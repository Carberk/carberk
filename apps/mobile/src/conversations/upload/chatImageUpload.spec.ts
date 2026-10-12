import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImageManipulator } from "expo-image-manipulator";
import {
  getInfoAsync,
  makeDirectoryAsync,
  copyAsync,
  uploadAsync,
} from "expo-file-system/legacy";

vi.mock("../../auth/session", () => ({
  loadAuthSession: vi.fn().mockResolvedValue(null),
  storeAuthSession: vi.fn(),
  clearAuthSession: vi.fn(),
}));

vi.mock("../../locale/localeStore", () => ({
  localeStore: {
    getState: vi.fn().mockReturnValue({ locale: "ru" }),
    subscribe: vi.fn(),
  },
}));

import { ApiError } from "../../api/client";

import {
  getChatImageStagingPath,
  ensureChatStagingDir,
  compressChatImage,
  uploadChatImageToPresignedUrl,
  classifyChatUploadError,
  ChatImageUploadError,
} from "./chatImageUpload";

vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", WEBP: "webp" },
  ImageManipulator: {
    manipulate: vi.fn(),
  },
}));

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  FileSystemUploadType: { BINARY_CONTENT: "BINARY_CONTENT" },
  getInfoAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  copyAsync: vi.fn(),
  deleteAsync: vi.fn(),
  uploadAsync: vi.fn(),
}));

const mockManipulate = vi.mocked(ImageManipulator.manipulate);
const mockGetInfoAsync = vi.mocked(getInfoAsync);
const mockMakeDirectoryAsync = vi.mocked(makeDirectoryAsync);
const mockCopyAsync = vi.mocked(copyAsync);
const mockUploadAsync = vi.mocked(uploadAsync);

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

function setupHappyPath(finalUri: string) {
  mockGetInfoAsync.mockResolvedValueOnce({ exists: true, uri: "", size: 1024, isDirectory: false, modificationTime: 0 });
  mockManipulatorChain({ uri: finalUri, width: 1000, height: 800 });
  mockGetInfoAsync.mockResolvedValueOnce({ exists: true, uri: "", size: 1024, isDirectory: false, modificationTime: 0 });
  mockGetInfoAsync.mockResolvedValueOnce({ exists: true, uri: "", size: 1024, isDirectory: false, modificationTime: 0 });
}

describe("getChatImageStagingPath", () => {
  it("returns a deterministic staging path under the conversation directory", () => {
    expect(getChatImageStagingPath("conv-1", "msg-1")).toBe(
      "file:///doc/chat-staging/conv-1/msg-1.webp",
    );
  });
});

describe("ensureChatStagingDir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the directory when it does not exist", async () => {
    mockGetInfoAsync.mockResolvedValueOnce({ exists: false, uri: "", isDirectory: false });

    await ensureChatStagingDir("conv-1");

    expect(mockMakeDirectoryAsync).toHaveBeenCalledWith("file:///doc/chat-staging/conv-1/", {
      intermediates: true,
    });
  });

  it("does not create the directory when it already exists", async () => {
    mockGetInfoAsync.mockResolvedValueOnce({ exists: true, uri: "", isDirectory: true, size: 0, modificationTime: 0 });

    await ensureChatStagingDir("conv-1");

    expect(mockMakeDirectoryAsync).not.toHaveBeenCalled();
  });
});

describe("compressChatImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws a non-retryable error when the source file is missing", async () => {
    mockGetInfoAsync.mockResolvedValueOnce({ exists: false, uri: "", isDirectory: false });

    await expect(compressChatImage("file:///tmp/source.webp", "file:///tmp/dest.webp")).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ChatImageUploadError);
        expect((err as ChatImageUploadError).code).toBe("file_missing");
        expect((err as ChatImageUploadError).retryable).toBe(false);
        return true;
      },
    );
  });

  it("returns compressed image metadata on the happy path", async () => {
    setupHappyPath("file:///tmp/compressed.webp");

    const result = await compressChatImage("file:///tmp/source.webp", "file:///tmp/dest.webp");

    expect(result.uri).toBe("file:///tmp/dest.webp");
    expect(result.width).toBe(1000);
    expect(result.height).toBe(800);
    expect(mockCopyAsync).toHaveBeenCalledWith({
      from: "file:///tmp/compressed.webp",
      to: "file:///tmp/dest.webp",
    });
  });

  it("re-compresses with quality 0.6 when the first output exceeds 5MB", async () => {
    mockGetInfoAsync.mockResolvedValueOnce({ exists: true, uri: "", size: 1024, isDirectory: false, modificationTime: 0 });
    mockManipulatorChain({ uri: "file:///tmp/compressed.webp", width: 1000, height: 800 });
    mockManipulatorChain({ uri: "file:///tmp/recompressed.webp", width: 1000, height: 800 });
    mockGetInfoAsync
      .mockResolvedValueOnce({ exists: true, uri: "", size: 6 * 1024 * 1024, isDirectory: false, modificationTime: 0 })
      .mockResolvedValueOnce({ exists: true, uri: "", size: 3 * 1024 * 1024, isDirectory: false, modificationTime: 0 })
      .mockResolvedValueOnce({ exists: true, uri: "", size: 3 * 1024 * 1024, isDirectory: false, modificationTime: 0 });

    const result = await compressChatImage("file:///tmp/source.webp", "file:///tmp/dest.webp");

    expect(result.uri).toBe("file:///tmp/dest.webp");
    expect(mockManipulate).toHaveBeenCalledTimes(2);
  });

  it("throws a retryable compression_failed error when copyAsync fails", async () => {
    setupHappyPath("file:///tmp/compressed.webp");
    mockCopyAsync.mockRejectedValueOnce(new Error("Permission denied"));

    await expect(compressChatImage("file:///tmp/source.webp", "file:///tmp/dest.webp")).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ChatImageUploadError);
        expect((err as ChatImageUploadError).code).toBe("compression_failed");
        expect((err as ChatImageUploadError).retryable).toBe(true);
        return true;
      },
    );
  });

  it("throws a retryable compression_failed error when the destination is missing after transfer", async () => {
    setupHappyPath("file:///tmp/compressed.webp");
    mockGetInfoAsync.mockReset();
    mockGetInfoAsync
      .mockResolvedValueOnce({ exists: true, uri: "", size: 1024, isDirectory: false, modificationTime: 0 })
      .mockResolvedValueOnce({ exists: true, uri: "", size: 1024, isDirectory: false, modificationTime: 0 })
      .mockResolvedValueOnce({ exists: false, uri: "", isDirectory: false });
    mockManipulatorChain({ uri: "file:///tmp/compressed.webp", width: 1000, height: 800 });

    await expect(compressChatImage("file:///tmp/source.webp", "file:///tmp/dest.webp")).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ChatImageUploadError);
        expect((err as ChatImageUploadError).code).toBe("compression_failed");
        return true;
      },
    );
  });
});

describe("uploadChatImageToPresignedUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws a non-retryable error when the local file is missing", async () => {
    mockGetInfoAsync.mockResolvedValueOnce({ exists: false, uri: "", isDirectory: false });

    await expect(uploadChatImageToPresignedUrl("https://up", "file:///tmp/missing.webp")).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ChatImageUploadError);
        expect((err as ChatImageUploadError).code).toBe("file_missing");
        expect((err as ChatImageUploadError).retryable).toBe(false);
        return true;
      },
    );
  });

  it("PUTs the file as binary content and returns on 2xx", async () => {
    mockGetInfoAsync.mockResolvedValueOnce({ exists: true, uri: "", size: 1024, isDirectory: false, modificationTime: 0 });
    mockUploadAsync.mockResolvedValueOnce({ status: 200, body: "", headers: {}, mimeType: "image/webp" });

    await uploadChatImageToPresignedUrl("https://up", "file:///tmp/image.webp");

    expect(mockUploadAsync).toHaveBeenCalledWith("https://up", "file:///tmp/image.webp", {
      httpMethod: "PUT",
      uploadType: expect.anything(),
      headers: {
        "Content-Type": "image/webp",
      },
    });
  });

  it("throws a retryable put_failed error on non-2xx status", async () => {
    mockGetInfoAsync.mockResolvedValueOnce({ exists: true, uri: "", size: 1024, isDirectory: false, modificationTime: 0 });
    mockUploadAsync.mockResolvedValueOnce({ status: 403, body: "", headers: {}, mimeType: "image/webp" });

    await expect(uploadChatImageToPresignedUrl("https://up", "file:///tmp/image.webp")).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ChatImageUploadError);
        expect((err as ChatImageUploadError).code).toBe("put_failed");
        expect((err as ChatImageUploadError).retryable).toBe(true);
        return true;
      },
    );
  });
});

describe("classifyChatUploadError", () => {
  it("passes through ChatImageUploadError instances unchanged", () => {
    const original = new ChatImageUploadError("boom", "put_failed", true);
    expect(classifyChatUploadError(original)).toBe(original);
  });

  it("classifies ApiError NETWORK_ERROR as retryable put_failed", () => {
    const err = classifyChatUploadError(new ApiError("NETWORK_ERROR", 0, "offline"));
    expect(err).toBeInstanceOf(ChatImageUploadError);
    expect(err.code).toBe("put_failed");
    expect(err.retryable).toBe(true);
  });

  it("classifies ApiError 429 as retryable put_failed", () => {
    const err = classifyChatUploadError(new ApiError("RATE_LIMITED", 429, "slow down"));
    expect(err.code).toBe("put_failed");
    expect(err.retryable).toBe(true);
  });

  it("classifies other ApiErrors as retryable presign_failed", () => {
    const err = classifyChatUploadError(new ApiError("UNKNOWN_ERROR", 500, "oops"));
    expect(err.code).toBe("presign_failed");
    expect(err.retryable).toBe(true);
  });

  it("classifies TypeError as retryable put_failed", () => {
    const err = classifyChatUploadError(new TypeError("fetch failed"));
    expect(err.code).toBe("put_failed");
    expect(err.retryable).toBe(true);
  });

  it("classifies generic errors as retryable put_failed", () => {
    const err = classifyChatUploadError(new Error("something"));
    expect(err.code).toBe("put_failed");
    expect(err.retryable).toBe(true);
  });
});
