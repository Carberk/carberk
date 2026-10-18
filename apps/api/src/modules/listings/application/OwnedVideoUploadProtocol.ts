import type { ListingActor } from "./ListingOwnership";
import type { VideoObjectStorage, VideoStorageSession, VideoConfirmedPart } from "../domain/ports/VideoObjectStorage";

export interface VideoSessionCreate {
  protocolVersion: 1;
  target: { kind: "draft" | "listing"; id: string };
  prepared: { sizeBytes: number; sha256: string };
  posterMs: number;
  idempotencyKey: string;
}
export interface OwnedVideoSession {
  id: string;
  generationId: string;
  uploadId: string;
  state: string;
  expiresAt: Date;
  storageUploadId: string | null;
  sizeBytes: number;
  completionFence: string | null;
}
export interface VideoSessionSnapshot {
  version: 1;
  sessionId: string;
  generation: string;
  state: string;
  expiresAt: Date;
  partBytes: number;
  partCount: number;
  parts?: VideoConfirmedPart[];
}
/** Every operation locks and rechecks current Identity/target/upload authority.
 * No callback or transaction escapes this boundary into storage I/O. */
export interface OwnedVideoSessionLedger {
  reserve(actor: ListingActor, input: VideoSessionCreate): Promise<{ session: OwnedVideoSession; initialize: boolean }>;
  read(actor: ListingActor, id: string): Promise<OwnedVideoSession>;
  bindInitialization(actor: ListingActor, id: string, storageUploadId: string): Promise<OwnedVideoSession>;
  beginCompletion(actor: ListingActor, id: string): Promise<OwnedVideoSession>;
  commitCompletion(actor: ListingActor, id: string, fence: string): Promise<OwnedVideoSession>;
  change(actor: ListingActor, id: string, action: "pause" | "resume" | "cancel"): Promise<OwnedVideoSession>;
}
export const OWNED_VIDEO_SESSION_LEDGER = Symbol("OwnedVideoSessionLedger");
export const OWNED_VIDEO_UPLOAD_PROTOCOL = Symbol("OwnedVideoUploadProtocol");

export class OwnedVideoUploadProtocol {
  constructor(private readonly ledger: OwnedVideoSessionLedger, private readonly storage: VideoObjectStorage) {}
  async create(actor: ListingActor, input: VideoSessionCreate): Promise<VideoSessionSnapshot> {
    const reserved = await this.ledger.reserve(actor, input);
    let session = reserved.session;
    if (!session.storageUploadId) {
      const storageUploadId = reserved.initialize
        ? await this.storage.initialize(session.id, session.uploadId)
        : await this.storage.recoverInitialization(session.id, session.uploadId);
      if (!storageUploadId) throw new Error("VIDEO_SESSION_INITIALIZING");
      session = await this.ledger.bindInitialization(actor, session.id, storageUploadId);
    }
    return this.snapshot(await this.ledger.read(actor, session.id));
  }
  async complete(actor: ListingActor, id: string): Promise<VideoSessionSnapshot> {
    const session = await this.ledger.beginCompletion(actor, id);
    if (session.state === "PROCESSING") return this.snapshot(session);
    if (session.state !== "COMPLETING" || !session.completionFence) throw new Error("VIDEO_SESSION_UNAVAILABLE");
    const storageSession = this.storageSession(session);
    if (!await this.storage.sourceCommitted(storageSession)) {
      try { await this.storage.complete(storageSession); }
      catch { if (!await this.storage.sourceCommitted(storageSession)) throw new Error("VIDEO_COMPLETION_UNCERTAIN"); }
    }
    if (!await this.storage.sourceCommitted(storageSession)) throw new Error("VIDEO_COMPLETION_UNCERTAIN");
    return this.snapshot(await this.ledger.commitCompletion(actor, id, session.completionFence));
  }
  async get(actor: ListingActor, id: string): Promise<VideoSessionSnapshot> {
    const session = await this.ledger.read(actor, id);
    const parts = ["UPLOADING", "PAUSED", "COMPLETING"].includes(session.state)
      ? await this.storage.listParts(this.storageSession(session)) : [];
    const current = await this.ledger.read(actor, id);
    if (current.state !== session.state || current.storageUploadId !== session.storageUploadId) throw new Error("VIDEO_SESSION_UNAVAILABLE");
    return { ...this.snapshot(current), parts };
  }
  async credentials(actor: ListingActor, id: string, partNumbers: number[]) {
    const session = await this.ledger.read(actor, id);
    const count = Math.ceil(session.sizeBytes / (5 * 1024 * 1024));
    if (session.state !== "UPLOADING" || !partNumbers.length || partNumbers.length > 3 || new Set(partNumbers).size !== partNumbers.length || partNumbers.some(part => !Number.isInteger(part) || part < 1 || part > count)) throw new Error("VIDEO_PART_INVALID");
    const parts = [];
    for (const partNumber of partNumbers) parts.push({ partNumber, ...await this.storage.partCredential(this.storageSession(session), partNumber) });
    const current = await this.ledger.read(actor, id);
    if (current.state !== "UPLOADING" || current.storageUploadId !== session.storageUploadId) throw new Error("VIDEO_SESSION_UNAVAILABLE");
    return { version: 1 as const, sessionId: id, parts };
  }
  async change(actor: ListingActor, id: string, action: "pause" | "resume" | "cancel"): Promise<VideoSessionSnapshot> {
    return this.snapshot(await this.ledger.change(actor, id, action));
  }
  private storageSession(session: OwnedVideoSession): VideoStorageSession {
    if (!session.storageUploadId) throw new Error("VIDEO_SESSION_INITIALIZING");
    return { sessionId: session.id, uploadId: session.uploadId, storageUploadId: session.storageUploadId, expectedBytes: session.sizeBytes, expiresAt: session.expiresAt };
  }
  private snapshot(session: OwnedVideoSession): VideoSessionSnapshot {
    return { version: 1, sessionId: session.id, generation: session.generationId, state: session.state, expiresAt: session.expiresAt, partBytes: 5 * 1024 * 1024, partCount: Math.ceil(session.sizeBytes / (5 * 1024 * 1024)) };
  }
}
