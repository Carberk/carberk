import "reflect-metadata";

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
import { PrismaService } from "@auto-tm/db";

import { ListingsModule } from "../listings.module";
import { IdentityModule } from "../../identity/identity.module";
import { EnvSchema } from "../../../env.schema";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import {
  cleanSuiteFixtures,
  defineE2eSuite,
} from "../../../../test/helpers/e2eSuite";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

const suite = defineE2eSuite("drafts-controller");
type SuiteUser = "user-1" | "user-2";
const SUITE_USERS: readonly SuiteUser[] = ["user-1", "user-2"];

describe("DraftsController e2e", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (cfg) => EnvSchema.parse(cfg),
        }),
        ListingsModule,
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
    await app.close();
  });

  beforeEach(async () => {
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
  });

  async function createUser(alias: SuiteUser): Promise<string> {
    await prisma.user.create({
      data: { id: suite.id(alias), phone: suite.phone(alias), phoneVerifiedAt: new Date(), role: "buyer" },
    });
    return mintUserJwt(suite.id(alias));
  }

  describe("POST /api/v1/listings/drafts", () => {
    it("returns 401 without bearer token", async () => {
      await request.post("/api/v1/listings/drafts").send({}).expect(401);
    });

    it("creates a draft with empty payload", async () => {
      const token = await createUser("user-1");
      const res = await request
        .post("/api/v1/listings/drafts")
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      expect(res.body.userId).toBe(suite.id("user-1"));
      expect(res.body.payload).toEqual({});
      expect(res.body.id).toBeDefined();
    });

    it("creates a draft with initial payload", async () => {
      const token = await createUser("user-1");
      const res = await request
        .post("/api/v1/listings/drafts")
        .set("Authorization", `Bearer ${token}`)
        .send({ initialPayload: { vin: "WBA123" } })
        .expect(201);

      expect(res.body.payload).toEqual({ vin: "WBA123" });
    });
  });

  describe("PATCH /api/v1/listings/drafts/:id", () => {
    it("autosaves draft payload", async () => {
      const token = await createUser("user-1");
      const created = await request
        .post("/api/v1/listings/drafts")
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      const res = await request
        .patch(`/api/v1/listings/drafts/${created.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ vin: "WBA456", brandId: suite.catalog.brandId })
        .expect(200);

      expect(res.body.payload).toMatchObject({ vin: "WBA456", brandId: suite.catalog.brandId });
      expect(res.body.payload.validatedSteps).toBeDefined();
    });

    it("returns 404 for another user's draft", async () => {
      const token1 = await createUser("user-1");
      const token2 = await createUser("user-2");

      const created = await request
        .post("/api/v1/listings/drafts")
        .set("Authorization", `Bearer ${token1}`)
        .send({})
        .expect(201);

      await request
        .patch(`/api/v1/listings/drafts/${created.body.id}`)
        .set("Authorization", `Bearer ${token2}`)
        .send({ vin: "WBA456" })
        .expect(404);
    });
  });

  describe("GET /api/v1/me/drafts", () => {
    it("returns 401 without bearer token", async () => {
      await request.get("/api/v1/me/drafts").expect(401);
    });

    it("lists caller's drafts", async () => {
      const token = await createUser("user-1");
      await request
        .post("/api/v1/listings/drafts")
        .set("Authorization", `Bearer ${token}`)
        .send({ initialPayload: { currentStep: 1 } })
        .expect(201);

      const res = await request
        .get("/api/v1/me/drafts")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].payload).toEqual({ currentStep: 1 });
      expect(res.body.nextCursor).toBeNull();
    });

    it("paginates with cursor", async () => {
      const token = await createUser("user-1");
      for (let i = 0; i < 3; i++) {
        await request
          .post("/api/v1/listings/drafts")
          .set("Authorization", `Bearer ${token}`)
          .send({ initialPayload: { step: i } })
          .expect(201);
      }

      const firstPage = await request
        .get("/api/v1/me/drafts?limit=2")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(firstPage.body.items).toHaveLength(2);
      expect(firstPage.body.nextCursor).toBeTruthy();

      const secondPage = await request
        .get(`/api/v1/me/drafts?limit=2&cursor=${firstPage.body.nextCursor}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.nextCursor).toBeNull();
    });
  });

  describe("POST /api/v1/listings/drafts/:id/validate-step", () => {
    it("returns valid for complete step", async () => {
      const token = await createUser("user-1");
      const created = await request
        .post("/api/v1/listings/drafts")
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      const res = await request
        .post(`/api/v1/listings/drafts/${created.body.id}/validate-step`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          step: "vehicle",
          payload: {
            brandId: suite.catalog.brandId,
            modelId: suite.catalog.modelId,
            year: 2020,
          },
        })
        .expect(200);

      expect(res.body.valid).toBe(true);
      expect(res.body.errors).toEqual([]);
    });

    it("returns errors for incomplete step", async () => {
      const token = await createUser("user-1");
      const created = await request
        .post("/api/v1/listings/drafts")
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      const res = await request
        .post(`/api/v1/listings/drafts/${created.body.id}/validate-step`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          step: "vehicle",
          payload: { brandId: suite.catalog.brandId },
        })
        .expect(200);

      expect(res.body.valid).toBe(false);
      expect(res.body.errors.length).toBeGreaterThan(0);
    });

    it("returns invalidated steps when field changes", async () => {
      const token = await createUser("user-1");
      const created = await request
        .post("/api/v1/listings/drafts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          initialPayload: {
            brandId: suite.catalog.brandId,
            modelId: suite.catalog.modelId,
            year: 2020,
          },
        })
        .expect(201);

      const res = await request
        .post(`/api/v1/listings/drafts/${created.body.id}/validate-step`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          step: "vehicle",
          payload: {
            brandId: suite.catalog.cityId,
            modelId: suite.catalog.modelId,
            year: 2020,
          },
        })
        .expect(200);

      expect(res.body.invalidatedSteps).toContain("vehicle");
      expect(res.body.invalidatedSteps).toContain("specs");
    });

    it("returns 404 for another user's draft", async () => {
      const token1 = await createUser("user-1");
      const token2 = await createUser("user-2");

      const created = await request
        .post("/api/v1/listings/drafts")
        .set("Authorization", `Bearer ${token1}`)
        .send({})
        .expect(201);

      await request
        .post(`/api/v1/listings/drafts/${created.body.id}/validate-step`)
        .set("Authorization", `Bearer ${token2}`)
        .send({ step: "vehicle", payload: {} })
        .expect(404);
    });

    it("rejects the eight-step wizard's removed vin step", async () => {
      const token = await createUser("user-1");
      const created = await request
        .post("/api/v1/listings/drafts")
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      await request
        .post(`/api/v1/listings/drafts/${created.body.id}/validate-step`)
        .set("Authorization", `Bearer ${token}`)
        .send({ step: "vin", payload: {} })
        .expect(400);
    });
  });

  describe("DELETE /api/v1/listings/drafts/:id", () => {
    it("discards the draft", async () => {
      const token = await createUser("user-1");
      const created = await request
        .post("/api/v1/listings/drafts")
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(201);

      await request
        .delete(`/api/v1/listings/drafts/${created.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const list = await request
        .get("/api/v1/me/drafts")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(list.body.items).toHaveLength(0);
    });

    it("returns 404 for another user's draft", async () => {
      const token1 = await createUser("user-1");
      const token2 = await createUser("user-2");

      const created = await request
        .post("/api/v1/listings/drafts")
        .set("Authorization", `Bearer ${token1}`)
        .send({})
        .expect(201);

      await request
        .delete(`/api/v1/listings/drafts/${created.body.id}`)
        .set("Authorization", `Bearer ${token2}`)
        .expect(404);
    });
  });
});
