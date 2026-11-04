import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import { PrismaTesterAccountStore } from "../src/PrismaTesterAccountStore";
import { runTesterAccounts } from "../src/tester-accounts";

import { createTestPool } from "./testing/create-test-pool";

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

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").withUsername("auto_tm").withPassword("auto_tm_test").withDatabase("tester_accounts_test").start();
    const databaseUrl = container.getConnectionUri();
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
    pool = createTestPool(databaseUrl);
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
    store = new PrismaTesterAccountStore(db);
  });
  afterAll(async () => { await db?.$disconnect(); await pool?.end(); await container?.stop(); });
  beforeEach(async () => { await db.session.deleteMany(); await db.user.deleteMany(); });

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
