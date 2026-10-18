import type { ListingActor } from "../ListingOwnership";
import type { OwnedVideoSession, OwnedVideoSessionLedger, VideoSessionCreate } from "../OwnedVideoUploadProtocol";

export class InMemoryOwnedVideoSessionLedger implements OwnedVideoSessionLedger {
  session: OwnedVideoSession | null = null;
  cancelled = false;
  input: string | null = null;
  async reserve(_actor: ListingActor, input: VideoSessionCreate) {
    const serialized = JSON.stringify(input);
    if (this.input && this.input !== serialized) throw new Error("VIDEO_IDEMPOTENCY_CONFLICT");
    const initialize = this.session === null;
    this.input = serialized;
    this.session ??= { id: "00000000-0000-4000-8000-000000000001", uploadId: "00000000-0000-4000-8000-000000000002", generationId: "00000000-0000-4000-8000-000000000003", state: "INITIALIZING", expiresAt: new Date("2026-10-24T00:00:00Z"), storageUploadId: null, sizeBytes: input.prepared.sizeBytes, completionFence: null };
    return { session: structuredClone(this.session), initialize };
  }
  async read(_actor: ListingActor, _id: string) {
    if (!this.session || this.cancelled) throw new Error("VIDEO_SESSION_UNAVAILABLE");
    return structuredClone(this.session);
  }
  async bindInitialization(actor: ListingActor, id: string, storageUploadId: string) {
    await this.read(actor, id);
    if (!this.session) throw new Error("VIDEO_SESSION_UNAVAILABLE");
    this.session.storageUploadId = storageUploadId; this.session.state = "UPLOADING";
    return structuredClone(this.session);
  }
  async beginCompletion(actor: ListingActor, id: string) {
    await this.read(actor, id);
    if (!this.session) throw new Error("VIDEO_SESSION_UNAVAILABLE");
    this.session.state = "COMPLETING"; this.session.completionFence = "completion-fence";
    return structuredClone(this.session);
  }
  async commitCompletion(actor: ListingActor, id: string, fence: string) {
    await this.read(actor, id);
    if (!this.session || this.session.completionFence !== fence) throw new Error("VIDEO_SESSION_UNAVAILABLE");
    this.session.state = "PROCESSING";
    return structuredClone(this.session);
  }
  async change(actor: ListingActor, id: string, action: "pause" | "resume" | "cancel") {
    const current = await this.read(actor, id);
    if (!this.session) throw new Error("VIDEO_SESSION_UNAVAILABLE");
    this.session.state = action === "pause" ? "PAUSED" : action === "resume" ? "UPLOADING" : "CLEANUP_PENDING";
    this.cancelled = action === "cancel";
    return { ...current, state: this.session.state };
  }
}
