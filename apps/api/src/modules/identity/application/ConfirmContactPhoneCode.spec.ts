import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { InvalidSignInCodeError } from "../domain/InvalidSignInCodeError";
import type { OtpRequest } from "../domain/OtpRequest";
import { ConfirmContactPhoneCode } from "./ConfirmContactPhoneCode";
import { InMemoryOtpRequests } from "./testing/InMemoryOtpRequests";
import { VerifySignInCode } from "./VerifySignInCode";

const PHONE = "+99365123456";
const CODE = "123456";

function hash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

describe("ConfirmContactPhoneCode", () => {
  let now: Date;
  let otp: InMemoryOtpRequests;
  let useCase: ConfirmContactPhoneCode;

  function seedContactCode(overrides: Partial<OtpRequest> = {}): OtpRequest {
    return otp.seed({
      purpose: "listing-contact-phone",
      destination: PHONE,
      codeHash: hash(CODE),
      userId: "seller-1",
      ...overrides,
    });
  }

  beforeEach(() => {
    now = new Date("2026-10-03T12:00:00.000Z");
    otp = new InMemoryOtpRequests(() => now);
    const clock = { now: () => now };
    useCase = new ConfirmContactPhoneCode(otp, new VerifySignInCode(otp, clock));
  });

  it("consumes the seller's newest contact-phone code for the number", async () => {
    const record = seedContactCode();

    await useCase.execute({ userId: "seller-1", phone: PHONE, code: CODE });

    expect((await otp.findById(record.id))?.verifiedAt).toEqual(now);
  });

  it("never consumes personal proof as business proof", async () => {
    const personal = seedContactCode();
    await expect(useCase.execute({ userId: "seller-1", phone: PHONE, code: CODE, businessId: "business-1" } as Parameters<typeof useCase.execute>[0])).rejects.toThrow("No Sign-in Code request found");
    expect((await otp.findById(personal.id))?.verifiedAt).toBeNull();
  });

  it("refuses a code used once already", async () => {
    seedContactCode();
    await useCase.execute({ userId: "seller-1", phone: PHONE, code: CODE });

    await expect(
      useCase.execute({ userId: "seller-1", phone: PHONE, code: CODE }),
    ).rejects.toThrow("OTP code has already been used");
  });

  it.each(["sign-in", "sign-in-method", "account-deletion"] as const)(
    "never accepts a %s code for the same number",
    async (purpose) => {
      const record = otp.seed({ purpose, destination: PHONE, codeHash: hash(CODE), userId: "seller-1" });

      await expect(
        useCase.execute({ userId: "seller-1", phone: PHONE, code: CODE }),
      ).rejects.toThrow("No Sign-in Code request found");
      expect((await otp.findById(record.id))?.verifiedAt).toBeNull();
    },
  );

  it("never accepts another seller's contact-phone code for the same number", async () => {
    seedContactCode({ userId: "seller-2" });

    await expect(
      useCase.execute({ userId: "seller-1", phone: PHONE, code: CODE }),
    ).rejects.toThrow("No Sign-in Code request found");
  });

  it("reports attempts left from 4 down to 1, then locks on the fifth wrong code", async () => {
    seedContactCode();
    const left: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const error = await useCase
        .execute({ userId: "seller-1", phone: PHONE, code: "000000" })
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(InvalidSignInCodeError);
      left.push((error as InvalidSignInCodeError).attemptsLeft);
    }

    expect(left).toEqual([4, 3, 2, 1]);
    await expect(
      useCase.execute({ userId: "seller-1", phone: PHONE, code: "000000" }),
    ).rejects.toThrow("Too many attempts");
    await expect(
      useCase.execute({ userId: "seller-1", phone: PHONE, code: CODE }),
    ).rejects.toThrow("Too many attempts");
  });

  it("refuses a code past its 5 minutes", async () => {
    seedContactCode();
    now = new Date(now.getTime() + 5 * 60 * 1000 + 1);

    await expect(
      useCase.execute({ userId: "seller-1", phone: PHONE, code: CODE }),
    ).rejects.toThrow("OTP code has expired");
  });
});
