import "reflect-metadata";
import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";
import { PrismaService } from "@auto-tm/db";

import { IdentityModule } from "../identity.module";
import { IDENTITY_CHECK_PORT } from "../identity.public";
import { AccountDeletionPendingGuard } from "../../../common/account-deletion-pending.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import {
  cleanSuiteFixtures,
  defineE2eSuite,
  seedSuiteCatalog,
} from "../../../../test/helpers/e2eSuite";

const suite = defineE2eSuite("account-restore");
const SUITE_USERS = ["member"] as const;
const PHONE = suite.phone("member");
const USER_ID = suite.id("member");

describe("Account restore e2e", () => {
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
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
    await app.close();
  });

  beforeEach(async () => {
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
    await prisma.user.create({
      data: { id: USER_ID, phone: PHONE, phoneVerifiedAt: new Date() },
    });
  });

  async function signIn(): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { deletionScheduledAt: string | null };
  }> {
    // Backdate earlier codes so the resend cooldown does not apply.
    await prisma.otpRequest.updateMany({
      where: { channel: "phone", destination: PHONE },
      data: { createdAt: new Date(Date.now() - 2 * 60_000) },
    });
    const otp = await request
      .post("/api/v1/auth/otp/request")
      .send({ phone: PHONE })
      .expect(201);
    const verified = await request
      .post("/api/v1/auth/otp/verify")
      .send({ phone: PHONE, code: otp.body.testCode })
      .expect(201);
    return verified.body;
  }

  async function seedListings() {
    const catalog = await seedSuiteCatalog(prisma, suite);
    const base = {
      sellerId: USER_ID,
      brandId: catalog.brandId,
      modelId: catalog.modelId,
      cityId: catalog.cityId,
      regionId: catalog.regionId,
      year: 2020,
      mileageKm: 50000,
      priceAmount: 100000,
      priceCurrency: "TMT" as const,
      description: "Great car",
      allowCalls: true,
      allowChat: true,
    };
    const active = await prisma.listing.create({
      data: { id: randomUUID(), ...base, status: "active", publishedAt: new Date() },
    });
    const selfArchived = await prisma.listing.create({
      data: { id: randomUUID(), ...base, status: "archived" },
    });
    return { active, selfArchived };
  }

  async function deleteAccount(accessToken: string) {
    await request
      .delete("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(204);
  }

  it("keeps the deletion scheduled and the listings archived when the User signs in", async () => {
    const { active } = await seedListings();
    const first = await signIn();
    await deleteAccount(first.accessToken);

    const pending = await signIn();

    expect(pending.user.deletionScheduledAt).not.toBeNull();
    const user = await prisma.user.findUnique({ where: { id: USER_ID } });
    expect(user!.deletionScheduledAt).not.toBeNull();
    const listing = await prisma.listing.findUnique({ where: { id: active.id } });
    expect(listing).toMatchObject({ status: "archived", archivedByDeletion: true });
  });

  it("restores the account and republishes exactly the listings the deletion archived", async () => {
    const { active, selfArchived } = await seedListings();
    await deleteAccount((await signIn()).accessToken);
    const pending = await signIn();

    const res = await request
      .post("/api/v1/me/restore")
      .set("Authorization", `Bearer ${pending.accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({ id: USER_ID, deletionScheduledAt: null });
    const user = await prisma.user.findUnique({ where: { id: USER_ID } });
    expect(user!.deletionScheduledAt).toBeNull();
    const republished = await prisma.listing.findUnique({ where: { id: active.id } });
    expect(republished).toMatchObject({ status: "active", archivedByDeletion: false });
    const untouched = await prisma.listing.findUnique({ where: { id: selfArchived.id } });
    expect(untouched!.status).toBe("archived");
  });

  it("succeeds without changing anything when no deletion is scheduled", async () => {
    const { active } = await seedListings();
    const session = await signIn();

    const res = await request
      .post("/api/v1/me/restore")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({ id: USER_ID, deletionScheduledAt: null });
    const listing = await prisma.listing.findUnique({ where: { id: active.id } });
    expect(listing!.status).toBe("active");
  });

  it("requires a signed-in User to restore", async () => {
    await request.post("/api/v1/me/restore").expect(401);
  });

  it("refuses marketplace changes from a session whose deletion is scheduled, but allows /me", async () => {
    await deleteAccount((await signIn()).accessToken);
    const pending = await signIn();
    const auth = { Authorization: `Bearer ${pending.accessToken}` };

    const me = await request.get("/api/v1/me").set(auth).expect(200);
    expect(me.body.deletionScheduledAt).not.toBeNull();

    const blocked = await request
      .post("/api/v1/me/blocked-users")
      .set(auth)
      .send({ userId: randomUUID() })
      .expect(403);
    expect(blocked.body.code).toBe("FORBIDDEN");
    expect(blocked.body.details.reason).toBe("ACCOUNT_DELETION_PENDING");

    await request.delete("/api/v1/me").set(auth).expect(403);

    const user = await prisma.user.findUnique({ where: { id: USER_ID } });
    expect(user!.deletionScheduledAt).not.toBeNull();
  });

  it("lets the pending session sign out, which revokes it and leaves the deletion scheduled", async () => {
    const { active } = await seedListings();
    await deleteAccount((await signIn()).accessToken);
    const pending = await signIn();
    expect(await prisma.session.count({ where: { userId: USER_ID } })).toBe(1);

    await request
      .post("/api/v1/auth/logout")
      .send({ refreshToken: pending.refreshToken })
      .expect(204);

    expect(await prisma.session.count({ where: { userId: USER_ID } })).toBe(0);
    const user = await prisma.user.findUnique({ where: { id: USER_ID } });
    expect(user!.deletionScheduledAt).not.toBeNull();
    const listing = await prisma.listing.findUnique({ where: { id: active.id } });
    expect(listing!.status).toBe("archived");

    const again = await signIn();
    expect(again.user.deletionScheduledAt).not.toBeNull();
  });
});
