import "reflect-metadata";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import { ListingViewsController } from "./ListingViewsController";
import { IDENTITY_CHECK_PORT, IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { LISTING_VIEWS_PORT } from "../domain/ports/ListingViewsPort";
import { RecordListingView } from "../application/RecordListingView";
import { InMemoryListingViews } from "../application/testing/InMemoryListingViews";
import type { IdentityCheckPort } from "../../identity/identity.public";

const views = new InMemoryListingViews();
const identity: IdentityCheckPort = { isAdmin: async (userId) => userId === "admin", isSuspended: async () => false, isInDealership: async () => false, isDeletionScheduled: async () => false, holdsSignInPhone: async () => false };
const now = new Date("2026-10-14T19:00:00Z");
describe("dedicated Listing-view HTTP signal", () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "synthetic-http-test-secret-874" })],
      controllers: [ListingViewsController],
      providers: [RecordListingView, { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: LISTING_VIEWS_PORT, useValue: views },
        { provide: IDENTITY_CHECK_PORT, useValue: identity },
        { provide: IDENTITY_CLOCK_PORT, useValue: { now: () => now } },
      ],
    }).compile();
    jwt = module.get(JwtService);
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => { await app?.close(); });
  it("accepts dedicated install signals with no count response", async () => {
    const response = await supertest(app.getHttpServer()).post("/api/v1/listings/car/views").set("x-app-install-id", "550e8400-e29b-41d4-a716-446655440000").expect(204);
    expect(response.text).toBe("");
    expect(views.records[0]).toMatchObject({ listingId: "car", viewerKey: "install:550e8400-e29b-41d4-a716-446655440000", now });
  });
  it("rejects malformed identifiers without reflecting them or recording", async () => {
    const before = views.records.length;
    const response = await supertest(app.getHttpServer()).post("/api/v1/listings/car/views").set("x-app-install-id", "raw-invalid-secret").expect(400);
    expect(JSON.stringify(response.body)).not.toContain("raw-invalid-secret");
    expect(views.records).toHaveLength(before);
  });
  it("silently ignores unidentifiable traffic", async () => {
    const before = views.records.length;
    await supertest(app.getHttpServer()).post("/api/v1/listings/car/views").expect(204);
    expect(views.records).toHaveLength(before);
  });
  it("uses verified account fallback and retains install precedence through sign-in", async () => {
    const before = views.records.length;
    const token = jwt.sign({ sub: "buyer" });
    await supertest(app.getHttpServer()).post("/api/v1/listings/car/views").set("authorization", `Bearer ${token}`).expect(204);
    await supertest(app.getHttpServer()).post("/api/v1/listings/car/views").set("authorization", `Bearer ${token}`).set("x-app-install-id", "550e8400-e29b-41d4-a716-446655440000").expect(204);
    expect(views.records.slice(before).map((row) => row.viewerKey)).toEqual(["account:buyer", "install:550e8400-e29b-41d4-a716-446655440000"]);
    expect(views.records.at(-1)?.requestingUserId).toBe("buyer");
  });
  it("excludes verified administrators and ignores invalid bearer identity", async () => {
    const before = views.records.length;
    await supertest(app.getHttpServer()).post("/api/v1/listings/car/views").set("authorization", `Bearer ${jwt.sign({ sub: "admin" })}`).set("x-app-install-id", "550e8400-e29b-41d4-a716-446655440000").expect(204);
    await supertest(app.getHttpServer()).post("/api/v1/listings/car/views").set("authorization", "Bearer invalid-token").expect(204);
    expect(views.records).toHaveLength(before);
  });

});
