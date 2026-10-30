import "reflect-metadata";
import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";
import sharp from "sharp";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "@auto-tm/db";

import { CatalogModule } from "../catalog.module";
import { IdentityModule } from "../../identity/identity.module";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { EnvSchema } from "../../../env.schema";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { mintAdminJwt } from "../../../../test/helpers/mintAdminJwt";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

describe("AdminCatalogController e2e", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;
  let now = new Date();

  const userIds = new Set<string>();
  const sessionIds = new Set<string>();
  const brandIds = new Set<string>();
  const modelIds = new Set<string>();
  const objectKeys = new Set<string>();
  const s3 = new S3Client({
    endpoint: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000",
    region: process.env["MINIO_REGION"] ?? "us-east-1",
    credentials: {
      accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
      secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
    },
    forcePathStyle: true,
  });

  async function cleanupOwnedFixture() {
    // Actor IDs belong only to users created by this suite. Retained campaign
    // audits and unrelated catalog/Listing graphs must never enter this cleanup.
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [...userIds] } } });
    await prisma.totpBackupCode.deleteMany({
      where: { totpEnrollment: { userId: { in: [...userIds] } } },
    });
    await prisma.totpEnrollment.deleteMany({ where: { userId: { in: [...userIds] } } });
    await prisma.session.deleteMany({ where: { id: { in: [...sessionIds] } } });
    await prisma.model.deleteMany({ where: { id: { in: [...modelIds] } } });
    await prisma.brand.deleteMany({ where: { id: { in: [...brandIds] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
    for (const key of objectKeys) {
      await s3.send(new DeleteObjectCommand({ Bucket: "catalog-assets", Key: key }));
    }
    userIds.clear();
    sessionIds.clear();
    brandIds.clear();
    modelIds.clear();
    objectKeys.clear();
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (cfg) => EnvSchema.parse(cfg),
        }),
        CatalogModule,
        IdentityModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    })
      .overrideProvider(IDENTITY_CLOCK_PORT)
      .useValue({ now: () => now })
      .compile();

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
    try {
      await cleanupOwnedFixture();
    } finally {
      await app.close();
      s3.destroy();
    }
  });

  beforeEach(async () => {
    now = new Date();
    await cleanupOwnedFixture();
  });

  async function createAdminUser(): Promise<{ userId: string; sessionId: string; token: string }> {
    const user = await prisma.user.create({
      data: {
        id: `admin-${randomUUID()}`,
        phone: "+99361111111",
        phoneVerifiedAt: new Date(),
        role: "admin",
      },
    });
    userIds.add(user.id);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        adminTotpExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
    sessionIds.add(session.id);
    return { userId: user.id, sessionId: session.id, token: mintAdminJwt(user.id, session.id) };
  }

  async function createNonAdminUser(): Promise<{ userId: string; token: string }> {
    const user = await prisma.user.create({
      data: {
        id: `user-${randomUUID()}`,
        phone: "+99362222222",
        phoneVerifiedAt: new Date(),
        role: "buyer",
      },
    });
    userIds.add(user.id);
    const { sign } = await import("jsonwebtoken");
    const nonAdminToken = sign(
      { sub: user.id, role: "buyer" },
      process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
      { expiresIn: "1h" },
    );
    return { userId: user.id, token: nonAdminToken };
  }

  async function createBrand() {
    const brand = await prisma.brand.create({
      data: {
        id: randomUUID(),
        slug: `slug-${randomUUID()}`,
        nameRu: "Тест",
        nameTk: "Test",
        nameEn: "Test",
      },
    });

    brandIds.add(brand.id);
    return brand;
  }

  async function createModel(brandId: string) {
    const model = await prisma.model.create({
      data: {
        id: randomUUID(),
        brandId,
        slug: `model-slug-${randomUUID()}`,
        nameRu: "Модель",
        nameTk: "Model",
        nameEn: "Model",
      },
    });
    modelIds.add(model.id);
    return model;
  }

  async function getAuditLogs(action: string) {
    const audits = await prisma.auditLog.findMany({
      where: { action, actorId: { in: [...userIds] } },
    });
    for (const audit of audits) {
      expect(audit.action).toBe(action);
      expect(userIds.has(audit.actorId!)).toBe(true);
      expect(audit.targetType).toBe(action.startsWith("CATALOG_MODEL_") ? "Model" : "Brand");
      expect((audit.targetType === "Model" ? modelIds : brandIds).has(audit.targetId)).toBe(true);
    }
    return audits;
  }

  async function getAuditLog(action: string) {
    const audits = await getAuditLogs(action);
    expect(audits).toHaveLength(1);
    return audits[0]!;
  }

  function unwrapAuditLog<T>(auditLog: T | null): T {
    expect(auditLog).not.toBeNull();
    return auditLog as T;
  }

  describe("admin session elevation through Identity composition", () => {
    function createRequest(token?: string) {
      const pending = request.post("/api/v1/admin/catalog/brands");
      if (token) pending.set("Authorization", `Bearer ${token}`);
      return pending
        .send({ slug: `elevation-${randomUUID()}`, nameRu: "Тест", nameTk: "Test", nameEn: "Test" })
        .expect((response) => {
          if (response.status === 201) brandIds.add(response.body.id as string);
        });
    }

    function expectError(body: unknown, statusCode: number, code: string, message: string) {
      expect(body).toEqual({
        statusCode,
        code,
        message,
        timestamp: expect.any(String),
        requestId: "unknown",
      });
    }

    it("preserves the missing-bearer and missing-sub 401 envelopes", async () => {
      const missingBearer = await createRequest().expect(401);
      expectError(missingBearer.body, 401, "UNAUTHORIZED", "Missing or malformed Authorization header");

      const token = app.get(JwtService).sign({ role: "admin" });
      const missingSubject = await createRequest(token).expect(401);
      expectError(missingSubject.body, 401, "HTTP_ERROR", "Authentication required");
    });

    it("reloads the current role before session admission despite an unchanged admin JWT", async () => {
      const { userId, sessionId, token } = await createAdminUser();
      await createRequest(token).expect(201);
      await prisma.user.update({ where: { id: userId }, data: { role: "buyer" } });
      await prisma.session.delete({ where: { id: sessionId } });

      const denied = await createRequest(token).expect(403);
      expectError(denied.body, 403, "FORBIDDEN", "Admin role required");
      const withoutSessionClaim = await createRequest(mintAdminJwt(userId)).expect(403);
      expectError(withoutSessionClaim.body, 403, "FORBIDDEN", "Admin role required");
    });

    it("admits a current admin even when the JWT role says buyer", async () => {
      const { userId, sessionId } = await createAdminUser();
      const token = app.get(JwtService).sign({ sub: userId, sid: sessionId, role: "buyer" });
      await createRequest(token).expect(201);
    });

    it("does not distinguish missing, absent or foreign sessions", async () => {
      const { userId, sessionId } = await createAdminUser();
      for (const token of [mintAdminJwt(userId), mintAdminJwt(userId, randomUUID())]) {
        const denied = await createRequest(token).expect(403);
        expectError(denied.body, 403, "FORBIDDEN", "Admin TOTP elevation required");
      }

      const other = await prisma.user.create({ data: { id: randomUUID(), role: "admin" } });
      userIds.add(other.id);
      await prisma.session.update({
        where: { id: sessionId },
        data: { userId: other.id, expiresAt: now, adminTotpExpiresAt: null },
      });
      const foreign = await createRequest(mintAdminJwt(userId, sessionId)).expect(403);
      expectError(foreign.body, 403, "FORBIDDEN", "Admin TOTP elevation required");
    });

    it.each([
      ["session expiry equality", "2026-05-14T12:00:00Z", "2026-05-14T12:01:00Z", "Admin session expired"],
      ["both deadlines expired", "2026-05-14T11:59:00Z", "2026-05-14T11:59:00Z", "Admin session expired"],
      ["expired session without elevation", "2026-05-14T11:59:00Z", null, "Admin session expired"],
      ["elevation expiry equality", "2026-05-14T12:01:00Z", "2026-05-14T12:00:00Z", "Admin TOTP elevation expired"],
      ["elevation already expired", "2026-05-14T12:01:00Z", "2026-05-14T11:59:00Z", "Admin TOTP elevation expired"],
      ["no elevation", "2026-05-14T12:01:00Z", null, "Admin TOTP elevation expired"],
    ] as const)("preserves refusal precedence for %s", async (_case, sessionExpiry, elevationExpiry, message) => {
      const { sessionId, token } = await createAdminUser();
      now = new Date("2026-05-14T12:00:00Z");
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          expiresAt: new Date(sessionExpiry),
          adminTotpExpiresAt: elevationExpiry ? new Date(elevationExpiry) : null,
        },
      });
      const denied = await createRequest(token).expect(403);
      expectError(denied.body, 403, "FORBIDDEN", message);
    });

    it("rechecks stored elevation and deletion on every request with the same bearer sid", async () => {
      const { sessionId, token } = await createAdminUser();
      now = new Date("2026-05-14T12:00:00Z");
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          expiresAt: new Date("2026-05-15T12:00:00Z"),
          adminTotpExpiresAt: new Date("2026-05-14T12:01:00Z"),
        },
      });
      await createRequest(token).expect(201);
      now = new Date("2026-05-14T12:01:00Z");
      const expired = await createRequest(token).expect(403);
      expectError(expired.body, 403, "FORBIDDEN", "Admin TOTP elevation expired");

      await prisma.session.update({
        where: { id: sessionId },
        data: { adminTotpExpiresAt: new Date("2026-05-14T12:02:00Z") },
      });
      await createRequest(token).expect(201);
      await prisma.session.update({ where: { id: sessionId }, data: { adminTotpExpiresAt: null } });
      const revoked = await createRequest(token).expect(403);
      expectError(revoked.body, 403, "FORBIDDEN", "Admin TOTP elevation expired");

      await prisma.session.delete({ where: { id: sessionId } });
      const deleted = await createRequest(token).expect(403);
      expectError(deleted.body, 403, "FORBIDDEN", "Admin TOTP elevation required");
    });
  });

  describe("POST /api/v1/admin/catalog/brands", () => {
    it("returns 401 without bearer token", async () => {
      await request
        .post("/api/v1/admin/catalog/brands")
        .send({ slug: "toyota", nameRu: "Тойота", nameTk: "Toýota", nameEn: "Toyota" })
        .expect(401);
    });

    it("returns 403 with non-admin token", async () => {
      const { token } = await createNonAdminUser();
      await request
        .post("/api/v1/admin/catalog/brands")
        .set("Authorization", `Bearer ${token}`)
        .send({ slug: "toyota", nameRu: "Тойота", nameTk: "Toýota", nameEn: "Toyota" })
        .expect(403);
    });

    it("returns 201 with admin token and writes audit log", async () => {
      const { token } = await createAdminUser();
      const res = await request
        .post("/api/v1/admin/catalog/brands")
        .set("Authorization", `Bearer ${token}`)
        .send({ slug: "toyota", nameRu: "Тойота", nameTk: "Toýota", nameEn: "Toyota" })
        .expect(201);

      brandIds.add(res.body.id as string);
      expect(res.body.slug).toBe("toyota");
      expect(res.body.nameRu).toBe("Тойота");

      const audit = await getAuditLog("CATALOG_BRAND_CREATE");
      expect(audit).not.toBeNull();
      expect(unwrapAuditLog(audit).targetType).toBe("Brand");
      expect(unwrapAuditLog(audit).targetId).toBe(res.body.id);
    });
  });

  describe("PATCH /api/v1/admin/catalog/brands/:id", () => {
    it("returns 401 without bearer token", async () => {
      const brand = await createBrand();
      await request
        .patch(`/api/v1/admin/catalog/brands/${brand.id}`)
        .send({ nameRu: "New" })
        .expect(401);
    });

    it("returns 403 with non-admin token", async () => {
      const brand = await createBrand();
      const { token } = await createNonAdminUser();
      await request
        .patch(`/api/v1/admin/catalog/brands/${brand.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ nameRu: "New" })
        .expect(403);
    });

    it("returns 200 with admin token and writes audit log", async () => {
      const brand = await createBrand();
      const { token } = await createAdminUser();
      const res = await request
        .patch(`/api/v1/admin/catalog/brands/${brand.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ nameRu: "Обновлено" })
        .expect(200);

      expect(res.body.nameRu).toBe("Обновлено");

      const audit = await getAuditLog("CATALOG_BRAND_UPDATE");
      expect(audit).not.toBeNull();
      expect(unwrapAuditLog(audit).targetId).toBe(brand.id);
    });
  });

  describe("DELETE /api/v1/admin/catalog/brands/:id", () => {
    it("returns 401 without bearer token", async () => {
      const brand = await createBrand();
      await request
        .delete(`/api/v1/admin/catalog/brands/${brand.id}`)
        .expect(401);
    });

    it("returns 403 with non-admin token", async () => {
      const brand = await createBrand();
      const { token } = await createNonAdminUser();
      await request
        .delete(`/api/v1/admin/catalog/brands/${brand.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("returns 200 with admin token and writes audit log", async () => {
      const brand = await createBrand();
      const { token } = await createAdminUser();
      await request
        .delete(`/api/v1/admin/catalog/brands/${brand.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const deleted = await prisma.brand.findUnique({ where: { id: brand.id } });
      expect(deleted).toBeNull();

      const audit = await getAuditLog("CATALOG_BRAND_DELETE");
      expect(audit).not.toBeNull();
      expect(unwrapAuditLog(audit).targetId).toBe(brand.id);
    });
  });

  describe("POST /api/v1/admin/catalog/brands/:brandId/models", () => {
    it("returns 401 without bearer token", async () => {
      const brand = await createBrand();
      await request
        .post(`/api/v1/admin/catalog/brands/${brand.id}/models`)
        .send({ slug: "camry", nameRu: "Камри", nameTk: "Kamri", nameEn: "Camry" })
        .expect(401);
    });

    it("returns 403 with non-admin token", async () => {
      const brand = await createBrand();
      const { token } = await createNonAdminUser();
      await request
        .post(`/api/v1/admin/catalog/brands/${brand.id}/models`)
        .set("Authorization", `Bearer ${token}`)
        .send({ slug: "camry", nameRu: "Камри", nameTk: "Kamri", nameEn: "Camry" })
        .expect(403);
    });

    it("returns 201 with admin token and writes audit log", async () => {
      const brand = await createBrand();
      const { token } = await createAdminUser();
      const res = await request
        .post(`/api/v1/admin/catalog/brands/${brand.id}/models`)
        .set("Authorization", `Bearer ${token}`)
        .send({ slug: "camry", nameRu: "Камри", nameTk: "Kamri", nameEn: "Camry" })
        .expect(201);

      modelIds.add(res.body.id as string);
      expect(res.body.slug).toBe("camry");
      expect(res.body.brandId).toBe(brand.id);

      const audit = await getAuditLog("CATALOG_MODEL_CREATE");
      expect(audit).not.toBeNull();
      expect(unwrapAuditLog(audit).targetId).toBe(res.body.id);
    });
  });

  describe("PATCH /api/v1/admin/catalog/models/:id", () => {
    it("returns 401 without bearer token", async () => {
      const brand = await createBrand();
      const model = await createModel(brand.id);
      await request
        .patch(`/api/v1/admin/catalog/models/${model.id}`)
        .send({ nameRu: "New" })
        .expect(401);
    });

    it("returns 403 with non-admin token", async () => {
      const brand = await createBrand();
      const model = await createModel(brand.id);
      const { token } = await createNonAdminUser();
      await request
        .patch(`/api/v1/admin/catalog/models/${model.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ nameRu: "New" })
        .expect(403);
    });

    it("returns 200 with admin token and writes audit log", async () => {
      const brand = await createBrand();
      const model = await createModel(brand.id);
      const { token } = await createAdminUser();
      const res = await request
        .patch(`/api/v1/admin/catalog/models/${model.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ nameRu: "Обновлено" })
        .expect(200);

      expect(res.body.nameRu).toBe("Обновлено");

      const audit = await getAuditLog("CATALOG_MODEL_UPDATE");
      expect(audit).not.toBeNull();
      expect(unwrapAuditLog(audit).targetId).toBe(model.id);
    });
  });

  describe("DELETE /api/v1/admin/catalog/models/:id", () => {
    it("returns 401 without bearer token", async () => {
      const brand = await createBrand();
      const model = await createModel(brand.id);
      await request
        .delete(`/api/v1/admin/catalog/models/${model.id}`)
        .expect(401);
    });

    it("returns 403 with non-admin token", async () => {
      const brand = await createBrand();
      const model = await createModel(brand.id);
      const { token } = await createNonAdminUser();
      await request
        .delete(`/api/v1/admin/catalog/models/${model.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("returns 200 with admin token and writes audit log", async () => {
      const brand = await createBrand();
      const model = await createModel(brand.id);
      const { token } = await createAdminUser();
      await request
        .delete(`/api/v1/admin/catalog/models/${model.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const deleted = await prisma.model.findUnique({ where: { id: model.id } });
      expect(deleted).toBeNull();

      const audit = await getAuditLog("CATALOG_MODEL_DELETE");
      expect(audit).not.toBeNull();
      expect(unwrapAuditLog(audit).targetId).toBe(model.id);
    });
  });

  describe("brand logo endpoints", () => {
    async function head(key: string) {
      try {
        return await s3.send(new HeadObjectCommand({ Bucket: "catalog-assets", Key: key }));
      } catch {
        return null;
      }
    }

    async function png(width: number, height: number): Promise<Buffer> {
      return sharp({
        create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
      })
        .png()
        .toBuffer();
    }

    const svg = (body: string) =>
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${body}</svg>`,
      );

    async function presign(brandId: string, token: string, contentType: string, sizeBytes: number) {
      const response = await request
        .post(`/api/v1/admin/catalog/brands/${brandId}/logo/presign`)
        .set("Authorization", `Bearer ${token}`)
        .send({ contentType, sizeBytes });
      if (response.status === 201) objectKeys.add(response.body.key as string);
      return response;
    }

    /** Presign, PUT the bytes to MinIO the way the admin app does, and return the key. */
    async function uploadPending(
      brandId: string,
      token: string,
      contentType: string,
      bytes: Buffer,
    ): Promise<string> {
      const res = await presign(brandId, token, contentType, bytes.byteLength);
      expect(res.status).toBe(201);
      const put = await fetch(res.body.uploadUrl, {
        method: "PUT",
        headers: res.body.headers,
        body: new Uint8Array(bytes),
      });
      expect(put.status).toBe(200);
      return res.body.key as string;
    }

    async function confirm(brandId: string, token: string, key: string) {
      const response = await request
        .put(`/api/v1/admin/catalog/brands/${brandId}/logo`)
        .set("Authorization", `Bearer ${token}`)
        .send({ key });
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (brand?.logoKey) objectKeys.add(brand.logoKey);
      return response;
    }

    it("returns 401 without bearer token and 403 for a non-admin", async () => {
      const brand = await createBrand();
      await request
        .post(`/api/v1/admin/catalog/brands/${brand.id}/logo/presign`)
        .send({ contentType: "image/png", sizeBytes: 10 })
        .expect(401);

      const { token } = await createNonAdminUser();
      expect((await presign(brand.id, token, "image/png", 10)).status).toBe(403);
      expect((await confirm(brand.id, token, "pending/x")).status).toBe(403);
      await request
        .delete(`/api/v1/admin/catalog/brands/${brand.id}/logo`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("uploads, replaces, and removes a logo without leaving orphan objects", async () => {
      const brand = await createBrand();
      const { token } = await createAdminUser();

      const firstPending = await uploadPending(brand.id, token, "image/png", await png(90, 90));
      expect(firstPending).toMatch(new RegExp(`^pending/brands/${brand.slug}/`));
      expect((await head(firstPending))?.ContentDisposition).toBe("attachment");

      const first = await confirm(brand.id, token, firstPending);
      expect(first.status).toBe(200);
      const firstKey = (await prisma.brand.findUniqueOrThrow({ where: { id: brand.id } })).logoKey;
      expect(firstKey).toMatch(
        new RegExp(`^brands/${brand.slug}/v\\d+-[0-9a-f-]{36}/logo\\.png$`),
      );
      expect(first.body.logoUrl).toMatch(new RegExp(`/catalog-assets/${firstKey}$`));
      expect((await head(firstKey as string))?.ContentType).toBe("image/png");
      expect(await head(firstPending)).toBeNull();

      const secondPending = await uploadPending(
        brand.id,
        token,
        "image/svg+xml",
        svg('<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><path fill="url(#g)" d="M0 0h24v24H0z"/>'),
      );
      const second = await confirm(brand.id, token, secondPending);
      expect(second.status).toBe(200);
      const secondKey = (await prisma.brand.findUniqueOrThrow({ where: { id: brand.id } }))
        .logoKey as string;
      // An SVG upload is served as a rendered PNG, never as SVG.
      expect(secondKey).toMatch(/\/logo\.png$/);
      expect((await head(secondKey))?.ContentType).toBe("image/png");
      const rendered = await s3.send(new GetObjectCommand({ Bucket: "catalog-assets", Key: secondKey }));
      const meta = await sharp(await rendered.Body!.transformToByteArray()).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["png", 256, 256]);
      expect(await head(firstKey as string)).toBeNull();
      expect(await head(secondPending)).toBeNull();
      const logoAudits = await getAuditLogs("CATALOG_BRAND_LOGO_SET");
      expect(logoAudits).toHaveLength(2);
      expect(logoAudits.map((audit) => audit.targetId)).toEqual([brand.id, brand.id]);
      expect(logoAudits.map((audit) => audit.details)).toEqual(expect.arrayContaining([
        { slug: brand.slug, logoKey: firstKey, previousLogoKey: null },
        { slug: brand.slug, logoKey: secondKey, previousLogoKey: firstKey },
      ]));

      await request
        .delete(`/api/v1/admin/catalog/brands/${brand.id}/logo`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const cleared = await prisma.brand.findUniqueOrThrow({ where: { id: brand.id } });
      expect(cleared.logoKey).toBeNull();
      expect(await head(secondKey)).toBeNull();
      expect(unwrapAuditLog(await getAuditLog("CATALOG_BRAND_LOGO_REMOVE")).targetId).toBe(
        brand.id,
      );
    });

    it("rejects unsupported and oversized files at presign", async () => {
      const brand = await createBrand();
      const { token } = await createAdminUser();

      for (const [contentType, size, reason] of [
        ["image/jpeg", 100, "LOGO_UNSUPPORTED_TYPE"],
        ["image/png", 200 * 1024 + 1, "LOGO_TOO_LARGE"],
      ] as const) {
        const res = await presign(brand.id, token, contentType, size);
        expect(res.status, reason).toBe(400);
        expect(res.body).toMatchObject({ code: "VALIDATION_FAILED", details: { reason } });
      }
    });

    it("rejects bad uploads at confirm and deletes the pending object", async () => {
      const brand = await createBrand();
      const { token } = await createAdminUser();

      const cases: Array<[string, Buffer, string]> = [
        ["image/webp", await png(90, 90), "LOGO_TYPE_MISMATCH"],
        ["image/png", await png(200, 90), "LOGO_NOT_SQUARE"],
        ["image/png", Buffer.from("not an image"), "LOGO_UNREADABLE"],
        [
          "image/svg+xml",
          svg('<s:script xmlns:s="http://www.w3.org/2000/svg">alert(1)</s:script>'),
          "LOGO_UNSAFE_SVG",
        ],
      ];
      for (const [contentType, bytes, reason] of cases) {
        const pending = await uploadPending(brand.id, token, contentType, bytes);
        const res = await confirm(brand.id, token, pending);
        expect(res.status, reason).toBe(400);
        expect(res.body).toMatchObject({ code: "VALIDATION_FAILED", details: { reason } });
        expect(await head(pending)).toBeNull();
      }

      // A different length is rejected before storage accepts the upload.
      const res = await presign(brand.id, token, "image/png", 100);
      const rejected = await fetch(res.body.uploadUrl, {
        method: "PUT",
        headers: res.body.headers,
        body: new Uint8Array(200 * 1024 + 1),
      });
      expect(rejected.status).toBe(403);
      expect(await head(res.body.key)).toBeNull();
      // Privileged writes can bypass a presign; confirm still enforces its cap.
      await s3.send(new PutObjectCommand({ Bucket: "catalog-assets", Key: res.body.key,
        ContentType: "image/png", Body: new Uint8Array(200 * 1024 + 1) }));
      const tooLarge = await confirm(brand.id, token, res.body.key);
      expect(tooLarge.body.details).toEqual({ reason: "LOGO_TOO_LARGE" });
      expect(await head(res.body.key)).toBeNull();

      const missing = await confirm(
        brand.id,
        token,
        `pending/brands/${brand.slug}/00000000-0000-4000-8000-000000000000`,
      );
      expect(missing.body.details).toEqual({ reason: "LOGO_UPLOAD_MISSING" });

      const unchanged = await prisma.brand.findUniqueOrThrow({ where: { id: brand.id } });
      expect(unchanged.logoKey).toBeNull();
    });

    it("deletes the logo object when the brand is deleted", async () => {
      const brand = await createBrand();
      const { token } = await createAdminUser();
      await confirm(brand.id, token, await uploadPending(brand.id, token, "image/png", await png(60, 60)));
      const key = (await prisma.brand.findUniqueOrThrow({ where: { id: brand.id } })).logoKey as string;

      await request
        .delete(`/api/v1/admin/catalog/brands/${brand.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(await head(key)).toBeNull();
    });

    describe("an imported logo", () => {
      const files = ["logo.png", "mono@1x.png", "mono@2x.png", "mono@3x.png"];

      async function importedLogo(slug: string, version: string): Promise<string> {
        const body = await png(30, 30);
        for (const file of files) {
          objectKeys.add(`brands/${slug}/${version}/${file}`);
          await s3.send(
            new PutObjectCommand({
              Bucket: "catalog-assets",
              Key: `brands/${slug}/${version}/${file}`,
              Body: body,
              ContentType: "image/png",
            }),
          );
        }
        return `brands/${slug}/${version}/logo.png`;
      }

      async function expectDirectory(slug: string, version: string, present: boolean) {
        for (const file of files) {
          const found = (await head(`brands/${slug}/${version}/${file}`)) !== null;
          expect(found, `${version}/${file}`).toBe(present);
        }
      }

      it("is removed with all four files when an admin removes it, leaving other versions", async () => {
        const brand = await createBrand();
        const { token } = await createAdminUser();
        const active = `imp-0123456789ab-${randomUUID()}`;
        const other = `imp-ffffffffffff-${randomUUID()}`;
        const key = await importedLogo(brand.slug, active);
        await importedLogo(brand.slug, other);
        await prisma.brand.update({ where: { id: brand.id }, data: { logoKey: key } });

        await request
          .delete(`/api/v1/admin/catalog/brands/${brand.id}/logo`)
          .set("Authorization", `Bearer ${token}`)
          .expect(200);

        await expectDirectory(brand.slug, active, false);
        await expectDirectory(brand.slug, other, true);
      });

      it("is replaced with all four files deleted when an admin uploads a new logo", async () => {
        const brand = await createBrand();
        const { token } = await createAdminUser();
        const active = `imp-0123456789ab-${randomUUID()}`;
        const key = await importedLogo(brand.slug, active);
        await prisma.brand.update({ where: { id: brand.id }, data: { logoKey: key } });

        const confirmed = await confirm(
          brand.id,
          token,
          await uploadPending(brand.id, token, "image/png", await png(90, 90)),
        );

        expect(confirmed.status).toBe(200);
        await expectDirectory(brand.slug, active, false);
      });

      it("is deleted with all four files when the brand is deleted", async () => {
        const brand = await createBrand();
        const { token } = await createAdminUser();
        const active = `imp-0123456789ab-${randomUUID()}`;
        const key = await importedLogo(brand.slug, active);
        await prisma.brand.update({ where: { id: brand.id }, data: { logoKey: key } });

        await request
          .delete(`/api/v1/admin/catalog/brands/${brand.id}`)
          .set("Authorization", `Bearer ${token}`)
          .expect(200);

        await expectDirectory(brand.slug, active, false);
      });

      it("is cleaned from the stored slug when the brand was renamed", async () => {
        const brand = await createBrand();
        const { token } = await createAdminUser();
        const active = `imp-0123456789ab-${randomUUID()}`;
        const key = await importedLogo(brand.slug, active);
        await prisma.brand.update({ where: { id: brand.id }, data: { logoKey: key } });
        await request
          .patch(`/api/v1/admin/catalog/brands/${brand.id}`)
          .set("Authorization", `Bearer ${token}`)
          .send({ slug: `${brand.slug}-renamed` })
          .expect(200);

        await request
          .delete(`/api/v1/admin/catalog/brands/${brand.id}/logo`)
          .set("Authorization", `Bearer ${token}`)
          .expect(200);

        await expectDirectory(brand.slug, active, false);
      });
    });

    it("returns 404 for an unknown brand", async () => {
      const { token } = await createAdminUser();
      expect((await presign(randomUUID(), token, "image/png", 10)).status).toBe(404);
    });
  });
});
