import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";

const MIGRATION = "20261003180100_clear_unverified_listing_contact_phones";
const migrationsDir = new URL("../prisma/migrations", import.meta.url).pathname;
const migrationSql = readFileSync(join(migrationsDir, MIGRATION, "migration.sql"), "utf-8");

async function insertListing(
  db: Client,
  id: string,
  sellerId: string,
  contactPhone: string | null,
  status = "active",
): Promise<void> {
  await db.query(
    `INSERT INTO listings (id, "sellerId", "brandId", "modelId", "cityId", "priceAmount",
      status, "contactPhone", "allowChat", "updatedAt")
     VALUES ($1, $2, 'brand', 'model', 'city', 100, $3::"ListingStatus", $4, true,
      '2026-09-01T00:00:00Z')`,
    [id, sellerId, status, contactPhone],
  );
}

async function listings(db: Client) {
  // Interpret the stored UTC timestamp before pg converts it to a Date.
  const result = await db.query<{
    id: string;
    contactPhone: string | null;
    status: string;
    allowChat: boolean;
    updatedAt: Date;
  }>(`SELECT id, "contactPhone", status::text AS status, "allowChat",
      "updatedAt" AT TIME ZONE 'UTC' AS "updatedAt"
      FROM listings ORDER BY id`);
  return result.rows;
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

    const earlier = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name < MIGRATION)
      .map((entry) => entry.name)
      .sort();
    for (const name of earlier) {
      await db.query(readFileSync(join(migrationsDir, name, "migration.sql"), "utf-8"));
    }

    await db.query(`INSERT INTO users (id, phone, "phoneVerifiedAt", "updatedAt") VALUES
      ('seller', '+99361111111', now(), now()),
      ('confirmer', '+99362222222', now(), now())`);
    await db.query(`INSERT INTO users (id, email, "emailVerifiedAt", "updatedAt")
      VALUES ('email-only', 'seller@example.com', now(), now())`);
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
    await db.query(`INSERT INTO verified_contact_phones (id, "sellerId", phone, "confirmedAt", "updatedAt")
      VALUES ('v1', 'confirmer', '+99365555555', now(), now())`);

    await insertListing(db, "a-foreign", "seller", "+99365123456");
    await insertListing(db, "b-own", "seller", "+99361111111");
    await insertListing(db, "c-none", "seller", null);
    await insertListing(db, "d-free-text", "seller", "8 800 555 35 35", "archived");
    await insertListing(db, "e-other-sellers-phone", "seller", "+99362222222");
    await insertListing(db, "f-confirmed", "confirmer", "+99365555555");
    await insertListing(db, "g-email-only", "email-only", "+99361111111");
  }, 120_000);

  afterAll(async () => {
    await db?.end();
    await container?.stop();
  });

  it("keeps only the seller's own sign-in phone or a number the seller confirmed", async () => {
    await db.query(migrationSql);

    expect((await listings(db)).map((row) => [row.id, row.contactPhone])).toEqual([
      ["a-foreign", null],
      ["b-own", "+99361111111"],
      ["c-none", null],
      ["d-free-text", null],
      ["e-other-sellers-phone", null],
      ["f-confirmed", "+99365555555"],
      ["g-email-only", null],
    ]);
  });

  it("leaves a cleared Listing showing, with chat and its updatedAt unchanged", async () => {
    const cleared = (await listings(db)).find((row) => row.id === "a-foreign");

    expect(cleared).toMatchObject({ status: "active", allowChat: true });
    expect(cleared?.updatedAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("changes nothing when run a second time", async () => {
    const before = await listings(db);

    await db.query(migrationSql);

    expect(await listings(db)).toEqual(before);
  });
});
