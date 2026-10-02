import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";

import {
  getResendCodeErrorCopy,
  getVerifyCodeErrorCopy,
  isSignInMethodTaken,
} from "./verifyCodeError";

// The real client imports React Native, which the node test environment
// cannot load.
vi.mock("../api/client", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public code: string,
      public status: number,
      message?: string,
    ) {
      super(message ?? code);
      this.name = "ApiError";
    }
  },
}));

const t = (key: string) => key;

describe("getVerifyCodeErrorCopy", () => {
  it.each([
    ["phone", "phoneTaken"],
    ["email", "emailTaken"],
  ] as const)(
    "treats SIGN_IN_METHOD_TAKEN on a %s as terminal with no merge offer",
    (method, key) => {
      expect(
        getVerifyCodeErrorCopy(
          new ApiError("SIGN_IN_METHOD_TAKEN", 409),
          t,
          method,
        ),
      ).toEqual({ message: key, terminal: true });
    },
  );

  it.each([
    ["INVALID_OTP", 400, "wrongCode"],
    ["OTP_ALREADY_USED", 400, "usedCode"],
    ["OTP_EXPIRED", 400, "expiredCode"],
    ["OTP_NOT_FOUND", 400, "expiredCode"],
    ["OTP_LOCKED", 400, "lockedCode"],
    ["RATE_LIMITED", 400, "rateLimitedCode"],
    ["TOO_MANY", 429, "rateLimitedCode"],
    ["NETWORK_ERROR", 0, "offline"],
  ])("maps %s to retryable copy", (code, status, key) => {
    expect(
      getVerifyCodeErrorCopy(new ApiError(code, status), t, "phone"),
    ).toEqual({ message: key, terminal: false });
  });

  it("shows offline copy for a non-API failure", () => {
    expect(getVerifyCodeErrorCopy(new Error("boom"), t, "email")).toEqual({
      message: "offline",
      terminal: false,
    });
  });
});

describe("getResendCodeErrorCopy", () => {
  it("maps rate limits and network failures", () => {
    expect(getResendCodeErrorCopy(new ApiError("RATE_LIMITED", 400), t)).toBe(
      "rateLimitedCode",
    );
    expect(getResendCodeErrorCopy(new ApiError("NETWORK_ERROR", 0), t)).toBe(
      "offline",
    );
    expect(getResendCodeErrorCopy(new ApiError("SERVER", 500), t)).toBe(
      "verifyFailed",
    );
  });
});

describe("isSignInMethodTaken", () => {
  it("recognises only SIGN_IN_METHOD_TAKEN", () => {
    expect(isSignInMethodTaken(new ApiError("SIGN_IN_METHOD_TAKEN", 409))).toBe(true);
    expect(isSignInMethodTaken(new ApiError("INVALID_OTP", 400))).toBe(false);
    expect(isSignInMethodTaken(new Error("SIGN_IN_METHOD_TAKEN"))).toBe(false);
  });
});
