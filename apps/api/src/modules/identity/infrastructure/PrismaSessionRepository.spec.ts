import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "@auto-tm/db";

import { RefreshTokenDigestAdapter } from "./RefreshTokenDigestAdapter";
import { PrismaSessionRepository } from "./PrismaSessionRepository";

describe("PrismaSessionRepository refresh-token lookup", () => {
  it("uses the indexed digest lookup without scanning sessions", async () => {
    const row = {
      id: "session-1",
      userId: "user-1",
      refreshTokenHash: "3f08aace122ee2368432c1ca23a049bc640bafbf00fdf33a52429f38ba12dbf9",
      deviceLabel: null,
      userAgent: null,
      expiresAt: new Date("2026-12-01T00:00:00Z"),
      createdAt: new Date("2026-11-01T00:00:00Z"),
      lastSeenAt: new Date("2026-11-01T00:00:00Z"),
      adminTotpExpiresAt: null,
      user: { id: "user-1", phone: "+99361111111", email: null, role: "buyer" },
    };
    const findUnique = vi.fn().mockResolvedValue(row);
    const findMany = vi.fn();
    const prisma = { session: { findUnique, findMany } } as unknown as PrismaService;
    const repository = new PrismaSessionRepository(prisma, new RefreshTokenDigestAdapter());

    const result = await repository.findByRefreshToken("token-1");

    expect(result?.session.id).toBe("session-1");
    expect(findUnique).toHaveBeenCalledWith({
      where: { refreshTokenHash: "3f08aace122ee2368432c1ca23a049bc640bafbf00fdf33a52429f38ba12dbf9" },
      include: { user: { select: { id: true, phone: true, email: true, role: true } } },
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});
