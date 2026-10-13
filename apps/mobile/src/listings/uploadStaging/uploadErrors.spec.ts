import { describe, it, expect, vi } from "vitest";
import type { TFunction } from "i18next";

vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", WEBP: "webp" },
  ImageManipulator: {
    manipulate: vi.fn(),
  },
}));

vi.mock("expo-file-system/legacy", () => ({
  getInfoAsync: vi.fn(),
  readDirectoryAsync: vi.fn(),
  deleteAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  moveAsync: vi.fn(),
  uploadAsync: vi.fn(),
  FileSystemUploadType: { BINARY_CONTENT: "BINARY_CONTENT" },
  documentDirectory: "file:///doc/",
}));

vi.mock("../../auth/session", () => ({
  loadAuthSession: vi.fn().mockResolvedValue(null),
  storeAuthSession: vi.fn(),
  clearAuthSession: vi.fn(),
}));

import { ApiError } from "../../api/client";

import { buildUploadError } from "./uploadErrors";
import { CompressionError } from "./compressor";

const t = ((key: string) => key) as TFunction;

describe("buildUploadError", () => {
  it("maps CompressionError to LOCAL_FILE_MISSING (non-retryable)", () => {
    const error = buildUploadError(new CompressionError("Photo file missing", "SOURCE_MISSING"), t);
    expect(error.code).toBe("LOCAL_FILE_MISSING");
    expect(error.retryable).toBe(false);
    expect(error.message).toBe("uploadErrorLocalFileMissing");
  });

  it("maps ApiError with status 429 to RATE_LIMITED (retryable)", () => {
    const error = buildUploadError(new ApiError("RATE_LIMITED", 429, "Too many requests"), t);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryable).toBe(true);
    expect(error.message).toBe("uploadErrorRateLimited");
  });

  it("maps ApiError without 429 to PRESIGN_FAILED (retryable)", () => {
    const error = buildUploadError(new ApiError("SERVER_ERROR", 500, "Internal error"), t);
    expect(error.code).toBe("PRESIGN_FAILED");
    expect(error.retryable).toBe(true);
    expect(error.message).toBe("uploadErrorPresignFailed");
  });

  it("maps TypeError to NETWORK_ERROR (retryable)", () => {
    const error = buildUploadError(new TypeError("Network request failed"), t);
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.retryable).toBe(true);
    expect(error.message).toBe("uploadErrorNetwork");
  });

  it("maps network-related message to NETWORK_ERROR (retryable)", () => {
    const error = buildUploadError(new Error("No network connection"), t);
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.retryable).toBe(true);
  });

  it("maps PUT failed message to PUT_FAILED (retryable)", () => {
    const error = buildUploadError(new Error("PUT failed: 403"), t);
    expect(error.code).toBe("PUT_FAILED");
    expect(error.retryable).toBe(true);
    expect(error.message).toBe("uploadErrorPutFailed");
  });

  it("maps unknown errors to UNKNOWN (retryable)", () => {
    const error = buildUploadError(new Error("Something weird"), t);
    expect(error.code).toBe("UNKNOWN");
    expect(error.retryable).toBe(true);
    expect(error.message).toBe("Something weird");
  });

  it("maps non-Error values to UNKNOWN (retryable)", () => {
    const error = buildUploadError("plain string", t);
    expect(error.code).toBe("UNKNOWN");
    expect(error.retryable).toBe(true);
    expect(error.message).toBe("uploadErrorUnknown");
  });
});
