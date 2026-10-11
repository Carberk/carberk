import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";

const MIGRATION = "20261011130000_correct_lugong_liugong_models";
const migrationsDir = new URL("../prisma/migrations", import.meta.url).pathname;
const migrationFile = join(migrationsDir, MIGRATION, "migration.sql");

describe("catalog seed ownership", () => {
  const models = JSON.parse(readFileSync(new URL("../prisma/seed/models.json", import.meta.url), "utf8")) as { brandSlug: string; nameEn: string }[];
  const brands = JSON.parse(readFileSync(new URL("../prisma/seed/brands.json", import.meta.url), "utf8")) as { slug: string; nameEn: string; nameRu: string; nameTk: string }[];

  it("keeps LiuGong CLG models out of Shandong Lugong without adding duplicate rows", () => {
    expect(models.filter(model => model.brandSlug === "lugong").map(model => model.nameEn)).toEqual([
      "LG930", "LG938", "LG942", "LG946", "T933", "ZL18F", "ZL30G", "ZL918F", "ZL930F", "ZL936F",
    ]);
    expect(models.filter(model => model.brandSlug === "liugong" && model.nameEn === "CLG 4180D")).toHaveLength(1);
    expect(models.filter(model => model.brandSlug === "liugong" && model.nameEn === "CLG6616E")).toHaveLength(1);
  });

  it("identifies John Deere while retaining the existing catalog slug", () => {
    expect(brands.find(brand => brand.slug === "john")).toEqual({
      slug: "john", nameEn: "John Deere", nameRu: "John Deere", nameTk: "John Deere",
    });
  });
});

describe(`${MIGRATION} — Testcontainers`, () => {
  let container: StartedPostgreSqlContainer;
  let db: Client;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withUsername("auto_tm").withPassword("auto_tm_pass").withDatabase("auto_tm_test").start();
    db = new Client({ connectionString: container.getConnectionUri() });
    await db.connect();
    for (const name of readdirSync(migrationsDir).filter(name => name < MIGRATION).sort()) {
      await db.query(readFileSync(join(migrationsDir, name, "migration.sql"), "utf8"));
    }
  }, 120_000);

  afterAll(async () => { await db?.end(); await container?.stop(); });

  beforeEach(async () => {
    await db.query("TRUNCATE users, brands, regions CASCADE");
    await db.query(`INSERT INTO users (id, phone, "phoneVerifiedAt", "updatedAt") VALUES ('seller', '+99361111111', now(), now());
      INSERT INTO brands (id, slug, "nameRu", "nameTk", "nameEn", "updatedAt") VALUES
      ('lugong', 'lugong', 'Lugong', 'Lugong', 'Lugong', now()),
      ('liugong', 'liugong', 'LiuGong', 'LiuGong', 'LiuGong', now()),
      ('john', 'john', 'John', 'John', 'John', now());
      INSERT INTO models (id, "brandId", slug, "nameRu", "nameTk", "nameEn", "updatedAt") VALUES
      ('old-4180', 'lugong', 'clg4180d', 'CLG4180D', 'CLG4180D', 'CLG4180D', now()),
      ('canonical-4180', 'liugong', 'clg-4180d', 'CLG 4180D', 'CLG 4180D', 'CLG 4180D', now()),
      ('old-6616', 'lugong', 'clg6616e', 'CLG6616E', 'CLG6616E', 'CLG6616E', now()),
      ('real-lugong', 'lugong', 'lg930', 'LG930', 'LG930', 'LG930', now());
      INSERT INTO generations (id, "modelId", "nameRu", "nameTk", "nameEn", "updatedAt")
      VALUES ('generation', 'old-4180', 'Generation', 'Generation', 'Generation', now());
      INSERT INTO regions (id, slug, "nameRu", "nameTk", "nameEn", "updatedAt") VALUES ('region', 'region', 'Region', 'Region', 'Region', now());
      INSERT INTO cities (id, "regionId", slug, "nameRu", "nameTk", "nameEn", "updatedAt") VALUES ('city', 'region', 'city', 'City', 'City', 'City', now());
      INSERT INTO listings (id, "sellerId", "brandId", "modelId", "generationId", "cityId", "priceAmount", "updatedAt") VALUES
      ('moved', 'seller', 'lugong', 'old-4180', 'generation', 'city', 100, now()),
      ('kept', 'seller', 'lugong', 'real-lugong', null, 'city', 200, now());
      INSERT INTO listing_drafts (id, "userId", payload, "updatedAt") VALUES
      ('draft', 'seller', '{"brandId":"lugong","modelId":"old-4180","description":"Keep this content"}', now());`);
  });

  async function applyMigration() {
    await db.query(readFileSync(migrationFile, "utf8"));
  }

  it("moves references to existing canonical models without dropping vehicle content", async () => {
    await applyMigration();
    expect((await db.query('SELECT id, "brandId", "modelId", "generationId", "priceAmount" FROM listings ORDER BY id')).rows).toEqual([
      { id: "kept", brandId: "lugong", modelId: "real-lugong", generationId: null, priceAmount: 200 },
      { id: "moved", brandId: "liugong", modelId: "canonical-4180", generationId: "generation", priceAmount: 100 },
    ]);
    expect((await db.query('SELECT "modelId" FROM generations WHERE id=\'generation\'')).rows).toEqual([{ modelId: "canonical-4180" }]);
    expect((await db.query("SELECT payload FROM listing_drafts WHERE id='draft'")).rows[0]?.payload).toEqual({ brandId: "liugong", modelId: "canonical-4180", description: "Keep this content" });
    expect((await db.query("SELECT id FROM models WHERE id='old-4180'")).rows).toEqual([]);
    expect((await db.query('SELECT "brandId" FROM models WHERE id=\'old-6616\'')).rows).toEqual([{ brandId: "liugong" }]);
  });

  it("is idempotent and works before a fresh database has catalog rows", async () => {
    await applyMigration(); await applyMigration();
    expect((await db.query("SELECT count(*)::int AS count FROM models WHERE \"brandId\"='lugong'")).rows).toEqual([{ count: 1 }]);
    expect((await db.query("SELECT \"nameEn\" FROM brands WHERE id='john'")).rows).toEqual([{ nameEn: "John Deere" }]);
    await db.query("TRUNCATE users, brands, regions CASCADE");
    await expect(applyMigration()).resolves.toBeUndefined();
    expect((await db.query("SELECT count(*)::int AS count FROM brands")).rows).toEqual([{ count: 0 }]);
  });

  it("refuses an affected saved search before changing any catalog or vehicle row", async () => {
    await db.query(`INSERT INTO saved_searches (id, "userId", filters, "updatedAt")
      VALUES ('search', 'seller', '{"brandId":"lugong","modelIds":["old-4180","real-lugong"]}', now())`);
    await expect(applyMigration()).rejects.toThrow(/saved.search/i);
    expect((await db.query("SELECT \"modelId\" FROM listings WHERE id='moved'")).rows).toEqual([{ modelId: "old-4180" }]);
    expect((await db.query("SELECT \"nameEn\" FROM brands WHERE id='john'")).rows).toEqual([{ nameEn: "John" }]);
  });
});
