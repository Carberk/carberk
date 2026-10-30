import type { Prisma, PrismaClient } from "../generated/prisma/client/client";
import { withDiagnosticSourceCommand, type DiagnosticSourceRow, type DiagnosticSourceTuple } from "../src/diagnostic-source-command";

/** Script-local database boundary. Discovery is unlocked; preparation is the first
 * locking/write operation. SQL projects protected fields and fences the complete
 * FK/trigger graph. Scalar data and nested media still use the original Prisma write. */
export async function upsertMaintenanceListing(prisma: PrismaClient, input: {
  create: Prisma.ListingUncheckedCreateInput & { id: string };
  /** Omit for a create-only caller; an existing ID then refuses before DML. */
  update?: Partial<Prisma.ListingUncheckedCreateInput>;
  /** A fixture may refresh only its legitimate personal inventory. */
  ownership?: { sellerId: string; businessId: null };
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const id = input.create.id;
    const [plan] = await tx.$queryRaw<{ source: DiagnosticSourceTuple | null; next: DiagnosticSourceTuple }[]>`
      WITH target AS (SELECT public.diagnostic_source_project(
        public.diagnostic_source_read('listings',jsonb_build_object('id',${id}::text)),
        public.diagnostic_source_meta('listings')->'fields') AS source)
      SELECT source, public.diagnostic_source_normalize('listings',public.diagnostic_source_project(
        CASE WHEN source IS NULL THEN
          jsonb_build_object('status','draft','activeVideoRevision',0,'archivedByDeletion',false)||${JSON.stringify(input.create)}::jsonb
        ELSE source||${JSON.stringify(input.update ?? {})}::jsonb END,
        public.diagnostic_source_meta('listings')->'fields')) AS next FROM target
    `;
    if (!plan) throw new Error("diagnostic_maintenance_listing_plan");
    if (plan.source !== null && input.update === undefined) throw new Error("diagnostic_source_stale");
    const assertOwnership = (source: DiagnosticSourceTuple | null) => {
      if (source && input.ownership && (source["sellerId"] !== input.ownership.sellerId || source["businessId"] !== input.ownership.businessId)) {
        throw new Error("Reviewer seed refused: foreign Listing association");
      }
    };
    assertOwnership(plan.source);
    const row: DiagnosticSourceRow = plan.source === null
      ? { table: "listings", key: { id }, verb: "insert", expected: "absent", next: plan.next }
      : { table: "listings", key: { id }, verb: "update", expected: { source: plan.source }, next: plan.next };
    await withDiagnosticSourceCommand(tx, {
      operation: plan.source === null ? "listing_create" : "listing_change",
      roots: [{ table: "listings", key: { id } }, ...(input.ownership ? [{ table: "users" as const, key: { id: input.ownership.sellerId } }] : [])], rows: [row],
      actorUserId: input.ownership?.sellerId ?? null, sessionId: null, cutoff: null, campaign: null,
    }, async () => {
      // Preparation reparses full OLD under its locks. Re-read ownership there
      // before the write as well, rather than using a fixture ID as authority.
      if (input.ownership && plan.source !== null) {
        const current = await tx.listing.findUniqueOrThrow({ where: { id }, select: { sellerId: true, businessId: true } });
        assertOwnership(current);
      }
      if (plan.source === null) await tx.listing.create({ data: input.create });
      else await tx.listing.update({ where: { id }, data: input.update ?? {} });
    });
  });
}

/** A single finite delete covers the selected batch, including cascades. Empty
 * selection is read-only. Scope/cap/refusal and rollback remain SQL-owned. */
export async function deleteMaintenanceListings(prisma: PrismaClient, where: Prisma.ListingWhereInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const selected = await tx.listing.findMany({ where, select: { id: true } });
    if (selected.length === 0) return;
    const rows: DiagnosticSourceRow[] = [];
    for (const { id } of selected) {
      const [plan] = await tx.$queryRaw<{ source: DiagnosticSourceTuple | null }[]>`
        SELECT public.diagnostic_source_project(public.diagnostic_source_read('listings',jsonb_build_object('id',${id}::text)),
          public.diagnostic_source_meta('listings')->'fields') AS source
      `;
      if (!plan?.source) throw new Error("diagnostic_source_stale");
      rows.push({ table: "listings", key: { id }, verb: "delete", expected: { source: plan.source }, next: null });
    }
    await withDiagnosticSourceCommand(tx, {
      operation: "listing_delete", roots: selected.map(({ id }) => ({ table: "listings", key: { id } })), rows,
      actorUserId: null, sessionId: null, cutoff: null, campaign: null,
    }, () => tx.listing.deleteMany({ where: { id: { in: selected.map(({ id }) => id) } } }));
  });
}
