import "reflect-metadata";

import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { signInCodeDestination } from "../domain/SignInCodeDestination";
import { PrismaOtpRequestRepository } from "./PrismaOtpRequestRepository";

const NOW = new Date("2026-10-18T12:00:00Z");
const clock = { now: () => NOW };
const input = {
  purpose: "sign-in" as const,
  destination: signInCodeDestination({ email: "reservation@example.com" }),
  codeHash: "hashed-code",
  userId: null,
  ip: "10.41.3.1",
};

/** Real worker-isolated PostgreSQL only; never run by the unit lane. */
describe("PostgreSQL code reservation boundaries", () => {
  let prisma: PrismaService;
  let holder: PrismaService;
  let repository: PrismaOtpRequestRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    holder = new PrismaService();
    repository = new PrismaOtpRequestRepository(prisma);
    await prisma.$connect();
    await holder.$connect();
  });
  beforeEach(async () => { await prisma.otpRequest.deleteMany(); });
  afterAll(async () => {
    try { await prisma?.onModuleDestroy(); } finally { await holder?.onModuleDestroy(); }
  });

  it("rolls back a failed insert and releases its admission locks without consuming a slot", async () => {
    await expect(repository.reserve({ ...input,
      userId: "00000000-0000-4000-8000-000000000413",
    }, clock)).rejects.toMatchObject({ code: "P2003" });
    expect(await repository.countByIpSince(input.ip, new Date(0))).toBe(0);
    const result = await repository.reserve(input, clock);
    expect(result.resendInSeconds).toBe(60);
    expect(await repository.countByDestinationSince("email", "reservation@example.com", new Date(0))).toBe(1);
  });

  it.each([
    { ageMs: 86_400_000, allowed: false },
    { ageMs: 86_400_001, allowed: true },
  ])("uses an inclusive rolling destination boundary at $ageMs ms", async ({ ageMs, allowed }) => {
    await prisma.otpRequest.createMany({ data: Array.from({ length: 5 }, () => ({
      purpose: "account_deletion" as const, channel: "email",
      destination: "reservation@example.com", codeHash: "old", ip: "other-ip",
      userId: null, createdAt: new Date(NOW.getTime() - ageMs),
      expiresAt: new Date(NOW.getTime() - 60_000), verifiedAt: NOW,
    })) });
    const result = repository.reserve(input, clock);
    if (allowed) await expect(result).resolves.toMatchObject({ resendInSeconds: 60 });
    else await expect(result).rejects.toMatchObject({ reason: "DESTINATION_LIMIT", retryInSeconds: 0 });
    expect(await prisma.otpRequest.count()).toBe(allowed ? 6 : 5);
  });

  it.each([
    { ageMs: 3_600_000, allowed: false },
    { ageMs: 3_600_001, allowed: true },
  ])("uses an inclusive rolling shared IP boundary at $ageMs ms", async ({ ageMs, allowed }) => {
    await prisma.otpRequest.createMany({ data: Array.from({ length: 10 }, (_, i) => ({
      purpose: "listing_contact_phone" as const, channel: "phone",
      destination: `other-${i}`, codeHash: "old", ip: input.ip,
      userId: null, createdAt: new Date(NOW.getTime() - ageMs),
      expiresAt: new Date(NOW.getTime() - 60_000), verifiedAt: NOW,
    })) });
    const result = repository.reserve(input, clock);
    if (allowed) await expect(result).resolves.toMatchObject({ resendInSeconds: 60 });
    else await expect(result).rejects.toMatchObject({ reason: "IP_LIMIT", retryInSeconds: 0 });
    expect(await prisma.otpRequest.count()).toBe(allowed ? 11 : 10);
  });

  it("takes destination before IP, permits disjoint progress, and dates the code after the lock wait", async () => {
    const ipKey = createHash("sha256").update(input.ip).digest().readInt32BE(0);
    const destinationKey = createHash("sha256").update("email:reservation@example.com").digest().readInt32BE(0);
    let release: () => void = () => {};
    let locked: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { locked = resolve; });
    const holding = holder.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(41302::int, ${ipKey}::int)`;
      locked();
      await gate;
    }, { timeout: 12000 });
    // Surface holder setup failure rather than waiting forever for ready.
    let pending: ReturnType<PrismaOtpRequestRepository["reserve"]> | undefined;
    let current = NOW;
    try {
      await Promise.race([ready, holding]);
      pending = repository.reserve(input, { now: () => current });
      // Drain even if a slow observer lets the operational timeout arrive first.
      void pending.catch(() => {});
      // Observe both physical lock classes on the same contender session.
      // This is a setup deadline, never a rate-limit or serialization assertion.
      const deadline = Date.now() + 2000;
      let observed = false;
      while (Date.now() < deadline) {
        const rows = await prisma.$queryRaw<Array<{ ordered: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM pg_locks d JOIN pg_locks i ON i.pid = d.pid
            WHERE d.locktype = 'advisory' AND i.locktype = 'advisory'
              AND d.database = (SELECT oid FROM pg_database WHERE datname = current_database())
              AND d.classid = 41301::oid AND d.objid = ${destinationKey >>> 0}::oid
              AND d.objsubid = 2 AND d.granted
              AND i.classid = 41302::oid AND i.objid = ${ipKey >>> 0}::oid
              AND i.objsubid = 2 AND NOT i.granted
          ) AS ordered`;
        if (rows[0]?.ordered) { observed = true; break; }
        await delay(10);
      }
      expect(observed, "lock setup failure: contender not observed behind held IP").toBe(true);
      const disjoint = await repository.reserve({ ...input,
        destination: signInCodeDestination({ phone: "+99363413001" }), ip: "10.41.3.2",
      }, clock);
      expect(disjoint.resendInSeconds).toBe(60);
      current = new Date("2026-10-18T12:03:00Z");
      release();
      await holding;
      const result = await pending;
      expect(result.record.createdAt).toEqual(new Date("2026-10-18T12:03:00Z"));
      expect(result.record.expiresAt).toEqual(new Date("2026-10-18T12:13:00Z"));
    } finally {
      release();
      await Promise.allSettled([holding, ...(pending ? [pending] : [])]);
    }
  });
});
