import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type AppStateStatus } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { VideoUploadsSchemas } from "@auto-tm/contracts";

import { ApiError, apiClient } from "../../api/client";

import type { ListingVideoSelection } from "./listingVideo";

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
}

export interface VideoUploadApi {
  open(input: VideoUploadsSchemas.OpenVideoUploadRequest, idempotencyKey: string): Promise<OpenVideoUploadResponse>;
  status(sessionId: string): Promise<VideoUploadStatusResponse>;
  complete(sessionId: string): Promise<VideoUploadStatusResponse>;
  cancel(sessionId: string): Promise<{ sessionId: string; generationId: string; state: "CANCELLED" }>;
}

export interface VideoUploadFileSystem {
  exists(uri: string): Promise<boolean>;
  readPart(uri: string, offset: number, size: number): Promise<Blob>;
  remove(uri: string): Promise<void>;
}

export interface VideoUploadTransport {
  put(url: string, body: Blob): Promise<void>;
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
}

const UPLOAD_TIMEOUT_MS = 60_000;
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
  readPart: async (uri, offset, size) => {
    // The new File API can produce a Blob for a byte range. Load it lazily so
    // unit tests can use the injected file seam without a native Expo module.
    const { File } = await import("expo-file-system");
    return new File(uri).slice(offset, offset + size, "video/mp4");
  },
  remove: async (uri) => {
    const fileSystem = await import("expo-file-system/legacy");
    await fileSystem.deleteAsync(uri, { idempotent: true });
  },
};

const defaultTransport: VideoUploadTransport = {
  put: async (url, body) => {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new ApiError("NETWORK_ERROR", 0, "Upload timed out")), UPLOAD_TIMEOUT_MS);
    });
    const response = await Promise.race([
      fetch(url, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body }),
      timeout,
    ]);
    if (!response.ok) throw new ApiError("VIDEO_PART_UPLOAD_FAILED", response.status, "Video part upload failed");
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
  private readonly storageKey: string;
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
  private localDeleted = false;

  constructor(options: VideoUploadControllerOptions) {
    this.api = options.api ?? defaultApi;
    this.fs = options.fileSystem ?? defaultFileSystem;
    this.transport = options.transport ?? defaultTransport;
    this.persistence = options.persistence ?? defaultPersistence;
    this.storageKey = options.storageKey;
    this.online = options.isOnline ?? (() => true);
    this.foreground = options.isForeground ?? (() => true);
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
    const raw = await this.persistence.get(this.storageKey);
    if (!raw) return;
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
    if (!restored.sessionId || restored.phase === "idle" || restored.phase === "operation-unknown" || restored.phase === "processing") return;
    await this.reconcile(this.operationId);
    if (this.snapshot.phase === "uploading" && this.isOnline() && this.isForeground()) this.startLoop();
  }

  async start(): Promise<void> {
    const op = ++this.operationId;
    if (this.snapshot.phase === "processing") return;
    if (!(await this.fs.exists(this.snapshot.localUri).catch(() => false))) {
      this.setState({ phase: "failed", failure: "source" });
      return;
    }
    if (!this.snapshot.sessionId) {
      try {
        const opened = await this.api.open(
          {
            target: this.snapshot.target,
            contentType: "video/mp4",
            sizeBytes: this.snapshot.sizeBytes,
            coverOffsetMs: this.snapshot.coverOffsetMs,
          },
          this.snapshot.idempotencyKey,
        );
        if (op !== this.operationId) return;
        this.snapshot.sessionId = opened.sessionId;
        this.snapshot.generationId = opened.generationId;
        this.snapshot.phase = "uploading";
        await this.persist();
        this.publish();
      } catch (error) {
        if (op !== this.operationId) return;
        this.setState({ phase: isNetworkError(error) ? "paused" : "failed", pauseReason: isNetworkError(error) ? "network" : undefined, failure: isNetworkError(error) ? undefined : "transfer" });
        return;
      }
    } else {
      this.setState({ phase: "uploading", pauseReason: undefined, failure: undefined });
    }
    if (!this.isOnline()) {
      this.setState({ phase: "paused", pauseReason: "network" });
      return;
    }
    if (!this.isForeground()) {
      this.setState({ phase: "paused", pauseReason: "background" });
      return;
    }
    this.startLoop();
    await this.runPromise;
  }

  setPreparedFile(file: { uri: string; sizeBytes: number }, selection: ListingVideoSelection): void {
    if (this.snapshot.sessionId || this.snapshot.phase === "processing") return;
    this.snapshot.localUri = file.uri;
    this.snapshot.sizeBytes = file.sizeBytes;
    this.snapshot.coverOffsetMs = Math.round(selection.posterS * 1000);
    this.snapshot.confirmedParts = [];
    this.snapshot.phase = "idle";
    this.snapshot.failure = undefined;
    this.snapshot.operation = undefined;
    this.snapshot.pauseReason = undefined;
    this.localDeleted = false;
    void this.persist();
    this.publish();
  }

  /** Reserve the server session without starting a part. Useful for lifecycle handoff. */
  async openSession(): Promise<void> {
    const op = ++this.operationId;
    if (!this.snapshot.sessionId) {
      const opened = await this.api.open({ target: this.snapshot.target, contentType: "video/mp4", sizeBytes: this.snapshot.sizeBytes, coverOffsetMs: this.snapshot.coverOffsetMs }, this.snapshot.idempotencyKey);
      if (op !== this.operationId) return;
      this.snapshot.sessionId = opened.sessionId;
      this.snapshot.generationId = opened.generationId;
      this.snapshot.phase = "uploading";
      await this.persist();
      this.publish();
    }
  }

  async pause(): Promise<void> {
    if (this.snapshot.phase !== "uploading") return;
    ++this.operationId;
    this.setState({ phase: "paused", pauseReason: "user", failure: undefined });
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
    this.setState({ phase: "uploading", pauseReason: undefined, failure: undefined });
    this.startLoop();
    await this.runPromise;
  }

  setNetworkAvailable(available: boolean): void {
    this.networkAvailable = available;
    if (!available && this.snapshot.phase === "uploading") {
      ++this.operationId;
      this.setState({ phase: "paused", pauseReason: "network", failure: undefined });
      return;
    }
    if (available && this.snapshot.phase === "paused" && this.snapshot.pauseReason === "network") void this.resume();
  }

  setForeground(foreground: boolean): void {
    this.foregroundActive = foreground;
    if (!foreground && this.snapshot.phase === "uploading") {
      ++this.operationId;
      this.setState({ phase: "paused", pauseReason: "background", failure: undefined });
      return;
    }
    if (foreground && this.snapshot.phase === "paused" && this.snapshot.pauseReason === "background") void this.resume();
  }

  async cancel(operation: VideoUploadOperation = "cancel"): Promise<void> {
    const op = ++this.operationId;
    this.running = false;
    if (!this.snapshot.sessionId) {
      await this.deleteLocalAndForget();
      return;
    }
    this.setState({ phase: "operation-unknown", operation, pauseReason: undefined, failure: undefined });
    try {
      await this.api.cancel(this.snapshot.sessionId);
      if (op !== this.operationId) return;
      await this.deleteLocalAndForget();
    } catch {
      // The operation is deliberately retained as unknown. It must never look
      // completed until Check status receives an authoritative answer.
      if (op === this.operationId) await this.persist();
    }
  }

  async checkStatus(): Promise<void> {
    const op = ++this.operationId;
    if (!this.snapshot.sessionId) return;
    try {
      const status = await this.api.status(this.snapshot.sessionId);
      if (op !== this.operationId) return;
      if (status.state === "CANCELLED" || status.state === "EXPIRED") {
        await this.deleteLocalAndForget();
        return;
      }
      if (status.state === "PROCESSING") {
        await this.finishProcessing(op, status);
        return;
      }
      if (this.snapshot.phase === "operation-unknown") {
        this.setState({ phase: "failed", failure: "transfer", operation: undefined });
      } else {
        await this.persist();
        this.publish();
      }
    } catch {
      // Keep the operation-unknown card and Check status action in place.
    }
  }

  async waitForIdleForTest(): Promise<void> {
    await this.runPromise;
  }

  private startLoop(): void {
    if (this.running || !this.snapshot.sessionId) return;
    this.running = true;
    const op = this.operationId;
    this.runPromise = this.run(op).finally(() => {
      this.running = false;
    });
  }

  private async run(op: number): Promise<void> {
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
        if (done || this.snapshot.phase !== "uploading") return;
        const next = status.parts.find((part) => !this.snapshot.confirmedParts.some((confirmed) => confirmed.partNumber === part.partNumber));
        if (!next) {
          try {
            const completed = await this.api.complete(this.snapshot.sessionId as string);
            if (op !== this.operationId) return;
            await this.applyStatus(op, completed);
          } catch (error) {
            if (op !== this.operationId) return;
            const reconciled = await this.api.status(this.snapshot.sessionId as string).catch(() => null);
            if (op !== this.operationId) return;
            if (reconciled) {
              const terminal = await this.applyStatus(op, reconciled);
              if (terminal || this.snapshot.phase !== "uploading") return;
            }
            if (isNetworkError(error)) this.setState({ phase: "paused", pauseReason: "network" });
            else this.setState({ phase: "failed", failure: "transfer" });
          }
          continue;
        }
        const offset = this.snapshot.confirmedParts.filter((part) => part.partNumber < next.partNumber).reduce((sum, part) => sum + part.sizeBytes, 0);
        const body = await this.fs.readPart(this.snapshot.localUri, offset, next.sizeBytes);
        try {
          await this.transport.put(next.uploadUrl, body);
        } catch (error) {
          if (op !== this.operationId) return;
          const reconciled = await this.api.status(this.snapshot.sessionId as string).catch(() => null);
          if (op !== this.operationId) return;
          if (reconciled) {
            const terminal = await this.applyStatus(op, reconciled);
            if (terminal || this.snapshot.phase !== "uploading") return;
            // The URL may have expired. The next loop gets a newly signed part.
            continue;
          }
          this.setState({ phase: isNetworkError(error) ? "paused" : "failed", pauseReason: isNetworkError(error) ? "network" : undefined, failure: isNetworkError(error) ? undefined : "transfer" });
          return;
        }
        // A successful PUT is not progress. Only this status response is the
        // authority that moves the confirmed byte count forward.
        const reconciled = await this.api.status(this.snapshot.sessionId as string);
        if (op !== this.operationId) return;
        const terminal = await this.applyStatus(op, reconciled);
        if (terminal || this.snapshot.phase !== "uploading") return;
      }
    } catch (error) {
      if (op !== this.operationId) return;
      this.setState({ phase: isNetworkError(error) ? "paused" : "failed", pauseReason: isNetworkError(error) ? "network" : undefined, failure: isNetworkError(error) ? undefined : "transfer" });
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
      if (this.snapshot.phase === "uploading") this.setState({ phase: "paused", pauseReason: "network" });
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
    const confirmed = uniqueParts(status.confirmedParts);
    this.snapshot.confirmedParts = confirmed;
    if (status.state === "PROCESSING") {
      await this.finishProcessing(op, status);
      return true;
    }
    if (status.state === "CANCELLED" || status.state === "EXPIRED") {
      await this.deleteLocalAndForget();
      return true;
    }
    await this.persist();
    this.publish();
    return false;
  }

  private async finishProcessing(op: number, _status: VideoUploadStatusResponse): Promise<void> {
    if (op !== this.operationId) return;
    this.snapshot.phase = "processing";
    this.snapshot.pauseReason = undefined;
    this.snapshot.failure = undefined;
    this.snapshot.operation = undefined;
    await this.deleteLocalOnly();
    await this.persistence.remove(this.storageKey);
    this.publish();
  }

  private async deleteLocalOnly(): Promise<void> {
    if (this.localDeleted) return;
    this.localDeleted = true;
    await this.fs.remove(this.snapshot.localUri).catch(() => undefined);
  }

  private async deleteLocalAndForget(): Promise<void> {
    await this.deleteLocalOnly();
    this.snapshot.phase = "idle";
    this.snapshot.sessionId = undefined;
    this.snapshot.generationId = undefined;
    this.snapshot.confirmedParts = [];
    this.snapshot.operation = undefined;
    this.snapshot.failure = undefined;
    this.snapshot.pauseReason = undefined;
    await this.persistence.remove(this.storageKey);
    this.publish();
  }

  private setState(patch: Partial<PersistedVideoUpload>): void {
    Object.assign(this.snapshot, patch);
    void this.persist();
    this.publish();
  }

  private async persist(): Promise<void> {
    await this.persistence.set(this.storageKey, JSON.stringify(this.snapshot));
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
  const target = options.target;
  const storageKey = options.storageKey ?? (target ? `listing-video:${target.type}:${target.id}` : "listing-video:none");

  useEffect(() => {
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
      isForeground: () => true,
    });
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(() => rerender((value) => value + 1));
    void controller.restore();
    return () => unsubscribe();
  }, [options.api, options.fileSystem, options.persistence, options.transport, rerender, storageKey, target]);

  useEffect(() => {
    if (!target) return;
    const subscribe = options.subscribeLifecycle ?? defaultLifecycleSubscribe;
    return subscribe({
      onAppState: (status) => controllerRef.current?.setForeground(status === "active"),
      onNetwork: (available) => controllerRef.current?.setNetworkAvailable(available),
    });
  }, [options.subscribeLifecycle, target]);

  const start = useCallback(async (file: { uri: string; sizeBytes: number }, selection: ListingVideoSelection) => {
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
  return {
    state,
    start,
    pause: () => invoke("pause"),
    resume: () => invoke("resume"),
    cancel: () => invoke("cancel", "cancel"),
    remove: () => invoke("cancel", "remove"),
    checkStatus: () => invoke("checkStatus"),
  };
}

