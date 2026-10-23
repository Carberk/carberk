import type { PreparedVideo } from "../../videoPreparation/VideoPreparation";
import type { VideoTransferDevice, VideoTransferRecord } from "../VideoTransfer";

export class InMemoryVideoTransferDevice implements VideoTransferDevice {
  bytes = new Uint8Array(5 * 1024 * 1024 + 2).fill(7);
  valid = true;
  record: VideoTransferRecord | null = null;
  async load() { return structuredClone(this.record); }
  async save(record: VideoTransferRecord) { this.record = structuredClone(record); }
  async verify(_prepared: PreparedVideo) { return this.valid; }
  async readPart(_prepared: PreparedVideo, offset: number, size: number) { return this.bytes.slice(offset, offset + size); }
}
