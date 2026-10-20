#!/usr/bin/env tsx
import "dotenv/config";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, type Prisma } from "../generated/prisma/client/client";
import { runPromoteAdmin, type PromoteAdminUser } from "../src/promote-admin";

// ECMAScript String.trim whitespace, also used for legacy stored-email matching.
const EMAIL_TRIM_CHARACTERS = " \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

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
      {
        // Lock before reading the role, including across phone/email invocations.
        // A waiter sees admin after commit, so it cannot overwrite before.role or audit twice.
        transaction: (work) => prisma.$transaction(async (tx) => work({
          findUserByPhone: async (phone) => {
            const users = await tx.$queryRaw<PromoteAdminUser[]>`
              SELECT "id", "role", "emailVerifiedAt" FROM "users"
              WHERE "phone" = ${phone} FOR UPDATE`;
            return users[0] ?? null;
          },
          findUsersByEmail: (email) => tx.$queryRaw<PromoteAdminUser[]>`
            SELECT "id", "role", "emailVerifiedAt" FROM "users"
            WHERE lower(btrim("email", ${EMAIL_TRIM_CHARACTERS})) = ${email}
            ORDER BY "id" LIMIT 2 FOR UPDATE`,
          updateUserRole: async (userId) => {
            await tx.user.update({ where: { id: userId }, data: { role: "admin" } });
          },
          createAuditLog: async (data) => {
            await tx.auditLog.create({
              data: { ...data, details: data.details as Prisma.InputJsonValue },
            });
          },
        })),
      },
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
