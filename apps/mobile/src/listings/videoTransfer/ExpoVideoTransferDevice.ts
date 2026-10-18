import type { PreparedVideo } from "../videoPreparation/VideoPreparation";
import type { VideoTransferDevice, VideoTransferRecord } from "./VideoTransfer";

export class ExpoVideoTransferDevice implements VideoTransferDevice {
  constructor(private readonly ownerId: string, private readonly targetId: string) {}
  async load(): Promise<VideoTransferRecord | null> { return null; }
  async save(_record: VideoTransferRecord): Promise<void> {}
  async verify(_prepared: PreparedVideo): Promise<boolean> { return false; }
  async readPart(_prepared: PreparedVideo, _offset: number, _size: number): Promise<Uint8Array> { return new Uint8Array(); }
}
