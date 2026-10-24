import { describe, expect, it, vi } from "vitest";
import { PrismaSessionRepository } from "./PrismaSessionRepository";

const session = {
  id: "session-1",
  userId: "user-1",
  expiresAt: new Date("2026-10-24T12:00:00.000Z"),
  adminTotpExpiresAt: null,
};

describe("PrismaSessionRepository.deleteAllByUserId", () => {
  it("returns zero without opening a source transaction when the User has no sessions", async () => {
    const transaction = vi.fn();
    const prisma = { session: { findMany: vi.fn().mockResolvedValue([]) }, $transaction: transaction } as never;
    const repository = new PrismaSessionRepository(prisma, {} as never);

    await expect(repository.deleteAllByUserId("user-1")).resolves.toBe(0);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("prepares and asserts one receipt before deleting the discovered rows", async () => {
    const sql: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        sql.push(strings[0] ?? "");
        if ((strings[0] ?? "").includes("diagnostic_prepare_source")) return [{ receipt: "receipt-1" }];
        return [];
      }),
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      session: { findMany: vi.fn().mockResolvedValue([session]) },
      $transaction: vi.fn(async (work: (value: typeof tx) => Promise<number>) => work(tx)),
    } as never;
    const repository = new PrismaSessionRepository(prisma, {} as never);

    await expect(repository.deleteAllByUserId("user-1")).resolves.toBe(1);
    expect(sql.findIndex((query) => query.includes("diagnostic_prepare_source"))).toBeGreaterThanOrEqual(0);
    expect(sql.findIndex((query) => query.includes("diagnostic_assert_source"))).toBeGreaterThan(0);
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["session-1"] }, userId: "user-1" } });
  });
});
