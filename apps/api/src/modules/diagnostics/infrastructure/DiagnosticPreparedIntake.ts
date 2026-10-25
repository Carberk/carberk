import { assertDiagnosticSourceCommand, withCampaignPreparation, withDiagnosticSourceCommand, type CampaignMutation, type DiagnosticSourceOperation, type DiagnosticSourceCommand, type DiagnosticSourceRoot, type DiagnosticSourceRow, type DiagnosticSourceTuple, type PreparedDiagnosticSource, type Prisma } from "@auto-tm/db";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";

type Tx = Prisma.TransactionClient;
type Scope = { table: string; key: Record<string, string> }[];
const contexts = new WeakMap<Tx, Scope>();
export const diagnosticHasPrefix = (tx: Tx): boolean => contexts.has(tx);
const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
const includes = (scope: Scope, root: DiagnosticSourceRoot) => scope.some(row => row.table === root.table && JSON.stringify(row.key) === JSON.stringify(root.key));
export const diagnosticRoots = (subject: DiagnosticSubject, ids: readonly string[] = []): DiagnosticSourceRoot[] => [
  { table: "users", key: { id: subject.userId } }, { table: "sessions", key: { id: subject.sessionId } },
  ...ids.map(id => ({ table: "inspection_orders" as const, key: { id } })),
];

/** One union at outer entry. Re-entry can only use resources already covered.
 * Reads use the kernel's retained/absent closure and lock keys, without a write receipt.
 * This never supplies authority, creates anchors, or modifies retained facts. */
export async function diagnosticReadPrefix(tx: Tx, roots: readonly DiagnosticSourceRoot[]): Promise<void> {
  const prior = contexts.get(tx);
  if (prior) { if (!roots.every(root => includes(prior, root))) throw denied(); return; }
  const command = { operation: "order_change", roots, rows: [], actorUserId: null, sessionId: null, cutoff: null, campaign: null };
  const discover = async () => {
    const [row] = await tx.$queryRaw<{ scope: Scope; keys: unknown; campaigns: string[]; mutations: CampaignMutation[] }[]>`
      WITH discovered AS MATERIALIZED (SELECT public.diagnostic_source_scope(${JSON.stringify(command)}::jsonb) AS scope)
      SELECT scope,public.diagnostic_source_lock_keys(scope,${JSON.stringify(command)}::jsonb) AS keys,
        public.diagnostic_source_campaigns(scope,${JSON.stringify(command)}::jsonb) AS campaigns,
        public.campaign_source_mutations(scope,${JSON.stringify(command)}::jsonb) AS mutations FROM discovered
    `;
    return row;
  };
  const discovered = await discover();
  if (!discovered) throw denied();
  // The server registry, not request identifiers, supplies every interpolated table name.
  const tables = await tx.$queryRaw<{ table: string; namespace: number }[]>`
    SELECT m->>'table' AS table,(m->>'namespace')::int AS namespace
    FROM jsonb_array_elements(public.diagnostic_source_registry()) m ORDER BY (m->>'namespace')::int
  `;
  await withCampaignPreparation(tx, discovered.mutations, async () => {
    for (const table of tables) {
      if (!/^[a-z_]+$/.test(table.table)) throw denied();
      // Preserve the effective message fence: an ordinary message INSERT may
      // already own this key while waiting for our Conversation row.
      if (table.namespace === 898310) {
        const locks = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock((k->>'namespace')::int,(k->>'key')::int) AS acquired
          FROM jsonb_array_elements(${JSON.stringify(discovered.keys)}::jsonb) k
          WHERE (k->>'namespace')::int=${table.namespace} ORDER BY (k->>'key')::int`;
        if (locks.some(lock => !lock.acquired)) throw denied();
      } else await tx.$queryRaw`SELECT pg_advisory_xact_lock((k->>'namespace')::int,(k->>'key')::int)
        FROM jsonb_array_elements(${JSON.stringify(discovered.keys)}::jsonb) k
        WHERE (k->>'namespace')::int=${table.namespace} ORDER BY (k->>'key')::int`;
      for (const row of discovered.scope.filter(row => row.table === table.table).sort((a, b) => JSON.stringify(a.key) < JSON.stringify(b.key) ? -1 : JSON.stringify(a.key) > JSON.stringify(b.key) ? 1 : 0)) {
        await tx.$queryRawUnsafe(`SELECT 1 FROM public.${table.table} s WHERE to_jsonb(s) @> $1::jsonb FOR UPDATE`, JSON.stringify(row.key));
      }
    }
    const checked = await discover();
    if (JSON.stringify(checked) !== JSON.stringify(discovered)) throw denied();
    contexts.set(tx, discovered.scope);
  });
}

/** SQL supplies the exact protected projection and normalization, including nulls. */
export async function diagnosticPlannedRow(tx: Tx, root: DiagnosticSourceRoot, next: Record<string, unknown> | null, insert = false): Promise<DiagnosticSourceRow> {
  const [row] = await tx.$queryRaw<{ source: DiagnosticSourceTuple | null; next: DiagnosticSourceTuple }[]>`
    SELECT public.diagnostic_source_project(public.diagnostic_source_read(${root.table},${JSON.stringify(root.key)}::jsonb),public.diagnostic_source_meta(${root.table})->'fields') AS source,
      public.diagnostic_source_normalize(${root.table},coalesce(public.diagnostic_source_read(${root.table},${JSON.stringify(root.key)}::jsonb),'{}'::jsonb)||${JSON.stringify(next ?? {})}::jsonb) AS next
  `;
  if (!row) throw denied();
  if (insert) {
    if (row.source !== null) throw denied();
    return { ...root, verb: "insert", expected: "absent", next: row.next } as DiagnosticSourceRow;
  }
  if (!row.source) throw denied();
  return { ...root, ...(next === null ? { verb: "delete", expected: { source: row.source }, next: null }
    : { verb: "update", expected: { source: row.source }, next: row.next }) } as DiagnosticSourceRow;
}

/** For a downstream caller that already owns the outer receipt. Assert backend,
 * transaction and concrete operation before making its complete scope reusable.
 * It never finishes another owner's receipt or accepts extra lock targets. */
export async function diagnosticReceiptPrefix(tx: Tx, receipt: PreparedDiagnosticSource, operation: DiagnosticSourceOperation): Promise<void> {
  await assertDiagnosticSourceCommand(tx, receipt, operation);
  const [row] = await tx.$queryRaw<{ scope: Scope }[]>`SELECT scope FROM public.diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
  if (!row) throw denied();
  contexts.set(tx, row.scope);
}

/** Compatible downstream contract: discover every explicit tuple first, then enter
 * once, before authority or resource locks. Work retains its own operation/receipt. */
export async function diagnosticMutation<T>(tx: Tx, command: DiagnosticSourceCommand, work: (receipt: PreparedDiagnosticSource) => Promise<T>): Promise<T> {
  if (contexts.has(tx)) throw denied();
  return withDiagnosticSourceCommand(tx, command, async receipt => {
    await diagnosticReceiptPrefix(tx, receipt, command.operation);
    return work(receipt);
  });
}
