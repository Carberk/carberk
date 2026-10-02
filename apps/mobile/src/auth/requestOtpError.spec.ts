import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";

import { getRequestOtpErrorCopy, isDailyCodeLimit } from "./requestOtpError";

// The real client imports React Native, which the node test environment
// cannot load.
vi.mock("../api/client", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public code: string,
      public status: number,
      message?: string,
      public details?: unknown,
    ) {
      super(message ?? code);
      this.name = "ApiError";
    }
  },
}));

const t = (key: string) => key;

function rateLimited(details?: unknown) {
  return new ApiError("RATE_LIMITED", 429, "Too many OTP requests", details);
}

describe("getRequestOtpErrorCopy", () => {
  it("says the destination hit its 24-hour limit", () => {
    expect(
      getRequestOtpErrorCopy(
        rateLimited({ reason: "destination_limit", retryInSeconds: 0 }),
        t,
        "phoneFormatError",
      ),
    ).toBe("dailyCodeLimit");
  });

  it.each([
    ["backoff", { reason: "backoff", retryInSeconds: 240 }],
    ["ip_limit", { reason: "ip_limit", retryInSeconds: 0 }],
    ["no details", undefined],
    ["malformed details", { reason: 5 }],
  ])("keeps the wait-a-moment copy for %s", (_label, details) => {
    expect(
      getRequestOtpErrorCopy(rateLimited(details), t, "emailFormatError"),
    ).toBe("rateLimitedCode");
  });

  it.each([
    [new ApiError("VALIDATION_FAILED", 400), "emailFormatError"],
    [new ApiError("NETWORK_ERROR", 0), "offline"],
    [new ApiError("INTERNAL", 500), "requestFailed"],
  ])("maps %s", (error, key) => {
    expect(getRequestOtpErrorCopy(error, t, "emailFormatError")).toBe(key);
  });
});

describe("isDailyCodeLimit", () => {
  it("ignores a destination_limit reason on a non-rate-limit error", () => {
    expect(
      isDailyCodeLimit(
        new ApiError("INTERNAL", 500, undefined, {
          reason: "destination_limit",
          retryInSeconds: 0,
        }),
      ),
    ).toBe(false);
  });
});
