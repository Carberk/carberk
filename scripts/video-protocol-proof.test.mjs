import test from "node:test";
import assert from "node:assert/strict";

import { VideoUploadProof, PART_BYTES, SESSION_MS, readyGeneration, rewriteManifest, authorizeAsset } from "./video-protocol-proof.mjs";
import { VideoProtocolFakeStore } from "./testing/VideoProtocolFakeStore.mjs";

const NOW = Date.parse("2026-10-14T00:00:00Z");
const record = () => ({ version: 1, owner: "owner", generation: "g1", uploadId: "storage-upload", key: "video/v1/s1/g1/source.mp4",
  bytes: PART_BYTES + 10, sha256: "a".repeat(64), expiresAt: NOW + SESSION_MS, state: "UPLOADING", cancelled: false });
const scope = { owner: "tester", listing: "listing", generation: "g1", purpose: "playback", expiresAt: NOW + 1000, assets: ["master.m3u8", "240p/index.m3u8", "240p/seg.ts"] };
const current = { listing: "listing", enabled: true, tester: true, activeAccount: true, listingVisible: true, generation: "g1", now: NOW };

test("recovery trusts storage-confirmed parts and preserves them across credentials/recreated session", async () => {
  const storage = new VideoProtocolFakeStore(); storage.parts = [{ number: 1, size: PART_BYTES, etag: "confirmed" }];
  const persisted = record();
  const result = await new VideoUploadProof(JSON.parse(JSON.stringify(persisted)), storage, () => NOW).recover("owner");
  assert.deepEqual(result.confirmed, storage.parts); assert.equal(result.nextPart, 2);
  await assert.rejects(new VideoUploadProof(persisted, storage, () => NOW).recover("another-owner"), /UNAVAILABLE/);
});

test("completion refuses missing/malformed confirmed parts and never treats upload completion as readiness", async () => {
  const storage = new VideoProtocolFakeStore(); const proof = new VideoUploadProof(record(), storage, () => NOW);
  await assert.rejects(proof.complete("owner"), /PARTS/);
  storage.parts = [{ number: 1, size: PART_BYTES, etag: "one" }, { number: 2, size: 10, etag: "two" }];
  const completed = await proof.complete("owner");
  assert.equal(completed.state, "PROCESSING");
  assert.equal((await proof.complete("owner")).state, "PROCESSING");
});

test("lost completion response reconciles the unique object after recreating the session", async () => {
  const storage = new VideoProtocolFakeStore(); storage.object = { size: PART_BYTES + 10 };
  const persisted = { ...record(), state: "COMPLETING" };
  assert.equal((await new VideoUploadProof(persisted, storage, () => NOW).complete("owner")).state, "PROCESSING");
  assert.deepEqual(storage.parts, []);
});

test("seven-day expiry fences renewal/completion at the exact deadline", async () => {
  const proof = new VideoUploadProof(record(), new VideoProtocolFakeStore(), () => NOW + SESSION_MS);
  await assert.rejects(proof.recover("owner"), /UNAVAILABLE/);
  await assert.rejects(proof.complete("owner"), /UNAVAILABLE/);
});

test("cancellation wins over late storage completion and does not falsely finish cleanup while late parts survive", async () => {
  const storage = new VideoProtocolFakeStore(); storage.parts = [{ number: 1, size: PART_BYTES, etag: "one" }, { number: 2, size: 10, etag: "two" }];
  let release; storage.holdCompletion = new Promise((resolve) => { release = resolve; });
  const proof = new VideoUploadProof(record(), storage, () => NOW);
  let began; const started = new Promise((resolve) => { began = resolve; }); storage.onComplete = began;
  const pending = proof.complete("owner");
  const refused = assert.rejects(pending, /CANCELLED/);
  await started;
  assert.equal((await proof.cancel("owner")).state, "CLEANUP_PENDING"); release(); await refused;
  assert.equal(storage.object, null);
  storage.parts = [{ number: 1, size: PART_BYTES, etag: "late" }]; storage.abortLeavesLatePart = true;
  assert.equal((await proof.cancel("owner")).state, "CLEANUP_PENDING");
});

test("revocation/current visibility and generation protect every asset, even previously granted segments", () => {
  const request = { grant: scope, owner: "tester", asset: "240p/seg.ts", purpose: "playback" };
  assert.equal(authorizeAsset(request, current).cacheControl, "private, no-store");
  for (const change of [{ enabled: false }, { tester: false }, { activeAccount: false }, { listingVisible: false }, { listing: "other-listing" }, { generation: "g2" }, { now: NOW + 1000 }]) {
    assert.throws(() => authorizeAsset(request, { ...current, ...change }), /UNAVAILABLE/);
  }
  assert.throws(() => authorizeAsset({ ...request, grant: { ...scope, revoked: true } }, current), /UNAVAILABLE/);
  assert.throws(() => authorizeAsset({ ...request, owner: "other" }, current), /UNAVAILABLE/);
  assert.throws(() => authorizeAsset({ ...request, asset: "../../another.mp4" }, current), /UNAVAILABLE/);
});

test("nested variants, maps and segments all keep the grant namespace; unknown/external/traversing assets fail closed", () => {
  const assets = new Set(["master.m3u8", "240p/index.m3u8", "240p/init.mp4", "240p/seg.ts"]);
  const prefix = "/proof-grants/opaque-token/";
  assert.equal(rewriteManifest('#EXTM3U\n240p/index.m3u8\n', prefix + 'master.m3u8', assets), '#EXTM3U\n' + prefix + '240p/index.m3u8\n');
  assert.equal(rewriteManifest('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\nseg.ts\n', prefix + '240p/index.m3u8', assets), '#EXTM3U\n#EXT-X-MAP:URI="' + prefix + '240p/init.mp4"\n' + prefix + '240p/seg.ts\n');
  for (const uri of ["https://evil.example/seg.ts", "../secret.ts", "%2e%2e/secret", "unknown.ts"]) assert.throws(() => rewriteManifest('#EXTM3U\n' + uri + '\n', prefix + 'master.m3u8', assets), /MANIFEST/);
});

test("authoritative timestamp/output manifest and generation fence are all required before readiness", () => {
  const job = { generation: "g2", posterMs: 1000 };
  const state = { pending: "g2", active: "g1", removed: false };
  const actual = { durationMs: 3000, validated: true, required: ["source.mp4", "poster.webp", "master.m3u8", "seg.ts"], accessible: ["source.mp4", "poster.webp", "master.m3u8", "seg.ts"] };
  assert.equal(readyGeneration(job, state, actual), true);
  for (const change of [{ accessible: ["source.mp4"] }, { durationMs: 999 }, { validated: false }, { durationMs: 90_001 }]) assert.equal(readyGeneration(job, state, { ...actual, ...change }), false);
  assert.equal(readyGeneration(job, { ...state, pending: "g3" }, actual), false);
  assert.equal(readyGeneration(job, { ...state, removed: true }, actual), false);
});

test("actual gateway HTTP responses rewrite nested resources and deny new access immediately after revocation", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createGatewayProof } = await import("./video-protocol-gateway-proof.mjs");
  const directory = await mkdtemp(join(tmpdir(), "video-gateway-"));
  let gateway;
  try {
    await writeFile(join(directory, "master.m3u8"), "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000\n240p.m3u8\n");
    await writeFile(join(directory, "240p.m3u8"), "#EXTM3U\n#EXTINF:1,\n240p0.ts\n#EXT-X-ENDLIST\n");
    await writeFile(join(directory, "240p0.ts"), "fixture bytes");
    gateway = await createGatewayProof(directory);
    const master = await fetch(gateway.url);
    assert.equal(master.headers.get("cache-control"), "private, no-store");
    const child = (await master.text()).split("\n").find((line) => line.startsWith("/proof-grants/"));
    const variant = await fetch(new URL(child, gateway.url));
    const segment = (await variant.text()).split("\n").find((line) => line.startsWith("/proof-grants/"));
    assert.equal(await (await fetch(new URL(segment, gateway.url))).text(), "fixture bytes");
    gateway.current.listingVisible = false;
    assert.equal((await fetch(new URL(segment, gateway.url))).status, 404);
    assert.equal((await fetch(gateway.url)).status, 404);
    assert.deepEqual(gateway.receipt, { manifests: 2, segments: 1, denied: 2 });
  } finally { await gateway?.close(); await rm(directory, { recursive: true, force: true }); }
});
