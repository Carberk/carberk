import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PrismaService } from "@auto-tm/db";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import supertest from "supertest";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { EnvSchema } from "../../../env.schema";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { ListingsModule } from "../listings.module";
import { CatalogModule } from "../../catalog/catalog.module";
import { VehicleHistoryModule } from "../../vehicle-history/vehicle-history.module";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";

const requestContext = vi.hoisted(() => ({ token: "" }));
// Test-only Next platform context; production actions/client/auth and HTTP/DB
// modules are real. This does not create a browser or device session.
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({
  get: (name: string) => name === "auto_tm_admin_access" ? { value: requestContext.token } : undefined,
}) }));
const actionPath = resolve(__dirname, "../../../../../admin/src/app/vehicle-history/[locale]/listing-actions");
type ListingAction = (locale: string, value: unknown) => Promise<{ status: string; data?: unknown }>;
const suite = defineE2eSuite("history-source-listing");
let app: NestFastifyApplication, prisma: PrismaService, action: ListingAction;
let holdResponse: (() => Promise<void>) | undefined;
let input: { id: string; scope: string; expectedAssignmentVersion: number; kind: string };
const owner = suite.id("operator-owner"), listingId = suite.id("source");
beforeAll(async () => {
  const env = EnvSchema.parse(process.env);
  const module = await Test.createTestingModule({ imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }), EventEmitterModule.forRoot(),
    bullTestRoot(), JwtModule.register({ global: true, secret: env.JWT_ACCESS_SECRET }), ListingsModule, CatalogModule, VehicleHistoryModule,
  ] }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)));
  app.useGlobalFilters(new GlobalErrorFilter());
  app.getHttpAdapter().getInstance().addHook("onSend", async (request, _reply, payload) => {
    if (request.url === `/api/v1/listings/${listingId}` && holdResponse) await holdResponse();
    return payload;
  });
  await app.listen(0, "127.0.0.1");
  prisma = app.get(PrismaService);
  await seedSuiteCatalog(prisma, suite);
  await prisma.user.create({ data: { id: owner, role: "seller", displayName: "History owner", email: "vh1251@example.invalid",
    emailVerifiedAt: new Date(), staffGrants: { create: { purpose: "vehicle_history" } } } });
  const session = await prisma.session.create({ data: { userId: owner, refreshTokenHash: randomUUID(),
    expiresAt: new Date(Date.now() + 600_000), adminTotpExpiresAt: new Date(Date.now() + 600_000) } });
  requestContext.token = app.get(JwtService).sign({ sub: owner, sid: session.id });
  const config = app.get(ConfigService);
  config.set("APP_ENV", "test"); config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", true); config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", owner);
  config.set("LISTING_VIDEO_VIEW_TESTER_USER_IDS", "");
  await prisma.listing.create({ data: { id: listingId, sellerId: owner, status: "active", ...{
    brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, regionId: suite.catalog.regionId, cityId: suite.catalog.cityId,
  }, priceAmount: 100, priceCurrency: "TMT", priceTmt: 100, contactPhone: "+99365001251", publishedAt: new Date() } });
  const http = supertest(app.getHttpServer());
  const created = await http.post("/api/v1/vehicle-history/requests").auth(requestContext.token, { type: "bearer" })
    .send({ attemptKey: randomUUID(), sourceListingId: listingId }).expect(201);
  await http.post(`/api/v1/vehicle-history/operator/requests/${created.body.id}/claim`).auth(requestContext.token, { type: "bearer" })
    .send({ expectedAssignmentVersion: 0 }).expect(201);
  input = { kind: "detail", id: created.body.id, expectedAssignmentVersion: 1,
    scope: createHash("sha256").update(`history-inbox\0${owner}\0${session.id}`).digest("hex") };
  vi.stubEnv("API_BASE_URL", await app.getUrl());
  action = (await import(actionPath) as { historyListingAction: ListingAction }).historyListingAction;
});
afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });

it("runs the production request-bound action through current History, public Listing and catalog HTTP/DB", async () => {
  for (const status of ["active", "sold", "archived"] as const) {
    await prisma.listing.update({ where: { id: listingId }, data: { status } });
    for (const locale of ["tk", "ru", "en"]) {
      const result = await action(locale, input);
      expect(result).toMatchObject({ status: "ok", data: { listing: { id: listingId, status },
        labels: { brand: expect.any(String), model: expect.any(String), region: expect.any(String), city: expect.any(String) } } });
      expect(JSON.stringify(result)).not.toMatch(/contactPhone|sellerId|allowCalls|allowChat|pendingVideo/);
    }
  }
  await prisma.listing.update({ where: { id: listingId }, data: { status: "banned" } });
  expect(await action("en", input)).toMatchObject({ status: "not-found" });
  await prisma.listing.update({ where: { id: listingId }, data: { status: "active" } });
  // An actual History grant plus coincidental seller ownership grants no video access.
  for (const kind of ["cover", "play"]) expect(await action("en", { ...input, kind })).toMatchObject({ status: "not-found" });
  for (const lost of ["source", "assignment", "session", "lifecycle"]) {
    let arrive!: () => void, release!: () => void;
    const arrived = new Promise<void>((resolve) => { arrive = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    // Delay the actual HTTP response after the real DB read, never a repository
    // collaborator. Request cookies remain fixed through server revocation.
    holdResponse = async () => { arrive(); await held; };
    const pending = action("en", input);
    try {
      await arrived;
      if (lost === "source") await prisma.vehicleHistoryRequest.update({ where: { id: input.id }, data: { sourceListingId: randomUUID() } });
      if (lost === "assignment") await prisma.vehicleHistoryRequest.update({ where: { id: input.id }, data: { assignmentVersion: 2 } });
      if (lost === "session") await prisma.session.updateMany({ where: { userId: owner }, data: { expiresAt: new Date(0) } });
      if (lost === "lifecycle") await prisma.user.update({ where: { id: owner }, data: { suspendedAt: new Date() } });
    } finally { release(); }
    const result = await pending;
    holdResponse = undefined;
    expect(result.status).toBe(["source", "assignment"].includes(lost) ? "conflict" : "denied");
    expect(result).not.toHaveProperty("data");
    await prisma.vehicleHistoryRequest.update({ where: { id: input.id }, data: { sourceListingId: listingId, assignmentVersion: 1 } });
    await prisma.session.updateMany({ where: { userId: owner }, data: { expiresAt: new Date(Date.now() + 600_000) } });
    await prisma.user.update({ where: { id: owner }, data: { suspendedAt: null } });
  }
  await prisma.vehicleHistoryRequest.update({ where: { id: input.id }, data: { assignmentVersion: 2 } });
  expect(await action("en", input)).toMatchObject({ status: "conflict" });
  await prisma.staffGrant.update({ where: { userId_purpose: { userId: owner, purpose: "vehicle_history" } }, data: { revokedAt: new Date() } });
  expect(await action("en", { ...input, expectedAssignmentVersion: 2 })).toMatchObject({ status: "denied" });
});
