#!/usr/bin/env tsx
import "dotenv/config";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client/client";
import { runPromoteAdmin } from "../src/promote-admin";
import { PrismaAdminPromotionStore } from "../src/PrismaAdminPromotionStore";

function parseArgs(argv: string[]) {
  let phone: string | undefined;
  let email: string | undefined;
  let reason: string | undefined;
  let dryRun = false;

  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--") continue; // pnpm's optional argument separator
    if (flag === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (flag !== "--phone" && flag !== "--email" && flag !== "--reason") {
      throw new Error(`Unknown argument: ${flag}`);
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (flag === "--phone") {
      if (phone !== undefined) throw new Error("Duplicate --phone");
      phone = value;
    } else if (flag === "--email") {
      if (email !== undefined) throw new Error("Duplicate --email");
      email = value;
    } else {
      if (reason !== undefined) throw new Error("Duplicate --reason");
      reason = value;
    }
  }

  return { phone, email, reason, dryRun };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv);

  if ((args.phone !== undefined) === (args.email !== undefined) || !args.reason) {
    console.error(
      "Usage: tsx scripts/promote-admin.ts (--phone <phone> | --email <email>) --reason <reason> [--dry-run]",
    );
    return 1;
  }

  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const result = await runPromoteAdmin(
      new PrismaAdminPromotionStore(prisma, process.env["AUTOTM_COMMIT_SHA"] ?? ""),
      { phone: args.phone, email: args.email, reason: args.reason, dryRun: args.dryRun },
    );

    console.log(result.message);
    return result.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
