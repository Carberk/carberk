import { describe, expect, it, vi } from "vitest";

import type { ListingVideoNativeModule } from "./prepare";

vi.unmock("./index");

vi.mock("expo-modules-core", () => ({
  requireNativeModule: vi.fn(),
  uuid: { v4: () => "job-1" },
}));

function fakeNative(): ListingVideoNativeModule {
  return {
    newJobId: () => "job-1",
    prepare: vi.fn(async () => ({
      uri: "file:///prepared.mp4",
      durationS: 1.8,
      sizeBytes: 1_000,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true,
    })),
    cancel: vi.fn(),
    addProgressListener: vi.fn(() => ({ remove: vi.fn() })),
  };
}

describe("listing video public preparation wrapper", () => {
  it("passes a short source duration so its whole interval is accepted", async () => {
    const native = fakeNative();
    const { requireNativeModule } = await import("expo-modules-core");
    vi.mocked(requireNativeModule).mockReturnValue(native);
    const { prepare } = await import("./index");
    await expect(prepare("file:///short.mp4", 0, 1.8, 0.225, undefined, 1.8).done).resolves.toMatchObject({
      durationS: 1.8,
    });
    expect(native.prepare).toHaveBeenCalledWith("file:///short.mp4", 0, 1.8, 0.225, "job-1");
  });
});
