import { describe, expect, it } from "vitest";
import { VideoPreparation, type VideoSelection } from "./VideoPreparation";
import { FakeVideoPreparation } from "./application/testing/FakeVideoPreparation";

const selection: VideoSelection = {
  jobId: "job-1", sourceUri: "file:///library/source.mov",
  startMs: 1000, endMs: 4000, maxBytes: 15 * 1024 * 1024,
};

describe("Listing video preparation handoff", () => {
  it("refuses selections above ninety seconds before touching the source", async () => {
    const native = new FakeVideoPreparation();
    await expect(new VideoPreparation(native).prepare({ ...selection, endMs: 91_001 })).rejects.toThrow("INVALID_SELECTION");
    expect(native.selections).toEqual([]);
  });

  it("accepts exactly ninety seconds and hands over only validated staged output", async () => {
    const native = new FakeVideoPreparation();
    native.output.durationMs = 90_000;
    const result = await new VideoPreparation(native).prepare({ ...selection, startMs: 0, endMs: 90_000 });
    expect(result.uri).toBe("file:///documents/videos/job-1/prepared.mp4");
    expect(result.durationMs).toBe(90_000);
  });

  it.each([
    { durationMs: 90_001 }, { sizeBytes: 16 * 1024 * 1024 },
    { fps: 60 }, { width: 1920, height: 1080 }, { videoCodec: "hevc" },
    { colour: "hlg" }, { uri: selection.sourceUri }, { audioCodec: "opus" },
    { sizeBytes: 0 }, { durationMs: 4000 }, { width: Number.NaN },
  ])("discards unsafe or incomplete native output %j", async (invalid) => {
    const native = new FakeVideoPreparation();
    Object.assign(native.output, invalid);
    await expect(new VideoPreparation(native).prepare(selection)).rejects.toThrow("INVALID_OUTPUT");
    expect(native.files.size).toBe(0);
  });

  it("never hands a late completed file to upload after cancellation", async () => {
    const native = new FakeVideoPreparation(); native.hold = true;
    const preparation = new VideoPreparation(native);
    const pending = preparation.prepare(selection);
    const refused = expect(pending).rejects.toThrow("CANCELLED");
    await preparation.cancel(selection.jobId);
    native.complete();
    await refused;
    expect(native.files.size).toBe(0);
  });

  it("allows only one local preparation at a time", async () => {
    const native = new FakeVideoPreparation(); native.hold = true;
    const preparation = new VideoPreparation(native);
    const first = preparation.prepare(selection);
    await expect(preparation.prepare({ ...selection, jobId: "job-2" })).rejects.toThrow("BUSY");
    native.complete(); await first;
  });
});
