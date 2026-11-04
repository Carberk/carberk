import "dotenv/config";

import { pathToFileURL } from "node:url";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client/client";

import { seedCatalog } from "./catalog-seed";

export async function runCatalogSeed(databaseUrl = process.env["DATABASE_URL"]): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    await seedCatalog(prisma);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCatalogSeed().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
