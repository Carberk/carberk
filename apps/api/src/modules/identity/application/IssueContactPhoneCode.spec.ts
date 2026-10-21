import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import type { OtpSenderPort, OtpSms } from "../domain/ports/OtpSenderPort";
import { SignInCodeRateLimitedError } from "../domain/SignInCodeRateLimitedError";
import { IssueContactPhoneCode } from "./IssueContactPhoneCode";
import { InMemoryOtpRequests } from "./testing/InMemoryOtpRequests";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const PHONE = "+99365123456";
const input = { userId: "seller-1", phone: PHONE, ip: "10.0.0.1", locale: "tk" as const };

function hash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

describe("IssueContactPhoneCode", () => {
  let otp: InMemoryOtpRequests;
  let sms: OtpSms[];
  let sender: OtpSenderPort;

  function useCase(testMode = true): IssueContactPhoneCode {
    return new IssueContactPhoneCode(otp, sender, { now: () => NOW }, testMode);
  }

  beforeEach(() => {
    otp = new InMemoryOtpRequests(() => NOW);
    sms = [];
    sender = { send: async (message) => { sms.push(message); } };
  });

  it("stores a 5-minute listing-contact-phone code bound to the seller and the IP", async () => {
    const result = await useCase().execute(input);

    expect(otp.records).toHaveLength(1);
    expect(otp.records[0]).toMatchObject({
      purpose: "listing-contact-phone",
      channel: "phone",
      destination: PHONE,
      userId: "seller-1",
      ip: "10.0.0.1",
      expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
      codeHash: hash(result.testCode as string),
    });
    expect(result).toEqual({
      requestId: otp.records[0]?.id,
      resendInSeconds: 60,
      testCode: expect.stringMatching(/^\d{6}$/),
    });
  });

  it("sends one SMS with the code, purpose, seller locale and request id", async () => {
    const result = await useCase().execute(input);

    expect(sms).toEqual([
      {
        smsDelivery: { kind: "ordinary" },
        phone: PHONE,
        code: result.testCode,
        purpose: "listing-contact-phone",
        locale: "tk",
        requestId: result.requestId,
      },
    ]);
  });

  it("leaves testCode out unless OTP_TEST_MODE is on", async () => {
    const result = await useCase(false).execute(input);

    expect(result).not.toHaveProperty("testCode");
  });

  it("counts sign-in and every other purpose against the number's daily budget", async () => {
    for (let i = 0; i < 5; i += 1) {
      otp.seed({
        purpose: i % 2 === 0 ? "sign-in" : "account-deletion",
        destination: PHONE,
        codeHash: hash("000000"),
        createdAt: new Date(NOW.getTime() - (i + 2) * 60 * 60 * 1000),
      });
    }

    const error = await useCase().execute(input).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SignInCodeRateLimitedError);
    expect(error).toMatchObject({ reason: "DESTINATION_LIMIT", retryInSeconds: 0 });
    expect(sms).toEqual([]);
  });

  it("counts every purpose from the same IP against the hourly IP budget", async () => {
    for (let i = 0; i < 10; i += 1) {
      otp.seed({
        purpose: "sign-in",
        destination: `+9936500000${i}`,
        codeHash: hash("000000"),
        ip: "10.0.0.1",
        createdAt: new Date(NOW.getTime() - 10 * 60 * 1000),
      });
    }

    await expect(useCase().execute(input)).rejects.toMatchObject({ reason: "IP_LIMIT" });
  });

  it("applies the backoff after the number's latest code of any purpose", async () => {
    otp.seed({
      purpose: "sign-in",
      destination: PHONE,
      codeHash: hash("000000"),
      createdAt: new Date(NOW.getTime() - 10 * 1000),
    });

    await expect(useCase().execute(input)).rejects.toMatchObject({
      reason: "BACKOFF",
      retryInSeconds: expect.any(Number),
    });
  });
});
