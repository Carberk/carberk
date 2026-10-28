import { Prisma, type PrismaClient } from "../generated/prisma/client/client";

import { accountSourceCommand } from "./account-source-command";
import { withDiagnosticSourceCommand, type DiagnosticSourceCommand, type DiagnosticSourceRow } from "./diagnostic-source-command";
import { TesterAccountsRefused, type TesterAccountStore, type TesterResult, type TesterTransaction, type TesterUser } from "./tester-accounts";

export class PrismaTesterAccountStore implements TesterAccountStore {
  constructor(private readonly prisma: PrismaClient) {}

  transaction<T>(run: (tx: TesterTransaction) => Promise<T>, mode: "seed" | "remove" = "seed"): Promise<T> {
    return this.prisma.$transaction(async (tx) => run({
      findUsers: (accounts) => tx.user.findMany({
        where: { OR: accounts.flatMap(({ id, phone, email }) => [{ id }, { phone }, { email }]) },
        select: { id: true, phone: true, email: true, role: true, phoneVerifiedAt: true, emailVerifiedAt: true, deletionScheduledAt: true },
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
    const rows: DiagnosticSourceRow[] = [];
    for (const user of transitions) {
      const plan = await accountSourceCommand(tx, { operation: "account_schedule", userId: user.id, deletionScheduledAt: now });
      rows.push(...plan.command.rows);
    }
    // One combined command, not one prepare per account. Actor is the subject for
    // a single target; a batch has no single acting account. SQL resolves scope.
    const command: DiagnosticSourceCommand = { operation: "account_schedule",
      roots: ids.map(id => ({ table: "users", key: { id } })), rows,
      actorUserId: ids.length === 1 ? ids[0] ?? null : null, sessionId: null, cutoff: null, campaign: null,
    };
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
      const sessions = await tx.session.count({ where: { userId: { in: ids } } });
      const inventory = await tx.listing.findMany({ where: { sellerId: { in: ids } }, select: { id: true, sellerId: true, businessId: true, status: true } });
      if (sessions > 0 || inventory.some(listing => listing.businessId !== null ||
          (listing.status === "active" && !transitions.some(user => user.id === listing.sellerId)))) {
        throw new TesterAccountsRefused("unsupported atomic schedule + Session deletion + Listing archive");
      }
      if (rows.length > 0) {
        const [derived] = await tx.$queryRaw<{ effects: { table: string; verb: string; key: { id: string } }[] }[]>`
          SELECT public.diagnostic_source_account_effects(${JSON.stringify(command)}::jsonb)
            || public.diagnostic_source_fk_effects(${JSON.stringify(command)}::jsonb) AS effects
        `;
        const expected = inventory.filter(listing => listing.status === "active").map(listing => listing.id).sort();
        if (!derived) throw new TesterAccountsRefused("missing account-schedule effect discovery");
        const actual = derived.effects;
        if (actual.some(effect => effect.table !== "listings" || effect.verb !== "update") ||
            JSON.stringify(actual.map(effect => effect.key.id).sort()) !== JSON.stringify(expected)) {
          throw new TesterAccountsRefused("unsupported extra account-schedule effects in complete removal plan");
        }
      }
      return inventory.filter(listing => listing.status === "active").map(listing => listing.id);
    };
    await preflight();
    if (rows.length === 0) return { created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 };
    return withDiagnosticSourceCommand(tx, command, async () => {
      const listingIds = await preflight();
      const scheduled = await tx.user.updateMany({ where: { id: { in: transitions.map(user => user.id) } }, data: { deletionScheduledAt: now } });
      // No empty guarded Session statement. Exact derived personal archive only.
      const archived = listingIds.length === 0 ? 0 : (await tx.listing.updateMany({
        where: { id: { in: listingIds } }, data: { status: "archived", archivedByDeletion: true },
      })).count;
      return { created: 0, scheduled: scheduled.count, sessionsDeleted: 0, listingsArchived: archived };
    });
  }
}
