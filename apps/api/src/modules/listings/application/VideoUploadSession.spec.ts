import { describe, expect, it } from "vitest";
import { VideoUploadSessionService, type VideoSessionRecord } from "./VideoUploadSession";
const base = (state: VideoSessionRecord["state"] = "UPLOADING"): VideoSessionRecord => ({ id: "s", uploadId: "u", userId: "seller", listingId: "listing", sourceKey: "pending/video/original.mp4", state, expiresAt: new Date("2026-10-15T01:00:00Z"), claimToken: "fence" });
describe("VideoUploadSessionService", () => {
 it("fences mutations to owner and expiry", () => { const s = new VideoUploadSessionService(() => new Date("2026-10-15T00:00:00Z")); expect(s.pause(base(), "seller").state).toBe("PAUSED"); expect(() => s.pause(base(), "other")).toThrow("VIDEO_SESSION_NOT_MUTABLE"); });
 it("cancellation wins and enters durable cleanup", () => { const s = new VideoUploadSessionService(); expect(s.cancel(base(), "seller").state).toBe("CLEANUP_PENDING"); });
});
