import { describe, expect, it } from "vitest";
import { VideoUploadSessionService, type VideoSessionRecord } from "./VideoUploadSession";
const base = (state: VideoSessionRecord["state"] = "UPLOADING"): VideoSessionRecord => ({ id: "s", uploadId: "u", userId: "seller", listingId: "listing", sourceKey: "pending/video/original.mp4", state, expiresAt: new Date("2026-10-15T01:00:00Z"), claimToken: "fence" });
describe("VideoUploadSessionService", () => {
 it("fences mutations to owner and expiry", () => { const s = new VideoUploadSessionService(() => new Date("2026-10-15T00:00:00Z")); expect(s.pause(base(), "seller").state).toBe("PAUSED"); expect(() => s.pause(base(), "other")).toThrow("VIDEO_SESSION_NOT_MUTABLE"); });
 it("cancellation wins and enters durable cleanup", () => { const s = new VideoUploadSessionService(); expect(s.cancel(base(), "seller").state).toBe("CLEANUP_PENDING"); });
});

describe("video recovery state boundaries", () => {
 const s = new VideoUploadSessionService(() => new Date("2026-10-15T00:00:00Z"));
 it.each(["COMPLETING", "PROCESSING", "FAILED", "CANCELLED", "CLEANUP_PENDING", "DELETED"] as const)("does not pause or resume %s", state => {
  expect(() => s.pause(base(state), "seller")).toThrow("VIDEO_SESSION_NOT_MUTABLE");
  expect(() => s.resume(base(state), "seller")).toThrow("VIDEO_SESSION_NOT_MUTABLE");
 });
 it("only resumes a paused session", () => {
  expect(s.resume(base("PAUSED"), "seller").state).toBe("UPLOADING");
  expect(() => s.resume(base(), "seller")).toThrow("VIDEO_SESSION_NOT_MUTABLE");
 });
 it("cannot cancel processing or resurrect deleted work", () => {
  expect(() => s.cancel(base("PROCESSING"), "seller")).toThrow("VIDEO_SESSION_NOT_MUTABLE");
  expect(() => s.cancel(base("DELETED"), "seller")).toThrow("VIDEO_SESSION_NOT_MUTABLE");
 });
 it("does not expire processing work whose upload already completed", () => {
  const expired = { ...base("PROCESSING"), expiresAt: new Date("2026-10-14T00:00:00Z") };
  expect(s.expire(expired).state).toBe("PROCESSING");
 });
});
