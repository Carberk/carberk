import { VideoUploadSchemas } from "@auto-tm/contracts";
import { randomUUID } from "expo-crypto";


import { emitMeasurement } from "../../measurement/nativeMeasurement";
import { apiClient } from "../../api/client";
import { peekAuthSession } from "../../auth/sessionSnapshot";
import { loadAuthSession } from "../../auth/session";
import { VideoPreparation, type VideoPreparationPort, type VideoSelection } from "../videoPreparation/VideoPreparation";
import { ExpoVideoTransferDevice } from "../videoTransfer/ExpoVideoTransferDevice";
import { VideoTransfer, type VideoTransferRecord } from "../videoTransfer/VideoTransfer";

import { VideoSelectionJournal } from "./VideoSelectionJournal";

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
  private saving: Promise<void> = Promise.resolve();
  private recovering: Promise<void> | undefined;
  constructor(readonly ownerId: string, readonly target: { kind: "draft" | "listing"; id: string }, readonly businessId?: string) {
    this.device = new ExpoVideoTransferDevice(ownerId, target.id, target.kind);
    this.transfer = new VideoTransfer({ load: () => this.device.load(), verify: prepared => this.device.verify(prepared), readPart: (prepared, offset, size) => this.device.readPart(prepared, offset, size), save: async record => {
      await this.saveRecord(record);
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
        if (status.state === "READY") { this.set({ phase: "READY", record }); await this.discardPrepared(record); }
        else if (["FAILED", "CLEANUP_PENDING", "DELETED"].includes(status.state)) this.set({ phase: status.state === "FAILED" ? "FAILED" : "CANCELLED", record });
      }
    } catch (error) { if (intent === this.intent) this.failed(error); }
  }
  async start(selection: Omit<VideoSelection, "jobId" | "maxBytes">, posterMs: number) {
    if (["PREPARING", "UPLOADING", "PROCESSING"].includes(this.value.phase)) return;
    const intent = ++this.intent, attemptId = randomUUID(), started = Date.now();
    this.set({ phase: "PREPARING", record: this.value.record });
    try {
    await this.owner();
    if (intent !== this.intent) return;
    if (!Number.isInteger(posterMs) || posterMs < selection.startMs || posterMs >= selection.endMs) throw new Error("INVALID_POSTER");
    const native = (await import("expo")).requireOptionalNativeModule<VideoPreparationPort>("ListingVideoPreparation");
    if (!native) { this.mediaResult("media_preparation_result", attemptId, started, "expected_rejection", "unsupported"); this.failed(new Error("VIDEO_PREPARATION_UNAVAILABLE")); return; }
    const jobId = randomUUID(); this.preparingJob = jobId; this.preparation = new VideoPreparation(native);
      const prepared = await this.preparation.prepare({ ...selection, jobId, maxBytes: 15 * 1024 * 1024 });
      await this.owner();
      if (intent !== this.intent) { this.mediaResult("media_preparation_result", attemptId, started, "cancelled"); await native.discard(jobId); return; }
      this.mediaResult("media_preparation_result", attemptId, started, "success");
      const record: VideoTransferRecord = { version: 1, ownerId: this.ownerId, idempotencyKey: jobId, target: this.target, prepared, posterMs: posterMs - selection.startMs, state: "UPLOADING", confirmedBytes: 0, ...(this.businessId ? { businessId: this.businessId } : {}) };
      await this.saveRecord(record);
      if (intent !== this.intent) return;
      await this.run();
    } catch (error) { this.mediaResult("media_preparation_result", attemptId, started, intent === this.intent ? "technical_failure" : "cancelled", intent === this.intent ? "unknown" : undefined); if (intent === this.intent) this.failed(error); }
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
      if (this.value.record) await this.discardPrepared(this.value.record);
    } catch (error) { this.failed(error); }
  }
  async removed(): Promise<void> {
    this.intent++;
    if (this.preparingJob) await this.preparation?.cancel(this.preparingJob);
    try { await this.transfer.cancel(); } catch { /* The target removal already committed. */ }
    try { await this.transfer.settle(); } catch { /* Keep local cleanup independent of the old answer. */ }
    if (this.value.record) await this.discardPrepared(this.value.record);
    await this.device.clear(); this.set({ phase: "EMPTY", record: null });
  }
  async detachForPublication(): Promise<VideoTransferRecord | null> {
    this.intent++;
    if (this.preparingJob) await this.preparation?.cancel(this.preparingJob);
    try { await this.transfer.pause(); } catch { /* Local pause survives expired server authority. */ }
    try { await this.transfer.settle(); } catch { /* A failed answer still leaves a recoverable journal. */ }
    await this.saving;
    return this.device.load();
  }
  private async discardPrepared(record: VideoTransferRecord) {
    try { await (await import("expo")).requireOptionalNativeModule<VideoPreparationPort>("ListingVideoPreparation")?.discard(record.idempotencyKey); } catch { /* Native cleanup can retry on the next bounded journal recovery. */ }
  }
  private async saveRecord(record: VideoTransferRecord) {
    this.saving = this.saving.then(() => this.device.save(record));
    await this.saving; this.set({ phase: record.state, record });
  }
  private mediaResult(eventName: "media_preparation_result" | "media_upload_result", attemptId: string, started: number, result: "success" | "technical_failure" | "expected_rejection" | "cancelled", category?: "unsupported" | "unknown" | "network") {
    emitMeasurement({ eventName, purpose: "product_reliability", payload: { attemptId, kind: "video", result, durationMs: Math.min(86400000, Math.max(0, Date.now() - started)), ...(category ? { category } : {}) } });
  }
  private async run() {
    const attemptId = randomUUID(), started = Date.now();
    try { await this.transfer.run(); this.mediaResult("media_upload_result", attemptId, started, this.value.phase === "PROCESSING" ? "success" : "cancelled"); }
    catch (error) { this.mediaResult("media_upload_result", attemptId, started, "technical_failure", "network"); this.failed(error); }
  }
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
export async function rebindPublishedVideo(ownerId: string, draftId: string, listingId: string, businessId?: string): Promise<void> {
  const draft = { kind: "draft" as const, id: draftId }, listing = { kind: "listing" as const, id: listingId };
  const key = `${ownerId}:draft:${draftId}:${businessId ?? "personal"}`;
  const source = tasks.get(key);
  const continuing = source?.snapshot().phase === "UPLOADING";
  const oldDevice = new ExpoVideoTransferDevice(ownerId, draftId, "draft");
  const record = source ? await source.detachForPublication() : await oldDevice.load();
  const oldSelection = new VideoSelectionJournal(ownerId, draft, businessId);
  const selection = await oldSelection.load();
  if (selection) { await new VideoSelectionJournal(ownerId, listing, businessId).save(selection); await oldSelection.save(null); }
  if (record) { await new ExpoVideoTransferDevice(ownerId, listingId, "listing").save({ ...record, target: listing }); await oldDevice.clear(); }
  tasks.delete(key);
  const published = videoUploadTask(ownerId, listing, businessId);
  await published.recover();
  if (continuing && published.snapshot().phase === "PAUSED") await published.resume();
}
