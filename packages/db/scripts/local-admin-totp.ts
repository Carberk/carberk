#!/usr/bin/env tsx
// Captured by admin:access for private handoff. Local read only; grants no access.
import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { parse } from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client/client";
import { runLocalAdminTotp } from "../src/local-admin-totp";
import purposes from "../src/local-admin-totp-purposes.json";

function apiEncryptionKey(): string | undefined {
  const fromEnv = process.env["TOTP_SECRET_ENCRYPTION_KEY"];
  if (fromEnv) return fromEnv;
  const apiEnv = resolve(__dirname, "../../../apps/api/.env");
  return existsSync(apiEnv) ? parse(readFileSync(apiEnv))["TOTP_SECRET_ENCRYPTION_KEY"] : undefined;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const { values, tokens } = parseArgs({ args, tokens: true, options: { phone: { type: "string" }, purpose: { type: "string", default: "legacyAdmin" } } });
  const { phone, purpose } = values;
  if (!phone || !/^\+993\d{8}$/.test(phone) || typeof purpose !== "string" || !Object.hasOwn(purposes, purpose) || tokens.filter(token => token.kind === "option" && token.name === "purpose").length > 1) {
    console.error("Refusing: use an existing local phone and a supported explicit TOTP purpose (default legacyAdmin).");
    return 1;
  }

  const databaseUrl = process.env["DATABASE_URL"];
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await runLocalAdminTotp(
      {
        findUserByPhone: (value) =>
          prisma.user.findUnique({
            where: { phone: value },
            select: { id: true, role: true, phone: true, email: true, suspendedAt: true, deletionScheduledAt: true,
              staffGrants: { select: { purpose: true, grantedAt: true, revokedAt: true } },
              totpEnrollment: { select: { encryptedSecret: true, verifiedAt: true } } },
          }).then((user) => (user ? { ...user, enrollment: user.totpEnrollment } : null)),
      },
      { databaseUrl, keyBase64: apiEncryptionKey(), phone, purpose, now: new Date() },
    );
    if (result.exitCode === 0) console.log(result.code);
    console.error(result.message);
    return result.exitCode;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch(() => {
    console.error("Local TOTP unavailable: check arguments, selected local database/key and enrollment; raw diagnostics suppressed.");
    process.exit(1);
  });
