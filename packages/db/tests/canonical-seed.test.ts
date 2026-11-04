import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import { loadBrandLogoManifest } from "../scripts/brand-logos/manifest";
import { sha256Hex, type MasterProvider } from "../scripts/brand-logos/sources";
import { seedCanonicalBaseline } from "../src/canonical-seed";

const run = promisify(execFile);
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const BUCKET = "catalog-assets";
const TEST_TIMEOUT = 180_000;

describe("canonical baseline seed", () => {
  let postgres: StartedPostgreSqlContainer;
  let minio: StartedTestContainer;
  let db: PrismaClient;
  let s3: S3Client;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:16-alpine")
      .withUsername("auto_tm")
      .withPassword("auto_tm_pass")
      .withDatabase("auto_tm_test")
      .withCommand(["postgres", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off"])
      .start();
    await run(`${packageDir}node_modules/.bin/prisma`, ["migrate", "deploy"], {
      cwd: packageDir,
      env: { ...process.env, DATABASE_URL: postgres.getConnectionUri() },
    });

    minio = await new GenericContainer(
      "cgr.dev/chainguard/minio@sha256:4692462f35d97d7e82c30371d82f057703c5d9489bcae726010594c812f2d285",
    )
      .withEnvironment({ MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" })
      .withCommand(["server", "/data"])
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
      .start();

    const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
    s3 = new S3Client({
      endpoint,
      region: "us-east-1",
      credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
      forcePathStyle: true,
    });
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    db = new PrismaClient({ adapter: new PrismaPg(postgres.getConnectionUri()) });
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await db?.$disconnect();
    s3?.destroy();
    await minio?.stop();
    await postgres?.stop();
  });

  it("converges the approved reference counts and repeats without changing identities", async () => {
    const fullManifest = loadBrandLogoManifest();
    const master = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
    );
    const manifest = {
      ...fullManifest,
      entries: fullManifest.entries.map((entry) => ({ ...entry, sha256Master: sha256Hex(master) })),
    };
    const masters: MasterProvider = { load: async () => master };
    const first = await seedCanonicalBaseline({ db, s3, manifest, masters });
    const firstBrand = await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } });
    const firstCounts = await Promise.all([
      db.brand.count(),
      db.model.count(),
      db.generation.count(),
      db.color.count(),
      db.bodyType.count(),
      db.region.count(),
      db.city.count(),
      db.engineType.count(),
      db.transmission.count(),
      db.driveType.count(),
      db.exchangeRate.count(),
    ]);

    const model = await db.model.findFirstOrThrow({ where: { slug: "4runner" } });
    const generation = await db.generation.create({
      data: { modelId: model.id, nameRu: "Sixth", nameTk: "Sixth", nameEn: "Sixth", yearStart: 2025 },
    });
    const adminRate = await db.exchangeRate.update({
      where: { fromCurrency_toCurrency: { fromCurrency: "USD", toCurrency: "TMT" } },
      data: { rate: 99 },
    });
    await db.brand.update({ where: { slug: "bmw" }, data: { logoKey: "brands/bmw/v1700000000000/logo.png" } });

    const second = await seedCanonicalBaseline({ db, s3, manifest, masters });
    const secondBrand = await db.brand.findUniqueOrThrow({ where: { slug: "toyota" } });
    const secondCounts = await Promise.all([
      db.brand.count(),
      db.model.count(),
      db.generation.count(),
      db.color.count(),
      db.bodyType.count(),
      db.region.count(),
      db.city.count(),
      db.engineType.count(),
      db.transmission.count(),
      db.driveType.count(),
      db.exchangeRate.count(),
    ]);

    expect(firstCounts).toEqual([130, 2420, 0, 15, 10, 6, 35, 6, 4, 4, 2]);
    expect(secondCounts).toEqual([130, 2420, 1, 15, 10, 6, 35, 6, 4, 4, 2]);
    expect(first.results).toHaveLength(130);
    expect(first.results.every((result) => result.outcome === "imported")).toBe(true);
    expect(second.results).toHaveLength(130);
    expect(second.results.filter((result) => result.outcome === "unchanged")).toHaveLength(129);
    expect(second.results.find((result) => result.slug === "bmw")?.outcome).toBe("skipped-admin");
    expect(secondBrand.id).toBe(firstBrand.id);
    expect(secondBrand.logoKey).toBe(firstBrand.logoKey);
    expect(await db.generation.findUniqueOrThrow({ where: { id: generation.id } })).toMatchObject({ yearStart: 2025 });
    expect(await db.exchangeRate.findUniqueOrThrow({ where: { id: adminRate.id } })).toMatchObject({ rate: 99 });
    expect(await db.brand.findUniqueOrThrow({ where: { slug: "bmw" } })).toMatchObject({ logoKey: "brands/bmw/v1700000000000/logo.png" });
    expect(firstBrand.logoKey).toMatch(/^brands\/toyota\/imp-[0-9a-f]{12}-[0-9a-f-]+\/logo\.png$/);
  }, TEST_TIMEOUT);
});
