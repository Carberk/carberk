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

  async execute(generationId: string): Promise<"unavailable" | "adopted" | "superseded" | "failed"> {
    const startedAt = this.now().getTime();
    const lease = await this.ledger.claim(generationId, new Date(startedAt), this.randomToken());
    if (!lease) return "unavailable";
    // Leave four minutes of the durable twenty-minute lease for the longest
    // bounded storage operation, transaction completion and cleanup grace.
    const checkBudget = () => { if (this.now().getTime() - startedAt >= 16 * 60_000) throw new Error("VIDEO_PROCESSING_TIMEOUT"); };
    let source: Awaited<ReturnType<VideoProcessingObjects["download"]>> | undefined;
    let output: Awaited<ReturnType<VideoMediaProcessor["process"]>> | undefined;
    try {
      source = await this.objects.download(lease);
      checkBudget();
      output = await this.codec.process({ path: source.path, sha256: lease.sha256, posterMs: lease.posterMs });
      checkBudget();
      const assets = output.assets.map(asset => ({ ...asset, key: `video/v1/${lease.uploadId}/${lease.generationId}/${asset.path}` }));
      await this.validateManifests(output.directory, assets);
      // Persist every exact key before the first write, so cancellation and
      // process death cannot leave an unrecorded generation directory.
      if (!await this.ledger.plan(lease, assets, this.now())) return "superseded";
      for (const asset of assets) { checkBudget(); await this.objects.publish(output.directory, asset); }
      for (const asset of assets) {
        checkBudget();
        if (!await this.objects.verify(asset)) throw new Error("VIDEO_READBACK_FAILED");
      }
      checkBudget();
      const adopted = await this.ledger.adopt(lease, {
        durationMs: output.durationMs, width: output.width, height: output.height,
        sourceSha256: output.sourceSha256, assets,
      }, this.now());
      return adopted ? "adopted" : "superseded";
    } catch (error) {
      const code = error instanceof Error && /^VIDEO_[A-Z_]+$/.test(error.message) ? error.message : "VIDEO_PROCESSING_FAILED";
      await this.ledger.fail(lease, code, this.now());
      return "failed";
    } finally {
      // Disposal is a boundary obligation. A failed output cleanup must not
      // skip source cleanup, and neither error changes the durable ledger result.
      const disposals = [output?.dispose(), source?.dispose()].filter((promise): promise is Promise<void> => !!promise);
      await Promise.allSettled(disposals);
    }
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
