import { describe, expect, it } from "vitest";
import { PrismaSessionRepository } from "./PrismaSessionRepository";

type SessionRow = {
  id: string; userId: string; expiresAt: Date; adminTotpExpiresAt: Date | null;
};
type SessionWhere = { userId: string; id?: { in: string[] } };
type Command = {
  operation: string;
  roots: { table: string; key: { id: string } }[];
  rows: { table: string; key: { id: string }; verb: string; expected: { source: {
    id: string; userId: string; expiresAt: string; adminTotpExpiresAt: string | null;
  } } }[];
};
const session: SessionRow = {
  id: "session-1", userId: "user-1",
  expiresAt: new Date("2026-10-24T12:00:00.000Z"), adminTotpExpiresAt: null,
};
const second = { ...session, id: "session-2" };
const foreign = { ...session, id: "foreign-session", userId: "user-2" };

/** Database boundary only. Models committed races, receipt effects and atomic
 * writes, not PostgreSQL locks or the kernel's full diagnostic graph. The real
 * source-command helper runs against this boundary without an internal mock. */
class SessionDatabase {
  committed = new Map<string, SessionRow>();
  beforeDiscovery?: () => void;
  duringWait?: () => void;
  failAfterDelete = false;
  transactions = 0;
  mutationAttempts = 0;
  activeReceipts = 0;

  constructor(rows: SessionRow[]) {
    this.committed = new Map(rows.map((row) => [row.id, row]));
  }

  private matches(row: SessionRow, where: SessionWhere) {
    return row.userId === where.userId && (!where.id || where.id.in.includes(row.id));
  }

  session = {
    findMany: async ({ where }: { where: SessionWhere }) =>
      [...this.committed.values()].filter((row) => this.matches(row, where)),
  };

  $transaction = async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
    this.transactions += 1;
    let draft = new Map(this.committed);
    let covered = new Set<string>();
    let prepared = false;
    let finished = false;
    const tx = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        if (sql.includes("diagnostic_prepare_source")) {
          const command = JSON.parse(String(values[0])) as Command;
          if (command.operation !== "session_change" || prepared) throw new Error("invalid_command");
          const userRoot = command.roots.find((root) => root.table === "users");
          if (!userRoot) throw new Error("missing_user_root");
          this.beforeDiscovery?.();
          const discover = () => [...this.committed.values()]
            .filter((row) => row.userId === userRoot.key.id).map((row) => row.id).sort();
          const before = discover();
          this.duringWait?.();
          if (JSON.stringify(before) !== JSON.stringify(discover())) {
            throw new Error("diagnostic_source_graph_changed");
          }
          draft = new Map(this.committed);
          // Discovery locks rows; only declared effects authorize their deletion.
          covered = new Set(command.rows.map((row) => {
            if (row.table !== "sessions" || row.verb !== "delete") throw new Error("invalid_effect");
            const actual = draft.get(row.key.id);
            const expected = row.expected.source;
            if (!actual || actual.id !== expected.id || actual.userId !== expected.userId ||
                actual.expiresAt.toISOString() !== expected.expiresAt ||
                (actual.adminTotpExpiresAt?.toISOString() ?? null) !== expected.adminTotpExpiresAt) {
              throw new Error("diagnostic_source_stale");
            }
            return row.key.id;
          }));
          prepared = true;
          this.activeReceipts += 1;
          return [{ receipt: "receipt-1" }];
        }
        if (!prepared || values[0] !== "receipt-1" || finished) throw new Error("invalid_receipt");
        if (sql.includes("diagnostic_assert_source")) {
          if (values[1] !== "session_change") throw new Error("invalid_operation");
          return [];
        }
        if (sql.includes("diagnostic_finish_source")) {
          if ([...covered].some((id) => draft.has(id))) throw new Error("incomplete_effects");
          finished = true;
          return [];
        }
        throw new Error("unexpected_query");
      },
      session: {
        findMany: async ({ where }: { where: SessionWhere }) => {
          if (!prepared) throw new Error("missing_receipt");
          return [...draft.values()].filter((row) => this.matches(row, where));
        },
        deleteMany: async ({ where }: { where: SessionWhere }) => {
          this.mutationAttempts += 1;
          if (!prepared) throw new Error("missing_receipt");
          let count = 0;
          for (const [id, row] of draft) {
            if (!this.matches(row, where)) continue;
            if (!covered.has(id)) throw new Error("diagnostic_source_uncovered_effect");
            draft.delete(id);
            count += 1;
            if (this.failAfterDelete) throw new Error("delete_failed");
          }
          return { count };
        },
      },
    };
    try {
      const result = await work(tx);
      if (!finished) throw new Error("unfinished_receipt");
      this.committed = draft;
      return result;
    } finally {
      if (prepared) this.activeReceipts -= 1;
    }
  };

  repository() { return new PrismaSessionRepository(this as never, {} as never); }
  ids() { return [...this.committed.keys()].sort(); }
}

describe("PrismaSessionRepository.deleteAllByUserId", () => {
  it("returns zero without a source transaction when the User has no sessions", async () => {
    const db = new SessionDatabase([foreign]);
    await expect(db.repository().deleteAllByUserId("user-1")).resolves.toBe(0);
    expect(db.transactions).toBe(0);
    expect(db.ids()).toEqual(["foreign-session"]);
  });

  it("revokes the complete stable set and preserves foreign sessions", async () => {
    const db = new SessionDatabase([session, second, foreign]);
    await expect(db.repository().deleteAllByUserId("user-1")).resolves.toBe(2);
    expect(db.ids()).toEqual(["foreign-session"]);
    expect(db.activeReceipts).toBe(0);
  });

  it("refuses a Session committed before preparation without attempting any mutation or retry", async () => {
    const db = new SessionDatabase([session, foreign]);
    db.beforeDiscovery = () => db.committed.set(second.id, second);
    await expect(db.repository().deleteAllByUserId("user-1")).rejects.toThrow("diagnostic_source_graph_changed");
    expect(db.ids()).toEqual(["foreign-session", "session-1", "session-2"]);
    expect(db.mutationAttempts).toBe(0);
    expect(db.transactions).toBe(1);
    expect(db.activeReceipts).toBe(0);
  });

  it("refuses a graph changed during the preparation lock wait and preserves both committed Sessions", async () => {
    const db = new SessionDatabase([session, foreign]);
    db.duringWait = () => db.committed.set(second.id, second);
    await expect(db.repository().deleteAllByUserId("user-1")).rejects.toThrow("diagnostic_source_graph_changed");
    expect(db.ids()).toEqual(["foreign-session", "session-1", "session-2"]);
    expect(db.mutationAttempts).toBe(0);
    expect(db.transactions).toBe(1);
    expect(db.activeReceipts).toBe(0);
  });

  it("lets preparation reject changed protected tuples before any deletion", async () => {
    const db = new SessionDatabase([session, foreign]);
    db.beforeDiscovery = () => db.committed.set(session.id, { ...session, adminTotpExpiresAt: new Date("2026-10-24T12:05:00Z") });
    await expect(db.repository().deleteAllByUserId("user-1")).rejects.toThrow("diagnostic_source_stale");
    expect(db.ids()).toEqual(["foreign-session", "session-1"]);
    expect(db.committed.get(session.id)?.adminTotpExpiresAt).toEqual(new Date("2026-10-24T12:05:00Z"));
    expect(db.mutationAttempts).toBe(0);
    expect(db.activeReceipts).toBe(0);
  });

  it("rolls back a partial deletion and propagates its error", async () => {
    const db = new SessionDatabase([session, second, foreign]);
    db.failAfterDelete = true;
    await expect(db.repository().deleteAllByUserId("user-1")).rejects.toThrow("delete_failed");
    expect(db.ids()).toEqual(["foreign-session", "session-1", "session-2"]);
    expect(db.activeReceipts).toBe(0);
  });
});
