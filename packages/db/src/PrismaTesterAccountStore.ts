import { Prisma, type PrismaClient } from "../generated/prisma/client/client";

import { testerRemovalSourceCommand } from "./maintenance-source-command";
import { withDiagnosticSourceCommand } from "./diagnostic-source-command";
import { TesterAccountsRefused, type TesterAccountStore, type TesterResult, type TesterTransaction, type TesterUser } from "./tester-accounts";

export class PrismaTesterAccountStore implements TesterAccountStore {
  constructor(private readonly prisma: PrismaClient) {}

  transaction<T>(run: (tx: TesterTransaction) => Promise<T>, mode: "seed" | "remove" = "seed"): Promise<T> {
    return this.prisma.$transaction(async (tx) => run({
      findUsers: (accounts) => tx.user.findMany({
        where: { OR: accounts.flatMap(({ id, phone, email }) => [{ id }, { phone }, { email }]) },
        select: { id: true, phone: true, email: true, role: true, phoneVerifiedAt: true, emailVerifiedAt: true, deletionScheduledAt: true, suspendedAt: true },
      }),
      createUser: async (account, now) => {
        await tx.user.create({ data: { ...account, role: "buyer", phoneVerifiedAt: now, emailVerifiedAt: now } });
      },
      removePersonalAccounts: (users, now) => this.removePersonalAccounts(tx, users, now),
      // These legacy constituent methods cannot cover a complete removal plan.
      // Keep direct use closed rather than exposing partial cleanup permission.
      scheduleDeletion: async (ids) => {
        if (ids.length === 0) return 0;
        throw new TesterAccountsRefused("unsupported atomic schedule + Session deletion + Listing archive");
      },
      deleteSessions: async (ids) => {
        if (ids.length === 0) return 0;
        throw new TesterAccountsRefused("unsupported atomic schedule + Session deletion + Listing archive");
      },
      archiveListings: async (ids) => {
        if (ids.length === 0) return 0;
        throw new TesterAccountsRefused("unsupported atomic schedule + Session deletion + Listing archive");
      },
    }), { isolationLevel: mode === "seed" ? Prisma.TransactionIsolationLevel.Serializable : Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 });
  }

  private async removePersonalAccounts(tx: Prisma.TransactionClient, users: TesterUser[], now: Date): Promise<TesterResult> {
    if (users.length === 0 || users.length > 30 || new Set(users.map(user => user.id)).size !== users.length) {
      throw new TesterAccountsRefused("invalid whole-list removal plan");
    }
    const ids = users.map(user => user.id);
    const transitions = users.filter(user => user.deletionScheduledAt === null || user.deletionScheduledAt > now);
    const command = await testerRemovalSourceCommand(tx, { users, now });
    const preflight = async () => {
      const current = await tx.user.findMany({ where: { id: { in: ids } }, select: {
        id: true, phone: true, email: true, role: true, phoneVerifiedAt: true, emailVerifiedAt: true,
        deletionScheduledAt: true, suspendedAt: true,
      } });
      const sameDate = (a: Date | null, b: Date | null) => a?.getTime() === b?.getTime();
      if (current.length !== users.length || users.some(expected => {
        const row = current.find(user => user.id === expected.id);
        return !row || (row.role !== "buyer" && row.role !== "seller") || row.suspendedAt !== null ||
          row.role !== expected.role || row.phone !== expected.phone || row.email !== expected.email ||
          !row.phoneVerifiedAt || !row.emailVerifiedAt ||
          !sameDate(row.phoneVerifiedAt, expected.phoneVerifiedAt) || !sameDate(row.emailVerifiedAt, expected.emailVerifiedAt) ||
          !sameDate(row.deletionScheduledAt, expected.deletionScheduledAt);
      })) throw new TesterAccountsRefused("tester source/eligibility changed");
      // SQL owns the exact whole-plan closure, including unchanged-schedule
      // Session cleanup, active personal archives and every transitive FK edge.
      const [plan] = await tx.$queryRaw<{ effects: { table: string; verb: string; key: { id: string } }[] }[]>`
        SELECT public.diagnostic_source_fk_effects(public.diagnostic_source_parse(${JSON.stringify(command)}::jsonb))
          || public.diagnostic_source_account_effects(${JSON.stringify(command)}::jsonb) AS effects
      `;
      if (!plan) throw new TesterAccountsRefused("missing whole-list removal discovery");
      return { sessionIds: plan.effects.filter(effect => effect.table === "sessions" && effect.verb === "delete").map(effect => effect.key.id),
        listingIds: plan.effects.filter(effect => effect.table === "listings" && effect.verb === "update").map(effect => effect.key.id) };
    };
    const discovered = await preflight();
    if (transitions.length === 0 && discovered.sessionIds.length === 0 && discovered.listingIds.length === 0) {
      return { created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 };
    }
    return withDiagnosticSourceCommand(tx, command, async () => {
      const { sessionIds, listingIds } = await preflight();
      const scheduled = transitions.length === 0 ? 0 : (await tx.user.updateMany({
        where: { id: { in: transitions.map(user => user.id) } }, data: { deletionScheduledAt: now },
      })).count;
      const sessionsDeleted = sessionIds.length === 0 ? 0 : (await tx.session.deleteMany({ where: { id: { in: sessionIds } } })).count;
      const listingsArchived = listingIds.length === 0 ? 0 : (await tx.listing.updateMany({
        where: { id: { in: listingIds } }, data: { status: "archived", archivedByDeletion: true },
      })).count;
      return { created: 0, scheduled, sessionsDeleted, listingsArchived };
    });
  }
}
