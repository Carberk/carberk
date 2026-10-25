import { describe, expect, it } from "vitest";

import { PrismaUploadClaims } from "./PrismaUploadClaims";

import { ClaimDatabase } from "../application/testing/UploadClaimsDatabase";

describe("pre-reserve upload retirement", () => {
  it.each([
    ["another User", "stranger", 0, true],
    ["a live adopter", "owner", 1, true],
    ["an object corrected before the lock", "owner", 0, false],
  ] as const)("records no retirement for %s", async (_reason, userId, adopters, invalid) => {
    const db = new ClaimDatabase();
    db.upload();
    if (adopters) db.tables["users"]?.push({ id: "adopter", avatarUploadId: "upload-1" });
    const before = structuredClone(db.tables);
    const claims = new PrismaUploadClaims(db.prisma, { now: () => new Date("2026-10-08T00:00:00Z") });
    const retire = claims.retireUnclaimed.bind(claims);
    expect(await retire("upload-1", userId, async () => invalid)).toBe(false);
    expect(db.tables).toEqual(before);
  });
});
