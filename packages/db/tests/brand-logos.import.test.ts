import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Pool } from "pg";
import sharp from "sharp";
import { siBmw, siToyota } from "simple-icons";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import {
  IMPORT_VERSION_PREFIX,
  formatCoverageReport,
  importVersion,
  importBrandLogos,
  type ImportReport,
} from "../scripts/brand-logos/import";
import type { BrandLogoManifest, ManifestEntry, SourcedLogoEntry } from "../scripts/brand-logos/manifest";
import { sha256Hex, type MasterProvider } from "../scripts/brand-logos/sources";

import { createTestPool } from "./testing/create-test-pool";

const BUCKET = "catalog-assets";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IMPORTED_FILES = ["logo.png", "mono@1x.png", "mono@2x.png", "mono@3x.png"];
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const enc = (text: string) => new TextEncoder().encode(text);

const ZAZ_SVG = enc(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ffffff"/><circle cx="5" cy="5" r="4" fill="#1040c0"/></svg>',
);

/** Masters the fake provider hands out, keyed by slug. Checksums are still verified by the importer. */
function providerFor(masters: Record<string, Uint8Array>): MasterProvider {
  return {
    async load(entry) {
      const bytes = masters[entry.slug];
      if (!bytes) throw new Error(`no fixture master for ${entry.slug}`);
      return bytes;
    },
  };
}

const simpleIconsEntry = (slug: string, tier: "A" | "B" | "C", svg: string): SourcedLogoEntry => ({
  slug,
  tier,
  source: "simple-icons",
  simpleIconsSlug: slug,
  simpleIconsVersion: "16.33.0",
  sourceUrl: `https://github.com/simple-icons/simple-icons/blob/16.33.0/icons/${slug}.svg`,
  upstreamSource: null,
  licence: "CC0-1.0",
  licenceUrl: "https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md",
  trademark: "test",
  retrievedAt: "2026-09-30",
  sha256Master: sha256Hex(enc(svg)),
  transform: "alpha",
});

const zazEntry = (): SourcedLogoEntry => ({
  slug: "zaz",
  tier: "C",
  source: "commons",
  commonsFile: "File:Zaz-logo.svg",
  pageRevisionId: 1,
  sourceUrl: "https://commons.wikimedia.org/w/index.php?title=File:Zaz-logo.svg&oldid=1",
  downloadUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Zaz-logo.svg",
  licence: "PD-textlogo",
  licenceUrl: "https://commons.wikimedia.org/wiki/Template:PD-textlogo",
  trademark: "test",
  retrievedAt: "2026-09-30",
  sha256Master: sha256Hex(ZAZ_SVG),
  transform: "luminance",
});

const noSource = (slug: string, tier: "A" | "F"): ManifestEntry => ({
  slug,
  tier,
  source: null,
  reason: "no lawful file",
});

function manifestOf(...entries: ManifestEntry[]): BrandLogoManifest {
  return { schemaVersion: 1, entries };
}

const baseManifest = () =>
  manifestOf(
    simpleIconsEntry("toyota", "A", siToyota.svg),
    simpleIconsEntry("bmw", "A", siBmw.svg),
    zazEntry(),
    noSource("kia", "A"),
    noSource("kuba", "F"),
  );

const baseMasters = (): Record<string, Uint8Array> => ({
  toyota: enc(siToyota.svg),
  bmw: enc(siBmw.svg),
  zaz: ZAZ_SVG,
});

describe("brand logo import — Testcontainers Postgres and MinIO", () => {
  let postgres: StartedPostgreSqlContainer;
  let minio: StartedTestContainer;
  let pool: Pool;
  let db: PrismaClient;
  let s3: S3Client;

  beforeAll(async () => {
    [postgres, minio] = await Promise.all([
      new PostgreSqlContainer("postgres:16-alpine")
        .withUsername("auto_tm")
        .withPassword("auto_tm_pass")
        .withDatabase("auto_tm_test")
        .start(),
      new GenericContainer("cgr.dev/chainguard/minio@sha256:4692462f35d97d7e82c30371d82f057703c5d9489bcae726010594c812f2d285")
        .withEnvironment({ MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" })
        .withCommand(["server", "/data"])
        .withExposedPorts(9000)
        .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
        .start(),
    ]);

    const url = postgres.getConnectionUri();
    execSync("pnpm prisma migrate deploy", {
      cwd: packageDir,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    pool = createTestPool(url);
    db = new PrismaClient({ adapter: new PrismaPg(pool) });

    s3 = new S3Client({
      endpoint: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
      region: "us-east-1",
      credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
      forcePathStyle: true,
    });
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }, 180_000);

  afterAll(async () => {
    await db?.$disconnect();
    await pool?.end();
    s3?.destroy();
    await postgres?.stop();
    await minio?.stop();
  });

  beforeEach(async () => {
    await db.brand.deleteMany();
    const keys = await listKeys();
    if (keys.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
    for (const slug of ["toyota", "bmw", "zaz", "kia", "kuba"]) {
      await db.brand.create({
        data: { id: slug, slug, nameRu: slug, nameTk: slug, nameEn: slug },
      });
    }
  });

  async function listKeys(prefix = ""): Promise<string[]> {
    const out = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
    return (out.Contents ?? []).map((o) => o.Key as string).sort();
  }

  async function snapshot() {
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET }));
    const objects = (listed.Contents ?? [])
      .map((o) => `${o.Key}|${o.ETag}|${o.LastModified?.toISOString()}`)
      .sort();
    const brands = await db.brand.findMany({ orderBy: { slug: "asc" } });
    return { objects, brands };
  }

  function run(
    options: { dryRun?: boolean; force?: boolean } = {},
    manifest = baseManifest(),
    masters = baseMasters(),
  ): Promise<ImportReport> {
    return importBrandLogos(
      { db, s3, bucket: BUCKET, manifest, masters: providerFor(masters) },
      { dryRun: options.dryRun ?? false, force: options.force ?? false },
    );
  }

  const outcomes = (report: ImportReport) =>
    Object.fromEntries(report.results.map((r) => [r.slug, r.outcome]));
  const outcomeOf = (report: ImportReport, slug: string) =>
    report.results.find((r) => r.slug === slug)?.outcome;

  async function objectPng(key: string) {
    const got = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = Buffer.from(await (got.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray());
    return { bytes, contentType: got.ContentType, cacheControl: got.CacheControl };
  }

  it("stores 30, 60 and 90 px transparent PNGs under a versioned key and sets Brand.logoKey", async () => {
    const report = await run();
    expect(outcomes(report)).toMatchObject({
      toyota: "imported",
      bmw: "imported",
      zaz: "imported",
      kia: "no-source",
      kuba: "no-source",
    });

    const toyota = await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } });
    const pattern = new RegExp(`^brands/toyota/${IMPORT_VERSION_PREFIX}[0-9a-f]{12}-${UUID}/logo\\.png$`);
    expect(toyota.logoKey).toMatch(pattern);
    const dir = (toyota.logoKey as string).replace(/logo\.png$/, "");
    expect(await listKeys("brands/toyota/")).toEqual(
      ["logo.png", "mono@1x.png", "mono@2x.png", "mono@3x.png"].map((f) => `${dir}${f}`),
    );

    for (const [file, size] of [
      ["mono@1x.png", 30],
      ["mono@2x.png", 60],
      ["mono@3x.png", 90],
      ["logo.png", 90],
    ] as const) {
      const { bytes, contentType, cacheControl } = await objectPng(`${dir}${file}`);
      const meta = await sharp(bytes).metadata();
      expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(["png", size, size, true]);
      expect(contentType).toBe("image/png");
      expect(cacheControl).toContain("immutable");
    }

    // Untouched brands keep a null key, and no SVG is ever stored or served.
    expect((await db.brand.findUniqueOrThrow({ where: { slug: "kia" } })).logoKey).toBeNull();
    expect((await listKeys()).some((k) => k.endsWith(".svg"))).toBe(false);
  });

  it("changes nothing when it runs a second time", async () => {
    await run();
    const before = await snapshot();
    const second = await run();
    const after = await snapshot();

    expect(after).toEqual(before);
    expect(outcomes(second)).toMatchObject({
      toyota: "unchanged",
      bmw: "unchanged",
      zaz: "unchanged",
    });
  });

  it("keeps every active object when two imports race from the same snapshot", async () => {
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const masters: MasterProvider = {
      async load() {
        if (++arrivals === 2) release();
        await barrier;
        return enc(siToyota.svg);
      },
    };
    const deps = {
      db, s3, bucket: BUCKET,
      manifest: manifestOf(simpleIconsEntry("toyota", "A", siToyota.svg)),
      masters,
    };
    const reports = await Promise.all([
      importBrandLogos(deps, { dryRun: false, force: false }),
      importBrandLogos(deps, { dryRun: false, force: false }),
    ]);

    expect(reports.map((report) => outcomeOf(report, "toyota")).sort()).toEqual(["failed", "imported"]);
    const brand = await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } });
    const directory = (brand.logoKey as string).replace("logo.png", "");
    for (const file of ["logo.png", "mono@1x.png", "mono@2x.png", "mono@3x.png"]) {
      await expect(s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: `${directory}${file}` }))).resolves.toBeDefined();
    }
  });

  it("restores the same content into a new directory, so a late cleanup of the old one cannot reach it", async () => {
    const entryA = simpleIconsEntry("toyota", "A", siToyota.svg);
    const manifestA = manifestOf(entryA);
    const manifestB = manifestOf(simpleIconsEntry("toyota", "A", siBmw.svg));
    await run({}, manifestA, { toyota: enc(siToyota.svg) });
    const keyA = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;
    await run({}, manifestB, { toyota: enc(siBmw.svg) });

    const restoring = await run({}, manifestA, { toyota: enc(siToyota.svg) });

    expect(outcomeOf(restoring, "toyota")).toBe("replaced-import");
    const keyA2 = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;
    expect(keyA2).not.toBe(keyA);
    expect(keyA2).toMatch(new RegExp(`^brands/toyota/${importVersion(entryA)}-${UUID}/logo\\.png$`));
    // Retained: an admin's delayed deletion of keyA's directory can only touch keyA.
    await expectDirectory(keyA, true);
    await expectDirectory(keyA2, true);
  });

  async function expectDirectory(key: string, present: boolean) {
    const directory = key.replace("logo.png", "");
    for (const file of IMPORTED_FILES) {
      const found = await s3
        .send(new HeadObjectCommand({ Bucket: BUCKET, Key: `${directory}${file}` }))
        .then(() => true, () => false);
      expect(found, `${directory}${file}`).toBe(present);
    }
  }

  /** What an admin's cleanup does, started now and finished later: list the directory, then delete it. */
  function delayedDirectoryDeletion(directory: string) {
    const client = new S3Client({
      endpoint: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
      region: "us-east-1",
      credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
      forcePathStyle: true,
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const listed = (async () => {
      const page = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: directory }));
      return (page.Contents ?? []).map((o) => o.Key as string);
    })();
    const finished = (async () => {
      const keys = await listed;
      await released;
      if (keys.length > 0) {
        await client.send(
          new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }),
        );
      }
      client.destroy();
    })();
    return { listed, release, finished };
  }

  it("keeps a new import of identical content intact while an admin's cleanup of the removed directory is delayed", async () => {
    const manifest = manifestOf(simpleIconsEntry("toyota", "A", siToyota.svg));
    const masters = { toyota: enc(siToyota.svg) };
    await run({}, manifest, masters);
    const removed = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;

    // Admin removal: the key is cleared in the database, cleanup lists the directory but has not deleted yet.
    await db.brand.update({ where: { slug: "toyota" }, data: { logoKey: null } });
    const cleanup = delayedDirectoryDeletion(removed.replace("logo.png", ""));
    await cleanup.listed;

    const report = await run({}, manifest, masters);
    const activated = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;
    expect(outcomeOf(report, "toyota")).toBe("imported");
    expect(activated).not.toBe(removed);

    cleanup.release();
    await cleanup.finished;

    await expectDirectory(removed, false);
    await expectDirectory(activated, true);
    expect((await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey).toBe(activated);
  });

  it("activates the same content twice in a row under two distinct directories", async () => {
    const manifest = manifestOf(simpleIconsEntry("toyota", "A", siToyota.svg));
    const masters = { toyota: enc(siToyota.svg) };
    await run({}, manifest, masters);
    const first = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;
    await db.brand.update({ where: { slug: "toyota" }, data: { logoKey: null } });

    await run({}, manifest, masters);
    const second = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;

    expect(second).not.toBe(first);
    expect(first.split("/")[2]?.slice(0, 16)).toBe(second.split("/")[2]?.slice(0, 16));
    await expectDirectory(first, true);
    await expectDirectory(second, true);
  });

  describe("a legacy deterministic active directory", () => {
    const entry = () => simpleIconsEntry("toyota", "A", siToyota.svg);
    const legacyDirectory = () => `brands/toyota/${importVersion(entry())}/`;

    async function activateLegacy(files = IMPORTED_FILES) {
      const body = await sharp({
        create: { width: 90, height: 90, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
      }).png().toBuffer();
      for (const file of files) {
        await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `${legacyDirectory()}${file}`, Body: body }));
      }
      await db.brand.update({ where: { slug: "toyota" }, data: { logoKey: `${legacyDirectory()}logo.png` } });
    }

    it("stays idempotent and is repaired in place without touching the database", async () => {
      await activateLegacy(["logo.png", "mono@1x.png", "mono@3x.png"]);
      const before = await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } });

      const report = await run({}, manifestOf(entry()), { toyota: enc(siToyota.svg) });

      expect(outcomeOf(report, "toyota")).toBe("unchanged");
      const after = await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } });
      expect(after.logoKey).toBe(before.logoKey);
      expect(after.updatedAt).toEqual(before.updatedAt);
      await expectDirectory(`${legacyDirectory()}logo.png`, true);
      expect(await listKeys("brands/toyota/")).toHaveLength(4);
    });

    it("is replaced by a new unique directory when its content changes, and is retained", async () => {
      await activateLegacy();
      const changed = manifestOf(simpleIconsEntry("toyota", "A", siBmw.svg));

      const report = await run({}, changed, { toyota: enc(siBmw.svg) });

      expect(outcomeOf(report, "toyota")).toBe("replaced-import");
      const key = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;
      expect(key).toMatch(new RegExp(`^brands/toyota/${IMPORT_VERSION_PREFIX}[0-9a-f]{12}-${UUID}/logo\\.png$`));
      await expectDirectory(`${legacyDirectory()}logo.png`, true);
    });

    it("is activated again with identical content only under a new UUID directory", async () => {
      await activateLegacy();
      await db.brand.update({ where: { slug: "toyota" }, data: { logoKey: null } });

      await run({}, manifestOf(entry()), { toyota: enc(siToyota.svg) });

      const key = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;
      expect(key).not.toBe(`${legacyDirectory()}logo.png`);
      expect(key).toMatch(new RegExp(`-${UUID}/logo\\.png$`));
    });
  });

  describe("brand renames", () => {
    it("recognizes imported ownership from the stored key after the brand was renamed", async () => {
      const entry = simpleIconsEntry("toyota", "A", siToyota.svg);
      await run({}, manifestOf(entry), { toyota: enc(siToyota.svg) });
      const oldKey = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;
      await db.brand.update({ where: { slug: "toyota" }, data: { slug: "toyota-new" } });
      const renamed = simpleIconsEntry("toyota-new", "A", siBmw.svg);

      const report = await run({}, manifestOf(renamed), { "toyota-new": enc(siBmw.svg) });

      // Not skipped as an admin upload: the key itself says it was imported.
      expect(outcomeOf(report, "toyota-new")).toBe("replaced-import");
      const key = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota-new" } })).logoKey as string;
      expect(key).toMatch(new RegExp(`^brands/toyota-new/${IMPORT_VERSION_PREFIX}`));
      await expectDirectory(oldKey, true);
    });

    it("repairs the stored directory of a renamed brand and never writes Brand.logoKey", async () => {
      const entry = simpleIconsEntry("toyota", "A", siToyota.svg);
      await run({}, manifestOf(entry), { toyota: enc(siToyota.svg) });
      const before = await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } });
      const missing = (before.logoKey as string).replace("logo.png", "mono@1x.png");
      await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: [{ Key: missing }] } }));
      await db.brand.update({ where: { slug: "toyota" }, data: { slug: "toyota-new" } });
      const renamedBefore = await db.brand.findUniqueOrThrow({ where: { slug: "toyota-new" } });

      const report = await run({}, manifestOf(simpleIconsEntry("toyota-new", "A", siToyota.svg)), {
        "toyota-new": enc(siToyota.svg),
      });

      expect(outcomeOf(report, "toyota-new")).toBe("unchanged");
      await expect(s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: missing }))).resolves.toBeDefined();
      const after = await db.brand.findUniqueOrThrow({ where: { slug: "toyota-new" } });
      expect(after.logoKey).toBe(before.logoKey);
      expect(after.updatedAt).toEqual(renamedBefore.updatedAt);
      expect(await listKeys("brands/toyota-new/")).toEqual([]);
    });

    it("rejects an entry whose brand was renamed after the run took its snapshot, writing nothing", async () => {
      const manifest = manifestOf(
        simpleIconsEntry("bmw", "A", siBmw.svg),
        simpleIconsEntry("toyota", "A", siToyota.svg),
      );
      const masters: MasterProvider = {
        async load(entry) {
          // bmw is processed first; renaming toyota here makes its snapshot row stale.
          if (entry.slug === "bmw") {
            await db.brand.update({ where: { slug: "toyota" }, data: { slug: "toyota-new" } });
            return enc(siBmw.svg);
          }
          return enc(siToyota.svg);
        },
      };

      const report = await importBrandLogos(
        { db, s3, bucket: BUCKET, manifest, masters },
        { dryRun: false, force: false },
      );

      expect(outcomeOf(report, "bmw")).toBe("imported");
      expect(outcomeOf(report, "toyota")).toBe("failed");
      expect((await db.brand.findUniqueOrThrow({ where: { slug: "toyota-new" } })).logoKey).toBeNull();
      expect(await listKeys("brands/toyota/")).toEqual([]);
      expect(await listKeys("brands/toyota-new/")).toEqual([]);
    });

    it("refuses to activate a directory when the brand is renamed during the upload", async () => {
      const manifest = manifestOf(simpleIconsEntry("toyota", "A", siToyota.svg));
      let renamed = false;
      s3.middlewareStack.add((next, context) => async (args) => {
        if (context.commandName === "PutObjectCommand" && !renamed) {
          renamed = true;
          await db.brand.update({ where: { slug: "toyota" }, data: { slug: "toyota-new" } });
        }
        return next(args);
      }, { step: "initialize", name: "renameDuringUpload" });
      let report: ImportReport;
      try {
        report = await run({}, manifest, { toyota: enc(siToyota.svg) });
      } finally {
        s3.middlewareStack.remove("renameDuringUpload");
      }

      expect(outcomeOf(report, "toyota")).toBe("failed");
      const brand = await db.brand.findUniqueOrThrow({ where: { slug: "toyota-new" } });
      expect(brand.logoKey).toBeNull();
      // The losing upload is retained under the slug it was written for (no importer GC).
      expect(await listKeys("brands/toyota/")).toHaveLength(4);
    });
  });

  it("cannot reactivate a removed directory when a late repair recreates files in it", async () => {
    const manifest = manifestOf(simpleIconsEntry("toyota", "A", siToyota.svg));
    const masters = { toyota: enc(siToyota.svg) };
    await run({}, manifest, masters);
    const removed = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;
    const removedDirectory = removed.replace("logo.png", "");
    let adminRemoved = false;
    s3.middlewareStack.add((next, context) => async (args) => {
      // Admin removal lands between the importer's fresh read and its first repair HEAD.
      if (context.commandName === "HeadObjectCommand" && !adminRemoved) {
        adminRemoved = true;
        await db.brand.update({ where: { slug: "toyota" }, data: { logoKey: null } });
        const keys = await listKeys(removedDirectory);
        await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
      }
      return next(args);
    }, { step: "initialize", name: "adminRemovalDuringRepair" });
    try {
      await run({}, manifest, masters);
    } finally {
      s3.middlewareStack.remove("adminRemovalDuringRepair");
    }

    // Accepted limitation: the late repair recreated inactive files...
    await expectDirectory(removed, true);
    // ...but it never wrote the key, so the removed directory is not active again.
    expect((await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey).toBeNull();
    await run({}, manifest, masters);
    const fresh = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;
    expect(fresh).not.toBe(removed);
  });

  it("converges on rerun after a lost compare-and-swap, without deleting the loser's objects", async () => {
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const masters: MasterProvider = {
      async load() {
        if (++arrivals === 2) release();
        await barrier;
        return enc(siToyota.svg);
      },
    };
    const deps = {
      db, s3, bucket: BUCKET,
      manifest: manifestOf(simpleIconsEntry("toyota", "A", siToyota.svg)),
      masters,
    };
    // Both imports must pass the fresh read before either upload can finish.
    // A barrier only at master loading lets the faster render activate first,
    // so the second import legitimately refuses before uploading anything.
    const directories = new Set<string>();
    let releaseUploads!: () => void;
    // If the second import never reaches an upload, fail with the cause instead of waiting for the
    // suite's 120 s test timeout, which would only say the test hung.
    const uploadsReady = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Upload barrier timed out after 15 s: the two imports did not both reach their first upload, so the lost compare-and-swap was never set up")),
        15_000,
      );
      releaseUploads = () => { clearTimeout(timer); resolve(); };
    });
    uploadsReady.catch(() => undefined); // a rejection is still delivered to each awaiting upload below
    s3.middlewareStack.add((next, context) => async (args) => {
      if (context.commandName === "PutObjectCommand") {
        const key = (args.input as { Key?: string }).Key ?? "";
        directories.add(key.slice(0, key.lastIndexOf("/")));
        if (directories.size === 2) releaseUploads();
        await uploadsReady;
      }
      return next(args);
    }, { step: "initialize", name: "bothImportsPastFreshRead" });
    try {
      await Promise.all([
        importBrandLogos(deps, { dryRun: false, force: false }),
        importBrandLogos(deps, { dryRun: false, force: false }),
      ]);
    } finally {
      s3.middlewareStack.remove("bothImportsPastFreshRead");
    }
    const winner = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;
    const beforeRerun = await listKeys("brands/toyota/");
    expect(beforeRerun).toHaveLength(8);

    const rerun = await run({}, manifestOf(simpleIconsEntry("toyota", "A", siToyota.svg)), { toyota: enc(siToyota.svg) });

    expect(outcomeOf(rerun, "toyota")).toBe("unchanged");
    expect((await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey).toBe(winner);
    expect(await listKeys("brands/toyota/")).toEqual(beforeRerun);
  });

  it("reports individual cleanup errors while preserving the successful replacement", async () => {
    const previous = "brands/toyota/v1790000000000/logo.png";
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: previous, Body: "admin-upload" }));
    await db.brand.update({ where: { slug: "toyota" }, data: { logoKey: previous } });
    s3.middlewareStack.add((next, context) => async (args) => {
      if (context.commandName === "DeleteObjectsCommand") {
        return {
          response: {},
          output: { $metadata: {}, Errors: [{ Key: previous, Code: "AccessDenied", Message: "cleanup denied" }] },
        };
      }
      return next(args);
    }, { step: "initialize", name: "cleanupErrorFixture" });
    try {
      const report = await run({ force: true }, manifestOf(simpleIconsEntry("toyota", "A", siBmw.svg)), { toyota: enc(siBmw.svg) });
      const result = report.results.find((r) => r.slug === "toyota");
      expect(result?.outcome).toBe("replaced-admin");
      expect(result?.detail).toContain(previous);
      expect(result?.detail).toContain("AccessDenied");
      expect(result?.detail).toContain("cleanup denied");
      const brand = await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } });
      expect(brand.logoKey).toBe(result?.logoKeyAfter);
      expect(brand.logoKey).not.toBe(previous);
      await expect(s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: brand.logoKey as string }))).resolves.toBeDefined();
    } finally {
      s3.middlewareStack.remove("cleanupErrorFixture");
    }
  });

  it("deletes a previous admin version of any size in batches of at most 1000 keys", async () => {
    const directory = "brands/toyota/v1790000000000-0f8fad5b-d9cb-469f-a165-70867728950e/";
    const previous = `${directory}logo.png`;
    const keys = [previous, ...Array.from({ length: 1_100 }, (_, i) => `${directory}extra-${i}.png`)];
    for (let i = 0; i < keys.length; i += 50) {
      await Promise.all(
        keys.slice(i, i + 50).map((Key) => s3.send(new PutObjectCommand({ Bucket: BUCKET, Key, Body: "x" }))),
      );
    }
    await db.brand.update({ where: { slug: "toyota" }, data: { logoKey: previous } });
    const batches: number[] = [];
    s3.middlewareStack.add((next, context) => async (args) => {
      if (context.commandName === "DeleteObjectsCommand") {
        batches.push((args.input as { Delete: { Objects: unknown[] } }).Delete.Objects.length);
      }
      return next(args);
    }, { step: "initialize", name: "batchSizes" });
    try {
      const report = await run({ force: true }, manifestOf(simpleIconsEntry("toyota", "A", siToyota.svg)), {
        toyota: enc(siToyota.svg),
      });
      expect(outcomeOf(report, "toyota")).toBe("replaced-admin");
      expect(report.results.find((r) => r.slug === "toyota")?.detail).toBeUndefined();
    } finally {
      s3.middlewareStack.remove("batchSizes");
    }

    expect(Math.max(...batches)).toBeLessThanOrEqual(1_000);
    expect(batches.reduce((sum, n) => sum + n, 0)).toBe(keys.length);
    expect(await listKeys(directory)).toEqual([]);
  }, 180_000);

  it("restores a missing object without touching the database", async () => {
    await run();
    const toyota = await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } });
    const key = (toyota.logoKey as string).replace("logo.png", "mono@2x.png");
    await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: [{ Key: key }] } }));

    const report = await run();

    expect(outcomeOf(report, "toyota")).toBe("unchanged");
    await expect(s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))).resolves.toBeDefined();
    const after = await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } });
    expect(after.updatedAt).toEqual(toyota.updatedAt);
  });

  describe("a logo an admin already uploaded", () => {
    const adminKey = "brands/toyota/v1790000000000/logo.png";
    const adminBytes = Buffer.from("admin-upload");

    beforeEach(async () => {
      await s3.send(
        new PutObjectCommand({ Bucket: BUCKET, Key: adminKey, Body: adminBytes, ContentType: "image/png" }),
      );
      await db.brand.update({ where: { slug: "toyota" }, data: { logoKey: adminKey } });
    });

    it("is not overwritten without --force", async () => {
      const report = await run();

      expect(outcomeOf(report, "toyota")).toBe("skipped-admin");
      expect(outcomeOf(report, "bmw")).toBe("imported");
      const toyota = await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } });
      expect(toyota.logoKey).toBe(adminKey);
      expect((await objectPng(adminKey)).bytes.equals(adminBytes)).toBe(true);
      expect(await listKeys("brands/toyota/")).toEqual([adminKey]);
    });

    it("is replaced with --force, and the admin's object is deleted", async () => {
      const report = await run({ force: true });

      expect(outcomeOf(report, "toyota")).toBe("replaced-admin");
      const toyota = await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } });
      expect(toyota.logoKey).toMatch(new RegExp(`^brands/toyota/${IMPORT_VERSION_PREFIX}`));
      const keys = await listKeys("brands/toyota/");
      expect(keys).not.toContain(adminKey);
      expect(keys).toHaveLength(4);
    });

    it("counts as a logo in the coverage report even though the import skipped it", async () => {
      const report = await run();
      const tierA = report.coverage.find((c) => c.tier === "A");
      expect(tierA).toMatchObject({ total: 3, withLogo: 2, letterFallback: 1 });
    });
  });

  it("replaces an earlier import when the manifest's master changes, and retains immutable versions", async () => {
    await run();
    const first = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;

    const changed = manifestOf(
      simpleIconsEntry("toyota", "A", siBmw.svg),
      simpleIconsEntry("bmw", "A", siBmw.svg),
      zazEntry(),
      noSource("kia", "A"),
      noSource("kuba", "F"),
    );
    const report = await run({}, changed, { ...baseMasters(), toyota: enc(siBmw.svg) });

    expect(outcomeOf(report, "toyota")).toBe("replaced-import");
    expect(outcomeOf(report, "bmw")).toBe("unchanged");
    const second = (await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey as string;
    expect(second).not.toBe(first);
    const keys = await listKeys("brands/toyota/");
    expect(keys).toHaveLength(8);
    for (const versionKey of [first, second]) {
      expect(keys.filter((k) => k.startsWith(versionKey.replace("logo.png", "")))).toHaveLength(4);
    }
    const beforeRepeat = await snapshot();
    expect(outcomeOf(await run({}, changed, { ...baseMasters(), toyota: enc(siBmw.svg) }), "toyota")).toBe("unchanged");
    expect(await snapshot()).toEqual(beforeRepeat);
  });

  it("leaves the database and the bucket alone on a dry run, but still reports what would happen", async () => {
    const before = await snapshot();
    const report = await run({ dryRun: true });
    expect(await snapshot()).toEqual(before);

    expect(report.dryRun).toBe(true);
    expect(outcomes(report)).toMatchObject({ toyota: "imported", bmw: "imported", zaz: "imported" });
    const toyota = report.results.find((r) => r.slug === "toyota");
    expect(toyota?.logoKeyAfter).toMatch(new RegExp(`^brands/toyota/${IMPORT_VERSION_PREFIX}`));
    expect(report.coverage.find((c) => c.tier === "A")).toMatchObject({ withLogo: 2 });
  });

  it("still checks the checksum on a dry run", async () => {
    const report = await run({ dryRun: true }, baseManifest(), { ...baseMasters(), bmw: enc("<svg/>") });
    expect(outcomeOf(report, "bmw")).toBe("failed");
  });

  it("reports a checksum mismatch, writes nothing for that brand, and still imports the others", async () => {
    const tampered = enc(siToyota.svg.replace("<svg", "<svg data-tampered=\"1\""));
    const report = await run({}, baseManifest(), { ...baseMasters(), toyota: tampered });

    const toyota = report.results.find((r) => r.slug === "toyota");
    expect(toyota?.outcome).toBe("failed");
    expect(toyota?.detail).toMatch(/sha256/i);
    expect(outcomeOf(report, "bmw")).toBe("imported");
    expect((await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } })).logoKey).toBeNull();
    expect(await listKeys("brands/toyota/")).toEqual([]);
  });

  it("skips a manifest entry whose brand is not in the catalog", async () => {
    await db.brand.delete({ where: { slug: "zaz" } });
    const report = await run();
    expect(outcomeOf(report, "zaz")).toBe("not-in-catalog");
    expect(await listKeys("brands/zaz/")).toEqual([]);
  });

  it("never touches a brand that has no source, whatever its key", async () => {
    await db.brand.update({ where: { slug: "kia" }, data: { logoKey: "brands/kia/v1790000000000/logo.png" } });
    await run({ force: true });
    expect((await db.brand.findUniqueOrThrow({ where: { slug: "kia" } })).logoKey).toBe(
      "brands/kia/v1790000000000/logo.png",
    );
  });

  it("reports coverage by tier and prints the tier A to C total", async () => {
    const report = await run();
    expect(report.coverage.map((c) => [c.tier, c.total, c.withLogo, c.letterFallback])).toEqual([
      ["A", 3, 2, 1],
      ["B", 0, 0, 0],
      ["C", 1, 1, 0],
      ["D", 0, 0, 0],
      ["E", 0, 0, 0],
      ["F", 1, 0, 1],
    ]);

    const text = formatCoverageReport(report);
    expect(text).toMatch(/A\s+3\s+2\s+1/);
    expect(text).toMatch(/Tiers A-C: 3 of 4 brands have a logo \(1 letter fallback\)/);
  });
});
