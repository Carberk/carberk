import "reflect-metadata";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { IdentityModule } from "../../identity/identity.module";
import type { BusinessAuthorityPort, ClockPort } from "../../identity/identity.public";
import type { PrismaService } from "@auto-tm/db";
import { PrismaVideoPlayback } from "./PrismaVideoPlayback";
import { VideoDatabase } from "./testing/VideoDatabase";

const now = new Date("2026-10-25T12:00:00.000Z");
const secret = "s".repeat(43);
function fixture() {
  const db = new VideoDatabase();
  db.put("users", { id: "viewer", suspendedAt: null, deletionScheduledAt: null });
  db.put("sessions", { id: "session", userId: "viewer", expiresAt: new Date("2026-10-26"), user: { id: "viewer", suspendedAt: null, deletionScheduledAt: null, dealershipMemberships: [] } });
  db.put("listings", { id: "listing", sellerId: "seller", businessId: null, status: "sold", activeVideoGenerationId: "generation", pendingVideoGenerationId: null });
  db.put("video_generations", { id: "generation", uploadId: "upload", listingId: "listing", state: "READY", readyAt: now, retiredAt: null, durationMs: 1000, manifest: { assets: [
    { path: "master.m3u8", key: "video/v1/upload/generation/master.m3u8", purpose: "playback", sizeBytes: 30, contentType: "application/vnd.apple.mpegurl" },
    { path: "240/index.m3u8", key: "video/v1/upload/generation/240/index.m3u8", purpose: "playback", sizeBytes: 20, contentType: "application/vnd.apple.mpegurl" },
    { path: "poster.jpg", key: "video/v1/upload/generation/poster.jpg", purpose: "poster", sizeBytes: 10, contentType: "image/jpeg" },
  ] } });
  const hash = createHash("sha256").update(secret).digest("hex");
  db.put("video_grants", { id: "grant", secretHash: hash, ownerUserId: "viewer", ownerSessionId: "session", listingId: "listing", generationId: "generation", purpose: "playback", expiresAt: new Date("2026-10-26"), revokedAt: null });
  const clock = { now: () => now };
  // Compose the actual providers exposed by Identity's Nest composition module.
  // This avoids an internal cross-context import or a fake authorization policy.
  const providers = Reflect.getMetadata("providers", IdentityModule) as { name?: string; useClass?: { name: string } }[];
  const Repository = providers.find(p => p.useClass?.name === "PrismaBusinessAuthority")?.useClass as unknown as new (db: PrismaService) => unknown;
  const Authority = providers.find(p => p.name === "CheckBusinessAuthority") as unknown as new (repository: unknown, clock: ClockPort) => BusinessAuthorityPort;
  const identity = new Authority(new Repository(db.prisma), clock);
  const service = new PrismaVideoPlayback(db.prisma, identity, { isEligible: () => true }, clock, () => secret);
  return { db, service };
}
describe("playback with complete outer preparation", () => {
  it("mints a Session-bound grant after preparing all current authority and generation dependencies", async () => {
    const f = fixture();
    expect(await f.service.issue({ userId: "viewer", sessionId: "session", listingId: "listing", purpose: "playback" })).toMatchObject({ url: `/video-grants/${secret}/master.m3u8`, generationId: "generation", expiresAt: new Date("2026-10-25T12:05:00Z") });
    expect(f.db.rows["video_grants"]?.at(-1)).toMatchObject({ ownerUserId: "viewer", ownerSessionId: "session", generationId: "generation" });
  });
  it("reads a descriptor through the same authority prefix", async () => {
    const f = fixture();
    expect(await f.service.describe({ userId: "viewer", sessionId: "session", listingId: "listing" })).toEqual({ generationId: "generation", durationMs: 1000, renditions: [240] });
    expect(f.db.reachedWrite).toBe(false);
  });
  it("authorizes an existing grant without taking its lock before its User and Listing", async () => {
    const f = fixture();
    expect(await f.service.authorize(secret)).toMatchObject({ purpose: "playback" });
    expect(f.db.reachedWrite).toBe(false);
  });
  it("refuses a changed graph after waiting before minting any grant", async () => {
    const f = fixture(); f.db.changeAfterLocks = () => { f.db.rows["listings"]![0]!["activeVideoGenerationId"] = "new-generation"; };
    expect(await f.service.issue({ userId: "viewer", sessionId: "session", listingId: "listing", purpose: "playback" })).toBeNull();
    expect(f.db.reachedWrite).toBe(false);
    expect(f.db.rows["video_grants"]).toHaveLength(1);
  });
  it("refuses failed campaign preparation without minting a grant", async () => {
    const f = fixture(); f.db.rejectPreparation = true;
    expect(await f.service.issue({ userId: "viewer", sessionId: "session", listingId: "listing", purpose: "playback" })).toBeNull();
    expect(f.db.reachedWrite).toBe(false);
  });
});
