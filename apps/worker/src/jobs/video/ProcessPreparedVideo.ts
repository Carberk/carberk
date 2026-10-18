import { readFile } from "node:fs/promises";
import { posix, join } from "node:path";

import type { VideoMediaProcessor } from "./VideoMediaProcessor";
import type { VideoProcessingLedger, VideoProcessingObjects, VideoPublishedAsset } from "./VideoProcessingPorts";

/** One job. The durable ledger decides whether outputs may become public.
 * No DB lock is held during downloading, encoding or storage I/O. */
export class ProcessPreparedVideo {
  constructor(
    private readonly ledger: VideoProcessingLedger,
    private readonly objects: VideoProcessingObjects,
    private readonly codec: VideoMediaProcessor,
    private readonly now: () => Date,
    private readonly randomToken: () => string,
  ) {}

  async execute(_generationId: string): Promise<"unavailable" | "adopted" | "superseded" | "failed"> {
    return "unavailable";
  }

  private async validateManifests(directory: string, assets: VideoPublishedAsset[]): Promise<void> {
    const paths = new Set(assets.map(asset => asset.path));
    if (paths.size !== assets.length || !paths.has("master.m3u8") || !assets.some(asset => asset.purpose === "poster")) throw new Error("VIDEO_MANIFEST_INVALID");
    for (const asset of assets) {
      if (!/^(?:[0-9]+\/)?[A-Za-z0-9_-]+\.(?:m3u8|ts|jpg)$/.test(asset.path)) throw new Error("VIDEO_MANIFEST_INVALID");
      if (!asset.path.endsWith(".m3u8")) continue;
      if (asset.sizeBytes > 512 * 1024) throw new Error("VIDEO_MANIFEST_INVALID");
      const playlist = await readFile(join(directory, asset.path), "utf8");
      if (!playlist.startsWith("#EXTM3U\n") || /(?:URI\s*=|#EXT-X-KEY)/i.test(playlist)) throw new Error("VIDEO_MANIFEST_INVALID");
      for (const line of playlist.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        if (!/^(?:[0-9]+\/)?[A-Za-z0-9_-]+\.(?:m3u8|ts)$/.test(line)) throw new Error("VIDEO_MANIFEST_INVALID");
        if (!paths.has(posix.join(posix.dirname(asset.path), line))) throw new Error("VIDEO_MANIFEST_INVALID");
      }
    }
  }
}
