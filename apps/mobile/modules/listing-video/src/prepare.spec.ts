import { describe, expect, it, vi } from "vitest";

import {
  ListingVideoError,
  prepareListingVideo,
  validateInterval,
  type ListingVideoNativeModule,
} from "./prepare";

function fakeNative(
  overrides: Partial<ListingVideoNativeModule> = {},
): ListingVideoNativeModule {
  return {
    newJobId: () => crypto.randomUUID(),
    prepare: vi.fn(async () => ({
      uri: "file:///app/listing-video/prepared.mp4",
      durationS: 10,
      sizeBytes: 1_500_000,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true,
    })),
    cancel: vi.fn(),
    addProgressListener: vi.fn(() => ({ remove: vi.fn() })),
    ...overrides,
  };
}

describe("validateInterval", () => {
  it("accepts a 3s to 90s interval with the cover inside it", () => {
    expect(() => validateInterval(2, 12, 5)).not.toThrow();
    expect(() => validateInterval(0, 90, 90)).not.toThrow();
    expect(() => validateInterval(0, 3, 0)).not.toThrow();
  });

  it("rejects intervals outside 3s..90s, reversed, or negative", () => {
    for (const [s, e] of [[0, 2.9], [0, 90.1], [5, 5], [9, 5], [-1, 10]] as const) {
      expect(() => validateInterval(s, e, s)).toThrowError(
        expect.objectContaining({ code: "invalid-interval" }),
      );
    }
  });

  it("rejects a cover outside the kept interval", () => {
    expect(() => validateInterval(5, 15, 4.9)).toThrowError(
      expect.objectContaining({ code: "invalid-cover" }),
    );
    expect(() => validateInterval(5, 15, 15.1)).toThrowError(
      expect.objectContaining({ code: "invalid-cover" }),
    );
  });
});

describe("prepareListingVideo", () => {
  it("keeps job identities distinct after a JavaScript session restarts", async () => {
    const jobIds: string[] = [];
    const native = fakeNative({
      newJobId: () => `native-uuid-${jobIds.length}`,
      prepare: vi.fn(async (_source, _start, _end, _cover, jobId) => {
        jobIds.push(jobId);
        return {
          uri: `file:///app/listing-video/${jobId}/prepared.mp4`,
          durationS: 10, sizeBytes: 1_500_000, width: 1280, height: 720,
          fps: 30, hasAudio: true,
        };
      }),
    });
    vi.resetModules();
    const firstSession = await import("./prepare");
    const first = await firstSession.prepareListingVideo(native, "file:///lib/a.mov", 0, 10, 5).done;
    vi.resetModules();
    const secondSession = await import("./prepare");
    const second = await secondSession.prepareListingVideo(native, "file:///lib/a.mov", 0, 10, 5).done;
    expect(second.uri).not.toBe(first.uri);
  });

  it("returns the prepared file and forwards progress for its job only", async () => {
    let listener: ((e: { jobId: string; fraction: number }) => void) | undefined;
    const native = fakeNative({
      addProgressListener: vi.fn((l) => {
        listener = l;
        return { remove: vi.fn() };
      }),
    });
    const fractions: number[] = [];
    const handle = prepareListingVideo(native, "file:///lib/a.mov", 2, 12, 5, (p) =>
      fractions.push(p.fraction),
    );
    listener?.({ jobId: "other", fraction: 0.9 });
    // Job id is internal; emit through the captured listener with any id then
    // assert foreign progress was filtered by checking the final file only.
    await expect(handle.done).resolves.toMatchObject({
      uri: "file:///app/listing-video/prepared.mp4",
      durationS: 10,
    });
    expect(native.prepare).toHaveBeenCalledWith(
      "file:///lib/a.mov",
      2,
      12,
      5,
      expect.any(String),
    );
    expect(fractions).not.toContain(0.9);
  });

  it("rejects an invalid interval before touching native code", async () => {
    const native = fakeNative();
    const handle = prepareListingVideo(native, "file:///lib/a.mov", 0, 120, 5);
    await expect(handle.done).rejects.toMatchObject({ code: "invalid-interval" });
    expect(native.prepare).not.toHaveBeenCalled();
  });

  it("reports unsupported-platform when no native module is linked", async () => {
    const handle = prepareListingVideo(null, "file:///lib/a.mov", 0, 10, 5);
    await expect(handle.done).rejects.toMatchObject({
      code: "unsupported-platform",
    });
  });

  it("maps a native cancellation to the typed cancelled error", async () => {
    const native = fakeNative({
      prepare: vi.fn(
        () =>
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("stopped")), 5),
          ),
      ),
    });
    const handle = prepareListingVideo(native, "file:///lib/a.mov", 0, 10, 5);
    handle.cancel();
    await expect(handle.done).rejects.toMatchObject({ code: "cancelled" });
    expect(native.cancel).toHaveBeenCalled();
  });

  it("rejects a native result over the 15 MiB cap", async () => {
    const native = fakeNative({
      prepare: vi.fn(async () => ({
        uri: "file:///app/x.mp4",
        durationS: 90,
        sizeBytes: 16 * 1024 * 1024,
        width: 1280,
        height: 720,
        fps: 30,
        hasAudio: true,
      })),
    });
    const handle = prepareListingVideo(native, "file:///lib/a.mov", 0, 90, 5);
    await expect(handle.done).rejects.toBeInstanceOf(ListingVideoError);
    await expect(
      prepareListingVideo(native, "file:///lib/a.mov", 0, 90, 5).done,
    ).rejects.toMatchObject({ code: "output-too-large" });
  });

  it("passes through known native error codes", async () => {
    const native = fakeNative({
      prepare: vi.fn(async () => {
        throw Object.assign(new Error("gone"), { code: "source-unreadable" });
      }),
    });
    await expect(
      prepareListingVideo(native, "file:///lib/a.mov", 0, 10, 5).done,
    ).rejects.toMatchObject({ code: "source-unreadable" });
  });

  it("passes through the native invalid-source code, not export-failed", async () => {
    const native = fakeNative({
      prepare: vi.fn(async () => {
        throw Object.assign(new Error("not a file URL"), { code: "invalid-source" });
      }),
    });
    await expect(
      prepareListingVideo(native, "file:///lib/a.mov", 0, 10, 5).done,
    ).rejects.toMatchObject({ code: "invalid-source" });
  });
});
