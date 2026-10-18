import { Controller, Get, Inject, Param, Req, Res } from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { Public } from "../../../common/public.decorator";
import { VIDEO_PLAYBACK_AUTHORITY, VIDEO_PLAYBACK_OBJECTS, type VideoPlaybackAuthority, type VideoPlaybackObjects } from "../application/VideoPlaybackPorts";
import { VideoManifestGateway } from "../infrastructure/VideoManifestGateway";

@Controller("video-grants")
export class VideoPlaybackController {
  private active = 0;
  constructor(@Inject(VIDEO_PLAYBACK_AUTHORITY) private readonly authority: VideoPlaybackAuthority, @Inject(VIDEO_PLAYBACK_OBJECTS) private readonly objects: VideoPlaybackObjects) {}
  @Get(":secret/*") @Public()
  async read(@Param("secret") secret: string, @Param("*") path: string | string[], @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer").header("X-Content-Type-Options", "nosniff");
    if (this.active >= 16) { reply.code(503).send({ code: "VIDEO_UNAVAILABLE" }); return; }
    this.active++;
    let released = false; const release = () => { if (!released) { released = true; this.active--; } };
    const abort = new AbortController(); const deadline = setTimeout(() => abort.abort(), 30_000);
    const finish = () => { clearTimeout(deadline); abort.abort(); release(); };
    reply.raw.once("close", finish); reply.raw.once("finish", finish);
    try {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(secret)) throw new Error("DENIED");
      const authorized = await this.authority.authorize(secret);
      if (!authorized) throw new Error("DENIED");
      const assetPath = Array.isArray(path) ? path.join("/") : path;
      const gateway = new VideoManifestGateway(authorized.assets);
      const asset = authorized.assets.find((entry) => entry.path === assetPath);
      if (!asset || !gateway.allows(assetPath, authorized.purpose) || !Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes < 1) throw new Error("DENIED");
      const playlist = assetPath.endsWith(".m3u8");
      let range: { start: number; end: number } | undefined;
      if (request.headers.range) {
        const matched = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
        if (playlist || !matched) { reply.header("Content-Range", `bytes */${asset.sizeBytes}`).code(416).send(); return; }
        range = { start: Number(matched[1]), end: matched[2] ? Number(matched[2]) : asset.sizeBytes - 1 };
        if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start || range.end >= asset.sizeBytes) { reply.header("Content-Range", `bytes */${asset.sizeBytes}`).code(416).send(); return; }
      }
      if (request.method === "HEAD") { reply.header("Content-Type", asset.contentType).header("Content-Length", asset.sizeBytes).code(200).send(); return; }
      const stream = await this.objects.open(asset, range, abort.signal);
      abort.signal.addEventListener("abort", () => stream.destroy(), { once: true });
      if (playlist) {
        const chunks: Buffer[] = []; let bytes = 0;
        for await (const chunk of stream) { const buffer: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); bytes += buffer.length; if (bytes > 512 * 1024) { stream.destroy(); throw new Error("DENIED"); } chunks.push(buffer); }
        reply.header("Content-Type", "application/vnd.apple.mpegurl").send(gateway.rewrite(Buffer.concat(chunks).toString("utf8"), assetPath, secret));
      } else {
        reply.header("Content-Type", asset.contentType).header("Accept-Ranges", "bytes").header("Content-Length", range ? range.end - range.start + 1 : asset.sizeBytes);
        if (range) reply.header("Content-Range", `bytes ${range.start}-${range.end}/${asset.sizeBytes}`).code(206);
        reply.send(stream);
      }
    } catch { if (!reply.sent) reply.code(404).send({ code: "VIDEO_UNAVAILABLE" }); }
    finally { if (reply.sent && reply.raw.writableFinished) finish(); }
  }
}
