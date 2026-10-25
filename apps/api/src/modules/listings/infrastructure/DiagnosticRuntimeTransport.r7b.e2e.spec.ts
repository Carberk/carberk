import { PrismaService, withCampaignPreparation } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { Listing } from "../domain/Listing";
import { PrismaListingRepository } from "./PrismaListingRepository";

// Explicitly isolated disposable database. This dependency proof needs no
// publication migration and invokes the production builder through its caller.
const suite = defineE2eSuite("r7b-runtime-transport-20261025");
describe("R7b runtime dependency transport", { concurrent: false }, () => {
  const db = new PrismaService();
  const owner = suite.id("owner"), listingId = suite.id("listing");
  let guards: { table: string; name: string; mode: string }[] = [];
  beforeAll(async () => {
    if (process.env["R7B_DISPOSABLE_DATABASE"] !== "round1-8c41fd9a") throw new Error("requires_task_owned_disposable_database");
    await seedSuiteCatalog(db, suite);
    await db.user.create({ data: { id: owner, phone: suite.phone("owner"), phoneVerifiedAt: new Date(), role: "seller" } });
    guards = await db.$queryRaw`SELECT c.relname AS table,t.tgname AS name,t.tgenabled::text AS mode FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')`;
    for (const g of guards) await db.$executeRawUnsafe(`ALTER TABLE public."${g.table}" ENABLE TRIGGER "${g.name}"`);
    expect(await db.$queryRaw`SELECT public.diagnostic_source_guards_ready() AS source,public.campaign_preparation_ready() AS campaign`).toEqual([{ source: true, campaign: true }]);
  });
  afterAll(async () => {
    try {
      for (const g of guards) {
        const mode = ({ O: "ENABLE", D: "DISABLE", A: "ENABLE ALWAYS", R: "ENABLE REPLICA" } as const)[g.mode as "O" | "D" | "A" | "R"];
        if (!mode) throw new Error("unknown_trigger_mode");
        await db.$executeRawUnsafe(`ALTER TABLE public."${g.table}" ${mode} TRIGGER "${g.name}"`);
      }
    } finally { await db.$disconnect(); }
  });
  it("prepares and finishes a real campaign through Prisma void transport", async () => {
    await db.$transaction(tx => withCampaignPreparation(tx, [{ table: "users", key: { id: owner }, verb: "update", next: {} }], async () => {}));
    expect(await db.$queryRaw`SELECT count(*)::int AS count FROM campaign_preparations`).toEqual([{ count: 0 }]);
  });
  it("transports the actual advisory void result as text", async () => {
    await db.$transaction(async tx => { expect(await tx.$queryRaw`SELECT pg_advisory_xact_lock(897999::int,1::int)::text AS result`).toEqual([{ result: "" }]); });
  });
  it("prepares ordinary source insert, update and soft deletion through the real repository", async () => {
    const repo = new PrismaListingRepository(db), at = new Date();
    const listing = Listing.create({ id: listingId, publicNumber: 0, sellerId: owner, status: "active", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, year: 2020, cityId: suite.catalog.cityId, priceAmount: 1000, priceCurrency: "TMT", contactPhone: suite.phone("owner"), allowCalls: true, allowChat: true, publishedAt: at, createdAt: at, updatedAt: at });
    await repo.save(listing); await repo.update(listing);
    await repo.softDelete(listingId, at);
    expect(await db.listing.findUnique({ where: { id: listingId } })).toMatchObject({ sellerId: owner, deletedAt: at });
    expect(await db.$queryRaw`SELECT count(*)::int AS count FROM diagnostic_source_commands`).toEqual([{ count: 0 }]);
  });
});
