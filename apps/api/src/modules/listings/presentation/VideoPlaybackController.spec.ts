import "reflect-metadata";
import { Readable } from "node:stream";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import { VIDEO_PLAYBACK_AUTHORITY, VIDEO_PLAYBACK_OBJECTS, type VideoPlaybackAsset } from "../application/VideoPlaybackPorts";
import { VideoPlaybackController } from "./VideoPlaybackController";

const playlist = Buffer.from("#EXTM3U\n240/index.m3u8\n");
const master: VideoPlaybackAsset = { path: "master.m3u8", key: "private/master", purpose: "playback", sizeBytes: playlist.length, contentType: "application/vnd.apple.mpegurl" };
const segment: VideoPlaybackAsset = { path: "240/seg.ts", key: "private/segment", purpose: "playback", sizeBytes: 8, contentType: "video/mp2t" };
describe("protected video HTTP", () => {
  let app: NestFastifyApplication; let request: ReturnType<typeof supertest>; let revoked = false;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [VideoPlaybackController], providers: [
      { provide: VIDEO_PLAYBACK_AUTHORITY, useValue: { authorize: async (secret: string) => !revoked && secret === "grant" ? { purpose: "playback", assets: [master, segment, { ...master, path: "240/index.m3u8", key: "private/variant" }, { ...segment, path: "poster.webp", purpose: "poster" }] } : null } },
      { provide: VIDEO_PLAYBACK_OBJECTS, useValue: { open: async (asset: VideoPlaybackAsset, range: { start: number; end: number } | undefined) => { const bytes = asset.key === "private/master" ? playlist : Buffer.from("12345678"); return Readable.from([range ? bytes.subarray(range.start, range.end + 1) : bytes]); } } },
    ] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter()); await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
  });
  afterAll(async () => { await app?.close(); });
  it("rewrites manifest children and reauthorizes every segment after revocation", async () => {
    const manifest = await request.get("/video-grants/grant/master.m3u8").expect(200);
    expect(manifest.text).toBe("#EXTM3U\n/video-grants/grant/240/index.m3u8\n");
    expect(manifest.headers["cache-control"]).toBe("private, no-store");
    await request.get("/video-grants/grant/240/seg.ts").expect(200);
    revoked = true;
    const denied = await request.get("/video-grants/grant/240/seg.ts").expect(404);
    expect(denied.headers["cache-control"]).toBe("private, no-store"); expect(denied.body).toEqual({ code: "VIDEO_UNAVAILABLE" });
    revoked = false;
  });
  it("streams exact byte ranges and refuses multiple or invalid ranges", async () => {
    const response = await request.get("/video-grants/grant/240/seg.ts").set("range", "bytes=2-4").expect(206);
    expect(response.headers["content-range"]).toBe("bytes 2-4/8"); expect(response.headers["content-length"]).toBe("3");
    await request.get("/video-grants/grant/240/seg.ts").set("range", "bytes=0-1,3-4").expect(416);
    await request.get("/video-grants/grant/240/seg.ts").set("range", "bytes=0-99").expect(416);
    await request.head("/video-grants/grant/240/seg.ts").expect(200);
    const head = await request.head("/video-grants/grant/240/seg.ts").set("range", "bytes=2-4").expect(206);
    expect(head.headers["content-range"]).toBe("bytes 2-4/8");
    expect(head.headers["content-length"]).toBe("3");
  });
  it("denies unknown assets and purpose escalation uniformly", async () => {
    for (const path of ["unknown.ts", "poster.webp"]) await request.get(`/video-grants/grant/${path}`).expect(404);
    await request.get("/video-grants/wrong/240/seg.ts").expect(404);
  });
});
