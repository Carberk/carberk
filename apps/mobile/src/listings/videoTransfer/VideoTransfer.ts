import { z } from "zod";

import { apiClient } from "../../api/client";
import { loadAuthSession } from "../../auth/session";
import type { PreparedVideo } from "../videoPreparation/VideoPreparation";

export interface VideoTransferRecord {
  version: 1;
  ownerId: string;
  idempotencyKey: string;
  target: { kind: "draft" | "listing"; id: string };
  prepared: PreparedVideo;
  posterMs: number;
  businessId?: string;
  sessionId?: string;
  state: "UPLOADING" | "PAUSED" | "PROCESSING" | "CANCELLED" | "FAILED";
  confirmedBytes: number;
}
/** Device-owned staged bytes and atomic journal, never credentials or original bytes. */
export interface VideoTransferDevice {
  load(): Promise<VideoTransferRecord | null>;
  save(record: VideoTransferRecord): Promise<void>;
  verify(prepared: PreparedVideo): Promise<boolean>;
  readPart(prepared: PreparedVideo, offset: number, size: number): Promise<Uint8Array>;
}
const partBytes = 5 * 1024 * 1024;
const apiPath = "/listing-video-upload-sessions";
const partSchema = z.object({ partNumber: z.number().int().min(1).max(3), sizeBytes: z.number().int().positive().max(partBytes), etag: z.string().min(1).max(1024) });
const snapshotSchema = z.object({ version: z.literal(1), sessionId: z.string().uuid(), generation: z.string().uuid(), state: z.enum(["INITIALIZING", "UPLOADING", "PAUSED", "COMPLETING", "PROCESSING", "READY", "FAILED", "CLEANUP_PENDING"]), expiresAt: z.string().datetime(), partBytes: z.literal(partBytes), partCount: z.number().int().min(1).max(3), parts: z.array(partSchema).max(3).optional() });
const credentialsSchema = z.object({ version: z.literal(1), sessionId: z.string().uuid(), parts: z.array(z.object({ partNumber: z.number().int().min(1).max(3), sizeBytes: z.number().int().positive().max(partBytes), url: z.string().url().max(8192), expiresAt: z.string().datetime() })).length(1) });
type Snapshot = z.infer<typeof snapshotSchema>;

/** Owns foreground transfer and durable intent. Reconcile opaque server-confirmed
 * parts after every uncertain answer. No presigned URL, ETag or bearer is saved. */
export class VideoTransfer {
  private stopped = false;
  private pending: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private writes: Promise<void> = Promise.resolve();
  constructor(private readonly device: VideoTransferDevice) {}

  run(): Promise<void> {
    if (this.pending) return this.pending;
    this.stopped = false;
    this.pending = this.transfer().finally(() => { this.pending = null; });
    return this.pending;
  }
  async pause(): Promise<void> { await this.stop("PAUSED"); }
  async cancel(): Promise<void> { await this.stop("CANCELLED"); }
  async resume(): Promise<void> {
    await this.pending;
    const record = await this.device.load();
    if (!record || record.state === "CANCELLED" || record.state === "PROCESSING") return;
    await this.owner(record);
    if (record.sessionId) await apiClient.post(`${apiPath}/${record.sessionId}/resume`, {}, snapshotSchema, this.options(record));
    await this.save({ ...record, state: "UPLOADING" });
    await this.run();
  }
  private async transfer(): Promise<void> {
    let record = await this.device.load();
    if (!record) return;
    await this.owner(record);
    if (record.state === "CANCELLED") {
      if (record.sessionId) await apiClient.delete(`${apiPath}/${record.sessionId}`, snapshotSchema, this.options(record));
      return;
    }
    if (record.state === "PAUSED" || record.state === "PROCESSING") return;
    if (!await this.device.verify(record.prepared)) throw new Error("VIDEO_LOCAL_SOURCE_UNAVAILABLE");
    if (this.stopped) return;
    if (!record.sessionId) {
      const created = await apiClient.post(apiPath, { protocolVersion: 1, target: record.target, idempotencyKey: record.idempotencyKey, prepared: { sizeBytes: record.prepared.sizeBytes, sha256: record.prepared.sha256 }, posterMs: record.posterMs }, snapshotSchema, this.options(record));
      // Even a stopped create must retain its identity for pause/cancellation.
      record = { ...record, sessionId: created.sessionId };
      if (this.stopped) {
        const latest = await this.device.load();
        if (latest) await this.save({ ...latest, sessionId: created.sessionId });
        if (latest?.state === "CANCELLED") await apiClient.delete(`${apiPath}/${created.sessionId}`, snapshotSchema, this.options(record));
        else await apiClient.post(`${apiPath}/${created.sessionId}/pause`, {}, snapshotSchema, this.options(record));
        return;
      }
      await this.save(record);
    }
    const attempts = new Map<number, number>();
    while (!this.stopped) {
      await this.owner(record);
      const current: Snapshot = await apiClient.get(`${apiPath}/${record.sessionId}`, snapshotSchema, this.options(record));
      if (this.stopped) return;
      this.validateSnapshot(record, current);
      if (["PROCESSING", "READY"].includes(current.state)) { await this.save({ ...record, state: "PROCESSING", confirmedBytes: record.prepared.sizeBytes }); return; }
      if (current.state === "PAUSED") { await this.save({ ...record, state: "PAUSED" }); return; }
      if (!["UPLOADING", "COMPLETING"].includes(current.state)) throw new Error("VIDEO_TRANSFER_UNAVAILABLE");
      const confirmed = current.parts ?? [];
      record = { ...record, confirmedBytes: confirmed.reduce((sum, part) => sum + part.sizeBytes, 0) };
      await this.save(record);
      const missing = Array.from({ length: current.partCount }, (_, index) => index + 1).find(number => !confirmed.some(part => part.partNumber === number));
      if (!missing || current.state === "COMPLETING") {
        if (this.stopped) return;
        const result = await apiClient.post(`${apiPath}/${record.sessionId}/complete`, {}, snapshotSchema, this.options(record));
        if (!this.stopped && result.state === "PROCESSING") await this.save({ ...record, state: "PROCESSING", confirmedBytes: record.prepared.sizeBytes });
        return;
      }
      if ((attempts.get(missing) ?? 0) >= 3) throw new Error("VIDEO_PART_RETRY_EXHAUSTED");
      const credential = await apiClient.post(`${apiPath}/${record.sessionId}/part-credentials`, { partNumbers: [missing] }, credentialsSchema, this.options(record));
      if (this.stopped) return;
      const part = credential.parts[0];
      if (!part) throw new Error("VIDEO_CREDENTIAL_INVALID");
      const size = Math.min(partBytes, record.prepared.sizeBytes - (missing - 1) * partBytes);
      if (credential.sessionId !== record.sessionId || part.partNumber !== missing || part.sizeBytes !== size || Date.parse(part.expiresAt) <= Date.now()) throw new Error("VIDEO_CREDENTIAL_INVALID");
      const url = new URL(part.url);
      if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("VIDEO_CREDENTIAL_INVALID");
      const bytes = await this.device.readPart(record.prepared, (missing - 1) * partBytes, size);
      if (bytes.length !== size) throw new Error("VIDEO_LOCAL_SOURCE_UNAVAILABLE");
      await this.owner(record);
      if (this.stopped) return;
      attempts.set(missing, (attempts.get(missing) ?? 0) + 1);
      this.controller = new AbortController();
      const controller = this.controller;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          fetch(part.url, { method: "PUT", body: bytes as BodyInit, headers: { "Content-Length": String(size) }, signal: controller.signal, redirect: "error" }),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error("VIDEO_PART_TIMEOUT")); }, 60_000); }),
        ]);
        if (!response.ok) throw new Error("VIDEO_PART_UNCERTAIN");
      } catch {
        if (this.stopped) return;
        // Reconcile before renewal/retry. A failed answer may have committed.
      } finally { clearTimeout(timeout); if (this.controller === controller) this.controller = null; }
    }
  }
  private async stop(state: "PAUSED" | "CANCELLED") {
    this.stopped = true; this.controller?.abort();
    await this.writes;
    const record = await this.device.load();
    if (!record || record.state === "PROCESSING" || record.state === "CANCELLED") return;
    await this.owner(record);
    await this.save({ ...record, state });
    if (!record.sessionId) return;
    if (state === "CANCELLED") await apiClient.delete(`${apiPath}/${record.sessionId}`, snapshotSchema, this.options(record));
    else await apiClient.post(`${apiPath}/${record.sessionId}/pause`, {}, snapshotSchema, this.options(record));
  }
  private async owner(record: VideoTransferRecord) {
    if ((await loadAuthSession())?.user.id !== record.ownerId) throw new Error("VIDEO_TRANSFER_SESSION_CHANGED");
  }
  private options(record: VideoTransferRecord) { return { assertSession: () => this.owner(record), ...(record.businessId ? { headers: { "x-business-id": record.businessId } } : {}) }; }
  private save(record: VideoTransferRecord) {
    const value = { ...record, target: { ...record.target }, prepared: { ...record.prepared } };
    this.writes = this.writes.then(() => this.device.save(value));
    return this.writes;
  }
  private validateSnapshot(record: VideoTransferRecord, snapshot: Snapshot) {
    if (snapshot.sessionId !== record.sessionId || snapshot.partCount !== Math.ceil(record.prepared.sizeBytes / partBytes) || new Set(snapshot.parts?.map(part => part.partNumber)).size !== (snapshot.parts?.length ?? 0) || snapshot.parts?.some(part => part.partNumber > snapshot.partCount || part.sizeBytes !== Math.min(partBytes, record.prepared.sizeBytes - (part.partNumber - 1) * partBytes))) throw new Error("VIDEO_SESSION_INVALID");
  }
}
