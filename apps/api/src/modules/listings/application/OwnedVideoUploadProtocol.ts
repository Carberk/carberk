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
  async create(_actor: ListingActor, _input: VideoSessionCreate): Promise<VideoSessionSnapshot> { throw new Error("VIDEO_PROTOCOL_INACTIVE"); }
  async complete(_actor: ListingActor, _id: string): Promise<VideoSessionSnapshot> { throw new Error("VIDEO_PROTOCOL_INACTIVE"); }
  private storageSession(session: OwnedVideoSession): VideoStorageSession {
    if (!session.storageUploadId) throw new Error("VIDEO_SESSION_INITIALIZING");
    return { sessionId: session.id, uploadId: session.uploadId, storageUploadId: session.storageUploadId, expectedBytes: session.sizeBytes, expiresAt: session.expiresAt };
  }
  private snapshot(session: OwnedVideoSession): VideoSessionSnapshot {
    return { version: 1, sessionId: session.id, generation: session.generationId, state: session.state, expiresAt: session.expiresAt, partBytes: 5 * 1024 * 1024, partCount: Math.ceil(session.sizeBytes / (5 * 1024 * 1024)) };
  }
}
