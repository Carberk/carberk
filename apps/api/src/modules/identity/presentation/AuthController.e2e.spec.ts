import "reflect-metadata";

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";
import { PrismaService } from "@auto-tm/db";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";

import { IdentityModule } from "../identity.module";
import { AUDIT_LOG_REPOSITORY } from "../../admin/domain/ports/AuditLogRepository";
import { RecordReviewerAuthBypassAudit } from "../../admin/application/RecordReviewerAuthBypassAudit";
import { PrismaAuditLogRepository } from "../../admin/infrastructure/PrismaAuditLogRepository";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import {
  EMAIL_CODE_SENDER_PORT,
  type EmailCodeSenderPort,
} from "../domain/ports/EmailCodeSenderPort";

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

describe("AuthController e2e — reviewer OTP bypass audit", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;
  let previousReviewEnabled: string | undefined;
  let previousReviewAccounts: string | undefined;
  const account1 = reviewerDemoAccount(1);
  const account2 = reviewerDemoAccount(2);
  const account3 = reviewerDemoAccount(3);

  beforeAll(async () => {
    previousReviewEnabled = process.env["REVIEW_DEMO_ACCOUNT_ENABLED"];
    previousReviewAccounts = process.env["REVIEW_DEMO_ACCOUNTS_JSON"];
    process.env["REVIEW_DEMO_ACCOUNT_ENABLED"] = "true";
    process.env["REVIEW_DEMO_ACCOUNTS_JSON"] = JSON.stringify([
      account1,
      account2,
      account3,
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
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
          useClass: PrismaAuditLogRepository,
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
    await app?.close();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.otpRequest.deleteMany();
  });

  it("authenticates a pre-existing reviewer buyer without OTP issuance and writes a durable audit row without the code", async () => {
    const user = await prisma.user.create({
      data: {
        phone: account1.phone,
        phoneVerifiedAt: new Date(),
        email: account1.email,
        emailVerifiedAt: new Date(),
        role: "buyer",
      },
    });

    const res = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: account1.phone, code: account1.code })
      .expect(201);

    expect(res.body.user.id).toBe(user.id);
    expect(await prisma.otpRequest.count()).toBe(0);

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: "REVIEWER_OTP_BYPASS_LOGIN",
        targetType: "user",
        targetId: user.id,
      },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog?.actorId).toBeNull();
    expect(auditLog?.details).toMatchObject({
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
