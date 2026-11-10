import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type AppStateStatus } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VideoUploadsSchemas } from "@auto-tm/contracts";

import { ApiError, apiClient } from "../../api/client";

import { sendListingVideoTelemetry, type ListingVideoTelemetry } from "./listingVideoTelemetry";
import { nativeVideoUploadTransport, type VideoUploadTransport } from "./nativeVideoUpload";
import type { ListingVideoSelection } from "./listingVideo";

export type { VideoUploadTransport } from "./nativeVideoUpload";

type VideoUploadTarget = VideoUploadsSchemas.VideoUploadTarget;
type OpenVideoUploadResponse = VideoUploadsSchemas.OpenVideoUploadResponse;
type VideoUploadStatusResponse = VideoUploadsSchemas.VideoUploadStatusResponse;

export type VideoUploadPauseReason = "user" | "network" | "background";
export type VideoUploadOperation = "cancel" | "remove";
export type VideoUploadFailure = "transfer" | "source" | "expired";

export interface VideoUploadState {
  phase: "idle" | "uploading" | "paused" | "processing" | "failed" | "operation-unknown";
  pauseReason?: VideoUploadPauseReason;
  operation?: VideoUploadOperation;
  failure?: VideoUploadFailure;
  sessionId?: string;
  generationId?: string;
  target: VideoUploadTarget;
  localUri?: string;
  sizeBytes: number;
  confirmedBytes: number;
  totalBytes: number;
  confirmedParts: number[];
  coverOffsetMs: number;
}

interface PersistedVideoUpload {
  version: 1;
  phase: VideoUploadState["phase"];
  pauseReason?: VideoUploadPauseReason;
  operation?: VideoUploadOperation;
  failure?: VideoUploadFailure;
  sessionId?: string;
  generationId?: string;
  target: VideoUploadTarget;
  localUri: string;
  sizeBytes: number;
  confirmedParts: { partNumber: number; sizeBytes: number }[];
  coverOffsetMs: number;
  idempotencyKey: string;
  openAttempted?: boolean;
  openingTarget?: VideoUploadTarget;
  sourceDirectory?: string;
}

export interface VideoUploadApi {
  open(input: VideoUploadsSchemas.OpenVideoUploadRequest, idempotencyKey: string): Promise<OpenVideoUploadResponse>;
  status(sessionId: string): Promise<VideoUploadStatusResponse>;
  complete(sessionId: string): Promise<VideoUploadStatusResponse>;
  cancel(sessionId: string): Promise<{ sessionId: string; generationId: string; state: "CANCELLED" }>;
}

export interface VideoUploadFileSystem {
  exists(uri: string): Promise<boolean>;
  remove(uri: string): Promise<void>;
}

export interface VideoUploadPersistence {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface VideoUploadControllerOptions {
  target: VideoUploadTarget;
  storageKey: string;
  localUri: string;
  sizeBytes: number;
  coverOffsetMs: number;
  api?: VideoUploadApi;
  fileSystem?: VideoUploadFileSystem;
  transport?: VideoUploadTransport;
  persistence?: VideoUploadPersistence;
  isOnline?: () => boolean;
  isForeground?: () => boolean;
  telemetry?: ListingVideoTelemetry;
}

const SNAPSHOT_VERSION = 1 as const;

const defaultPersistence: VideoUploadPersistence = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

const defaultFileSystem: VideoUploadFileSystem = {
  exists: async (uri) => {
    const fileSystem = await import("expo-file-system/legacy");
    return (await fileSystem.getInfoAsync(uri)).exists;
  },
  remove: async (uri) => {
    const fileSystem = await import("expo-file-system/legacy");
    await fileSystem.deleteAsync(uri, { idempotent: true });
  },
};

const defaultApi: VideoUploadApi = {
  open: (input, idempotencyKey) =>
    apiClient.post("/listings/video-uploads", input, VideoUploadsSchemas.OpenVideoUploadResponseSchema, {
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  status: (sessionId) =>
    apiClient.get(`/listings/video-uploads/${sessionId}`, VideoUploadsSchemas.VideoUploadStatusResponseSchema),
  complete: (sessionId) =>
    apiClient.post(`/listings/video-uploads/${sessionId}/complete`, {}, VideoUploadsSchemas.VideoUploadStatusResponseSchema),
  cancel: (sessionId) =>
    apiClient.post(`/listings/video-uploads/${sessionId}/cancel`, {}, VideoUploadsSchemas.CancelVideoUploadResponseSchema),
};

function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `listing-video-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 0 || error.code === "NETWORK_ERROR";
  return error instanceof TypeError || /network|offline|timed out|timeout|connection/i.test(error instanceof Error ? error.message : String(error));
}

function confirmedBytes(parts: { partNumber: number; sizeBytes: number }[]): number {
  return parts.reduce((sum, part) => sum + part.sizeBytes, 0);
}

function uniqueParts(parts: { partNumber: number; sizeBytes: number }[]): { partNumber: number; sizeBytes: number }[] {
  const seen = new Set<number>();
  return parts
    .filter((part) => {
      if (seen.has(part.partNumber)) return false;
      seen.add(part.partNumber);
      return true;
    })
    .sort((a, b) => a.partNumber - b.partNumber);
}

function sameTarget(a: VideoUploadTarget, b: VideoUploadTarget): boolean {
  return a.type === b.type && a.id === b.id;
}

export class VideoUploadController {
  private readonly api: VideoUploadApi;
  private readonly fs: VideoUploadFileSystem;
  private readonly transport: VideoUploadTransport;
  private readonly persistence: VideoUploadPersistence;
  private storageKey: string;
  private readonly online: () => boolean;
  private readonly foreground: () => boolean;
  private networkAvailable: boolean;
  private foregroundActive: boolean;
  private readonly listeners = new Set<(state: VideoUploadState) => void>();
  private snapshot: PersistedVideoUpload;
  private currentState: VideoUploadState;
  private operationId = 0;
  private running = false;
  private runPromise: Promise<void> | null = null;
  private disposed = false;
  private localDeleted = false;
  private openPromise: Promise<void> | null = null;
  private partAbort: AbortController | null = null;
  private persistenceQueue: Promise<void> = Promise.resolve();
  private readonly telemetry: ListingVideoTelemetry;
  /** Set while an upload restored after reopening is picked up again. */
  private restarting = false;

  constructor(options: VideoUploadControllerOptions) {
    this.api = options.api ?? defaultApi;
    this.fs = options.fileSystem ?? defaultFileSystem;
    this.transport = options.transport ?? nativeVideoUploadTransport;
    this.persistence = options.persistence ?? defaultPersistence;
    this.storageKey = options.storageKey;
    this.online = options.isOnline ?? (() => true);
    this.foreground = options.isForeground ?? (() => true);
    this.telemetry = options.telemetry ?? sendListingVideoTelemetry;
    this.networkAvailable = this.online();
    this.foregroundActive = this.foreground();
    this.snapshot = {
      version: SNAPSHOT_VERSION,
      phase: "idle",
      target: options.target,
      localUri: options.localUri,
      sizeBytes: options.sizeBytes,
      confirmedParts: [],
      coverOffsetMs: options.coverOffsetMs,
      idempotencyKey: newIdempotencyKey(),
    };
    this.currentState = this.toState();
  }

  get state(): VideoUploadState {
    return this.currentState;
  }

  subscribe(listener: (state: VideoUploadState) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => this.listeners.delete(listener);
  }

  async restore(): Promise<void> {
    const op = this.operationId;
    const raw = await this.persistence.get(this.storageKey);
    if (this.disposed || op !== this.operationId || !raw) return;
    let restored: PersistedVideoUpload;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== SNAPSHOT_VERSION) return;
      restored = parsed as PersistedVideoUpload;
    } catch {
      return;
    }
    if (!sameTarget(restored.target, this.snapshot.target)) return;
    this.snapshot = restored;
    this.localDeleted = false;
    this.publish();
    if (restored.phase === "idle" || restored.phase === "operation-unknown" || restored.phase === "processing") return;
    if (restored.phase === "paused" && restored.pauseReason === "user") {
      await this.reconcile(this.operationId);
      return;
    }
    if (restored.phase === "uploading" || restored.phase === "paused") {
      this.restarting = true;
      try { await this.resumeAutomatic(); } finally { this.restarting = false; }
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.snapshot.sessionId) return;
    if (!this.openPromise) {
      this.openPromise = (async () => {
        this.snapshot.openingTarget ??= this.snapshot.target;
        this.snapshot.openAttempted = true;
        // Recovery, including Cancel during Open, must use the same key after a restart.
        await this.persist();
        if (this.disposed) return;
        const opened = await this.api.open({
          target: this.snapshot.openingTarget, contentType: "video/mp4",
          sizeBytes: this.snapshot.sizeBytes, coverOffsetMs: this.snapshot.coverOffsetMs,
        }, this.snapshot.idempotencyKey);
        if (this.disposed) return;
        await this.adopt(opened.target);
        this.snapshot.sessionId = opened.sessionId;
        this.snapshot.generationId = opened.generationId;
        await this.persist();
      })().finally(() => { this.openPromise = null; });
    }
    await this.openPromise;
  }

  async start(): Promise<void> {
    if (this.disposed || this.snapshot.phase === "processing" || this.snapshot.operation) return;
    const op = ++this.operationId;
    this.setState({ phase: "uploading", pauseReason: undefined, failure: undefined });
    this.restarting = false;
    if (!(await this.fs.exists(this.snapshot.localUri).catch(() => false))) {
      if (op === this.operationId) this.setState({ phase: "failed", failure: "source" });
      return;
    }
    if (op !== this.operationId) return;
    if (!this.isOnline() || !this.isForeground()) {
      this.setState({ phase: "paused", pauseReason: !this.isOnline() ? "network" : "background" });
      return;
    }
    try {
      await this.ensureSession();
    } catch (error) {
      if (op === this.operationId) this.failTransfer(error);
      return;
    }
    if (op !== this.operationId) return;
    this.publish();
    this.startLoop();
    await this.runPromise;
  }

  setPreparedFile(file: { uri: string; sizeBytes: number; sourceDirectory?: string }, selection: ListingVideoSelection): void {
    if (this.snapshot.openAttempted || this.snapshot.sessionId || this.snapshot.phase === "processing") return;
    this.snapshot.idempotencyKey = newIdempotencyKey();
    this.snapshot.localUri = file.uri;
    this.snapshot.sizeBytes = file.sizeBytes;
    this.snapshot.sourceDirectory = file.sourceDirectory;
    this.snapshot.coverOffsetMs = Math.round((selection.posterS - selection.startS) * 1000);
    this.snapshot.confirmedParts = [];
    this.snapshot.phase = "idle";
    this.snapshot.failure = undefined;
    this.snapshot.operation = undefined;
    this.snapshot.pauseReason = undefined;
    this.localDeleted = false;
    void this.persist().catch(() => undefined);
    this.publish();
  }

  /** Reserve the server session without starting a part. Useful for lifecycle handoff. */
  async openSession(): Promise<void> {
    if (this.snapshot.operation || this.snapshot.phase === "processing") return;
    this.setState({ phase: "uploading" });
    await this.ensureSession();
    this.publish();
  }

  async pause(): Promise<void> {
    if (this.snapshot.phase !== "uploading") return;
    ++this.operationId;
    this.partAbort?.abort();
    this.setState({ phase: "paused", pauseReason: "user", failure: undefined });
    await this.persist();
  }

  async resume(): Promise<void> {
    if (this.snapshot.phase !== "paused" && !(this.snapshot.phase === "failed" && this.snapshot.failure === "transfer")) return;
    if (!this.isOnline()) {
      this.setState({ phase: "paused", pauseReason: "network", failure: undefined });
      return;
    }
    if (!this.isForeground()) {
      this.setState({ phase: "paused", pauseReason: "background", failure: undefined });
      return;
    }
    if (!this.snapshot.sessionId) {
      await this.start();
      return;
    }
    this.setState({ phase: "uploading", pauseReason: undefined, failure: undefined });
    // The restart resume has been sent: an interruption from here is a real
    // interruption of this run, not the reopen the flag was holding back.
    this.restarting = false;
    this.startLoop();
    await this.runPromise;
  }

  setNetworkAvailable(available: boolean): void {
    this.networkAvailable = available;
    if (!available && this.snapshot.phase === "uploading") {
      ++this.operationId;
      this.partAbort?.abort();
      this.setState({ phase: "paused", pauseReason: "network", failure: undefined });
      return;
    }
    if (available && this.snapshot.phase === "paused" && this.snapshot.pauseReason === "network") void this.resume();
  }

  setForeground(foreground: boolean): void {
    this.foregroundActive = foreground;
    if (!foreground && this.snapshot.phase === "uploading") {
      ++this.operationId;
      this.partAbort?.abort();
      this.setState({ phase: "paused", pauseReason: "background", failure: undefined });
      return;
    }
    if (foreground && this.snapshot.phase === "paused" && this.snapshot.pauseReason === "background") void this.resume();
  }

  private async resumeAutomatic(): Promise<void> {
    if (!this.isOnline() || !this.isForeground()) {
      this.setState({ phase: "paused", pauseReason: !this.isOnline() ? "network" : "background" });
      return;
    }
    if (this.snapshot.phase === "uploading") this.setState({ phase: "paused", pauseReason: "background" });
    await this.resume();
  }

  async cancel(operation: VideoUploadOperation = "cancel"): Promise<void> {
    const op = ++this.operationId;
    this.partAbort?.abort();
    this.setState({ phase: "operation-unknown", operation, pauseReason: undefined, failure: undefined });
    await this.persist();
    if (!this.snapshot.sessionId && !this.snapshot.openAttempted) {
      await this.deleteLocalAndForget(op);
      return;
    }
    await this.confirmCancellation(op);
  }

  private async confirmCancellation(op: number): Promise<void> {
    try {
      await this.ensureSession();
      if (op !== this.operationId) return;
      await this.api.cancel(this.snapshot.sessionId as string);
      if (op === this.operationId) await this.deleteLocalAndForget(op);
    } catch {
      // Only the requested terminal outcome can clear this durable operation.
      if (op === this.operationId) await this.persist();
    }
  }

  async checkStatus(): Promise<void> {
    const op = ++this.operationId;
    try {
      await this.ensureSession();
      if (op !== this.operationId) return;
      const status = await this.api.status(this.snapshot.sessionId as string);
      if (op !== this.operationId) return;
      if (await this.applyStatus(op, status)) return;
      if (this.snapshot.operation) await this.confirmCancellation(op);
    } catch {
      // Keep the operation-unknown card and Check status action in place.
    }
  }

  /** Publish preserves the session; local recovery follows its canonical target. */
  async adopt(target: VideoUploadTarget): Promise<void> {
    if (sameTarget(target, this.snapshot.target)) return;
    if (this.snapshot.target.type !== "draft" || target.type !== "listing") return;
    if (this.snapshot.openAttempted) this.snapshot.openingTarget ??= this.snapshot.target;
    const oldKey = this.storageKey;
    const oldSuffix = `${this.snapshot.target.type}:${this.snapshot.target.id}`;
    this.storageKey = oldKey.endsWith(oldSuffix) ? `${oldKey.slice(0, -oldSuffix.length)}${target.type}:${target.id}` : oldKey;
    this.snapshot.target = target;
    const value = JSON.stringify(this.snapshot);
    const key = this.storageKey;
    this.persistenceQueue = this.persistenceQueue.catch(() => undefined).then(async () => {
      await this.persistence.set(key, value);
      if (oldKey !== key) await this.persistence.remove(oldKey);
    });
    this.publish();
    await this.persistenceQueue;
  }

  /** Fence local callbacks after target removal; server lifecycle is separate. */
  async clear(): Promise<void> {
    const op = ++this.operationId;
    this.partAbort?.abort();
    await this.openPromise?.catch(() => undefined);
    await this.deleteLocalAndForget(op);
  }

  dispose(): void {
    this.disposed = true;
    ++this.operationId;
    this.partAbort?.abort();
    this.listeners.clear();
  }

  async waitForIdleForTest(): Promise<void> {
    await this.runPromise;
  }

  private startLoop(): void {
    if (this.disposed || this.running || !this.snapshot.sessionId) return;
    this.running = true;
    const op = this.operationId;
    this.runPromise = this.run(op).finally(() => {
      this.running = false;
      // A quick Continue may arrive before the fenced request finishes.
      // Hand off to the current operation once the old loop has stopped.
      if (op !== this.operationId && this.snapshot.phase === "uploading") this.startLoop();
    });
  }

  private async run(op: number): Promise<void> {
    let attemptsWithoutProgress = 0;
    try {
      while (op === this.operationId && this.snapshot.phase === "uploading") {
        if (!this.isOnline()) {
          this.setState({ phase: "paused", pauseReason: "network" });
          return;
        }
        if (!this.isForeground()) {
          this.setState({ phase: "paused", pauseReason: "background" });
          return;
        }
        const status = await this.api.status(this.snapshot.sessionId as string);
        if (op !== this.operationId) return;
        const done = await this.applyStatus(op, status);
        if (op !== this.operationId || done || this.snapshot.phase !== "uploading") return;
        const next = status.parts.find((part) => !this.snapshot.confirmedParts.some((confirmed) => confirmed.partNumber === part.partNumber));
        if (!next) {
          try {
            const completed = await this.api.complete(this.snapshot.sessionId as string);
            if (op !== this.operationId) return;
            if (!(await this.applyStatus(op, completed))) this.failTransfer(new Error("Completion not confirmed"));
          } catch (error) {
            if (op !== this.operationId) return;
            const reconciled = await this.api.status(this.snapshot.sessionId as string).catch(() => null);
            if (op !== this.operationId) return;
            if (reconciled) {
              const terminal = await this.applyStatus(op, reconciled);
              if (terminal || this.snapshot.phase !== "uploading") return;
            }
            this.failTransfer(error);
          }
          continue;
        }
        const available = await this.fs.exists(this.snapshot.localUri).catch(() => false);
        if (op !== this.operationId) return;
        if (!available) { this.setState({ phase: "failed", failure: "source" }); return; }
        const offset = (next.partNumber - 1) * status.partSizeBytes;
        const before = confirmedBytes(this.snapshot.confirmedParts);
        this.partAbort = new AbortController();
        try {
          await this.transport.put(next.uploadUrl, { uri: this.snapshot.localUri, offset, sizeBytes: next.sizeBytes, ...(this.snapshot.sourceDirectory ? { temporaryDirectory: this.snapshot.sourceDirectory } : {}) }, this.partAbort.signal);
        } catch (error) {
          if (op !== this.operationId) return;
          const reconciled = await this.api.status(this.snapshot.sessionId as string).catch(() => null);
          if (op !== this.operationId) return;
          if (reconciled) {
            const terminal = await this.applyStatus(op, reconciled);
            if (terminal || this.snapshot.phase !== "uploading") return;
            if (confirmedBytes(this.snapshot.confirmedParts) > before) attemptsWithoutProgress = 0;
            else if (isNetworkError(error) || (error instanceof ApiError && error.code === "VIDEO_UPLOAD_TIMEOUT")) { this.failTransfer(error); return; }
            else if (++attemptsWithoutProgress >= 3) { this.failTransfer(error); return; }
            // A bounded renewal retries only missing parts.
            continue;
          }
          this.failTransfer(error);
          return;
        }
        if (op !== this.operationId) return;
        // A successful PUT is not progress. Only this status response is the
        // authority that moves the confirmed byte count forward.
        const reconciled = await this.api.status(this.snapshot.sessionId as string);
        if (op !== this.operationId) return;
        const terminal = await this.applyStatus(op, reconciled);
        if (terminal || this.snapshot.phase !== "uploading") return;
        if (confirmedBytes(this.snapshot.confirmedParts) > before) attemptsWithoutProgress = 0;
        else if (++attemptsWithoutProgress >= 3) { this.failTransfer(new Error("Part was not confirmed")); return; }
      }
    } catch (error) {
      if (op !== this.operationId) return;
      this.failTransfer(error);
    }
  }

  private async reconcile(op: number): Promise<void> {
    if (!this.snapshot.sessionId) return;
    try {
      const status = await this.api.status(this.snapshot.sessionId);
      if (op !== this.operationId) return;
      await this.applyStatus(op, status);
    } catch (error) {
      if (op !== this.operationId || !isNetworkError(error)) return;
      if (this.snapshot.phase === "uploading") this.failTransfer(error);
    }
  }

  private isOnline(): boolean {
    return this.networkAvailable && this.online();
  }

  private isForeground(): boolean {
    return this.foregroundActive && this.foreground();
  }

  private async applyStatus(op: number, status: VideoUploadStatusResponse): Promise<boolean> {
    if (op !== this.operationId) return true;
    await this.adopt(status.target);
    if (op !== this.operationId) return true;
    const confirmed = uniqueParts(status.confirmedParts);
    this.snapshot.confirmedParts = confirmed;
    if (status.state === "PROCESSING" || status.state === "FAILED") {
      if (this.snapshot.operation) {
        await this.persist();
        this.publish();
        return false;
      }
      await this.finishProcessing(op, status);
      return true;
    }
    if (status.state === "CANCELLED" || status.state === "EXPIRED") {
      await this.deleteLocalAndForget(op);
      return true;
    }
    await this.persist();
    this.publish();
    return false;
  }

  private async finishProcessing(op: number, _status: VideoUploadStatusResponse): Promise<void> {
    if (op !== this.operationId) return;
    await this.deleteLocalOnly(op);
    if (op !== this.operationId) return;
    await this.forget(op);
    if (op !== this.operationId) return;
    this.snapshot.phase = "processing";
    this.snapshot.pauseReason = undefined;
    this.snapshot.failure = undefined;
    this.publish();
  }

  private async deleteLocalOnly(op: number): Promise<void> {
    if (this.localDeleted) return;
    const { localUri, sourceDirectory } = this.snapshot;
    if (localUri) await this.fs.remove(localUri);
    if (sourceDirectory) await this.fs.remove(sourceDirectory);
    if (op === this.operationId) this.localDeleted = true;
  }

  private async forget(op: number): Promise<void> {
    // A newer operation's write must run after this removal, even when its
    // request arrives while AsyncStorage is still deleting the old record.
    this.persistenceQueue = this.persistenceQueue.catch(() => undefined).then(async () => {
      if (op === this.operationId) await this.persistence.remove(this.storageKey);
    });
    await this.persistenceQueue;
  }

  private async deleteLocalAndForget(op: number): Promise<void> {
    if (op !== this.operationId) return;
    await this.deleteLocalOnly(op);
    if (op !== this.operationId) return;
    await this.forget(op);
    if (op !== this.operationId) return;
    this.snapshot.phase = "idle";
    this.snapshot.openAttempted = false;
    this.snapshot.openingTarget = undefined;
    this.snapshot.sessionId = undefined;
    this.snapshot.generationId = undefined;
    this.snapshot.confirmedParts = [];
    this.snapshot.operation = undefined;
    this.snapshot.failure = undefined;
    this.snapshot.pauseReason = undefined;
    this.publish();
  }

  private setState(patch: Partial<PersistedVideoUpload>): void {
    const before = { phase: this.snapshot.phase, pauseReason: this.snapshot.pauseReason, failure: this.snapshot.failure };
    Object.assign(this.snapshot, patch);
    this.measure(before);
    void this.persist().catch(() => undefined);
    this.publish();
  }

  private persist(): Promise<void> {
    const value = JSON.stringify(this.snapshot);
    const key = this.storageKey;
    this.persistenceQueue = this.persistenceQueue.catch(() => undefined).then(() => this.persistence.set(key, value));
    return this.persistenceQueue;
  }

  private failTransfer(error: unknown): void {
    const timedOut = error instanceof Error && /timed out|timeout/i.test(error.message);
    const network = isNetworkError(error) && !(timedOut && this.isOnline());
    this.setState({ phase: network ? "paused" : "failed", pauseReason: network ? "network" : undefined, failure: network ? undefined : "transfer" });
  }

  /** Interruptions, resumes and failures for tester measurements (#1052). */
  private measure(before: Pick<PersistedVideoUpload, "phase" | "pauseReason" | "failure">): void {
    const { phase, pauseReason, failure } = this.snapshot;
    const progress = { confirmedBytes: confirmedBytes(uniqueParts(this.snapshot.confirmedParts)), totalBytes: this.snapshot.sizeBytes };
    if (phase === "paused" && pauseReason && before.phase === "uploading") {
      // A reopened app passes through a synthetic background pause; the
      // interruption itself was the app closing, which no code observed.
      if (!this.restarting) this.telemetry({ event: "upload_interrupted", reason: pauseReason, ...progress });
    } else if (phase === "uploading" && (before.phase === "paused" || (before.phase === "failed" && before.failure === "transfer"))) {
      const reason = this.restarting ? "restart" : before.phase === "failed" ? "retry" : before.pauseReason ?? "retry";
      this.telemetry({ event: "upload_resumed", reason, ...progress });
    } else if (phase === "failed" && failure && (before.phase !== "failed" || before.failure !== failure)) {
      this.telemetry({ event: "upload_failed", failure, ...progress });
    }
  }

  private publish(): void {
    this.currentState = this.toState();
    for (const listener of this.listeners) listener(this.currentState);
  }

  private toState(): VideoUploadState {
    const parts = uniqueParts(this.snapshot.confirmedParts);
    return {
      phase: this.snapshot.phase,
      ...(this.snapshot.pauseReason ? { pauseReason: this.snapshot.pauseReason } : {}),
      ...(this.snapshot.operation ? { operation: this.snapshot.operation } : {}),
      ...(this.snapshot.failure ? { failure: this.snapshot.failure } : {}),
      ...(this.snapshot.sessionId ? { sessionId: this.snapshot.sessionId } : {}),
      ...(this.snapshot.generationId ? { generationId: this.snapshot.generationId } : {}),
      target: this.snapshot.target,
      localUri: this.snapshot.localUri,
      sizeBytes: this.snapshot.sizeBytes,
      confirmedBytes: confirmedBytes(parts),
      totalBytes: this.snapshot.sizeBytes,
      confirmedParts: parts.map((part) => part.partNumber),
      coverOffsetMs: this.snapshot.coverOffsetMs,
    };
  }
}

export interface VideoUploadLifecycleHandlers {
  onAppState(status: AppStateStatus): void;
  onNetwork(available: boolean): void;
}

export type VideoUploadLifecycleSubscribe = (handlers: VideoUploadLifecycleHandlers) => () => void;

const defaultLifecycleSubscribe: VideoUploadLifecycleSubscribe = (handlers) => {
  handlers.onAppState(AppState.currentState);
  const appSubscription = AppState.addEventListener("change", (status) => handlers.onAppState(status));
  let disposed = false;
  let networkSubscription: (() => void) | undefined;
  void import("@react-native-community/netinfo").then(({ default: netInfo }) => {
    if (disposed) return;
    networkSubscription = netInfo.addEventListener((state) => {
      if (state.isConnected !== null) handlers.onNetwork(state.isConnected);
    });
  }).catch(() => undefined);
  return () => {
    disposed = true;
    appSubscription.remove();
    networkSubscription?.();
  };
};

export interface UseVideoUploadOptions {
  target?: VideoUploadTarget;
  storageKey?: string;
  api?: VideoUploadApi;
  fileSystem?: VideoUploadFileSystem;
  transport?: VideoUploadTransport;
  persistence?: VideoUploadPersistence;
  subscribeLifecycle?: VideoUploadLifecycleSubscribe;
}

export function useVideoUpload(options: UseVideoUploadOptions = {}) {
  const controllerRef = useRef<VideoUploadController | null>(null);
  const [, rerender] = useState(0);
  const targetType = options.target?.type;
  const targetId = options.target?.id;
  const target = useMemo(() => targetType && targetId ? { type: targetType, id: targetId } : undefined, [targetType, targetId]);
  const storageKey = options.storageKey ?? (target ? `listing-video:${target.type}:${target.id}` : "listing-video:none");

  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    const target = targetRef.current;
    if (!target) {
      controllerRef.current = null;
      rerender((value) => value + 1);
      return;
    }
    const controller = new VideoUploadController({
      target,
      storageKey,
      localUri: "",
      sizeBytes: 0,
      coverOffsetMs: 0,
      api: options.api,
      fileSystem: options.fileSystem,
      transport: options.transport,
      persistence: options.persistence,
      isOnline: () => true,
      isForeground: () => AppState.currentState === "active",
    });
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(() => rerender((value) => value + 1));
    void controller.restore();
    return () => { unsubscribe(); controller.dispose(); };
  }, [options.api, options.fileSystem, options.persistence, options.transport, rerender, storageKey]);

  useEffect(() => {
    if (!target) return;
    const subscribe = options.subscribeLifecycle ?? defaultLifecycleSubscribe;
    return subscribe({
      onAppState: (status) => controllerRef.current?.setForeground(status === "active"),
      onNetwork: (available) => controllerRef.current?.setNetworkAvailable(available),
    });
  }, [options.subscribeLifecycle, target]);

  useEffect(() => { if (target) void controllerRef.current?.adopt(target).catch(() => undefined); }, [target]);

  const start = useCallback(async (file: { uri: string; sizeBytes: number; sourceDirectory?: string }, selection: ListingVideoSelection) => {
    const current = controllerRef.current;
    if (!current || !target) return;
    current.setPreparedFile(file, selection);
    await current.start();
  }, [target]);

  const invoke = useCallback((method: "pause" | "resume" | "checkStatus" | "cancel", arg?: VideoUploadOperation) => {
    const controller = controllerRef.current;
    if (!controller) return Promise.resolve();
    if (method === "cancel") return controller.cancel(arg);
    return controller[method]();
  }, []);

  const state = controllerRef.current?.state ?? ({ phase: "idle", target: target ?? { type: "draft", id: "" }, sizeBytes: 0, totalBytes: 0, confirmedBytes: 0, confirmedParts: [], coverOffsetMs: 0 } satisfies VideoUploadState);
  return useMemo(() => ({
    state,
    start,
    pause: () => invoke("pause"),
    resume: () => invoke("resume"),
    cancel: () => invoke("cancel", "cancel"),
    remove: () => invoke("cancel", "remove"),
    checkStatus: () => invoke("checkStatus"),
    adopt: (target: VideoUploadTarget) => controllerRef.current?.adopt(target),
    clear: () => controllerRef.current?.clear(),
  }), [state, start, invoke]);
}
