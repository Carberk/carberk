import { describe, expect, it } from "vitest";
import { VideoManifestGateway } from "./VideoManifestGateway";

const assets = [
  { path: "master.m3u8", purpose: "playback" as const },
  { path: "240/index.m3u8", purpose: "playback" as const },
  { path: "240/init.mp4", purpose: "playback" as const },
  { path: "240/seg-1.m4s", purpose: "playback" as const },
  { path: "poster.webp", purpose: "poster" as const },
];
describe("video manifest gateway", () => {
  it("rewrites variant, segment and init references into the same grant namespace", () => {
    const gateway = new VideoManifestGateway(assets);
    expect(gateway.rewrite("#EXTM3U\n240/index.m3u8\n", "master.m3u8", "opaque-grant")).toBe("#EXTM3U\n/video-grants/opaque-grant/240/index.m3u8\n");
    expect(gateway.rewrite('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\nseg-1.m4s\n', "240/index.m3u8", "opaque-grant")).toBe('#EXTM3U\n#EXT-X-MAP:URI="/video-grants/opaque-grant/240/init.mp4"\n/video-grants/opaque-grant/240/seg-1.m4s\n');
  });
  it("rejects references outside the exact stream manifest and poster-purpose escalation", () => {
    const gateway = new VideoManifestGateway(assets);
    for (const uri of ["https://evil/seg", "//evil/seg", "../master.m3u8", "%2e%2e/seg", "unknown.ts", "poster.webp", "240/seg-1.m4s?secret=x", "240\\seg-1.m4s"]) {
      expect(() => gateway.rewrite(`#EXTM3U\n${uri}\n`, "master.m3u8", "grant")).toThrow("VIDEO_ASSET_DENIED");
    }
    expect(gateway.allows("poster.webp", "poster")).toBe(true);
    expect(gateway.allows("master.m3u8", "poster")).toBe(false);
    expect(gateway.allows("poster.webp", "playback")).toBe(false);
  });
  it("rejects encryption and malformed URI attributes instead of leaving unprotected references", () => {
    const gateway = new VideoManifestGateway(assets);
    for (const text of ['#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"', '#EXTM3U\n#EXT-X-MAP:URI=init.mp4']) {
      expect(() => gateway.rewrite(text, "240/index.m3u8", "grant")).toThrow("VIDEO_MANIFEST_INVALID");
    }
  });
});
