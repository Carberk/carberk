import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "@auto-tm/db";

import { cleanSuiteFixtures, defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import type { Session } from "../domain/Session";
import type { TotpEnrollment } from "../domain/TotpEnrollment";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { TotpEnrollmentRepository } from "../domain/ports/TotpEnrollmentRepository";
import { PrismaSessionRepository } from "./PrismaSessionRepository";
import { PrismaTotpEnrollmentRepository } from "./PrismaTotpEnrollmentRepository";
import { RefreshTokenDigestAdapter } from "./RefreshTokenDigestAdapter";

const suite = defineE2eSuite("totp-enrollment-atomicity");
const USERS = ["admin", "other"] as const;
const USER_ID = suite.id("admin");
const NOW = new Date("2026-11-16T12:00:00Z");
const ELEVATED_UNTIL = new Date("2026-11-17T00:00:00Z");
const CODE_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

describe("PrismaTotpEnrollmentRepository atomic elevation", () => {
  let prisma: PrismaService;
  let enrollments: TotpEnrollmentRepository;
  let sessions: SessionRepository;
  let enrollment: TotpEnrollment;
  let ownSession: Session;
  let foreignSession: Session;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    enrollments = new PrismaTotpEnrollmentRepository(prisma);
    sessions = new PrismaSessionRepository(prisma, new RefreshTokenDigestAdapter());
  });

  afterAll(async () => {
    await cleanSuiteFixtures(prisma, suite, { userAliases: USERS });
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await cleanSuiteFixtures(prisma, suite, { userAliases: USERS });
    for (const alias of USERS) {
      await prisma.user.create({
        data: { id: suite.id(alias), phone: suite.phone(alias), phoneVerifiedAt: NOW, role: "admin" },
      });
    }
    const createSession = (userId: string) => sessions.create({
      userId,
      refreshTokenHash: `totp-atomicity-${userId}`,
      deviceLabel: null,
      userAgent: null,
      expiresAt: ELEVATED_UNTIL,
    });
    ownSession = await createSession(USER_ID);
    foreignSession = await createSession(suite.id("other"));
    enrollment = await enrollments.createPending(USER_ID, "encrypted-test-secret");
  });

  function complete(sessionId: string) {
    return enrollments.completeFirstVerification({
      userId: USER_ID,
      enrollmentId: enrollment.id,
      verifiedAt: NOW,
      codeHashes: [CODE_HASH],
      sessionId,
      adminTotpExpiresAt: ELEVATED_UNTIL,
    });
  }

  function consume(sessionId: string) {
    return enrollments.consumeBackupCodeAndElevate({
      userId: USER_ID,
      enrollmentId: enrollment.id,
      codeHash: CODE_HASH,
      usedAt: NOW,
      sessionId,
      adminTotpExpiresAt: ELEVATED_UNTIL,
    });
  }

  it("leaves enrollment and backup codes pending when the Session cannot be elevated, then allows retry", async () => {
    await expect(complete(foreignSession.id)).rejects.toThrow("SESSION_NOT_FOUND");
    expect((await enrollments.findByUserId(USER_ID))?.verifiedAt).toBeNull();
    expect(await enrollments.findBackupCodes(enrollment.id)).toEqual([]);
    expect((await sessions.findById(foreignSession.id))?.adminTotpExpiresAt).toBeNull();

    await complete(ownSession.id);
    expect((await enrollments.findByUserId(USER_ID))?.verifiedAt).toEqual(NOW);
    expect(await enrollments.findBackupCodes(enrollment.id)).toEqual([
      expect.objectContaining({ codeHash: CODE_HASH, usedAt: null }),
    ]);
    expect((await sessions.findById(ownSession.id))?.adminTotpExpiresAt).toEqual(ELEVATED_UNTIL);
  });

  it("keeps a backup code usable after failed elevation and consumes it once across concurrent retries", async () => {
    await complete(ownSession.id);
    await sessions.updateAdminTotpExpiresAt(ownSession.id, null);

    await expect(consume(foreignSession.id)).rejects.toThrow("SESSION_NOT_FOUND");
    expect(await enrollments.findBackupCodes(enrollment.id)).toEqual([
      expect.objectContaining({ codeHash: CODE_HASH, usedAt: null }),
    ]);
    expect((await sessions.findById(foreignSession.id))?.adminTotpExpiresAt).toBeNull();
    expect((await sessions.findById(ownSession.id))?.adminTotpExpiresAt).toBeNull();

    const results = await Promise.all([consume(ownSession.id), consume(ownSession.id)]);
    expect(results.sort()).toEqual([false, true]);
    expect(await enrollments.findBackupCodes(enrollment.id)).toEqual([
      expect.objectContaining({ codeHash: CODE_HASH, usedAt: NOW }),
    ]);
    expect((await sessions.findById(ownSession.id))?.adminTotpExpiresAt).toEqual(ELEVATED_UNTIL);
    expect(await consume(ownSession.id)).toBe(false);
  });
});
