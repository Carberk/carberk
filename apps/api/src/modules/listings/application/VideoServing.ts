import { createHash, timingSafeEqual } from "node:crypto";
export class VideoServingService {
  authorize(input: { presentedSecret: string; storedHash: string; listingId: string; requestedListingId: string; expiresAt: Date; revokedAt?: Date | null; now?: Date }): { ok: true; headers: Record<string, string> } | { ok: false } {
    const hash = createHash("sha256").update(input.presentedSecret).digest("hex"); const a = Buffer.from(hash); const b = Buffer.from(input.storedHash); const match = a.length === b.length && timingSafeEqual(a, b);
    if (!match || input.listingId !== input.requestedListingId || !!input.revokedAt || input.expiresAt.getTime() <= (input.now ?? new Date()).getTime()) return { ok: false };
    return { ok: true, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } };
  }
}
