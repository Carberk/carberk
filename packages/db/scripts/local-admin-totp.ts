#!/usr/bin/env tsx
// Prints a local admin's current authenticator code. Refuses any database that is not on localhost.
// Usage: pnpm -s --filter @auto-tm/db admin:totp -- --phone +9936XXXXXXX
import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client/client";
import { runLocalAdminTotp } from "../src/local-admin-totp";

function apiEncryptionKey(): string | undefined {
  const fromEnv = process.env["TOTP_SECRET_ENCRYPTION_KEY"];
  if (fromEnv) return fromEnv;
  const apiEnv = resolve(__dirname, "../../../apps/api/.env");
  return existsSync(apiEnv) ? parse(readFileSync(apiEnv))["TOTP_SECRET_ENCRYPTION_KEY"] : undefined;
}

async function main(): Promise<number> {
  const phoneFlag = process.argv.indexOf("--phone");
  const phone = phoneFlag === -1 ? undefined : process.argv[phoneFlag + 1];
  if (!phone) {
    console.error("Usage: pnpm -s --filter @auto-tm/db admin:totp -- --phone <phone>");
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
            select: { id: true, role: true, totpEnrollment: { select: { encryptedSecret: true, verifiedAt: true } } },
          }).then((user) => (user ? { id: user.id, role: user.role, enrollment: user.totpEnrollment } : null)),
      },
      { databaseUrl, keyBase64: apiEncryptionKey(), phone, now: new Date() },
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
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
