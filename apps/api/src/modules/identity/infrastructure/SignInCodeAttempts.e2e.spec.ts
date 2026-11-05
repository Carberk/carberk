import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PrismaService } from "@auto-tm/db";

import { VerifySignInCode } from "../application/VerifySignInCode";
import { InvalidSignInCodeError } from "../domain/InvalidSignInCodeError";
import { signInCodeDestination } from "../domain/SignInCodeDestination";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import { defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { PrismaOtpRequestRepository } from "./PrismaOtpRequestRepository";

const suite = defineE2eSuite("sign-in-code-parallel-attempts");
const PHONE = suite.phone("destination");
const NOW = new Date("2026-11-05T12:00:00.000Z");
let prisma: PrismaService;

beforeAll(async () => {
  prisma = new PrismaService();
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.otpRequest.deleteMany({ where: { channel: "phone", destination: PHONE } });
});

afterAll(async () => {
  await prisma.otpRequest.deleteMany({ where: { channel: "phone", destination: PHONE } });
  await prisma.onModuleDestroy();
});

it("limits parallel wrong Sign-in Codes to five failures with truthful remaining attempts", async () => {
  // Delay only the real database read's return, so every caller begins from
  // the same snapshot. All attempt writes still execute against PostgreSQL.
  let reads = 0;
  let release: () => void = () => {};
  const allRead = new Promise<void>(resolve => { release = resolve; });
  class ConcurrentReads extends PrismaOtpRequestRepository {
    override async findLatestForPurpose(input: Parameters<OtpRequestRepository["findLatestForPurpose"]>[0]) {
      const request = await super.findLatestForPurpose(input);
      reads += 1;
      if (reads === 10) release();
      await allRead;
      return request;
    }
  }
  const repo = new ConcurrentReads(prisma);
  const request = await repo.create({
    purpose: "sign-in", channel: "phone", destination: PHONE,
    codeHash: createHash("sha256").update("999999").digest("hex"),
    expiresAt: new Date(NOW.getTime() + 300_000), userId: null, ip: "192.0.2.1",
  });
  const verify = new VerifySignInCode(repo, { now: () => NOW });
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) =>
    verify.execute({ purpose: "sign-in", destination: signInCodeDestination({ phone: PHONE }),
      code: String(index).padStart(6, "0") })));

  const errors = results.map(result => result.status === "rejected" ? result.reason as unknown : null);
  expect.soft((await repo.findById(request.id))?.attempts).toBe(5);
  expect.soft(errors.filter((error): error is InvalidSignInCodeError => error instanceof InvalidSignInCodeError)
    .map(error => error.attemptsLeft).sort()).toEqual([1, 2, 3, 4]);
  expect.soft(errors.filter(error => error instanceof Error && error.message === "Too many attempts")).toHaveLength(6);
  await expect(verify.execute({ purpose: "sign-in", destination: signInCodeDestination({ phone: PHONE }),
    code: "999999" })).rejects.toThrow("Too many attempts");
});

it("refuses a previously verified correct code if five wrong attempts lock it before consumption", async () => {
  const repo = new PrismaOtpRequestRepository(prisma);
  await repo.create({
    purpose: "sign-in", channel: "phone", destination: PHONE,
    codeHash: createHash("sha256").update("999999").digest("hex"),
    expiresAt: new Date(NOW.getTime() + 300_000), userId: null, ip: "192.0.2.1",
  });
  const verify = new VerifySignInCode(repo, { now: () => NOW });
  const candidate = await verify.execute({ purpose: "sign-in",
    destination: signInCodeDestination({ phone: PHONE }), code: "999999" });
  // The caller has not consumed its candidate yet; other requests exhaust it.
  for (let index = 0; index < 5; index += 1) {
    await expect(verify.execute({ purpose: "sign-in",
      destination: signInCodeDestination({ phone: PHONE }), code: "000000" })).rejects.toThrow();
  }
  expect(await repo.consumeIfUnused(candidate.id)).toBe(false);
  expect((await repo.findById(candidate.id))?.verifiedAt).toBeNull();
});
