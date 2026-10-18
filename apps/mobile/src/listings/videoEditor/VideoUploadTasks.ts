import { VideoUploadSchemas } from "@auto-tm/contracts";
import { randomUUID } from "expo-crypto";

import { apiClient } from "../../api/client";
import { peekAuthSession } from "../../auth/sessionSnapshot";
import { loadAuthSession } from "../../auth/session";
import { VideoPreparation, type VideoPreparationPort, type VideoSelection } from "../videoPreparation/VideoPreparation";
import { ExpoVideoTransferDevice } from "../videoTransfer/ExpoVideoTransferDevice";
import { VideoTransfer, type VideoTransferRecord } from "../videoTransfer/VideoTransfer";

export interface VideoTaskSnapshot {
  phase: "EMPTY" | "PREPARING" | "UPLOADING" | "PAUSED" | "PROCESSING" | "READY" | "FAILED" | "CANCELLED";
  record: VideoTransferRecord | null;
  error?: string;
}
/** One foreground writer survives wizard step navigation. The journal belongs to
 * one account/target; signed authority is always fetched afresh by transfer. */
export class VideoUploadTask {
  private value: VideoTaskSnapshot = { phase: "EMPTY", record: null };
  private readonly listeners = new Set<() => void>();
  private readonly device: ExpoVideoTransferDevice;
  private readonly transfer: VideoTransfer;
  private preparation: VideoPreparation | undefined;
  private preparingJob: string | undefined;
  private intent = 0;
  private recovering: Promise<void> | undefined;
  constructor(readonly ownerId: string, readonly target: { kind: "draft" | "listing"; id: string }, readonly businessId?: string) {
    this.device = new ExpoVideoTransferDevice(ownerId, target.id, target.kind);
    this.transfer = new VideoTransfer({ load: () => this.device.load(), verify: prepared => this.device.verify(prepared), readPart: (prepared, offset, size) => this.device.readPart(prepared, offset, size), save: async record => {
      await this.device.save(record); this.set({ phase: record.state, record });
    } });
  }
  snapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  recover(): Promise<void> {
    return this.recovering ??= this.restore().finally(() => { this.recovering = undefined; });
  }
  private async restore() {
    const intent = this.intent;
    try {
      await this.owner();
      const record = await this.device.load();
      if (!record || intent !== this.intent) return;
      if (record.businessId !== this.businessId) throw new Error("VIDEO_TRANSFER_SESSION_CHANGED");
      this.set({ phase: record.state, record });
      if (record.state === "UPLOADING") await this.run();
      if (record.state === "PROCESSING" && record.sessionId) {
        const status = await apiClient.get(`/listing-video-upload-sessions/${record.sessionId}`, VideoUploadSchemas.SessionSnapshot, { assertSession: () => this.owner(), ...(this.businessId ? { headers: { "x-business-id": this.businessId } } : {}) });
        if (intent !== this.intent) return;
        if (status.sessionId !== record.sessionId) throw new Error("VIDEO_SESSION_INVALID");
        if (status.state === "READY") this.set({ phase: "READY", record });
        else if (["FAILED", "CLEANUP_PENDING", "DELETED"].includes(status.state)) this.set({ phase: status.state === "FAILED" ? "FAILED" : "CANCELLED", record });
      }
    } catch (error) { if (intent === this.intent) this.failed(error); }
  }
  async start(selection: Omit<VideoSelection, "jobId" | "maxBytes">, posterMs: number) {
    if (["PREPARING", "UPLOADING", "PROCESSING"].includes(this.value.phase)) return;
    const intent = ++this.intent;
    this.set({ phase: "PREPARING", record: this.value.record });
    try {
    await this.owner();
    if (!Number.isInteger(posterMs) || posterMs < selection.startMs || posterMs >= selection.endMs) throw new Error("INVALID_POSTER");
    const native = (await import("expo")).requireOptionalNativeModule<VideoPreparationPort>("ListingVideoPreparation");
    if (!native) { this.failed(new Error("VIDEO_PREPARATION_UNAVAILABLE")); return; }
    const jobId = randomUUID(); this.preparingJob = jobId; this.preparation = new VideoPreparation(native);
      const prepared = await this.preparation.prepare({ ...selection, jobId, maxBytes: 15 * 1024 * 1024 });
      await this.owner();
      if (intent !== this.intent) { await native.discard(jobId); return; }
      const record: VideoTransferRecord = { version: 1, ownerId: this.ownerId, idempotencyKey: jobId, target: this.target, prepared, posterMs: posterMs - selection.startMs, state: "UPLOADING", confirmedBytes: 0, ...(this.businessId ? { businessId: this.businessId } : {}) };
      await this.device.save(record); this.set({ phase: "UPLOADING", record });
      await this.run();
    } catch (error) { if (intent === this.intent) this.failed(error); }
    finally { this.preparingJob = undefined; this.preparation = undefined; }
  }
  async pause() {
    try {
      if (this.preparingJob) {
        this.intent++;
        await this.preparation?.cancel(this.preparingJob);
        this.set({ phase: "FAILED", record: this.value.record, error: "VIDEO_PREPARATION_INTERRUPTED" });
      } else await this.transfer.pause();
    } catch (error) { this.failed(error); }
  }
  async resume() { try { await this.owner(); await this.transfer.resume(); } catch (error) { this.failed(error); } }
  async cancel() {
    this.intent++;
    try {
      if (this.preparingJob) await this.preparation?.cancel(this.preparingJob);
      await this.transfer.cancel();
      this.set({ phase: "CANCELLED", record: this.value.record });
    } catch (error) { this.failed(error); }
  }
  private async run() { try { await this.transfer.run(); } catch (error) { this.failed(error); } }
  private async owner() { if ((await loadAuthSession())?.user.id !== this.ownerId) throw new Error("VIDEO_TRANSFER_SESSION_CHANGED"); }
  private failed(error: unknown) { this.set({ ...this.value, phase: "FAILED", error: error instanceof Error ? error.message : "VIDEO_TRANSFER_UNAVAILABLE" }); }
  private set(value: VideoTaskSnapshot) { this.value = value; for (const listener of this.listeners) listener(); }
}
const tasks = new Map<string, VideoUploadTask>();
export function videoUploadTask(ownerId: string, target: { kind: "draft" | "listing"; id: string }, businessId?: string): VideoUploadTask {
  const key = `${ownerId}:${target.kind}:${target.id}:${businessId ?? "personal"}`;
  let task = tasks.get(key);
  if (!task) { task = new VideoUploadTask(ownerId, target, businessId); tasks.set(key, task); }
  return task;
}
export async function pauseVideoUploads() { await Promise.all([...tasks.values()].filter(task => ["PREPARING", "UPLOADING"].includes(task.snapshot().phase)).map(task => task.pause())); }
export async function reconcileVideoUploadOwner() {
  const ownerId = peekAuthSession()?.user.id;
  await Promise.all([...tasks.values()].filter(task => task.ownerId !== ownerId && ["PREPARING", "UPLOADING"].includes(task.snapshot().phase)).map(task => task.pause()));
}
