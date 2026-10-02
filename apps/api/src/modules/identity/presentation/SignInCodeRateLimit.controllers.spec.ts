import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { AccountDeletionController } from "./AccountDeletionController";
import { AuthController } from "./AuthController";
import { MeController } from "./MeController";
import type { RateLimitReason } from "../domain/OtpAttemptLedger";
import { SignInCodeRateLimitedError } from "../domain/SignInCodeRateLimitedError";

const REFUSALS: Array<{
  reason: RateLimitReason;
  resendInSeconds: number;
  details: { reason: string; retryInSeconds: number };
}> = [
  {
    reason: "DESTINATION_LIMIT",
    resendInSeconds: 300,
    details: { reason: "destination_limit", retryInSeconds: 0 },
  },
  {
    reason: "IP_LIMIT",
    resendInSeconds: 300,
    details: { reason: "ip_limit", retryInSeconds: 0 },
  },
  {
    reason: "BACKOFF",
    resendInSeconds: 45,
    details: { reason: "backoff", retryInSeconds: 45 },
  },
];

const request = {
  headers: {},
  ip: "10.0.0.1",
  user: { sub: "user-1" },
} as never;

function rejecting(error: Error) {
  return {
    execute: async () => {
      throw error;
    },
  };
}

type Call = (error: Error) => Promise<unknown>;

const ENDPOINTS: Array<[string, Call]> = [
  [
    "POST /api/v1/auth/otp/request",
    (error) =>
      new AuthController(
        rejecting(error) as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      ).otpRequest({ phone: "+99361234567" }, request),
  ],
  [
    "POST /api/v1/me/sign-in-methods/request",
    (error) =>
      new MeController(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        rejecting(error) as never,
        {} as never,
        {} as never,
      ).requestMethodChange(request, { email: "buyer@example.com" }),
  ],
  [
    "POST /api/v1/account-deletion/request",
    (error) =>
      new AccountDeletionController(
        rejecting(error) as never,
        {} as never,
      ).request({ phone: "+99361234567" }, request),
  ],
];

async function thrownBy(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => {
      throw new Error("expected the request to be refused");
    },
    (error: unknown) => error,
  );
}

describe.each(ENDPOINTS)("%s refuses a Sign-in Code request", (_name, call) => {
  it.each(REFUSALS)(
    "answers RATE_LIMITED with the $reason reason",
    async ({ reason, resendInSeconds, details }) => {
      const error = await thrownBy(
        call(
          new SignInCodeRateLimitedError({
            allowed: false,
            reason,
            resendInSeconds,
          }),
        ),
      );

      expect(error).toBeInstanceOf(HttpException);
      const http = error as HttpException;
      expect(http.getStatus()).toBe(400);
      expect(http.getResponse()).toEqual({
        code: "RATE_LIMITED",
        message: expect.any(String),
        details,
      });
    },
  );

  it("does not treat a plain error with the old message as a rate limit", async () => {
    const error = await thrownBy(call(new Error("Too many OTP requests")));

    expect(error).not.toBeInstanceOf(HttpException);
  });
});
