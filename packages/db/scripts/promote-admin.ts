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
        transaction: (work) => prisma.$transaction(async (tx) => {
          // Local to this transaction. Ordinary Users need no campaign candidate;
          // reservation tracking requires the exact runtime SHA for promotion.
          await tx.$queryRaw`SELECT set_config('autotm.admin_promote_candidate', ${process.env["AUTOTM_COMMIT_SHA"] ?? ""}, true)`;
          const checkReservation = async (user: (PromoteAdminUser & { email: string | null }) | undefined) => {
            // Fixed synthetic address grammar yields one namespace, never a schema scan.
            const reservation = user?.email?.match(/^[a-z-]+\.([a-f0-9]{32})\.[a-f0-9]{12}@campaign897\.invalid$/);
            if (user && reservation) {
              const namespace = `cf_${reservation[1]}`;
              const [binding] = await tx.$queryRawUnsafe<{ valid: boolean }[]>(`
                SELECT EXISTS(SELECT 1 FROM "${namespace}".campaign_manifest m
                  JOIN "${namespace}".campaign_entities e ON e.user_id=$1 AND e.email=$2
                  WHERE m.delivery_version<>3 OR (m.profile='campaign897-full-v3' AND m.state='identities' AND m.candidate=$3)) AS valid`,
              user.id, user.email, process.env["AUTOTM_COMMIT_SHA"] ?? "");
              if (!binding?.valid) throw new Error("Campaign promotion binding refused");
            }
            return user ?? null;
          };
          return work({
            findUserByPhone: async (phone) => {
              const users = await tx.$queryRaw<(PromoteAdminUser & { email: string | null })[]>`
                SELECT "id", "role", "emailVerifiedAt", "email" FROM "users"
                WHERE "phone" = ${phone} FOR UPDATE`;
              return checkReservation(users[0]);
            },
            findUsersByEmail: async (email) => {
              const users = await tx.$queryRaw<(PromoteAdminUser & { email: string | null })[]>`
                SELECT "id", "role", "emailVerifiedAt", "email" FROM "users"
                WHERE lower(btrim("email", ${EMAIL_TRIM_CHARACTERS})) = ${email}
                ORDER BY "id" LIMIT 2 FOR UPDATE`;
              for (const user of users) await checkReservation(user);
              return users;
            },
            updateUserRole: async (userId) => {
              await tx.user.update({ where: { id: userId }, data: { role: "admin" } });
            },
            createAuditLog: async (data) => {
              await tx.auditLog.create({
                data: { ...data, details: data.details as Prisma.InputJsonValue },
              });
            },
          });
        }),
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
