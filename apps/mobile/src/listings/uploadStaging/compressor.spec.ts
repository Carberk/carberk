import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImageManipulator } from "expo-image-manipulator";
import { getInfoAsync, moveAsync, copyAsync, deleteAsync } from "expo-file-system/legacy";

import { compressPhoto, CompressionError } from "./compressor";

vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", WEBP: "webp" },
  ImageManipulator: {
    manipulate: vi.fn(),
  },
}));

vi.mock("expo-file-system/legacy", () => ({
  getInfoAsync: vi.fn(),
  moveAsync: vi.fn(),
  copyAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));

const mockManipulate = vi.mocked(ImageManipulator.manipulate);
const mockGetInfoAsync = vi.mocked(getInfoAsync);
const mockMoveAsync = vi.mocked(moveAsync);
const mockCopyAsync = vi.mocked(copyAsync);
const mockDeleteAsync = vi.mocked(deleteAsync);

function mockManipulatorChain(result: { uri: string; width: number; height: number }) {
  const saveAsync = vi.fn().mockResolvedValue(result);
  const renderAsync = vi.fn().mockResolvedValue({ saveAsync, width: result.width, height: result.height });
  const context = {
    resize: vi.fn().mockReturnThis(),
    renderAsync,
  };
  mockManipulate.mockReturnValueOnce(context as unknown as ReturnType<typeof ImageManipulator.manipulate>);
  return context;
}

function setupHappyPath(finalUri: string, destExists = true) {
  mockGetInfoAsync.mockResolvedValueOnce({ exists: true, uri: "", size: 1024, isDirectory: false, modificationTime: 0 });
  mockManipulatorChain({ uri: finalUri, width: 1000, height: 800 });
  mockGetInfoAsync.mockResolvedValueOnce({ exists: true, uri: "", size: 1024, isDirectory: false, modificationTime: 0 });
  if (destExists) {
    mockGetInfoAsync.mockResolvedValueOnce({
      exists: true,
      uri: "",
      size: 1024,
      isDirectory: false,
      modificationTime: 0,
    });
  } else {
    mockGetInfoAsync.mockResolvedValueOnce({
      exists: false,
      uri: "",
      isDirectory: false,
    });
  }
}

describe("compressPhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws CompressionError when source file does not exist", async () => {
    mockGetInfoAsync.mockResolvedValueOnce({ exists: false, uri: "", isDirectory: false });

    await expect(
      compressPhoto("file:///tmp/source.webp", "file:///tmp/dest.webp"),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(CompressionError);
      expect((err as CompressionError).code).toBe("SOURCE_MISSING");
      expect((err as CompressionError).message).toBe("Original photo was deleted — please re-select");
      return true;
    });

    expect(mockManipulate).not.toHaveBeenCalled();
  });

  it("calls ImageManipulator.manipulate with at most 2400px long side and WebP quality 0.8", async () => {
    setupHappyPath("file:///tmp/compressed.webp");

    await compressPhoto("file:///tmp/source.webp", "file:///tmp/dest.webp");

    expect(mockManipulate).toHaveBeenCalledWith("file:///tmp/source.webp");
    const context = mockManipulate.mock.results[0]?.value as { resize: ReturnType<typeof vi.fn> } | undefined;
    expect(context).toBeDefined();
    expect((context as NonNullable<typeof context>).resize).toHaveBeenCalledWith({ width: 1000 });
  });

  it.each([
    [2048, 1024, { width: 512 }],
    [1024, 2048, { height: 512 }],
    [128, 256, { height: 256 }],
  ])("bounds a profile photo's long side without upscaling %s x %s", async (width, height, resize) => {
    setupHappyPath("file:///tmp/compressed.webp");
    await compressPhoto("file:///tmp/source.webp", "file:///tmp/dest.webp", { maxDimension: 512, width, height });
    const context = mockManipulate.mock.results[0]?.value as { resize: ReturnType<typeof vi.fn> };
    expect(context.resize).toHaveBeenCalledWith(resize);
  });

  it("re-compresses with quality 0.6 when file size > 5MB", async () => {
    mockGetInfoAsync.mockResolvedValueOnce({ exists: true, uri: "", size: 1024, isDirectory: false, modificationTime: 0 });
    mockManipulatorChain({
      uri: "file:///tmp/compressed.webp",
      width: 1000,
      height: 800,
    });
    mockManipulatorChain({
      uri: "file:///tmp/recompressed.webp",
      width: 1000,
      height: 800,
    });
    mockGetInfoAsync
      .mockResolvedValueOnce({ exists: true, uri: "", size: 6 * 1024 * 1024, isDirectory: false, modificationTime: 0 })
      .mockResolvedValueOnce({ exists: true, uri: "", size: 3 * 1024 * 1024, isDirectory: false, modificationTime: 0 })
      .mockResolvedValueOnce({ exists: true, uri: "", size: 3 * 1024 * 1024, isDirectory: false, modificationTime: 0 });

    await compressPhoto("file:///tmp/source.webp", "file:///tmp/dest.webp");

    expect(mockManipulate).toHaveBeenCalledTimes(2);
    expect(mockManipulate).toHaveBeenLastCalledWith("file:///tmp/compressed.webp");
  });

  it("copies file to destination when different", async () => {
    setupHappyPath("file:///tmp/compressed.webp");

    await compressPhoto("file:///tmp/source.webp", "file:///tmp/dest.webp");

    expect(mockCopyAsync).toHaveBeenCalledWith({
      from: "file:///tmp/compressed.webp",
      to: "file:///tmp/dest.webp",
    });
    expect(mockMoveAsync).not.toHaveBeenCalled();
  });

  it("does not move file when destination matches", async () => {
    setupHappyPath("file:///tmp/dest.webp");

    await compressPhoto("file:///tmp/source.webp", "file:///tmp/dest.webp");

    expect(mockMoveAsync).not.toHaveBeenCalled();
    expect(mockCopyAsync).not.toHaveBeenCalled();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("throws CompressionError when destination file is missing after copy", async () => {
    setupHappyPath("file:///tmp/compressed.webp", false);

    await expect(
      compressPhoto("file:///tmp/source.webp", "file:///tmp/dest.webp"),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(CompressionError);
      expect((err as CompressionError).code).toBe("DESTINATION_MISSING");
      return true;
    });
  });

  it("cleans up source file after successful copy", async () => {
    setupHappyPath("file:///tmp/compressed.webp");

    await compressPhoto("file:///tmp/source.webp", "file:///tmp/dest.webp");

    expect(mockDeleteAsync).toHaveBeenCalledWith("file:///tmp/compressed.webp", { idempotent: true });
  });

  it("throws DESTINATION_MISSING when copyAsync fails", async () => {
    setupHappyPath("file:///tmp/compressed.webp");
    mockCopyAsync.mockRejectedValueOnce(new Error("Permission denied"));

    await expect(
      compressPhoto("file:///tmp/source.webp", "file:///tmp/dest.webp"),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(CompressionError);
      expect((err as CompressionError).code).toBe("DESTINATION_MISSING");
      expect((err as CompressionError).message).toBe(
        "Failed to transfer compressed photo to staging — disk full or permission denied",
      );
      return true;
    });

    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("does not throw when deleteAsync fails after successful move", async () => {
    setupHappyPath("file:///tmp/compressed.webp");
    mockDeleteAsync.mockRejectedValueOnce(new Error("Cleanup failed"));

    await expect(
      compressPhoto("file:///tmp/source.webp", "file:///tmp/dest.webp"),
    ).resolves.toBeDefined();
  });
});
