import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";

const MIGRATION = "20261011140000_add_listing_media_thumb_hash";
const migrationsDir = new URL("../prisma/migrations", import.meta.url).pathname;
// rgbaToThumbHash(1, 1, [255, 0, 0, 255]), generated with evanw/thumbhash's
// reference encoder: https://github.com/evanw/thumbhash/blob/main/js/thumbhash.js
const GENERATED_HASH = "1fsrB38I9wiIh4hwj3CI+AiIgIAICIgA";

interface MediaRow {
  id: string;
  listingId: string;
  kind: string;
  key: string;
  sortOrder: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  posterKey: string | null;
  createdAt: Date;
  uploadId: string | null;
}

describe("ListingMedia optional ThumbHash schema", () => {
  it("offers nullable hash storage while Message attachments retain their JSON boundary", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const media = schema.match(/model ListingMedia \{([\s\S]*?)\n\}/)?.[1];
    const message = schema.match(/model Message \{([\s\S]*?)\n\}/)?.[1];
    expect(media).toMatch(/\bthumbHash\s+String\?/);
    expect(message).toMatch(/\bmetadata\s+Json\?/);
    expect(message).not.toMatch(/\bthumbHash\b/);
  });
});

describe(`${MIGRATION} PostgreSQL upgrade`, () => {
  let container: StartedPostgreSqlContainer;
  let db: Client;
  let pool: Pool;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withUsername("auto_tm").withPassword("auto_tm_pass").withDatabase("auto_tm_test").start();
    db = new Client({ connectionString: container.getConnectionUri() });
    await db.connect();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    await db?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  });

  async function applyHistory(filter: (name: string) => boolean) {
    const names = readdirSync(migrationsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && filter(entry.name))
      .map(entry => entry.name).sort();
    for (const name of names) {
      await db.query(readFileSync(join(migrationsDir, name, "migration.sql"), "utf8"));
    }
  }

  async function insertLegacyRows() {
    await db.query(`
      INSERT INTO users (id, email, "emailVerifiedAt", "updatedAt")
        VALUES ('seller', 'seller@example.com', now(), now());
      INSERT INTO brands (id, slug, "nameRu", "nameTk", "nameEn", "updatedAt")
        VALUES ('brand', 'brand', 'Brand', 'Brand', 'Brand', now());
      INSERT INTO models (id, "brandId", slug, "nameRu", "nameTk", "nameEn", "updatedAt")
        VALUES ('model', 'brand', 'model', 'Model', 'Model', 'Model', now());
      INSERT INTO regions (id, slug, "nameRu", "nameTk", "nameEn", "updatedAt")
        VALUES ('region', 'region', 'Region', 'Region', 'Region', now());
      INSERT INTO cities (id, "regionId", slug, "nameRu", "nameTk", "nameEn", "updatedAt")
        VALUES ('city', 'region', 'city', 'City', 'City', 'City', now());
      INSERT INTO listings (id, "sellerId", "brandId", "modelId", "cityId", "priceAmount", "updatedAt")
        VALUES ('listing', 'seller', 'brand', 'model', 'city', 100, now());
      INSERT INTO media_uploads (id, "userId", key, kind, "contentType", "sizeBytes", state)
        VALUES ('upload', 'seller', 'legacy/photo.webp', 'image', 'image/webp', 4567, 'ADOPTED');
      INSERT INTO listing_media (id, "listingId", kind, key, "sortOrder", width, height, "durationMs", "posterKey")
        VALUES ('photo', 'listing', 'image', 'legacy/photo.webp', 0, 1280, 960, null, null),
               ('video', 'listing', 'video', 'legacy/video.mp4', 1, 1920, 1080, 1234, 'legacy/poster.webp'),
               ('unknown-size', 'listing', 'image', 'legacy/unknown.jpg', 2, null, null, null, null);
      UPDATE listing_media SET "uploadId" = 'upload' WHERE id = 'photo';
      INSERT INTO conversations (id, "listingId", "buyerId", "sellerId", "updatedAt")
        VALUES ('conversation', 'listing', 'seller', 'seller', now());
      INSERT INTO messages (id, "conversationId", "senderId", kind, metadata)
        VALUES ('message', 'conversation', 'seller', 'image', '{"key":"chat/photo.webp","width":640,"height":480}');
    `);
  }

  it("upgrades populated media with null hashes and preserves every legacy field and chat attachment", async () => {
    await applyHistory(name => name < MIGRATION);
    await insertLegacyRows();
    const before = (await db.query<MediaRow>("SELECT * FROM listing_media ORDER BY id")).rows;
    const chatBefore = (await db.query("SELECT * FROM messages")).rows;

    await applyHistory(name => name >= MIGRATION);

    const after = (await db.query<MediaRow & { thumbHash: string | null }>("SELECT * FROM listing_media ORDER BY id")).rows;
    expect(after).toEqual(before.map(row => ({ ...row, thumbHash: null })));
    expect((await db.query("SELECT * FROM messages")).rows).toEqual(chatBefore);
    expect((await db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'thumbHash'`)).rows).toEqual([]);
  });

  it("roundtrips a generated hash and still accepts writes from an older API omitting it", async () => {
    await applyHistory(name => name < MIGRATION);
    await insertLegacyRows();
    await applyHistory(name => name >= MIGRATION);

    expect(await prisma.listingMedia.findUnique({ where: { id: "photo" } }))
      .toMatchObject({ thumbHash: null, key: "legacy/photo.webp", width: 1280, height: 960 });
    await prisma.listingMedia.update({
      where: { id: "photo" },
      // Spread permits the test-first checkpoint to compile against the old
      // generated client. Its runtime still rejects an unsupported hash field.
      data: { key: "legacy/photo.webp", ...{ thumbHash: GENERATED_HASH } },
    });
    expect(await prisma.listingMedia.findUnique({ where: { id: "photo" } }))
      .toMatchObject({ thumbHash: GENERATED_HASH, key: "legacy/photo.webp", width: 1280, height: 960 });
    const created = await db.query(`INSERT INTO listing_media (id, "listingId", kind, key, "sortOrder")
      VALUES ('old-api', 'listing', 'image', 'old-api/photo.jpg', 3) RETURNING "thumbHash"`);
    expect(created.rows).toEqual([{ thumbHash: null }]);
  });

  it("deploys the complete migration history safely to a fresh database", async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
      stdio: "pipe",
    });
    await insertLegacyRows();
    const column = await db.query(`SELECT is_nullable, data_type, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'listing_media' AND column_name = 'thumbHash'`);
    expect(column.rows).toEqual([{ is_nullable: "YES", data_type: "text", column_default: null }]);
    expect((await db.query('SELECT "thumbHash" FROM listing_media')).rows)
      .toEqual([{ thumbHash: null }, { thumbHash: null }, { thumbHash: null }]);
    // A second deployment is a no-op and preserves rows.
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
      stdio: "pipe",
    });
    expect((await db.query("SELECT count(*)::int AS count FROM listing_media")).rows).toEqual([{ count: 3 }]);
  });
});
