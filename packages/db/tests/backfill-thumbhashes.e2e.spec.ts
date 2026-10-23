import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type * as S3Sdk from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type * as Pg from "pg";
import sharp from "sharp";
import { thumbHashToAverageRGBA } from "thumbhash";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import { main } from "../scripts/backfill-thumbhashes";

const boundary = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  unexpectedStorageCommands: 0,
  beforeGet: undefined as ((key: string) => Promise<void>) | undefined,
  beforeQuery: undefined as ((sql: string, values: unknown[]) => Promise<void>) | undefined,
}));

vi.mock("@aws-sdk/client-s3", async (original) => ({ ...await original<typeof S3Sdk>(), S3Client: class {
  destroy() {}
  async send(command: unknown) {
    if (command instanceof ListObjectsV2Command) {
      const prefix = `${command.input.Bucket}/`;
      return { Contents: [...boundary.objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ Key: key.slice(prefix.length) })) };
    }
    if (command instanceof GetObjectCommand) {
      const key = `${command.input.Bucket}/${command.input.Key}`;
      await boundary.beforeGet?.(key);
      const bytes = boundary.objects.get(key);
      if (!bytes) throw new Error("NoSuchKey");
      return { Body: { transformToByteArray: async () => new Uint8Array(bytes) } };
    }
    // Any attempted object write fails the test.
    boundary.unexpectedStorageCommands += 1;
    throw new Error("Unexpected storage command");
  }
} }));

// Scheduling only: every statement and parameter reaches real PostgreSQL
// unchanged. No query result or predicate is simulated. Readback uses a separate,
// unwrapped connection obtained with importActual below.
vi.mock("pg", async (original) => {
  const actual = await original<typeof Pg>();
  return { ...actual, Pool: class {
    private readonly pool: Pg.Pool;
    constructor(options: Pg.PoolConfig) { this.pool = new actual.Pool(options); }
    async query(sql: string, values: unknown[] = []) {
      await boundary.beforeQuery?.(sql, values);
      return this.pool.query(sql, values);
    }
    async end() { await this.pool.end(); }
  } };
});

const DELETED = new Date("2026-10-14T12:00:00.000Z");
const HASH = "AAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("ThumbHash operator against migrated PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pg.Pool;
  let db: PrismaClient;
  let listingId: string;
  let conversationId: string;
  let sellerId: string;
  let buyerId: string;
  let photo: Buffer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").withDatabase("thumbhash_backfill_test").start();
    const databaseUrl = container.getConnectionUri();
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
    const actual = await vi.importActual<typeof Pg>("pg");
    pool = new actual.Pool({ connectionString: databaseUrl });
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("MINIO_ENDPOINT", "http://storage.invalid");
    vi.stubEnv("MINIO_ACCESS_KEY", "test");
    vi.stubEnv("MINIO_SECRET_KEY", "test");
    photo = await sharp({ create: { width: 20, height: 12, channels: 3, background: "#d04030" } }).webp().toBuffer();
    const seller = await db.user.create({ data: { role: "seller" } });
    const buyer = await db.user.create({ data: { role: "buyer" } });
    sellerId = seller.id; buyerId = buyer.id;
    const names = { nameRu: "Fixture", nameTk: "Fixture", nameEn: "Fixture" };
    const brand = await db.brand.create({ data: { slug: "thumbhash", ...names } });
    const model = await db.model.create({ data: { slug: "thumbhash", brandId: brand.id, ...names } });
    const region = await db.region.create({ data: { slug: "thumbhash", ...names } });
    const city = await db.city.create({ data: { slug: "thumbhash", regionId: region.id, ...names } });
    const listing = await db.listing.create({ data: { sellerId, brandId: brand.id, modelId: model.id, cityId: city.id, priceAmount: 100 } });
    listingId = listing.id;
    conversationId = (await db.conversation.create({ data: { listingId, sellerId, buyerId } })).id;
  });
  afterAll(async () => {
    await db?.$disconnect(); await pool?.end(); await container?.stop(); vi.unstubAllEnvs();
  });
  beforeEach(async () => {
    boundary.beforeGet = undefined; boundary.beforeQuery = undefined; boundary.objects.clear();
    boundary.unexpectedStorageCommands = 0;
    await db.message.deleteMany(); await db.listingMedia.deleteMany();
  });

  afterEach(() => { expect(boundary.unexpectedStorageCommands).toBe(0); });

  async function image(id: string, key = `${id}.webp`, senderId = sellerId) {
    boundary.objects.set(`chat-attachments/${key}`, photo);
    await db.message.create({ data: { id, conversationId, senderId, kind: "image", metadata: { key, caption: id } } });
  }
  async function read(id: string) {
    const result = await pool.query('SELECT "metadata", "deletedAt" FROM "messages" WHERE "id" = $1', [id]);
    return result.rows[0] as { metadata: Record<string, unknown>; deletedAt: Date | null };
  }
  function duringDownload(key: string, work: () => Promise<void>) {
    boundary.beforeGet = async (requested) => {
      if (requested !== `chat-attachments/${key}`) return;
      boundary.beforeGet = undefined;
      // The script awaits this external response until the independent commit
      // completes. This is an explicit barrier, with no timing assumption.
      await work();
    };
  }

  it("hashes live photos and Messages, preserves excluded rows and metadata, and is safe to rerun", async () => {
    boundary.objects.set("listing-photos/cover.webp", photo);
    await db.listingMedia.createMany({ data: [
      { id: "photo", listingId, kind: "image", key: "cover.webp", sortOrder: 0 },
      { id: "video", listingId, kind: "video", key: "video.mp4", sortOrder: 1 },
      { id: "hashed", listingId, kind: "image", key: "hashed.webp", sortOrder: 2, thumbHash: HASH },
    ] });
    await image("live"); await image("other", "other.webp", buyerId); await image("deleted");
    boundary.objects.set("chat-attachments/other.webp", await sharp({ create: { width: 20, height: 12, channels: 3, background: "#1078c8" } }).webp().toBuffer());
    await pool.query('UPDATE "messages" SET "deletedAt" = $1 WHERE "id" = $2', [DELETED, "deleted"]);
    await db.message.createMany({ data: [
      { id: "cover", conversationId, senderId: buyerId, kind: "post_ref", metadata: { listingId, coverMediaKey: "cover.webp", title: "Keep" } },
      { id: "foreign-cover", conversationId, senderId: buyerId, kind: "post_ref", metadata: { listingId: "another-listing", coverMediaKey: "cover.webp" } },
      { id: "message-text", conversationId, senderId: sellerId, kind: "text", metadata: { key: "unrelated.webp" } },
      { id: "existing", conversationId, senderId: sellerId, kind: "image", metadata: { key: "existing.webp", thumbHash: HASH, caption: "Keep" } },
    ] });
    await main(["apply"]);
    const media = await pool.query('SELECT "id", "thumbHash" FROM "listing_media" ORDER BY "id"');
    const hash = media.rows.find((row) => row.id === "photo")?.thumbHash as string;
    expect(Buffer.from(hash, "base64").length).toBeGreaterThanOrEqual(17);
    expect(Buffer.from(hash, "base64").length).toBeLessThanOrEqual(25);
    expect(media.rows).toContainEqual({ id: "video", thumbHash: null });
    expect(media.rows).toContainEqual({ id: "hashed", thumbHash: HASH });
    expect((await read("live")).metadata).toEqual({ key: "live.webp", caption: "live", thumbHash: hash });
    const otherHash = (await read("other")).metadata["thumbHash"] as string;
    expect(otherHash).not.toBe(hash);
    expect((await read("other")).metadata).toEqual({ key: "other.webp", caption: "other", thumbHash: otherHash });
    const red = thumbHashToAverageRGBA(Buffer.from(hash, "base64"));
    const blue = thumbHashToAverageRGBA(Buffer.from(otherHash, "base64"));
    expect(red.r).toBeCloseTo(208 / 255, 1);
    expect(red.g).toBeCloseTo(64 / 255, 1);
    expect(red.b).toBeCloseTo(48 / 255, 1);
    expect(blue.r).toBeCloseTo(16 / 255, 1);
    expect(blue.g).toBeCloseTo(120 / 255, 1);
    expect(blue.b).toBeCloseTo(200 / 255, 1);
    expect(await read("deleted")).toEqual({ deletedAt: DELETED, metadata: { key: "deleted.webp", caption: "deleted" } });
    expect((await read("cover")).metadata).toEqual({ listingId, coverMediaKey: "cover.webp", title: "Keep", coverThumbHash: hash });
    expect((await read("foreign-cover")).metadata).toEqual({ listingId: "another-listing", coverMediaKey: "cover.webp" });
    expect((await read("existing")).metadata).toEqual({ key: "existing.webp", thumbHash: HASH, caption: "Keep" });
    expect((await read("message-text")).metadata).toEqual({ key: "unrelated.webp" });
    const snapshot = await pool.query('SELECT "id", "metadata", "deletedAt" FROM "messages" ORDER BY "id"');
    await main(["apply"]);
    expect((await pool.query('SELECT "id", "metadata", "deletedAt" FROM "messages" ORDER BY "id"')).rows).toEqual(snapshot.rows);
    expect((await pool.query('SELECT "id", "thumbHash" FROM "listing_media" ORDER BY "id"')).rows).toEqual(media.rows);
  });

  it("leaves an image Message untouched when deleted during a successful download", async () => {
    await image("racing-image");
    duringDownload("racing-image.webp", async () => {
      await pool.query('UPDATE "messages" SET "deletedAt" = $1 WHERE "id" = $2', [DELETED, "racing-image"]);
    });
    await main(["apply"]);
    expect(await read("racing-image")).toEqual({ deletedAt: DELETED, metadata: { key: "racing-image.webp", caption: "racing-image" } });
  });

  it.each(["key", "thumbHash"] as const)("preserves a concurrent %s update during download", async (field) => {
    await image("changed");
    const value = field === "key" ? "replacement.webp" : HASH;
    duringDownload("changed.webp", async () => {
      await pool.query('UPDATE "messages" SET "metadata" = "metadata" || $1::jsonb WHERE "id" = $2', [JSON.stringify({ [field]: value }), "changed"]);
    });
    await main(["apply"]);
    expect((await read("changed")).metadata).toEqual({ key: "changed.webp", caption: "changed", [field]: value });
  });

  it("leaves a post_ref deleted after its fresh candidate read untouched at the actual UPDATE", async () => {
    await db.listingMedia.create({ data: { listingId, kind: "image", key: "cover.webp", sortOrder: 0, thumbHash: HASH } });
    const metadata = { listingId, coverMediaKey: "cover.webp", title: "Keep" };
    await db.message.create({ data: { id: "racing-cover", conversationId, senderId: buyerId, kind: "post_ref", metadata } });
    let reachedUpdate = false;
    boundary.beforeQuery = async (sql, values) => {
      if (!sql.startsWith('UPDATE "messages"') || values[1] !== "racing-cover") return;
      boundary.beforeQuery = undefined;
      reachedUpdate = true;
      await pool.query('UPDATE "messages" SET "deletedAt" = $1 WHERE "id" = $2', [DELETED, "racing-cover"]);
    };
    await main(["apply"]);
    expect(reachedUpdate).toBe(true);
    expect(await read("racing-cover")).toEqual({ deletedAt: DELETED, metadata });
  });

  it("skips a deleted missing original using the real stillReferenced query", async () => {
    await image("missing");
    duringDownload("missing.webp", async () => {
      await pool.query('UPDATE "messages" SET "deletedAt" = $1 WHERE "id" = $2', [DELETED, "missing"]);
      boundary.objects.delete("chat-attachments/missing.webp");
    });
    await expect(main(["apply"])).resolves.toBeUndefined();
    expect(await read("missing")).toEqual({ deletedAt: DELETED, metadata: { key: "missing.webp", caption: "missing" } });
  });

  it("refuses conversion leftovers without writing hashes", async () => {
    await image("jpeg", "original.jpg");
    await expect(main(["apply"])).rejects.toThrow(/conversion is not complete/);
    expect((await read("jpeg")).metadata).toEqual({ key: "original.jpg", caption: "jpeg" });
  });
});
