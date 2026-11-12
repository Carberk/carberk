import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { verifyBenchmark } from "./review-benchmark.mjs";
import { BENCHMARK } from "./review-benchmarks/manifest.mjs";

test("requires an explicit offline pack directory", async () => {
  await assert.rejects(verifyBenchmark(), /explicit pack directory/);
});

// Small stand-in bytes at the filesystem boundary; decoder/probe are external tools.
const bytes = Buffer.from("a licensed input");
const definition = {
  corpus: "test-input", version: 1, assets: [{
    id: "photo", file: "photo.jpg", bytes: 16,
    sha256: "b50d0637cf96d000d6db37a0a7a5d64d2eede4ff0a50034f7c8242e1d4e2e14e",
    media: { container: "jpeg_pipe", video: { codec: "mjpeg", width: 1, height: 1, pixelFormat: "yuvj444p" }, audio: null, otherStreams: [] },
  }],
};

async function inPack(run) {
  const directory = await mkdtemp("/tmp/carberk-benchmark-test-");
  try {
    await writeFile(join(directory, "manifest.json"), JSON.stringify(definition));
    await run(directory);
  }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("refuses missing local input without acquisition", async () => {
  await inPack(async directory => {
    await assert.rejects(verifyBenchmark(directory, { definition }), /photo.jpg: missing/);
  });
});

const photoProbe = {
  format: { format_name: "jpeg_pipe" },
  streams: [{ codec_type: "video", codec_name: "mjpeg", width: 1, height: 1, pix_fmt: "yuvj444p" }],
};
const tools = { probe: async () => structuredClone(photoProbe), decode: async () => {} };

test("accepts complete pinned bytes only after metadata verification and full decode", async () => {
  await inPack(async directory => {
    await writeFile(join(directory, "photo.jpg"), bytes);
    const result = await verifyBenchmark(directory, { definition, tools });
    assert.equal(result.corpus, "test-input");
    assert.equal(result.files, 1);
    assert.equal(result.bytes, 16);
    await assert.rejects(verifyBenchmark(directory, { definition, tools: {
      ...tools, decode: async () => { throw new Error("truncated JPEG"); },
    } }), /photo.jpg: cannot fully decode/);
  });
});

test("refuses a missing or modified pack manifest", async () => {
  await inPack(async directory => {
    await rm(join(directory, "manifest.json"));
    await assert.rejects(verifyBenchmark(directory, { definition, tools }), /manifest.json: missing/);
    await writeFile(join(directory, "manifest.json"), JSON.stringify({ ...definition, version: 2 }));
    await assert.rejects(verifyBenchmark(directory, { definition, tools }), /manifest.json: does not match/);
    await writeFile(join(directory, "manifest.json"), "{");
    await assert.rejects(verifyBenchmark(directory, { definition, tools }), /manifest.json: invalid JSON/);
  });
});

test("refuses incorrect probe codec, dimensions, pixel format, container and extra audio", async () => {
  await inPack(async directory => {
    await writeFile(join(directory, "photo.jpg"), bytes);
    for (const change of [
      p => { p.streams[0].codec_name = "png"; },
      p => { p.streams[0].width = 2; },
      p => { p.streams[0].height = 2; },
      p => { p.streams[0].pix_fmt = "yuv420p"; },
      p => { p.format.format_name = "png_pipe"; },
      p => { p.streams.push({ codec_type: "audio", codec_name: "aac" }); },
      p => { delete p.streams; },
    ]) {
      const probe = structuredClone(photoProbe); change(probe);
      await assert.rejects(verifyBenchmark(directory, { definition, tools: {
        ...tools, probe: async () => probe,
      } }), /photo.jpg: metadata mismatch/);
    }
  });
});

test("refuses wrong size and same-length substituted bytes before probing", async () => {
  await inPack(async directory => {
    await writeFile(join(directory, "photo.jpg"), "short");
    await assert.rejects(verifyBenchmark(directory, { definition }), /byte count mismatch/);
    await writeFile(join(directory, "photo.jpg"), "b licensed input");
    await assert.rejects(verifyBenchmark(directory, { definition }), /SHA256 mismatch/);
  });
});

test("refuses wrong video duration, frame rate and audio metadata even with pinned bytes", async () => {
  await inPack(async directory => {
    await writeFile(join(directory, "photo.jpg"), bytes);
    const videoDefinition = structuredClone(definition);
    videoDefinition.assets[0].media = {
      container: "mov,mp4,m4a,3gp,3g2,mj2", durationSeconds: 60,
      video: { codec: "h264", width: 1280, height: 720, pixelFormat: "yuv420p", frameRate: "50/1" },
      audio: { codec: "aac", sampleRate: 44100, channels: 2 }, otherStreams: [],
    };
    await writeFile(join(directory, "manifest.json"), JSON.stringify(videoDefinition));
    const videoProbe = {
      format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "60.000000" },
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1280, height: 720, pix_fmt: "yuv420p", r_frame_rate: "50/1" },
        { codec_type: "audio", codec_name: "aac", sample_rate: "44100", channels: 2 },
      ],
    };
    const options = { definition: videoDefinition, tools: { ...tools, probe: async () => videoProbe } };
    assert.equal((await verifyBenchmark(directory, options)).files, 1);
    for (const change of [
      p => { p.format.duration = "59.9"; },
      p => { delete p.format.duration; },
      p => { p.streams[0].r_frame_rate = "25/1"; },
      p => { p.streams[1].codec_name = "vorbis"; },
      p => { p.streams[1].sample_rate = "48000"; },
      p => { p.streams[1].channels = 1; },
      p => { p.streams.pop(); },
    ]) {
      const probe = structuredClone(videoProbe); change(probe);
      await assert.rejects(verifyBenchmark(directory, { ...options, tools: { ...tools, probe: async () => probe } }), /metadata mismatch/);
    }
  });
});

test("v1 pins original sources, all seven hashes and the exact conversion commands", () => {
  assert.equal(createHash("sha256").update(JSON.stringify(BENCHMARK)).digest("hex"),
    "69e9a38c64dec115a47647af98d84742d108baca885fd20a92d4f6503d7a46dc");
  assert.equal(BENCHMARK.assets.length, 7);
  assert.ok(Object.isFrozen(BENCHMARK));
  assert.throws(() => { BENCHMARK.assets[0].media.video.width = 1; }, TypeError);
  assert.throws(() => { BENCHMARK.assets[5].transform.command.push("-an"); }, TypeError);
});

test("uses the exact three curated source identities, rather than their smaller UI renditions", async () => {
  const gallery = JSON.parse(await readFile(new URL("../packages/db/scripts/ui-fixtures/es300h-shenzhen-2025-07-17/v1/photos.manifest.json", import.meta.url), "utf8"));
  for (const asset of BENCHMARK.assets.slice(0, 3)) {
    const photo = gallery.photos.find(p => p.sourceFile === asset.title);
    assert.ok(photo);
    assert.equal(asset.sourcePage, photo.sourcePage);
    assert.equal(asset.sourceRevisionId, photo.sourceRevisionId);
    assert.equal(asset.author, photo.author);
    assert.equal(asset.license, photo.license);
    assert.ok(asset.bytes > photo.bytes);
    assert.ok(asset.media.video.width > photo.width);
    assert.ok(asset.media.video.height > photo.height);
    assert.notEqual(asset.sha256, photo.sha256);
  }
});

test("the operator CLI requires a directory and refuses a different corpus before invoking tools", async () => {
  const script = new URL("./review-benchmark.mjs", import.meta.url).pathname;
  const missing = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Usage:/);
  await inPack(async directory => {
    const wrongPack = spawnSync(process.execPath, [script, directory], { encoding: "utf8" });
    assert.equal(wrongPack.status, 1);
    assert.match(wrongPack.stderr, /manifest.json: does not match pinned definition/);
    assert.equal(wrongPack.stdout, "");
  });
});

const mediaToolsAvailable = ["ffprobe", "ffmpeg"].every(tool => spawnSync(tool, ["-version"]).status === 0);
test("real tools decode a JPEG and reject truncated pixels despite matching length/hash/header claims", {
  skip: !mediaToolsAvailable && "FFmpeg/ffprobe not installed; full operator-pack verification is explicit",
}, async () => {
  await inPack(async directory => {
    const jpeg = await readFile(new URL("../packages/db/scripts/ui-fixtures/es300h-shenzhen-2025-07-17/v1/01-cover-front-three-quarter.jpg", import.meta.url));
    const jpegDefinition = structuredClone(definition);
    const asset = jpegDefinition.assets[0];
    Object.assign(asset, {
      bytes: 623868, sha256: "bc42269d0b71af628ba36661649f1c88ec37d26ee3cf9cf8fccb2a30517ac4a6",
      media: { container: "image2", video: { codec: "mjpeg", width: 1920, height: 1471, pixelFormat: "yuvj420p" }, audio: null, otherStreams: [] },
    });
    await writeFile(join(directory, "photo.jpg"), jpeg);
    await writeFile(join(directory, "manifest.json"), JSON.stringify(jpegDefinition));
    assert.equal((await verifyBenchmark(directory, { definition: jpegDefinition })).files, 1);
    const truncated = jpeg.subarray(0, 30000);
    asset.bytes = truncated.length;
    asset.sha256 = createHash("sha256").update(truncated).digest("hex");
    await writeFile(join(directory, "photo.jpg"), truncated);
    await writeFile(join(directory, "manifest.json"), JSON.stringify(jpegDefinition));
    await assert.rejects(verifyBenchmark(directory, { definition: jpegDefinition }), /cannot fully decode/);
  });
});
