import { describe, expect, it } from "vitest";
import type { PrismaService } from "@auto-tm/db";

import { PrismaUploadClaims } from "./PrismaUploadClaims";

/** The database boundary returns an AVAILABLE row and its independent adopter count. */
function database(adopters: number) {
  const writes: string[] = [];
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray) => sql.join("").includes("AS total")
      ? [{ total: BigInt(adopters) }]
      : [{ id: "upload-1", userId: "owner", key: "pending/photo/original.webp", state: "AVAILABLE",
          claimToken: null, claimTargetType: null, claimTargetId: null, writeProtocol: "conditional-v1", objectKeys: [] }],
    $executeRaw: async (sql: TemplateStringsArray) => { writes.push(sql.join("")); return 1; },
  };
  const prisma = { $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx) };
  return { prisma: prisma as unknown as PrismaService, writes };
}

describe("pre-reserve upload retirement", () => {
  it.each([
    ["another User", "stranger", 0, true],
    ["a live adopter", "owner", 1, true],
    ["an object corrected before the lock", "owner", 0, false],
  ] as const)("records no retirement for %s", async (_reason, userId, adopters, invalid) => {
    const db = database(adopters);
    const claims = new PrismaUploadClaims(db.prisma, { now: () => new Date("2026-10-08T00:00:00Z") });
    const retire = claims.retireUnclaimed.bind(claims);
    expect(await retire("upload-1", userId, async () => invalid)).toBe(false);
    expect(db.writes).toEqual([]);
  });
});
