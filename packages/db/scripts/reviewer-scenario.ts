#!/usr/bin/env tsx
import "dotenv/config";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client/client";
import { runReviewerScenarioSeed } from "../src/reviewer-scenario-seed";

import { PrismaReviewerScenarioSeedStore } from "./reviewer-scenario-store";

function parseArgs(argv: string[]): { mode: "seed" | "revoke" | null } {
  let mode: "seed" | "revoke" | null = "seed";

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--mode" && i + 1 < argv.length) {
      const rawMode = argv[++i];
      if (rawMode === "seed" || rawMode === "revoke") {
        mode = rawMode;
      } else {
        mode = null;
      }
    }
  }

  return { mode };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv);
  if (!args.mode) {
    console.error("Usage: tsx scripts/reviewer-scenario.ts [--mode seed|revoke]");
    return 1;
  }

  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const result = await runReviewerScenarioSeed(
      new PrismaReviewerScenarioSeedStore(prisma),
      {
        mode: args.mode,
        reviewDemoAccountsJson: process.env["REVIEW_DEMO_ACCOUNTS_JSON"] ?? "[]",
        env: {
          appEnv: process.env["APP_ENV"],
          authorization: process.env["REVIEWER_SCENARIO_SEED_AUTHORIZATION"],
          signupsEnabled: process.env["SIGNUPS_ENABLED"],
          reviewDemoAccountEnabled: process.env["REVIEW_DEMO_ACCOUNT_ENABLED"],
        },
        now: new Date(),
      },
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
