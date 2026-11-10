import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, NotFoundException, HttpException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Env } from "../../../env.schema";
import { ConfigListingVideoAccess } from "../../../common/ConfigListingVideoAccess";
import { IDENTITY_CHECK_PORT, IDENTITY_SESSION_REPOSITORY, IDENTITY_CLOCK_PORT, type IdentityCheckPort, type SessionRepository, type ClockPort } from "../../identity/identity.public";
import { VIDEO_SERVING_REPOSITORY, type VideoServingRepository, type VideoAudience, type ServingVideo } from "../domain/ports/VideoServingRepository";
import { VIDEO_MEDIA_STORAGE, type VideoMediaStorage } from "../domain/ports/VideoMediaStorage";

const audiences = z.enum(["viewer", "owner-preview", "moderator"]);
const grantSchema = z.object({ sub: z.string(), sid: z.string(), aud: audiences, video: z.string(), generation: z.string(), scope: z.enum(["cover", "playback"]), exp: z.number() });
const manifestSchema = z.record(z.string(), z.object({ key: z.string().min(1), sizeBytes: z.number().int().positive() }));
type Grant = z.infer<typeof grantSchema>;
type Actor = { sub?: string; sid?: string };
const unavailable = () => new NotFoundException({ code: "VIDEO_NOT_AVAILABLE", message: "Video unavailable" });
const resource = (member: string) => `${Buffer.from(member).toString("base64url")}.${member.startsWith("cover:") ? "webp" : member === "master" || member.startsWith("playlist:") ? "m3u8" : "ts"}`;

/** Grants only carry authority to recheck; no file request trusts a prior read. */
@Injectable()
export class ServeListingVideo {
  private readonly key: Buffer;
  constructor(
    @Inject(VIDEO_SERVING_REPOSITORY) private readonly videos: VideoServingRepository,
    @Inject(VIDEO_MEDIA_STORAGE) private readonly storage: VideoMediaStorage,
    @Inject(IDENTITY_CHECK_PORT) private readonly identity: IdentityCheckPort,
    @Inject(IDENTITY_SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(IDENTITY_CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ConfigListingVideoAccess) private readonly access: ConfigListingVideoAccess,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {
    this.key = createHmac("sha256", config.get("JWT_ACCESS_SECRET", { infer: true })).update("listing-video-grant-v1").digest();
  }

  private async authorize(actor: Actor, audience: VideoAudience, video: ServingVideo | null): Promise<{ sub: string; sid: string }> {
    const { sub, sid } = actor;
    if (!sub || !sid) throw unavailable();
    const session = await this.sessions.findById(sid);
    const now = this.clock.now();
    if (!session || session.userId !== sub || session.expiresAt <= now || await this.identity.isSuspended(sub) || await this.identity.isDeletionScheduled(sub)) throw unavailable();
    if (audience === "moderator") {
      if (!await this.identity.isAdmin(sub) || !session.adminTotpExpiresAt || session.adminTotpExpiresAt <= now) throw unavailable();
    } else if (audience === "viewer" && !this.access.canViewVideo(sub)) throw unavailable();
    if (!video) return { sub, sid };
    if (video.deleted) throw unavailable();
    if (audience === "viewer" && !["active", "sold"].includes(video.listingStatus ?? "")) throw unavailable();
    if (audience === "owner-preview" && (video.ownerId !== sub || video.targetOwnerId !== sub)) throw unavailable();
    if (audience === "moderator" && !video.listingStatus) throw unavailable();
    return { sub, sid };
  }

  private ready(video: ServingVideo) {
    const generation = video.active;
    if (!generation || generation.status !== "Ready" || generation.sourceState !== "COMPLETED" || generation.bucket !== this.storage.bucket) throw unavailable();
    const parsed = manifestSchema.safeParse(generation.manifest);
    if (!parsed.success || !parsed.data["master"] || !["thumbnail", "list", "detail", "fullscreen"].every((variant) => parsed.data[`cover:${variant}`])) throw unavailable();
    return { generation, manifest: parsed.data };
  }

  private origin(): string {
    const configured = this.config.get("LISTING_VIDEO_API_ORIGIN", { infer: true });
    const env = this.config.get("APP_ENV", { infer: true });
    if (!configured && env !== "development" && env !== "test") throw unavailable();
    return configured ?? `http://localhost:${this.config.get("PORT", { infer: true }) ?? 3006}`;
  }
  private sign(grant: Grant): string {
    const payload = Buffer.from(JSON.stringify(grant)).toString("base64url");
    return `${payload}.${createHmac("sha256", this.key).update(payload).digest("base64url")}`;
  }
  private verify(token: string): Grant {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra || token.length > 2048) throw unavailable();
    const expected = createHmac("sha256", this.key).update(payload).digest();
    const received = Buffer.from(signature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(expected, received)) throw unavailable();
    try {
      const grant = grantSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
      if (grant.exp <= this.clock.now().getTime()) throw unavailable();
      return grant;
    } catch { throw unavailable(); }
  }
  private url(grant: Grant, token: string, member: string): string {
    return `${this.origin()}/api/v1/listings/video-files/${grant.aud}/${grant.video}/${grant.generation}/${resource(member)}?grant=${token}`;
  }

  async control(actor: Actor, audienceInput: string, type: string, id: string, play: boolean) {
    const audience = audiences.safeParse(audienceInput);
    if (!audience.success || (type !== "listing" && type !== "draft")) throw unavailable();
    const video = await this.videos.find({ type, id });
    const authorized = await this.authorize(actor, audience.data, video);
    if (!video) { if (play) throw unavailable(); return { status: "none" }; }
    // ADR-0112 reserves pending state for owner and moderator reads; viewers see only Ready.
    const pendingStatus = audience.data === "viewer" ? undefined : video.pendingStatus?.toLowerCase();
    if (!video.active) { if (play) throw unavailable(); return { status: pendingStatus ?? "none" }; }
    const { generation, manifest } = this.ready(video);
    const grant: Grant = { sub: authorized.sub, sid: authorized.sid, aud: audience.data, video: video.id, generation: generation.id, scope: play ? "playback" : "cover", exp: this.clock.now().getTime() + 300_000 };
    const token = this.sign(grant);
    const cover = Object.fromEntries(["thumbnail", "list", "detail", "fullscreen"].map((variant) => [variant, this.url(grant, token, `cover:${variant}`)]));
    return { status: "ready", ...(pendingStatus ? { pendingStatus } : {}), video: { id: video.id, generationId: generation.id, durationMs: generation.durationMs, cover }, expiresAt: new Date(grant.exp).toISOString(), ...(play ? { url: this.url(grant, token, "master") } : {}), qualities: [240, 360, 720].filter((tier) => manifest[`playlist:${tier}`]) };
  }

  async file(input: { audience: string; videoId: string; generationId: string; resource: string; token: string; range?: string; head: boolean }) {
    const grant = this.verify(input.token);
    if (grant.aud !== input.audience || grant.video !== input.videoId || grant.generation !== input.generationId) throw unavailable();
    const video = await this.videos.find({ videoId: grant.video });
    await this.authorize(grant, grant.aud, video);
    if (!video) throw unavailable();
    const { generation, manifest } = this.ready(video);
    if (generation.id !== grant.generation) throw unavailable();
    const member = Object.keys(manifest).find((name) => resource(name) === input.resource);
    if (!member || (grant.scope === "cover" && !member.startsWith("cover:"))) throw unavailable();
    const entry = manifest[member];
    if (!entry) throw unavailable();
    const playlist = member === "master" || member.startsWith("playlist:");
    try {
      if (playlist) {
        const bytes = await this.storage.mediaRead(entry.key);
        const rewrite = (uri: string) => {
          // The worker writes full Bucket keys into every playlist; only exact recorded manifest keys resolve.
          const child = Object.keys(manifest).find((name) => manifest[name]?.key === uri);
          if (!child) throw unavailable();
          return this.url(grant, input.token, child);
        };
        const text = Buffer.from(bytes).toString("utf8").split(/\r?\n/).map((line) => {
          if (!line || line.startsWith("#")) return line.replace(/URI="([^"]*)"/g, (_match, uri: string) => `URI="${rewrite(uri)}"`);
          return rewrite(line.trim());
        }).join("\n");
        const body = Buffer.from(text);
        return { body: input.head ? undefined : body, status: 200, headers: { "Content-Type": "application/vnd.apple.mpegurl", "Content-Length": String(body.length) } };
      }
      const meta = await this.storage.mediaHead(entry.key);
      let start = 0;
      let end = meta.sizeBytes - 1;
      if (input.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(input.range);
        if (!match || (!match[1] && !match[2])) throw new HttpException({ code: "VIDEO_RANGE_INVALID" }, 416);
        start = match[1] ? Number(match[1]) : Math.max(0, meta.sizeBytes - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= meta.sizeBytes) throw new HttpException({ code: "VIDEO_RANGE_INVALID" }, 416);
      }
      const headers: Record<string, string> = { "Content-Type": member.startsWith("cover:") ? "image/webp" : "video/mp2t", "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1), ETag: meta.etag };
      if (input.range) headers["Content-Range"] = `bytes ${start}-${end}/${meta.sizeBytes}`;
      return { status: input.range ? 206 : 200, headers, body: input.head ? undefined : Buffer.from(await this.storage.mediaRead(entry.key, input.range ? `bytes=${start}-${end}` : undefined)) };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 416) {
        const meta = await this.storage.mediaHead(entry.key);
        return { status: 416, headers: { "Content-Range": `bytes */${meta.sizeBytes}`, "Accept-Ranges": "bytes", "Content-Length": "0" }, body: undefined };
      }
      throw unavailable();
    }
  }
}
