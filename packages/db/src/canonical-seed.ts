import "dotenv/config";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { S3Client } from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../generated/prisma/client/client";
import { importBrandLogos, type ImportReport } from "../scripts/brand-logos/import";
import type { BrandLogoManifest } from "../scripts/brand-logos/manifest";
import { loadBrandLogoManifest } from "../scripts/brand-logos/manifest";
import { createMasterProvider, type MasterProvider } from "../scripts/brand-logos/sources";

import { seedCatalog } from "./catalog-seed";

const LOGO_BUCKET = "catalog-assets";
const DEFAULT_REGION = "us-east-1";

export interface CanonicalSeedDeps {
  db: PrismaClient;
  s3: S3Client;
  manifest: BrandLogoManifest;
  masters: MasterProvider;
}

/** Seed the supported reference baseline and its complete logo manifest. */
export async function seedCanonicalBaseline(deps: CanonicalSeedDeps): Promise<ImportReport> {
  await seedCatalog(deps.db);
  const report = await importBrandLogos(
    {
      db: deps.db,
      s3: deps.s3,
      bucket: LOGO_BUCKET,
      manifest: deps.manifest,
      masters: deps.masters,
    },
    { dryRun: false, force: false },
  );
  const failed = report.results.filter((result) => result.outcome === "failed");
  if (failed.length > 0) {
    throw new Error(
      `Canonical baseline logo import failed for ${failed.map((result) => result.slug).join(", ")}`,
    );
  }
  return report;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the canonical baseline seed`);
  return value;
}

export async function runCanonicalSeedFromEnv(): Promise<ImportReport> {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const minioEndpoint = requiredEnv("MINIO_ENDPOINT");
  const accessKeyId = requiredEnv("MINIO_ACCESS_KEY");
  const secretAccessKey = requiredEnv("MINIO_SECRET_KEY");
  const pool = new Pool({ connectionString: databaseUrl });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  const s3 = new S3Client({
    endpoint: minioEndpoint,
    region: process.env["MINIO_REGION"] ?? DEFAULT_REGION,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  const cacheDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../node_modules/.cache/brand-logos",
  );

  try {
    return await seedCanonicalBaseline({
      db,
      s3,
      manifest: loadBrandLogoManifest(),
      masters: createMasterProvider({ cacheDir }),
    });
  } finally {
    await db.$disconnect();
    await pool.end();
    s3.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCanonicalSeedFromEnv()
    .then((report) => {
      const counts = new Map<string, number>();
      for (const result of report.results) {
        counts.set(result.outcome, (counts.get(result.outcome) ?? 0) + 1);
      }
      console.log(
        `Canonical baseline seeded logos: ${[...counts]
          .map(([outcome, count]) => `${outcome}: ${count}`)
          .join(", ")}`,
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
