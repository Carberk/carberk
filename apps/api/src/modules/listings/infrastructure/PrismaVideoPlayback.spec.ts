import { describe, expect, it } from "vitest";
import type { PrismaService } from "@auto-tm/db";
import type { BusinessAuthorityPort } from "../../identity/identity.public";
import { PrismaVideoPlayback } from "./PrismaVideoPlayback";

const secret = "s".repeat(43);
function fixture() {
  const grant = { id: "grant", ownerUserId: "viewer", ownerSessionId: "session", purpose: "playback", listingId: "listing", generationId: "generation", expiresAt: new Date(Date.now() + 60_000), revokedAt: null as Date | null };
  const listing = { id: "listing", activeVideoGenerationId: "generation", sellerId: "seller", businessId: null, status: "sold" };
  const generation = { id: "generation", listingId: "listing", uploadId: "upload", state: "READY", readyAt: new Date(), retiredAt: null as Date | null, manifest: { assets: [{ path: "master.m3u8", key: "video/v1/upload/generation/master.m3u8", purpose: "playback", sizeBytes: 23, contentType: "application/vnd.apple.mpegurl" }] } };
  let active = true; let eligible = true;
  const transaction = { $executeRaw: async () => 0, $queryRaw: async () => [{ id: "grant" }], videoGrant: { findUnique: async () => grant }, listing: { findUnique: async () => listing }, videoGeneration: { findUnique: async () => generation } };
  const prisma = { $transaction: async (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction) } as unknown as PrismaService;
  const identity = { resolve: async () => { if (!active) throw new Error("SESSION_REQUIRED"); return { kind: "personal", userId: "viewer" }; }, authorize: async () => { throw new Error("MEMBERSHIP_REQUIRED"); } } as BusinessAuthorityPort;
  return { grant, listing, generation, service: new PrismaVideoPlayback(prisma, identity, { isEligible: () => eligible }), revokeSession: () => { active = false; }, revokeTester: () => { eligible = false; } };
}
describe("current persisted playback authority", () => {
  it("admits exact ready active generations including ordinary sold Listing visibility", async () => { const f = fixture(); expect(await f.service.authorize(secret)).toMatchObject({ purpose: "playback", assets: [{ path: "master.m3u8" }] }); });
  it("refuses each later request after session, tester, grant or active-generation revocation", async () => {
    const session = fixture(); session.revokeSession(); expect(await session.service.authorize(secret)).toBeNull();
    const tester = fixture(); tester.revokeTester(); expect(await tester.service.authorize(secret)).toBeNull();
    const grant = fixture(); grant.grant.revokedAt = new Date(); expect(await grant.service.authorize(secret)).toBeNull();
    const replaced = fixture(); replaced.listing.activeVideoGenerationId = "replacement"; expect(await replaced.service.authorize(secret)).toBeNull();
    const retired = fixture(); retired.generation.retiredAt = new Date(); expect(await retired.service.authorize(secret)).toBeNull();
  });
  it("refuses unbound legacy grants, expired grants, banned public Listings and arbitrary manifest keys", async () => {
    const legacy = fixture(); legacy.grant.ownerSessionId = ""; expect(await legacy.service.authorize(secret)).toBeNull();
    const expired = fixture(); expired.grant.expiresAt = new Date(0); expect(await expired.service.authorize(secret)).toBeNull();
    const banned = fixture(); banned.listing.status = "banned"; expect(await banned.service.authorize(secret)).toBeNull();
    const escaped = fixture(); escaped.generation.manifest.assets[0]!.key = "private/another-user/secret"; expect(await escaped.service.authorize(secret)).toBeNull();
  });
});
