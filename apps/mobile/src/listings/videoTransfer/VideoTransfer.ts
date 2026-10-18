import type { PreparedVideo } from "../videoPreparation/VideoPreparation";

export interface VideoTransferRecord {
  version: 1;
  ownerId: string;
  idempotencyKey: string;
  target: { kind: "draft" | "listing"; id: string };
  prepared: PreparedVideo;
  posterMs: number;
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
/** Foreground-only transfer. Background uses pause, never a silent resume. */
export class VideoTransfer {
  constructor(private readonly device: VideoTransferDevice) {}
  async run(): Promise<void> {}
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async cancel(): Promise<void> {}
}
