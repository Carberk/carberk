import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";

// #871: relisting used to reset publishedAt. A Listing row is only ever created
// by publishing (PublishListing creates it with publishedAt = now, before the
// insert sets createdAt), so createdAt is the first publish and a relisted row
// is one whose publishedAt is later than its createdAt.
const MIGRATION = "20261014120000_restore_relisted_listings_published_at";
const migrationsDir = new URL("../prisma/migrations", import.meta.url).pathname;
const migrationNames = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

async function applyMigrations(db: Client, names: string[]): Promise<void> {
  for (const name of names) {
    await db.query(readFileSync(join(migrationsDir, name, "migration.sql"), "utf-8"));
  }
}

const CREATED_AT = "2026-09-01T10:00:05.250Z";
const UPDATED_AT = "2026-10-12T08:00:00.000Z";

async function insertListing(
  db: Client,
  id: string,
  publishedAt: string | null,
  status = "active",
): Promise<void> {
  await db.query(
    `INSERT INTO listings (id, "sellerId", "brandId", "modelId", "cityId", "priceAmount",
      status, "allowChat", "publishedAt", "createdAt", "updatedAt")
     VALUES ($1, 'seller', 'brand', 'model', 'city', 100, $2::"ListingStatus", true,
      $3, $4, $5)`,
    [id, status, publishedAt, CREATED_AT, UPDATED_AT],
  );
}

async function listings(db: Client) {
  const result = await db.query<{
    id: string;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    status: string;
  }>(`SELECT id, "publishedAt", "createdAt", "updatedAt", status::text AS status
      FROM listings ORDER BY id`);
  return result.rows.map((row) => ({
    ...row,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

describe(`${MIGRATION} — Testcontainers`, () => {
  let container: StartedPostgreSqlContainer;
  let db: Client;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withUsername("auto_tm")
      .withPassword("auto_tm_pass")
      .withDatabase("auto_tm_test")
      .start();
    db = new Client({ connectionString: container.getConnectionUri() });
    await db.connect();

    await applyMigrations(db, migrationNames.filter((name) => name < MIGRATION));

    await db.query(`INSERT INTO users (id, phone, "phoneVerifiedAt", "updatedAt")
      VALUES ('seller', '+99361111111', now(), now())`);
    for (const [table, id] of [
      ["brands", "brand"],
      ["regions", "region"],
    ] as const) {
      await db.query(`INSERT INTO ${table} (id, slug, "nameRu", "nameTk", "nameEn", "updatedAt")
        VALUES ($1, $1, $1, $1, $1, now())`, [id]);
    }
    await db.query(`INSERT INTO models (id, "brandId", slug, "nameRu", "nameTk", "nameEn", "updatedAt")
      VALUES ('model', 'brand', 'model', 'model', 'model', 'model', now())`);
    await db.query(`INSERT INTO cities (id, "regionId", slug, "nameRu", "nameTk", "nameEn", "updatedAt")
      VALUES ('city', 'region', 'city', 'city', 'city', 'city', now())`);

    // Published through the app: publishedAt is taken before the insert.
    await insertListing(db, "a-never-relisted", "2026-09-01T10:00:03.000Z");
    // Relisted by its owner, and by an account restore, after the first publish.
    await insertListing(db, "b-owner-relisted", "2026-10-12T08:00:00.000Z");
    await insertListing(db, "c-restore-relisted", "2026-10-12T08:00:00.000Z");
    // Relisted, then removed from sale or sold again.
    await insertListing(db, "d-relisted-then-archived", "2026-10-12T08:00:00.000Z", "archived");
    // Seeded inventory dated before its row existed.
    await insertListing(db, "e-backdated-seed", "2026-08-01T00:00:00.000Z");
    await insertListing(db, "f-no-publish-date", null);
    await insertListing(db, "g-same-instant", CREATED_AT);

    await applyMigrations(db, migrationNames.filter((name) => name === MIGRATION));
  }, 120_000);

  afterAll(async () => {
    await db?.end();
    await container?.stop();
  });

  it("puts a relisted Listing back on its first publish date", async () => {
    const rows = await listings(db);

    expect(rows.map((row) => [row.id, row.publishedAt])).toEqual([
      ["a-never-relisted", "2026-09-01T10:00:03.000Z"],
      ["b-owner-relisted", CREATED_AT],
      ["c-restore-relisted", CREATED_AT],
      ["d-relisted-then-archived", CREATED_AT],
      ["e-backdated-seed", "2026-08-01T00:00:00.000Z"],
      ["f-no-publish-date", null],
      ["g-same-instant", CREATED_AT],
    ]);
  });

  it("keeps each Listing's status, createdAt and updatedAt, so Updated still shows the relist", async () => {
    const rows = await listings(db);

    expect(rows.every((row) => row.createdAt === CREATED_AT)).toBe(true);
    expect(rows.every((row) => row.updatedAt === UPDATED_AT)).toBe(true);
    expect(rows.find((row) => row.id === "d-relisted-then-archived")?.status).toBe("archived");
  });

  it("changes nothing when run a second time", async () => {
    const before = await listings(db);

    await applyMigrations(db, [MIGRATION]);

    expect(await listings(db)).toEqual(before);
  });
});
