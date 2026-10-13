import { EventEmitterModule } from "@nestjs/event-emitter";
import "reflect-metadata";

import { createHash } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import supertest from "supertest";
import { PrismaService } from "@auto-tm/db";

import { ListingsModule } from "../listings.module";
import { IdentityModule } from "../../identity/identity.module";
import { IDENTITY_CHECK_PORT } from "../../identity/identity.public";
import { EnvSchema } from "../../../env.schema";
import { AccountDeletionPendingGuard } from "../../../common/account-deletion-pending.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import { cleanSuiteFixtures, defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

const suite = defineE2eSuite("contact-phones-controller");
type SuiteUser = "seller-1" | "seller-2";
const SUITE_USERS: readonly SuiteUser[] = ["seller-1", "seller-2"];
/** Numbers no suite User holds; each test confirms or requests codes for them. */
const OTHER = suite.phone("other-number");
const SECOND = suite.phone("second-number");
const DAY = 24 * 60 * 60 * 1000;

describe("ContactPhonesController e2e (ADR-0081)", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;
  /** A distinct client address per test, so the shared per-IP budget never spills over. */
  let ip = 0;

  beforeAll(async () => {
    process.env["OTP_TEST_MODE"] = "true";
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        bullTestRoot(),
        ConfigModule.forRoot({ isGlobal: true, validate: (cfg) => EnvSchema.parse(cfg) }),
        ListingsModule,
        IdentityModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    const reflector = app.get(Reflector);
    app.useGlobalGuards(
      new JwtAuthGuard(reflector, app.get(JwtService)),
      new AccountDeletionPendingGuard(reflector, app.get(IDENTITY_CHECK_PORT)),
    );
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    delete process.env["OTP_TEST_MODE"];
    await cleanSuiteFixtures(prisma, suite, {
      userAliases: SUITE_USERS,
      extraPhones: [OTHER, SECOND],
    });
    await app.close();
  });

  beforeEach(async () => {
    ip += 1;
    await cleanSuiteFixtures(prisma, suite, {
      userAliases: SUITE_USERS,
      extraPhones: [OTHER, SECOND],
    });
  });

  async function createSeller(
    alias: SuiteUser,
    data: { suspendedAt?: Date; deletionScheduledAt?: Date } = {},
  ): Promise<string> {
    await prisma.user.create({
      data: {
        id: suite.id(alias),
        phone: suite.phone(alias),
        phoneVerifiedAt: new Date(),
        role: "buyer",
        ...data,
      },
    });
    return `Bearer ${mintUserJwt(suite.id(alias))}`;
  }

  function clientIp(): string {
    return `10.59.${Math.floor(ip / 250)}.${ip % 250}`;
  }

  function post(path: string, auth: string, body: unknown, locale = "ru") {
    return request
      .post(`/api/v1/me/contact-phones/${path}`)
      .set("Authorization", auth)
      .set("X-Real-IP", clientIp())
      .set("Accept-Language", locale)
      .send(body as object);
  }

  async function requestCode(auth: string, phone: string): Promise<string> {
    const res = await post("request", auth, { phone }).expect(200);
    expect(res.body.status).toBe("code_sent");
    return res.body.testCode as string;
  }

  it("refuses an unauthenticated caller", async () => {
    await request.get("/api/v1/me/contact-phones").expect(401);
  });

  describe("POST /request", () => {
    it("answers confirmed for the seller's sign-in phone, stores no code and sends nothing", async () => {
      const auth = await createSeller("seller-1");

      const res = await post("request", auth, { phone: suite.phone("seller-1") }).expect(200);

      expect(res.body).toEqual({
        status: "confirmed",
        contactPhone: {
          phone: suite.phone("seller-1"),
          source: "account",
          confirmedAt: null,
          reusableUntil: null,
        },
      });
      expect(await prisma.otpRequest.count({ where: { destination: suite.phone("seller-1") } })).toBe(0);
    });

    it("stores a listing-contact-phone code bound to the seller and answers code_sent", async () => {
      const auth = await createSeller("seller-1");

      const res = await post("request", auth, { phone: OTHER }).expect(200);

      expect(res.body).toMatchObject({
        status: "code_sent",
        requestId: expect.any(String),
        resendInSeconds: 60,
        testCode: expect.stringMatching(/^\d{6}$/),
      });
      const stored = await prisma.otpRequest.findFirstOrThrow({ where: { destination: OTHER } });
      expect(stored).toMatchObject({
        id: res.body.requestId,
        purpose: "listing_contact_phone",
        userId: suite.id("seller-1"),
        ip: clientIp(),
        codeHash: createHash("sha256").update(res.body.testCode).digest("hex"),
      });
    });

    it("answers confirmed without a code for a number confirmed in the last 7 days", async () => {
      const auth = await createSeller("seller-1");
      const code = await requestCode(auth, OTHER);
      await post("verify", auth, { phone: OTHER, code }).expect(200);

      const res = await post("request", auth, { phone: OTHER }).expect(200);

      expect(res.body).toMatchObject({
        status: "confirmed",
        contactPhone: { phone: OTHER, source: "confirmed" },
      });
      expect(await prisma.otpRequest.count({ where: { destination: OTHER } })).toBe(1);
    });

    it.each([
      ["a non-TM number", { phone: "+79161234567" }],
      ["a landline", { phone: "+99312345678" }],
      ["an extra field", { phone: OTHER, purpose: "sign-in" }],
      ["no body", {}],
    ])("answers VALIDATION_FAILED for %s", async (_name, body) => {
      const auth = await createSeller("seller-1");

      const res = await post("request", auth, body).expect(400);

      expect(res.body.code).toBe("VALIDATION_FAILED");
    });

    it("answers RATE_LIMITED backoff for a resend that comes too soon", async () => {
      const auth = await createSeller("seller-1");
      await requestCode(auth, OTHER);

      const res = await post("request", auth, { phone: OTHER }).expect(400);

      expect(res.body).toMatchObject({
        code: "RATE_LIMITED",
        details: { reason: "backoff", retryInSeconds: expect.any(Number) },
      });
    });

    it("counts sign-in codes for the number against its daily limit", async () => {
      const auth = await createSeller("seller-1");
      await prisma.otpRequest.createMany({
        data: Array.from({ length: 5 }, (_, i) => ({
          purpose: "sign_in" as const,
          channel: "phone" as const,
          destination: OTHER,
          codeHash: "x",
          expiresAt: new Date(),
          ip: "10.0.0.1",
          createdAt: new Date(Date.now() - (i + 2) * 60 * 60 * 1000),
        })),
      });

      const res = await post("request", auth, { phone: OTHER }).expect(400);

      expect(res.body).toMatchObject({
        code: "RATE_LIMITED",
        details: { reason: "destination_limit", retryInSeconds: 0 },
      });
    });

    it("counts every code from the client IP against the hourly IP limit", async () => {
      const auth = await createSeller("seller-1");
      await prisma.otpRequest.createMany({
        data: Array.from({ length: 10 }, () => ({
          purpose: "sign_in" as const,
          channel: "phone" as const,
          destination: SECOND,
          codeHash: "x",
          expiresAt: new Date(),
          ip: clientIp(),
          createdAt: new Date(Date.now() - 10 * 60 * 1000),
        })),
      });

      const res = await post("request", auth, { phone: OTHER }).expect(400);

      expect(res.body).toMatchObject({
        code: "RATE_LIMITED",
        details: { reason: "ip_limit", retryInSeconds: 0 },
      });
    });
  });

  describe("POST /verify", () => {
    it("confirms the number for 7 days without touching the seller's sign-in phone", async () => {
      const auth = await createSeller("seller-1");
      const code = await requestCode(auth, OTHER);

      const res = await post("verify", auth, { phone: OTHER, code }).expect(200);

      const { confirmedAt, reusableUntil } = res.body.contactPhone;
      expect(res.body.contactPhone).toMatchObject({ phone: OTHER, source: "confirmed" });
      expect(new Date(reusableUntil).getTime() - new Date(confirmedAt).getTime()).toBe(7 * DAY);
      const seller = await prisma.user.findUniqueOrThrow({ where: { id: suite.id("seller-1") } });
      expect(seller.phone).toBe(suite.phone("seller-1"));
      expect(
        await prisma.otpRequest.findFirstOrThrow({ where: { destination: OTHER } }),
      ).toMatchObject({ verifiedAt: expect.any(Date) });
    });

    it("restarts the 7 days when the number is confirmed again", async () => {
      const auth = await createSeller("seller-1");
      await prisma.verifiedContactPhone.create({
        data: {
          sellerId: suite.id("seller-1"),
          phone: OTHER,
          confirmedAt: new Date(Date.now() - 8 * DAY),
        },
      });
      const code = await requestCode(auth, OTHER);

      await post("verify", auth, { phone: OTHER, code }).expect(200);

      const rows = await prisma.verifiedContactPhone.findMany({ where: { sellerId: suite.id("seller-1") } });
      expect(rows).toHaveLength(1);
      expect(Date.now() - (rows[0]?.confirmedAt.getTime() ?? 0)).toBeLessThan(60_000);
    });

    it("lets two sellers confirm the same number", async () => {
      const first = await createSeller("seller-1");
      const second = await createSeller("seller-2");
      const firstCode = await requestCode(first, OTHER);
      await post("verify", first, { phone: OTHER, code: firstCode }).expect(200);
      await prisma.otpRequest.updateMany({
        where: { destination: OTHER },
        data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      });
      ip += 1;
      const secondCode = await requestCode(second, OTHER);

      await post("verify", second, { phone: OTHER, code: secondCode }).expect(200);

      expect(await prisma.verifiedContactPhone.count({ where: { phone: OTHER } })).toBe(2);
    });

    it("answers INVALID_OTP with attempts left from 4 to 1, then OTP_LOCKED", async () => {
      const auth = await createSeller("seller-1");
      const code = await requestCode(auth, OTHER);
      const wrong = code === "000000" ? "111111" : "000000";

      const left: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const res = await post("verify", auth, { phone: OTHER, code: wrong }).expect(400);
        expect(res.body.code).toBe("INVALID_OTP");
        left.push(res.body.details.attemptsLeft);
      }
      const fifth = await post("verify", auth, { phone: OTHER, code: wrong }).expect(400);
      const after = await post("verify", auth, { phone: OTHER, code }).expect(400);

      expect(left).toEqual([4, 3, 2, 1]);
      expect(fifth.body.code).toBe("OTP_LOCKED");
      expect(after.body.code).toBe("OTP_LOCKED");
    });

    it("answers OTP_ALREADY_USED for a consumed code and OTP_EXPIRED past 5 minutes", async () => {
      const auth = await createSeller("seller-1");
      const code = await requestCode(auth, OTHER);
      await post("verify", auth, { phone: OTHER, code }).expect(200);

      const used = await post("verify", auth, { phone: OTHER, code }).expect(400);
      await prisma.otpRequest.updateMany({
        where: { destination: OTHER },
        data: { verifiedAt: null, expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await post("verify", auth, { phone: OTHER, code }).expect(400);

      expect(used.body.code).toBe("OTP_ALREADY_USED");
      expect(expired.body.code).toBe("OTP_EXPIRED");
    });

    it("answers OTP_NOT_FOUND for a sign-in code or another seller's code for the number", async () => {
      const auth = await createSeller("seller-1");
      const other = await createSeller("seller-2");
      const othersCode = await requestCode(other, OTHER);
      await prisma.otpRequest.create({
        data: {
          purpose: "sign_in",
          channel: "phone" as const,
          destination: OTHER,
          codeHash: createHash("sha256").update("123456").digest("hex"),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          ip: "10.0.0.1",
        },
      });

      const foreign = await post("verify", auth, { phone: OTHER, code: othersCode }).expect(400);
      const signIn = await post("verify", auth, { phone: OTHER, code: "123456" }).expect(400);

      expect(foreign.body.code).toBe("OTP_NOT_FOUND");
      expect(signIn.body.code).toBe("OTP_NOT_FOUND");
      expect(await prisma.verifiedContactPhone.count({ where: { phone: OTHER } })).toBe(0);
    });

    it("never signs anyone in with a contact-phone code", async () => {
      const auth = await createSeller("seller-1");
      const code = await requestCode(auth, OTHER);

      const res = await request
        .post("/api/v1/auth/otp/verify")
        .send({ phone: OTHER, code, deviceLabel: "contact-phone e2e" })
        .expect(400);

      expect(res.body.code).toBe("OTP_NOT_FOUND");
      expect(await prisma.user.count({ where: { phone: OTHER } })).toBe(0);
    });
  });

  describe("GET /", () => {
    it("lists reusable numbers newest first, without expired ones or the sign-in phone", async () => {
      const auth = await createSeller("seller-1");
      const sellerId = suite.id("seller-1");
      await prisma.verifiedContactPhone.createMany({
        data: [
          { sellerId, phone: OTHER, confirmedAt: new Date(Date.now() - 2 * DAY) },
          { sellerId, phone: SECOND, confirmedAt: new Date(Date.now() - DAY) },
          { sellerId, phone: suite.phone("other-old"), confirmedAt: new Date(Date.now() - 8 * DAY) },
          { sellerId, phone: suite.phone("seller-1"), confirmedAt: new Date() },
        ],
      });

      const res = await request
        .get("/api/v1/me/contact-phones")
        .set("Authorization", auth)
        .expect(200);

      expect(res.body.items.map((item: { phone: string }) => item.phone)).toEqual([SECOND, OTHER]);
      expect(res.body.items[0]).toMatchObject({ source: "confirmed" });
    });
  });

  describe("refused Users", () => {
    it("answers 403 USER_SUSPENDED to a suspended User on every endpoint", async () => {
      const auth = await createSeller("seller-1", { suspendedAt: new Date() });

      const responses = [
        await post("request", auth, { phone: OTHER }),
        await post("verify", auth, { phone: OTHER, code: "123456" }),
        await request.get("/api/v1/me/contact-phones").set("Authorization", auth),
      ];

      for (const res of responses) {
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: "FORBIDDEN", details: { reason: "USER_SUSPENDED" } });
      }
      expect(await prisma.otpRequest.count({ where: { destination: OTHER } })).toBe(0);
    });

    it("refuses a code request while the account deletion is scheduled", async () => {
      const auth = await createSeller("seller-1", { deletionScheduledAt: new Date(Date.now() + DAY) });

      const res = await post("request", auth, { phone: OTHER }).expect(403);

      expect(res.body.code).toBe("FORBIDDEN");
      expect(await prisma.otpRequest.count({ where: { destination: OTHER } })).toBe(0);
    });
  });
});
