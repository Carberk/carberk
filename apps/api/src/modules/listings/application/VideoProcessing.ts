import { createHash, randomBytes } from "node:crypto";
export type Rendition = { height: 240 | 360 | 720; key: string; bytes: number };
export class VideoProcessingService {
  prepare(input: { durationMs: number; sourceBytes: number; renditions: Rendition[] }): { durationMs: number; renditions: Rendition[] } {
    if (!Number.isInteger(input.durationMs) || input.durationMs <= 0 || input.durationMs > 90_000 || input.sourceBytes <= 0) throw new Error("VIDEO_INVALID_SOURCE");
    if (!input.renditions.length || input.renditions.some((r) => r.bytes <= 0 || ![240, 360, 720].includes(r.height))) throw new Error("VIDEO_INVALID_RENDITIONS");
    return { durationMs: input.durationMs, renditions: input.renditions.filter((r, i, all) => all.findIndex((x) => x.height === r.height) === i) };
  }
}
export class VideoGrantService {
  issue(input: { listingId: string; generationId: string; purpose: "poster" | "playback"; now?: Date }): { secret: string; hash: string; expiresAt: Date } {
    const secret = randomBytes(32).toString("base64url"); const ttl = input.purpose === "poster" ? 60_000 : 300_000; const now = input.now ?? new Date();
    return { secret, hash: createHash("sha256").update(secret).digest("hex"), expiresAt: new Date(now.getTime() + ttl) };
  }
  valid(input: { expiresAt: Date; revokedAt?: Date | null; now?: Date }): boolean { const now = input.now ?? new Date(); return !input.revokedAt && input.expiresAt.getTime() > now.getTime(); }
}
