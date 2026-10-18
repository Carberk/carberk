import { SortedFeedRankingAdapter } from "../infrastructure/SortedFeedRankingAdapter";
import { PrismaExchangeRateRepository } from "../infrastructure/PrismaExchangeRateRepository";
import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "@auto-tm/db";
import supertest from "supertest";

import { PublicMarketplaceController } from "./PublicMarketplaceController";
import { PrismaPublicMarketplaceReadRepository } from "../infrastructure/PrismaPublicMarketplaceReadRepository";
import { PUBLIC_MARKETPLACE_READ_PORT } from "../domain/ports/PublicMarketplaceReadPort";
import { MEDIA_STORAGE_PORT } from "../domain/ports/MediaStoragePort";
import { defineE2eSuite, cleanSuiteFixtures, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";

const suite = defineE2eSuite("public-marketplace-910");
describe("anonymous marketplace through real HTTP and PostgreSQL", () => {
 let app: NestFastifyApplication; let prisma: PrismaService; let request: ReturnType<typeof supertest>;
 const businessId = suite.id("business"); const listingId = suite.id("listing");
 async function cleanup() {
  if (!prisma) return;
  await prisma.listing.deleteMany({ where: { sellerId: suite.id("seller") } });
  await prisma.dealership.deleteMany({ where: { id: businessId } });
  await cleanSuiteFixtures(prisma, suite, { userAliases: ["seller"] });
 }
 beforeAll(async () => {
  const module = await Test.createTestingModule({ controllers: [PublicMarketplaceController], providers: [PrismaService, { provide: PUBLIC_MARKETPLACE_READ_PORT, useClass: PrismaPublicMarketplaceReadRepository }, { provide: MEDIA_STORAGE_PORT, useValue: { resolvePublicUrl: (key: string) => `https://media.example.test/${key}` } }] }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter()); prisma = app.get(PrismaService); await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
 }, 60000);
 afterAll(async () => { await cleanup(); await app?.close(); });
 beforeEach(async () => {
  await cleanup(); await seedSuiteCatalog(prisma, suite);
  await prisma.user.create({ data: { id: suite.id("seller"), phone: suite.phone("seller"), phoneVerifiedAt: new Date() } });
  await prisma.dealership.create({ data: { id: businessId, slug: suite.slugFor("business"), name: "Synthetic showroom", status: "active", admissionMode: "synthetic", checkedEvidence: "PRIVATE evidence", address: "Public address" } });
  await prisma.listing.create({ data: { id: listingId, sellerId: suite.id("seller"), businessId, brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, status: "active", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT", allowChat: true, allowCalls: true, contactPhone: suite.phone("seller"), description: "Public car" } });
 });
 it("exposes only public identity and current active inventory without authentication", async () => {
  const page = await request.get(`/api/v1/public-marketplace/showrooms/${businessId}`).expect(200);
  expect(page.headers["cache-control"]).toBe("no-store");
  expect(page.body.business).toMatchObject({ name: "Synthetic showroom", identityChecked: false, address: "Public address" });
  expect(page.body.listings).toHaveLength(1); expect(JSON.stringify(page.body)).not.toMatch(/PRIVATE|checkedEvidence|diagnostic|sellerId/);
  await request.get("/api/v1/public-marketplace/showrooms/not-a-uuid").expect(400);
 });
 it("keeps sold facts available without new contact and removes suppressed content immediately", async () => {
  await prisma.listing.update({ where: { id: listingId }, data: { status: "sold" } });
  const sold = await request.get(`/api/v1/public-marketplace/listings/${listingId}`).expect(200);
  expect(sold.body).toMatchObject({ status: "sold", allowChat: false, contactPhone: null });
  expect((await request.get(`/api/v1/public-marketplace/showrooms/${businessId}`).expect(200)).body.listings).toEqual([]);
  await prisma.listing.update({ where: { id: listingId }, data: { status: "banned" } });
  await request.get(`/api/v1/public-marketplace/listings/${listingId}`).expect(404);
  await prisma.listing.update({ where: { id: listingId }, data: { status: "active", deletedAt: new Date() } });
  await request.get(`/api/v1/public-marketplace/listings/${listingId}`).expect(404);
 });
 it("pages showroom inventory without duplicates and keeps seller choice out of ranking order", async () => {
  const personalId = suite.id("personal");
  const create = (id: string, business: string | null, publishedAt: Date) => prisma.listing.create({ data: { id, sellerId: suite.id("seller"), businessId: business, brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, status: "active", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT", publishedAt } });
  await prisma.listing.update({ where: { id: listingId }, data: { publishedAt: new Date("2026-10-01T00:00:00Z") } });
  await create(personalId, null, new Date("2026-10-03T00:00:00Z"));
  const ranking = new SortedFeedRankingAdapter(prisma, new PrismaExchangeRateRepository(prisma));
  expect((await ranking.rank({ sort: "newest", limit: 20 })).items.map(item => item.id)).toEqual([personalId, listingId]);
  expect((await ranking.rank({ sort: "newest", filters: { sellerType: "business" }, limit: 20 })).items.map(item => item.id)).toEqual([listingId]);
  expect((await ranking.count({ filters: { sellerType: "personal" } })).totalMatching).toBe(1);
  for (let index = 0; index < 21; index++) await create(suite.id(`page-${index}`), businessId, new Date("2026-10-02T00:00:00Z"));
  const first = (await request.get(`/api/v1/public-marketplace/showrooms/${businessId}`).expect(200)).body;
  expect(first.listings).toHaveLength(20); expect(first.nextCursor).toBeTruthy();
  const next = (await request.get(`/api/v1/public-marketplace/showrooms/${businessId}?cursor=${first.nextCursor}`).expect(200)).body;
  expect(next.listings).toHaveLength(2); expect(next.nextCursor).toBeNull();
  expect(new Set([...first.listings, ...next.listings].map((item: { id: string }) => item.id)).size).toBe(22);
 });

 it("hides a suspended business from both reader routes", async () => {
  await prisma.dealership.update({ where: { id: businessId }, data: { status: "suspended" } });
  await request.get(`/api/v1/public-marketplace/showrooms/${businessId}`).expect(404);
  await request.get(`/api/v1/public-marketplace/listings/${listingId}`).expect(404);
 });
});
