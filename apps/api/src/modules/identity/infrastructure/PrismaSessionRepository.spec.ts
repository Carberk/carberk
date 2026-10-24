import { describe, expect, it } from "vitest";
import { PrismaSessionRepository } from "./PrismaSessionRepository";

const session = {
  id: "session-1",
  userId: "user-1",
  expiresAt: new Date("2026-10-24T12:00:00.000Z"),
  adminTotpExpiresAt: null,
};

describe("PrismaSessionRepository.deleteAllByUserId", () => {
  it("returns zero without opening a source transaction when the User has no sessions", async () => {
    let opened = false;
    const prisma = {
      session: { findMany: async () => [] },
      $transaction: async () => { opened = true; return 0; },
    } as never;
    const repository = new PrismaSessionRepository(prisma, {} as never);

    await expect(repository.deleteAllByUserId("user-1")).resolves.toBe(0);
    expect(opened).toBe(false);
  });

  it("revokes a session committed during preparation while preserving foreign sessions", async () => {
    const sessions = new Map([
      ["session-1", session],
      ["foreign-session", { ...session, id: "foreign-session", userId: "user-2" }],
    ]);
    const prisma = {
      session: { findMany: async () => [sessions.get("session-1")] },
      $transaction: async (work: (value: {
        $queryRaw: (...args: unknown[]) => Promise<unknown[]>;
        session: {
          deleteMany: (args: { where: { userId: string } }) => Promise<{ count: number }>;
        };
      }) => Promise<number>) => {
        const tx = {
          $queryRaw: async (...args: unknown[]) => {
            const sql = String((args[0] as TemplateStringsArray | undefined)?.[0] ?? "");
            if (sql.includes("diagnostic_prepare_source")) {
              const command = JSON.parse(String(args[1]));
              if (!command.roots.some((root: { table: string; key: { id: string } }) => root.table === "users" && root.key.id === "user-1")) {
                throw new Error("missing_user_root");
              }
              // A same-user Session committed while the User fence was being
              // acquired is visible to the locked post-prepare discovery.
              sessions.set("session-2", { ...session, id: "session-2" });
              return [{ receipt: "receipt-1" }];
            }
            return [];
          },
          session: {
            deleteMany: async ({ where }: { where: { userId: string } }) => {
              let count = 0;
              for (const [id, row] of sessions) {
                if (row.userId === where.userId) {
                  sessions.delete(id);
                  count += 1;
                }
              }
              return { count };
            },
          },
        };
        return work(tx);
      },
    } as never;
    const repository = new PrismaSessionRepository(prisma, {} as never);

    await expect(repository.deleteAllByUserId("user-1")).resolves.toBe(2);
    expect([...sessions.values()].map(({ id }) => id)).toEqual(["foreign-session"]);
  });
});
