import { describe, expect, it } from "vitest";
import { VideoGrantService, VideoProcessingService } from "./VideoProcessing";
describe("video processing and grants", () => {
 it("enforces the published duration and deduplicates renditions", () => { const result = new VideoProcessingService().prepare({ durationMs: 90_000, sourceBytes: 10, renditions: [{ height: 360, key: "a", bytes: 1 }, { height: 360, key: "b", bytes: 2 }] }); expect(result.renditions).toHaveLength(1); expect(() => new VideoProcessingService().prepare({ durationMs: 90_001, sourceBytes: 1, renditions: [{ height: 360, key: "a", bytes: 1 }] })).toThrow(); });
 it("issues short poster and longer playback grants with hashes", () => { const now = new Date("2026-10-15T00:00:00Z"); const service = new VideoGrantService(); const poster = service.issue({ listingId: "l", generationId: "g", purpose: "poster", now }); const play = service.issue({ listingId: "l", generationId: "g", purpose: "playback", now }); expect(poster.secret).not.toBe(poster.hash); expect(poster.expiresAt.getTime() - now.getTime()).toBe(60_000); expect(play.expiresAt.getTime() - now.getTime()).toBe(300_000); });
});
