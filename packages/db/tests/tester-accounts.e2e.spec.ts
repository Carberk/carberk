import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import { PrismaTesterAccountStore } from "../src/PrismaTesterAccountStore";
import { runTesterAccounts } from "../src/tester-accounts";

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected fixture value");
  return value;
}

const NOW = new Date("2026-10-07T00:00:00.000Z");
const accounts = Array.from({ length: 30 }, (_, index) => ({ phone: `+99370${String(index + 1).padStart(6, "0")}`, email: `tester${index + 1}@example.invalid`, code: "765432" }));
const input = (mode: "seed" | "remove" = "seed") => ({ mode, now: NOW, testerAccountsJson: JSON.stringify(accounts), reviewerAccountsJson: "[]" });

describe("tester operator Prisma transaction integration", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: PrismaClient;
  let store: PrismaTesterAccountStore;

  async function captureDormantFixture() {
    guardSnapshot = (await pool.query<{ table: string; name: string; mode: string }>(`SELECT c.relname AS table,t.tgname AS name,t.tgenabled AS mode
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
    // Facts are ordinary preactivation setup; behavior runs with every finite guard enabled.
    await sourceGuards(false);
  }
  let guardSnapshot: { table: string; name: string; mode: string }[] = [];
  async function sourceGuards(enabled: boolean) {
    const rows = await pool.query<{ table: string; name: string }>(`SELECT c.relname AS table,t.tgname AS name
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')
      ORDER BY c.relname,t.tgname`);
    for (const row of rows.rows) await pool.query(`ALTER TABLE public."${row.table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER "${row.name}"`);
    if (enabled) expect((await pool.query("SELECT diagnostic_source_guards_ready() ready")).rows).toEqual([{ ready: true }]);
  }
  afterEach(async () => {
    if (!pool) return;
    expect((await pool.query("SELECT count(*)::int count FROM diagnostic_source_commands")).rows).toEqual([{ count: 0 }]);
    for (const row of guardSnapshot) {
      const mode = ({ O: "ENABLE", D: "DISABLE", R: "ENABLE REPLICA", A: "ENABLE ALWAYS" } as Record<string, string>)[row.mode];
      if (!mode) throw new Error("Unknown fixture trigger mode");
      await pool.query(`ALTER TABLE public."${row.table}" ${mode} TRIGGER "${row.name}"`);
    }
    expect((await pool.query(`SELECT c.relname AS table,t.tgname AS name,t.tgenabled AS mode
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows).toEqual(guardSnapshot);
  });

  beforeAll(async () => {
    const supplied = process.env["R7G_TESTER_DATABASE_URL"];
    if (supplied) {
      const address = new URL(supplied);
      if (address.hostname !== "127.0.0.1" || ["5432", "6379", "9000"].includes(address.port) || !address.pathname.startsWith("/candidatea_r7g_")) throw new Error("Isolated R7g database required");
    } else container = await new PostgreSqlContainer("postgres:16-alpine").withUsername("auto_tm").withPassword("auto_tm_test").withDatabase("tester_accounts_test").start();
    const databaseUrl = supplied ?? container.getConnectionUri();
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
    pool = new Pool({ connectionString: databaseUrl });
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
    store = new PrismaTesterAccountStore(db);
  });
  afterAll(async () => { await db?.$disconnect(); await pool?.end(); await container?.stop(); });
  beforeEach(async () => {
    await captureDormantFixture();
    await db.session.deleteMany(); await db.user.deleteMany();
  });

  it("seeds 30 Users with both methods, preserves generated identity and profile across reruns, then removes Sessions without touching another User", async () => {
    expect(await runTesterAccounts(store, input())).toMatchObject({ created: 30 });
    const first = await db.user.findUniqueOrThrow({ where: { phone: must(accounts[0]).phone } });
    expect(first).toMatchObject({ role: "buyer", phoneVerifiedAt: NOW, emailVerifiedAt: NOW, email: must(accounts[0]).email, deletionScheduledAt: null });
    expect(first.nameNumber).toBeGreaterThanOrEqual(1000); expect(first.nameNumber).toBeLessThanOrEqual(9999);
    expect(first.avatarIndex).toBeGreaterThanOrEqual(0); expect(first.avatarIndex).toBeLessThanOrEqual(11);
    await db.user.update({ where: { id: first.id }, data: { displayName: "Test Driver", role: "seller" } });
    expect(await runTesterAccounts(store, input())).toMatchObject({ created: 0 });
    expect(await db.user.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ displayName: "Test Driver", role: "seller", nameNumber: first.nameNumber, avatarIndex: first.avatarIndex });
    const names = { nameRu: "Fixture", nameTk: "Fixture", nameEn: "Fixture" };
    const brand = await db.brand.create({ data: { slug: "tester-brand", ...names } });
    const model = await db.model.create({ data: { slug: "tester-model", brandId: brand.id, ...names } });
    const region = await db.region.create({ data: { slug: "tester-region", ...names } });
    const city = await db.city.create({ data: { slug: "tester-city", regionId: region.id, ...names } });
    const listing = await db.listing.create({ data: { sellerId: first.id, brandId: brand.id, modelId: model.id, cityId: city.id, regionId: region.id, year: 2020, mileageKm: 1000, priceAmount: 100, status: "active" } });
    const other = await db.user.create({ data: { phone: "+99371000000", phoneVerifiedAt: NOW, role: "buyer" } });
    for (const user of [first, other]) await db.session.create({ data: { userId: user.id, refreshTokenHash: `fixture-hash:${user.id}`, expiresAt: new Date("2026-12-01T00:00:00Z") } });
    await sourceGuards(true);
    expect(await runTesterAccounts(store, input("remove"))).toMatchObject({ scheduled: 30, sessionsDeleted: 1, listingsArchived: 1 });
    expect(await db.user.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ deletionScheduledAt: NOW });
    expect(await db.user.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ deletionScheduledAt: null });
    expect(await db.session.count({ where: { userId: other.id } })).toBe(1);
    expect(await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "archived", archivedByDeletion: true });
    expect(await runTesterAccounts(store, input("remove"))).toEqual({ created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 });
  });

  it("refuses a conflict at the end of the list before creating any User", async () => {
    const conflicting = await db.user.create({ data: { email: must(accounts[29]).email, emailVerifiedAt: NOW, role: "admin" } });
    await expect(runTesterAccounts(store, input())).rejects.toThrow(/refused/);
    expect(await db.user.count()).toBe(1);
    expect(await db.user.findUniqueOrThrow({ where: { id: conflicting.id } })).toMatchObject({ deletionScheduledAt: null, role: "admin" });
  });

  it("removal preflights all roles and rolls back before revoking or scheduling an ordinary tester", async () => {
    await runTesterAccounts(store, input());
    const elevated = await db.user.findUniqueOrThrow({ where: { email: must(accounts[29]).email } });
    await db.user.update({ where: { id: elevated.id }, data: { role: "moderator" } });
    const ordinary = await db.user.findUniqueOrThrow({ where: { email: must(accounts[0]).email } });
    await db.session.create({ data: { userId: ordinary.id, refreshTokenHash: "fixture-hash", expiresAt: new Date("2026-12-01T00:00:00Z") } });
    await sourceGuards(true);
    await expect(runTesterAccounts(store, input("remove"))).rejects.toThrow(/refused/);
    expect(await db.user.count({ where: { deletionScheduledAt: { not: null } } })).toBe(0);
    expect(await db.session.count()).toBe(1);
  });

  it("concurrent seeds never duplicate or take over Users", async () => {
    const results = await Promise.allSettled([runTesterAccounts(store, input()), runTesterAccounts(store, input())]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect(await db.user.count()).toBe(30);
    expect(await db.user.count({ where: { role: "buyer", phoneVerifiedAt: NOW, emailVerifiedAt: NOW } })).toBe(30);
    expect(await runTesterAccounts(store, input())).toMatchObject({ created: 0 });
  });
});
