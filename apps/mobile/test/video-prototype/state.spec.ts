import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { SYNTHETIC_CLIPS } from "../../src/video-prototype/fixtures";
import { createDeterministicLocalVideoAdapter } from "../../src/video-prototype/localAdapter";
import { createInitialVideoPrototypeState, selectionError, videoPrototypeReducer } from "../../src/video-prototype/state";

// expo-crypto's native digest is replaced at the native boundary only.
vi.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digestStringAsync: async (_algorithm: string, data: string) => createHash("sha256").update(data).digest("hex") }));

const source = (() => {
  const clip = SYNTHETIC_CLIPS[2];
  if (!clip) throw new Error("Missing long synthetic fixture");
  return clip;
})();

function selected() {
  return videoPrototypeReducer(videoPrototypeReducer(createInitialVideoPrototypeState(), { type: "library", open: true }), { type: "select", source });
}

describe("prototype interval invariants", () => {
  it("starts long sources at the first 90 seconds and requires the trim screen", () => {
    const state = selected();
    expect(state.pending?.selection).toEqual({ startSeconds: 0, endSeconds: 90, posterSeconds: 5 });
    expect(videoPrototypeReducer(state, { type: "edit", phase: "poster" }).pending?.phase).toBe("preview");
  });
  it("accepts exactly 90 seconds, rejects 91 seconds and validates poster bounds", () => {
    expect(selectionError(source, { startSeconds: 0, endSeconds: 90, posterSeconds: 5 })).toBeNull();
    expect(selectionError(source, { startSeconds: 0, endSeconds: 91, posterSeconds: 5 })).toBe("tooLong");
    expect(selectionError(source, { startSeconds: 0, endSeconds: 90, posterSeconds: 91 })).toBe("poster");
    expect(selectionError(source, { startSeconds: 0, endSeconds: 121, posterSeconds: 5 })).toBe("interval");
  });
  it("clamps poster after either trim handle and refuses preparation with an invalid poster", () => {
    let state = videoPrototypeReducer(selected(), { type: "edit", phase: "trim" });
    state = videoPrototypeReducer(state, { type: "trim", handle: "start", seconds: 20 });
    expect(state.pending?.selection.posterSeconds).toBe(20);
    state = videoPrototypeReducer(state, { type: "trim", handle: "end", seconds: 30 });
    state = videoPrototypeReducer(state, { type: "edit", phase: "poster" });
    state = videoPrototypeReducer(state, { type: "poster", seconds: 28 });
    state = videoPrototypeReducer(state, { type: "edit", phase: "trim" });
    state = videoPrototypeReducer(state, { type: "trim", handle: "end", seconds: 25 });
    expect(state.pending?.selection.posterSeconds).toBe(25);
    if (!state.pending) throw new Error("Expected pending selection");
    const forged = { ...state, pending: { ...state.pending, phase: "poster" as const, selection: { ...state.pending.selection, posterSeconds: 99 } } };
    expect(videoPrototypeReducer(forged, { type: "prepare" }).pending?.phase).toBe("poster");
  });
});

describe("deterministic descriptor adapter", () => {
  it.each(SYNTHETIC_CLIPS)("hashes the exact committed UTF-8 bytes of $id", (clip) => {
    const bytes = readFileSync(new URL(`../../src/video-prototype/fixtures/${clip.id}.json`, import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(clip.sha256);
  });
  it("returns actual prepared descriptor bytes/hash and refuses original or discarded output", async () => {
    const adapter = createDeterministicLocalVideoAdapter();
    const output = await adapter.prepare(source, { startSeconds: 10, endSeconds: 90, posterSeconds: 20 });
    expect(JSON.parse(output.descriptorUtf8)).toEqual({ kind: "prepared-descriptor-v1", sourceSha256: "157bef55c50343fbef57d6cde6c4cdf9a85c709e5e6b51b0a0edbf20745fff5e", startSeconds: 10, endSeconds: 90, posterSeconds: 20 });
    expect(output.sizeBytes).toBe(169);
    expect(output.sha256).toBe("e8725c2c470b9a3a8cc5768089c0565a22b73de10a6103ddac1bfe325cfb0736");
    expect(adapter.uploadChunk(output, 25)).toBe(50);
    expect(() => adapter.uploadChunk(source as never, 0)).toThrow("PREPARED_OUTPUT_REQUIRED");
    adapter.discard(output);
    expect(() => adapter.uploadChunk(output, 0)).toThrow("PREPARED_OUTPUT_REQUIRED");
  });
  it("rejects an out-of-interval poster before producing staged data", async () => {
    const adapter = createDeterministicLocalVideoAdapter();
    await expect(adapter.prepare(source, { startSeconds: 10, endSeconds: 90, posterSeconds: 5 })).rejects.toThrow("INVALID_SELECTION");
  });
});
