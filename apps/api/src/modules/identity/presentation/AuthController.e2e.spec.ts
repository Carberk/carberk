import "reflect-metadata";
import { getQueueToken } from "@nestjs/bullmq";
import type { Queue } from "bullmq";

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";
import { PrismaService } from "@auto-tm/db";
import { AuthSchemas } from "@auto-tm/contracts";
import { Injectable } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";

import { IdentityModule } from "../identity.module";
import { IDENTITY_ADMIN_PORT, type IdentityAdminPort } from "../identity.public";
import { AUDIT_LOG_REPOSITORY } from "../../admin/domain/ports/AuditLogRepository";
import { RecordReviewerAuthBypassAudit } from "../../admin/application/RecordReviewerAuthBypassAudit";
import { PrismaAuditLogRepository } from "../../admin/infrastructure/PrismaAuditLogRepository";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import {
  EMAIL_CODE_SENDER_PORT,
  type EmailCodeSenderPort,
} from "../domain/ports/EmailCodeSenderPort";
import { toCodePurpose } from "../infrastructure/codePurpose";
import { reservedPhoneAttemptKey } from "../infrastructure/RedisReservedPhoneAttemptLedger";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { eventually } from "../../../../test/helpers/eventually";

function reviewerDemoAccount(index: number): { phone: string; email: string; code: string } {
  return {
    phone: `+99365${String(index).padStart(6, "0")}`,
    email: `reviewer${index}@autotm.bagtyyar.dev`,
    code: String(index).repeat(6),
  };
}

describe("AuthController e2e — POST /api/v1/auth/otp/request", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        IdentityModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.otpRequest.deleteMany();
  });

  it("returns 201 with requestId and resendInSeconds for a valid TM phone", async () => {
    const res = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone: "+99361234567" })
      .expect(201);

    expect(res.body.requestId).toBeDefined();
    expect(res.body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // resendInSeconds should be 60 for first request (60 * 2^0)
    // Allow small clock skew (±5s)
    expect(res.body.resendInSeconds).toBeGreaterThanOrEqual(55);
    expect(res.body.resendInSeconds).toBeLessThanOrEqual(60);
    expect(res.body.testCode).toBeUndefined();
  });

  it("returns 400 VALIDATION_FAILED for an invalid phone number", async () => {
    const res = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone: "+15551234567" })
      .expect(400);

    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("returns 400 VALIDATION_FAILED for a malformed phone", async () => {
    const res = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone: "not-a-phone" })
      .expect(400);

    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("returns 400 VALIDATION_FAILED for missing body", async () => {
    const res = await request
      .post("/api/v1/auth/otp/request")
      .send({})
      .expect(400);

    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("enforces phone daily rate limit (5 requests)", async () => {
    const phone = "+99363334444";
    for (let i = 0; i < 5; i++) {
      await prisma.otpRequest.create({
        data: {
          purpose: toCodePurpose("sign-in"),
          channel: "phone",
          destination: phone,
          phone,
          codeHash: "test-hash",
          expiresAt: new Date(Date.now() + 300_000),
          ip: `10.0.0.${i}`,
        },
      });
    }

    const res = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone })
      .expect(400);

    expect(res.body.code).toBe("RATE_LIMITED");
    expect(res.body.details).toEqual({
      reason: "destination_limit",
      retryInSeconds: 0,
    });
  });

  it("counts codes of every purpose against the daily limit for a number", async () => {
    const phone = "+99363335555";
    const purposes = ["account-deletion", "sign-in-method"] as const;
    for (let i = 0; i < 5; i++) {
      await prisma.otpRequest.create({
        data: {
          purpose: toCodePurpose(purposes[i % 2]!),
          channel: "phone",
          destination: phone,
          phone,
          codeHash: "test-hash",
          expiresAt: new Date(Date.now() + 300_000),
          ip: `10.0.1.${i}`,
        },
      });
    }

    const res = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone })
      .expect(400);

    expect(res.body.code).toBe("RATE_LIMITED");
    expect(res.body.details).toEqual({
      reason: "destination_limit",
      retryInSeconds: 0,
    });
  });
});

describe("AuthController e2e — email Sign-in Method", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;
  const queued: Parameters<EmailCodeSenderPort["enqueue"]>[0][] = [];
  const emailSender: EmailCodeSenderPort = {
    enqueue: async (input) => { queued.push(input); },
  };

  beforeAll(async () => {
    process.env["OTP_TEST_MODE"] = "true";
    const moduleFixture = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        IdentityModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    })
      .overrideProvider(EMAIL_CODE_SENDER_PORT)
      .useValue(emailSender)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    delete process.env["OTP_TEST_MODE"];
    await app.close();
  });

  beforeEach(async () => {
    queued.length = 0;
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.otpRequest.deleteMany();
  });

  it("requests and verifies an emailed code into an email-only User", async () => {
    const requestResponse = await request
      .post("/api/v1/auth/otp/request")
      .send({ email: " Buyer@Example.COM " })
      .expect(201);

    expect(queued).toEqual([
      expect.objectContaining({
        requestId: requestResponse.body.requestId,
        email: "buyer@example.com",
        code: requestResponse.body.testCode,
      }),
    ]);
    const stored = await prisma.otpRequest.findUnique({
      where: { id: requestResponse.body.requestId },
    });
    expect(stored).toMatchObject({
      channel: "email",
      destination: "buyer@example.com",
      phone: null,
    });

    const verifyResponse = await request
      .post("/api/v1/auth/otp/verify")
      .send({ email: "buyer@example.com", code: requestResponse.body.testCode })
      .expect(201);

    expect(verifyResponse.body.user).toMatchObject({
      phone: null,
      email: "buyer@example.com",
      role: "buyer",
    });
    await expect(prisma.user.findUnique({
      where: { email: "buyer@example.com" },
    })).resolves.toMatchObject({
      phone: null,
      emailVerifiedAt: expect.any(Date),
    });

    await request
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: verifyResponse.body.refreshToken })
      .expect(201);
  });

  it("returns the same request response for registered and unregistered emails", async () => {
    await prisma.user.create({
      data: {
        email: "registered@example.com",
        emailVerifiedAt: new Date(),
      },
    });

    const registered = await request
      .post("/api/v1/auth/otp/request")
      .send({ email: "registered@example.com" })
      .expect(201);
    const unregistered = await request
      .post("/api/v1/auth/otp/request")
      .send({ email: "unregistered@example.com" })
      .expect(201);

    expect(Object.keys(registered.body).sort()).toEqual(
      Object.keys(unregistered.body).sort(),
    );
    expect(queued.map((job) => job.email)).toEqual([
      "registered@example.com",
      "unregistered@example.com",
    ]);
  });
});

describe("AuthController e2e — POST /api/v1/auth/otp/verify", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env["OTP_TEST_MODE"] = "true";
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        IdentityModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    delete process.env["OTP_TEST_MODE"];
    await app.close();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.otpRequest.deleteMany();
  });

  afterEach(() => {
    delete process.env["SIGNUPS_ENABLED"];
  });

  async function requestOtp(phone: string): Promise<string> {
    const res = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone })
      .expect(201);
    return res.body.testCode as string;
  }

  it("verifies a valid OTP and returns tokens + user", async () => {
    const testCode = await requestOtp("+99361234567");

    const res = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99361234567", code: testCode, deviceLabel: "Chrome on Mac" })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.accessToken).toMatch(/^eyJ/);
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.refreshToken).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.phone).toBe("+99361234567");
    expect(res.body.user.role).toBe("buyer");
  });

  it("returns 400 OTP_NOT_FOUND when no OTP was requested", async () => {
    const res = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99361234567", code: "123456" })
      .expect(400);

    expect(res.body.code).toBe("OTP_NOT_FOUND");
  });

  it("returns 400 INVALID_OTP for wrong code", async () => {
    await requestOtp("+99361234567");

    const res = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99361234567", code: "000000" })
      .expect(400);

    expect(res.body.code).toBe("INVALID_OTP");
  });

  it("locks an ordinary Sign-in Code after five failures across concurrent requests", async () => {
    const phone = "+99361234567";
    const code = await requestOtp(phone);
    const wrongCode = code === "000000" ? "111111" : "000000";
    const responses = await Promise.all(Array.from({ length: 10 }, () =>
      request.post("/api/v1/auth/otp/verify").send({ phone, code: wrongCode }).expect(400)));

    expect(responses.filter(response => response.body.code === "INVALID_OTP")).toHaveLength(4);
    expect(responses.filter(response => response.body.code === "OTP_LOCKED")).toHaveLength(6);
    const locked = await request.post("/api/v1/auth/otp/verify").send({ phone, code }).expect(400);
    expect(locked.body.code).toBe("OTP_LOCKED");
  });

  it("still signs in with an ordinary correct code after four wrong attempts", async () => {
    const phone = "+99361234567";
    const code = await requestOtp(phone);
    const wrongCode = code === "000000" ? "111111" : "000000";
    for (let index = 0; index < 4; index += 1) {
      const refused = await request.post("/api/v1/auth/otp/verify").send({ phone, code: wrongCode }).expect(400);
      expect(refused.body.code).toBe("INVALID_OTP");
    }
    const signedIn = await request.post("/api/v1/auth/otp/verify").send({ phone, code }).expect(201);
    expect(signedIn.body.user.phone).toBe(phone);
    expect(signedIn.body.refreshToken).toBeTypeOf("string");
  });

  it("returns 400 OTP_ALREADY_USED when code is reused", async () => {
    const testCode = await requestOtp("+99361234567");

    await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99361234567", code: testCode })
      .expect(201);

    const res = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99361234567", code: testCode })
      .expect(400);

    expect(res.body.code).toBe("OTP_ALREADY_USED");
  });

  it("creates a new user on first verification and reuses on second", async () => {
    const testCode1 = await requestOtp("+99361234567");
    const res1 = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99361234567", code: testCode1 })
      .expect(201);

    const userId = res1.body.user.id;

    // Request a new OTP and verify again with same phone
    await prisma.otpRequest.updateMany({
      where: { channel: "phone", destination: "+99361234567" },
      data: { createdAt: new Date(Date.now() - 2 * 60_000) },
    });
    const testCode2 = await requestOtp("+99361234567");
    const res2 = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99361234567", code: testCode2 })
      .expect(201);

    expect(res2.body.user.id).toBe(userId);
  });

  it("returns 403 FORBIDDEN when SIGNUPS_ENABLED=false and phone is new", async () => {
    process.env["SIGNUPS_ENABLED"] = "false";

    const testCode = await requestOtp("+99361234567");

    const res = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99361234567", code: testCode })
      .expect(403);

    expect(res.body.code).toBe("FORBIDDEN");
    expect(res.body.details?.reason).toBe("FEATURE_DISABLED");
  });

  it("allows existing user login when SIGNUPS_ENABLED=false", async () => {
    process.env["SIGNUPS_ENABLED"] = "false";

    const existingUser = await prisma.user.create({
      data: { phone: "+99361234567", phoneVerifiedAt: new Date() },
    });

    const testCode = await requestOtp("+99361234567");
    const res = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99361234567", code: testCode })
      .expect(201);

    expect(res.body.user.id).toBe(existingUser.id);
  });

  it("signs in an account in the deletion grace period without restoring it", async () => {
    process.env["SIGNUPS_ENABLED"] = "false";

    const scheduledAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const existingUser = await prisma.user.create({
      data: {
        phone: "+99361234567",
        phoneVerifiedAt: new Date(),
        deletionScheduledAt: scheduledAt,
      },
    });

    const testCode = await requestOtp("+99361234567");
    const res = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: "+99361234567", code: testCode })
      .expect(201);

    expect(res.body.user.id).toBe(existingUser.id);
    expect(res.body.user.deletionScheduledAt).toBe(scheduledAt.toISOString());

    const userAfter = await prisma.user.findUnique({ where: { id: existingUser.id } });
    expect(userAfter?.deletionScheduledAt).toEqual(scheduledAt);
  });
});

// The audit row is written by an async @OnEvent handler after VerifyOtp
// emits ReviewerOtpBypassAuthenticated, so under CI event-loop load the
// write can land after the HTTP response (hosted run 36890441753 attempt 1
// failed on exactly that timing). Delaying the write past any plausible
// response latency makes that race deterministic: if the test below ever
// stops waiting for the row, it fails on every run instead of flaking.
@Injectable()
class DelayedPrismaAuditLogRepository extends PrismaAuditLogRepository {
  override async create(
    ...args: Parameters<PrismaAuditLogRepository["create"]>
  ): ReturnType<PrismaAuditLogRepository["create"]> {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return super.create(...args);
  }
}

describe.each([true, false])("AuthController e2e fixed-code audit, reviewer flag %s", (reviewEnabled) => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;
  let previousReviewEnabled: string | undefined;
  let previousReviewAccounts: string | undefined;
  let previousTesterAccounts: string | undefined;
  const account1 = reviewEnabled ? reviewerDemoAccount(1) : { phone: "+99370000001", email: "tester1@example.invalid", code: "765432" };
  const otherAccount = reviewEnabled ? reviewerDemoAccount(2) : { phone: "+99370000002", email: "tester2@example.invalid", code: "654321" };
  const account2 = reviewerDemoAccount(2);
  const account3 = reviewerDemoAccount(3);

  beforeAll(async () => {
    previousReviewEnabled = process.env["REVIEW_DEMO_ACCOUNT_ENABLED"];
    previousReviewAccounts = process.env["REVIEW_DEMO_ACCOUNTS_JSON"];
    previousTesterAccounts = process.env["TESTER_ACCOUNTS_JSON"];
    process.env["TESTER_ACCOUNTS_JSON"] = reviewEnabled ? "[]" : JSON.stringify([account1, otherAccount]);
    process.env["REVIEW_DEMO_ACCOUNT_ENABLED"] = String(reviewEnabled);
    process.env["REVIEW_DEMO_ACCOUNTS_JSON"] = JSON.stringify([
      reviewerDemoAccount(1),
      account2,
      account3,
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        EventEmitterModule.forRoot(),
        IdentityModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
      providers: [
        PrismaAuditLogRepository,
        {
          provide: AUDIT_LOG_REPOSITORY,
          useClass: DelayedPrismaAuditLogRepository,
        },
        RecordReviewerAuthBypassAudit,
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (previousReviewEnabled === undefined) {
      delete process.env["REVIEW_DEMO_ACCOUNT_ENABLED"];
    } else {
      process.env["REVIEW_DEMO_ACCOUNT_ENABLED"] = previousReviewEnabled;
    }
    if (previousReviewAccounts === undefined) {
      delete process.env["REVIEW_DEMO_ACCOUNTS_JSON"];
    } else {
      process.env["REVIEW_DEMO_ACCOUNTS_JSON"] = previousReviewAccounts;
    }
    if (previousTesterAccounts === undefined) delete process.env["TESTER_ACCOUNTS_JSON"];
    else process.env["TESTER_ACCOUNTS_JSON"] = previousTesterAccounts;
    await app?.close();
  });

  beforeEach(async () => {
    const queue = app.get<Queue>(getQueueToken(AuthSchemas.EMAIL_CODE_QUEUE));
    const redis = await queue.client;
    for (const account of [account1, otherAccount]) {
      await redis.del(reservedPhoneAttemptKey(account.phone));
    }
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.otpRequest.deleteMany();
  });

  it("shares a destination budget across concurrent guesses and refuses the correct code until the lock expires", async () => {
    for (const account of [account1, otherAccount]) await prisma.user.create({ data: {
      phone: account.phone, phoneVerifiedAt: new Date(), role: "buyer",
    } });
    // A separate application graph has its own managed Redis client.
    const secondModule = await Test.createTestingModule({ imports: [
      bullTestRoot(), IdentityModule,
      JwtModule.register({ global: true, secret: "synthetic-second-api-secret" }),
    ] }).compile();
    const secondApp = secondModule.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    secondApp.useGlobalFilters(new GlobalErrorFilter());
    let guesses: Awaited<ReturnType<ReturnType<typeof supertest>["post"]>>[];
    try {
      await secondApp.listen(0, "127.0.0.1");
      const secondRequest = supertest(secondApp.getHttpServer());
      guesses = await Promise.all(Array.from({ length: 20 }, (_, index) =>
        (index % 2 === 0 ? request : secondRequest).post("/api/v1/auth/otp/verify")
          .send({ phone: account1.phone, code: "999999" }).expect(400),
      ));
    } finally {
      await secondApp.close();
    }
    expect(guesses.filter((response) => response.body.code === "INVALID_OTP")).toHaveLength(4);
    expect(guesses.filter((response) => response.body.code === "OTP_LOCKED")).toHaveLength(16);
    const locked = await request.post("/api/v1/auth/otp/verify")
      .send({ phone: account1.phone, code: account1.code }).expect(400);
    expect(locked.body).toMatchObject({ code: "OTP_LOCKED", message: "Too many failed attempts. Wait 15 minutes and try again." });
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
    expect(await prisma.otpRequest.count()).toBe(0);
    // Requesting again cannot clear a verification lock.
    await request.post("/api/v1/auth/otp/request").send({ phone: account1.phone }).expect(201);
    await request.post("/api/v1/auth/otp/verify").send({ phone: account1.phone, code: account1.code }).expect(400);
    await request.post("/api/v1/auth/otp/verify").send({ phone: otherAccount.phone, code: otherAccount.code }).expect(201);
    const queue = app.get<Queue>(getQueueToken(AuthSchemas.EMAIL_CODE_QUEUE));
    const redis = await queue.client;
    const key = reservedPhoneAttemptKey(account1.phone);
    expect(await redis.pttl(key)).toBeGreaterThan(890_000);
    expect(await redis.pttl(key)).toBeLessThanOrEqual(900_000);
    // Move near the deadline, then prove blocked reads cannot refresh it.
    await redis.pexpire(key, 10_000);
    for (const code of [account1.code, "999999"]) {
      const retry = await request.post("/api/v1/auth/otp/verify").send({ phone: account1.phone, code }).expect(400);
      expect(retry.body.code).toBe("OTP_LOCKED");
    }
    expect(await redis.pttl(key)).toBeLessThanOrEqual(10_000);
    // Expire the real Redis key, without waiting 15 minutes in CI.
    await redis.pexpire(key, 1);
    const recovered = await eventually(async () => {
      const response = await request.post("/api/v1/auth/otp/verify").send({ phone: account1.phone, code: account1.code });
      return response.status === 201 ? response.body : null;
    });
    expect(recovered.user.phone).toBe(account1.phone);
    const freshFailure = await request.post("/api/v1/auth/otp/verify").send({ phone: account1.phone, code: "999999" }).expect(400);
    expect(freshFailure.body.code).toBe("INVALID_OTP");
  });

  it.each(["phone", "email"] as const)("suspends and restores fixed-code %s sign-in without reviving old Sessions", async (channel) => {
    const user = await prisma.user.create({ data: {
      phone: account1.phone, phoneVerifiedAt: new Date(), email: account1.email,
      emailVerifiedAt: new Date(), role: "buyer",
    } });
    const input = { [channel]: account1[channel], code: account1.code };
    await request.post("/api/v1/auth/otp/request").send({ [channel]: account1[channel] }).expect(201);
    const signedIn = await request.post("/api/v1/auth/otp/verify").send(input).expect(201);
    const identity = app.get<IdentityAdminPort>(IDENTITY_ADMIN_PORT);
    await expect(prisma.$transaction(async (tx) => {
      await identity.suspendUser(user.id, user.id, "Synthetic suspension", tx);
      throw new Error("Rollback suspension");
    })).rejects.toThrow("Rollback suspension");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).suspendedAt).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    await prisma.$transaction((tx) => identity.suspendUser(user.id, user.id, "Synthetic suspension", tx));
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    await request.post("/api/v1/auth/refresh").send({ refreshToken: signedIn.body.refreshToken }).expect(401);
    // The second email request must be outside the existing resend backoff.
    if (channel === "email") await prisma.otpRequest.updateMany({
      where: { channel: "email", destination: account1.email },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    await request.post("/api/v1/auth/otp/request").send({ [channel]: account1[channel] }).expect(201);
    const refused = await request.post("/api/v1/auth/otp/verify").send(input).expect(403);
    expect(refused.body.details).toEqual({ reason: "USER_SUSPENDED" });
    if (channel === "email") expect((await prisma.otpRequest.findFirstOrThrow({ orderBy: { createdAt: "desc" } })).verifiedAt).toBeNull();
    await prisma.$transaction((tx) => identity.unsuspendUser(user.id, tx));
    await request.post("/api/v1/auth/refresh").send({ refreshToken: signedIn.body.refreshToken }).expect(401);
    const restored = await request.post("/api/v1/auth/otp/verify").send(input).expect(201);
    expect(restored.body.user.id).toBe(user.id);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it.each(["phone", "email"] as const)("authenticates a pre-existing ordinary User by %s and persists a code-free audit row", async (channel) => {
    const user = await prisma.user.create({
      data: {
        phone: account1.phone,
        phoneVerifiedAt: new Date(),
        email: account1.email,
        emailVerifiedAt: new Date(),
        role: "buyer",
      },
    });

    await request.post("/api/v1/auth/otp/request").send({ [channel]: account1[channel] }).expect(201);
    const res = await request
      .post("/api/v1/auth/otp/verify")
      .send({ [channel]: account1[channel], code: account1.code })
      .expect(201);

    expect(res.body.user.id).toBe(user.id);
    expect(await prisma.otpRequest.count()).toBe(channel === "phone" ? 0 : 1);

    const auditLog = await eventually(
      () =>
        prisma.auditLog.findFirst({
          where: {
            action: "REVIEWER_OTP_BYPASS_LOGIN",
            targetType: "user",
            targetId: user.id,
          },
        }),
      { description: "the REVIEWER_OTP_BYPASS_LOGIN audit row" },
    );

    expect(auditLog.actorId).toBeNull();
    expect(auditLog.details).toMatchObject({
      authMethod: "reviewer_otp_bypass",
      role: "buyer",
    });
    expect(JSON.stringify(auditLog)).not.toContain(account1.code);
  });
});

describe("AuthController e2e — POST /api/v1/auth/logout", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env["OTP_TEST_MODE"] = "true";
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        IdentityModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    delete process.env["OTP_TEST_MODE"];
    await app.close();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.otpRequest.deleteMany();
  });

  async function login(phone: string): Promise<{ accessToken: string; refreshToken: string }> {
    const otpRes = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone })
      .expect(201);
    const verifyRes = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone, code: otpRes.body.testCode })
      .expect(201);
    return {
      accessToken: verifyRes.body.accessToken,
      refreshToken: verifyRes.body.refreshToken,
    };
  }

  it("requires reauthentication for a pre-cutover bcrypt token without a legacy fallback", async () => {
    await login("+99361234567");
    // A real pre-cutover bcrypt verifier for the synthetic token `c` repeated
    // 64 times. Kept literal so the fixture does not use the current hasher.
    const legacyHash = "$2b$10$jjkDkrXhw4teuItuaa54D.9yZAMqC63VbwTxNGoGd.ah3owxvc/Sy";
    const session = await prisma.session.findFirstOrThrow();
    await prisma.session.update({ where: { id: session.id }, data: { refreshTokenHash: legacyHash } });

    for (const action of ["refresh", "logout"]) {
      const response = await request.post(`/api/v1/auth/${action}`)
        .send({ refreshToken: "c".repeat(64) }).expect(401);
      expect(response.body.code).toBe("INVALID_REFRESH_TOKEN");
    }
    expect((await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).refreshTokenHash)
      .toBe(legacyHash);
  });

  it("rotates one owner's session once among unrelated active and expired sessions", async () => {
    await login("+99361111111");
    const other = await prisma.user.findUniqueOrThrow({ where: { phone: "+99361111111" } });
    await prisma.session.createMany({ data: Array.from({ length: 500 }, (_, index) => ({
      userId: other.id,
      refreshTokenHash: `unrelated-digest-${index}`,
      expiresAt: new Date(index % 2 === 0 ? "2020-01-01T00:00:00Z" : "2099-01-01T00:00:00Z"),
    })) });
    const { refreshToken } = await login("+99361234567");
    const owner = await prisma.user.findUniqueOrThrow({ where: { phone: "+99361234567" } });
    const session = await prisma.session.findFirstOrThrow({ where: { userId: owner.id } });
    const elevation = new Date("2099-01-01T00:00:00Z");
    await prisma.user.update({ where: { id: owner.id }, data: { role: "admin" } });
    await prisma.session.update({ where: { id: session.id }, data: { adminTotpExpiresAt: elevation } });

    const results = await Promise.all([1, 2].map(() => request.post("/api/v1/auth/refresh").send({ refreshToken })));
    expect(results.map((result) => result.status).sort()).toEqual([201, 401]);
    const renewed = results.find((result) => result.status === 201)!;
    const claims = app.get(JwtService).verify(renewed.body.accessToken);
    expect(claims).toMatchObject({ sub: owner.id, sid: session.id, role: "admin" });
    const stored = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.adminTotpExpiresAt).toEqual(elevation);
    expect(stored.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.refreshTokenHash).not.toBe(renewed.body.refreshToken);
    await request.post("/api/v1/auth/refresh").send({ refreshToken }).expect(401);
    await request.post("/api/v1/auth/logout").send({ refreshToken: "a".repeat(64) }).expect(401);
    await request.post("/api/v1/auth/logout").send({ refreshToken: renewed.body.refreshToken }).expect(204);
    expect(await prisma.session.count({ where: { userId: other.id } })).toBe(501);
  });

  it("refuses expired refresh but still lets its owner log out that session", async () => {
    const { refreshToken } = await login("+99361234567");
    const session = await prisma.session.findFirstOrThrow();
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date("2020-01-01T00:00:00Z") } });
    const expired = await request.post("/api/v1/auth/refresh").send({ refreshToken }).expect(401);
    expect(expired.body.code).toBe("SESSION_EXPIRED");
    await request.post("/api/v1/auth/logout").send({ refreshToken }).expect(204);
    expect(await prisma.session.findUnique({ where: { id: session.id } })).toBeNull();
  });

  it("returns 204 and deletes the session matching the supplied refresh token", async () => {
    const { refreshToken } = await login("+99361234567");

    await request
      .post("/api/v1/auth/logout")
      .send({ refreshToken })
      .expect(204);

    // Verify the session is gone — refreshing with the same token should fail
    await request
      .post("/api/v1/auth/refresh")
      .send({ refreshToken })
      .expect(401);
  });

  it("returns 401 for an unknown refresh token", async () => {
    const res = await request
      .post("/api/v1/auth/logout")
      .send({ refreshToken: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789" })
      .expect(401);

    expect(res.body.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("returns 400 for missing body", async () => {
    const res = await request
      .post("/api/v1/auth/logout")
      .send({})
      .expect(400);

    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("is idempotent — second call with same token returns 401", async () => {
    const { refreshToken } = await login("+99361234567");

    // First logout succeeds
    await request
      .post("/api/v1/auth/logout")
      .send({ refreshToken })
      .expect(204);

    // Second logout with same (now-deleted) token
    const res = await request
      .post("/api/v1/auth/logout")
      .send({ refreshToken })
      .expect(401);

    expect(res.body.code).toBe("INVALID_REFRESH_TOKEN");
  });
});

describe("AuthController e2e — POST /api/v1/auth/logout-all", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env["OTP_TEST_MODE"] = "true";
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        IdentityModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    const reflector = app.get(Reflector);
    const jwtService = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(reflector, jwtService));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    delete process.env["OTP_TEST_MODE"];
    await app.close();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.otpRequest.deleteMany();
  });

  async function login(phone: string): Promise<{ accessToken: string; refreshToken: string }> {
    const otpRes = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone })
      .expect(201);
    const verifyRes = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone, code: otpRes.body.testCode })
      .expect(201);
    return {
      accessToken: verifyRes.body.accessToken,
      refreshToken: verifyRes.body.refreshToken,
    };
  }

  it("returns 401 when no bearer token is provided", async () => {
    await request
      .post("/api/v1/auth/logout-all")
      .expect(401);
  });

  it("returns 204 and deletes all sessions for the authenticated user", async () => {
    const { accessToken, refreshToken } = await login("+99361234567");

    await request
      .post("/api/v1/auth/logout-all")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(204);

    // Verify all sessions are gone — refresh should fail
    await request
      .post("/api/v1/auth/refresh")
      .send({ refreshToken })
      .expect(401);
  });

  it("only deletes the authenticated user's sessions, not others", async () => {
    const { accessToken, refreshToken: user1Refresh } = await login("+99361234567");
    const { refreshToken: user2Refresh } = await login("+99363334444");

    // User 1 logs out all
    await request
      .post("/api/v1/auth/logout-all")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(204);

    // User 1's sessions gone — refresh fails
    await request
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: user1Refresh })
      .expect(401);

    // User 2's session still works
    await request
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: user2Refresh })
      .expect(201);
  });
});

describe("MeController e2e — GET /api/v1/me", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env["OTP_TEST_MODE"] = "true";
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        IdentityModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    const reflector = app.get(Reflector);
    const jwtService = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(reflector, jwtService));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    delete process.env["OTP_TEST_MODE"];
    await app.close();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.otpRequest.deleteMany();
  });

  async function login(phone: string): Promise<{ accessToken: string; userId: string }> {
    const otpRes = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone })
      .expect(201);
    const verifyRes = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone, code: otpRes.body.testCode })
      .expect(201);
    return {
      accessToken: verifyRes.body.accessToken,
      userId: verifyRes.body.user.id,
    };
  }

  it("returns 401 when no bearer token is provided", async () => {
    await request
      .get("/api/v1/me")
      .expect(401);
  });

  it("returns the user shape for an authenticated request", async () => {
    const { accessToken, userId } = await login("+99361234567");

    const res = await request
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(userId);
    expect(res.body.phone).toBe("+99361234567");
    expect(res.body.email).toBeNull();
    expect(res.body.phoneVerified).toBe(true);
    expect(res.body.role).toBe("buyer");
    expect(res.body).toHaveProperty("displayName");
    expect(res.body).toHaveProperty("avatarUrl");
    expect(res.body).toHaveProperty("locale");
    expect(res.body).toHaveProperty("createdAt");
    expect(res.body).toHaveProperty("deletionScheduledAt");
  });

  it("returns the assigned name number and avatar index, unchanged by a second sign-in (#638)", async () => {
    const first = await login("+99361234567");
    const firstMe = await request
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${first.accessToken}`)
      .expect(200);

    expect(firstMe.body.displayName).toBeNull();
    expect(firstMe.body.avatarKey).toBeNull();
    expect(firstMe.body.nameNumber).toBeGreaterThanOrEqual(1000);
    expect(firstMe.body.nameNumber).toBeLessThanOrEqual(9999);
    expect(firstMe.body.avatarIndex).toBeGreaterThanOrEqual(0);
    expect(firstMe.body.avatarIndex).toBeLessThanOrEqual(11);
    expect(AuthSchemas.MeResponseSchema.safeParse(firstMe.body).success).toBe(true);

    await prisma.otpRequest.updateMany({
      where: { channel: "phone", destination: "+99361234567" },
      data: { createdAt: new Date(Date.now() - 2 * 60_000) },
    });
    const second = await login("+99361234567");
    const secondMe = await request
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${second.accessToken}`)
      .expect(200);

    expect(second.userId).toBe(first.userId);
    expect(secondMe.body).toMatchObject({
      nameNumber: firstMe.body.nameNumber,
      avatarIndex: firstMe.body.avatarIndex,
      avatarKey: null,
    });
  });

  it("returns the correct role for the authenticated user", async () => {
    // Login as buyer
    const { accessToken } = await login("+99361234567");

    const res = await request
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.role).toBe("buyer");
  });
});

describe("MeController e2e — DELETE /api/v1/me", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env["OTP_TEST_MODE"] = "true";
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        IdentityModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    const reflector = app.get(Reflector);
    const jwtService = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(reflector, jwtService));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    delete process.env["OTP_TEST_MODE"];
    await app.close();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.otpRequest.deleteMany();
  });

  async function login(phone: string): Promise<{ accessToken: string; userId: string }> {
    const otpRes = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone })
      .expect(201);
    const verifyRes = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone, code: otpRes.body.testCode })
      .expect(201);
    return {
      accessToken: verifyRes.body.accessToken,
      userId: verifyRes.body.user.id,
    };
  }

  it("returns 401 when no bearer token is provided", async () => {
    await request
      .delete("/api/v1/me")
      .expect(401);
  });

  it("returns 401 with an invalid bearer token", async () => {
    await request
      .delete("/api/v1/me")
      .set("Authorization", "Bearer invalid-token")
      .expect(401);
  });

  it("returns 204 and starts a 30-day deletion grace period", async () => {
    const { accessToken, userId } = await login("+99361234567");

    await request
      .delete("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(204);

    // Verify user row is retained with deletionScheduledAt set
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user).not.toBeNull();
    expect(user!.deletionScheduledAt).not.toBeNull();
  });

  it("returns 204 and revokes all sessions", async () => {
    const { accessToken, userId } = await login("+99361234567");

    // Verify session exists before deletion
    const sessionsBefore = await prisma.session.count({ where: { userId } });
    expect(sessionsBefore).toBeGreaterThan(0);

    await request
      .delete("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(204);

    // Sessions are explicitly deleted by DeleteMe, not cascaded
    const sessionsAfter = await prisma.session.count({ where: { userId } });
    expect(sessionsAfter).toBe(0);
  });
});
