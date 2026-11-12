import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { BENCHMARK } from "./review-benchmarks/manifest.mjs";

const exec = promisify(execFile);
const localTools = {
  async probe(file) {
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { timeout: 60000 });
    return JSON.parse(stdout);
  },
  async decode(file) {
    await exec("nice", ["-n", "10", "ffmpeg", "-nostdin", "-v", "error", "-xerror", "-err_detect", "explode",
      "-threads", "2", "-i", file, "-map", "0:v:0", "-map", "0:a?", "-threads", "2", "-filter_threads", "2", "-f", "null", "-"],
    { timeout: 600000, maxBuffer: 1024 * 1024 });
  },
};

function matchesMedia(probe, expected) {
  if (!Array.isArray(probe?.streams) || probe?.format?.format_name !== expected.container) return false;
  const videos = probe.streams.filter(s => s.codec_type === "video");
  const audios = probe.streams.filter(s => s.codec_type === "audio");
  const others = probe.streams.filter(s => !["video", "audio"].includes(s.codec_type)).map(s => s.codec_type);
  if (videos.length !== 1 || audios.length !== (expected.audio ? 1 : 0)
    || JSON.stringify(others) !== JSON.stringify(expected.otherStreams)) return false;
  const v = videos[0];
  if (v.codec_name !== expected.video.codec || v.width !== expected.video.width || v.height !== expected.video.height
    || v.pix_fmt !== expected.video.pixelFormat) return false;
  if (expected.video.frameRate && v.r_frame_rate !== expected.video.frameRate) return false;
  if (expected.audio && (audios[0].codec_name !== expected.audio.codec
    || Number(audios[0].sample_rate) !== expected.audio.sampleRate || audios[0].channels !== expected.audio.channels)) return false;
  if (expected.durationSeconds !== undefined) {
    const duration = Number(probe.format.duration);
    if (!Number.isFinite(duration) || Math.abs(duration - expected.durationSeconds) > 0.002) return false;
  }
  return true;
}

/** Explicit operator action; never runs during app startup or readiness. */
export async function verifyBenchmark(directory, { definition = BENCHMARK, tools = localTools } = {}) {
  if (typeof directory !== "string" || !directory.trim()) {
    throw new Error("Provide an explicit pack directory; see scripts/review-benchmarks/README.md");
  }
  let manifest;
  try { manifest = await readFile(join(directory, "manifest.json"), "utf8"); }
  catch { throw new Error("manifest.json: missing or unreadable; restore the pinned offline pack"); }
  let parsed;
  try { parsed = JSON.parse(manifest); }
  catch { throw new Error("manifest.json: invalid JSON"); }
  if (JSON.stringify(parsed) !== JSON.stringify(definition)) throw new Error("manifest.json: does not match pinned definition");
  let bytes = 0;
  for (const asset of definition.assets) {
    const file = join(directory, asset.file);
    let size;
    try { size = (await stat(file)).size; }
    catch { throw new Error(`${asset.file}: missing or unreadable; restore the pinned offline pack`); }
    if (size !== asset.bytes) throw new Error(`${asset.file}: byte count mismatch`);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    if (hash.digest("hex") !== asset.sha256) throw new Error(`${asset.file}: SHA256 mismatch`);
    let probe;
    try { probe = await tools.probe(file); }
    catch (error) { throw new Error(`${asset.file}: cannot probe; install ffprobe and restore valid inputs (${error.message})`); }
    if (!matchesMedia(probe, asset.media)) throw new Error(`${asset.file}: metadata mismatch (container/codec/dimensions/audio/duration/frame rate)`);
    try { await tools.decode(file); }
    catch (error) { throw new Error(`${asset.file}: cannot fully decode; install ffmpeg and restore valid inputs (${error.message})`); }
    bytes += size;
  }
  return {
    corpus: definition.corpus, version: definition.version,
    definitionSha256: createHash("sha256").update(JSON.stringify(definition)).digest("hex"),
    files: definition.assets.length, bytes,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: node scripts/review-benchmark.mjs <explicit-pack-directory>");
    console.log(JSON.stringify(await verifyBenchmark(resolve(process.argv[2]))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
