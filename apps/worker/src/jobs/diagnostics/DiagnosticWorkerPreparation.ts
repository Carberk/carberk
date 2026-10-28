import { Prisma, withCampaignPreparation, withDiagnosticSourceCommand, type CampaignMutation, type DiagnosticSourceOperation, type DiagnosticSourceRoot, type DiagnosticSourceRow, type DiagnosticSourceTuple } from "@auto-tm/db";

type Tx = Prisma.TransactionClient;
type Scope = { table: string; key: Record<string, string> }[];
export class DiagnosticWorkerPreparationChanged extends Error {
  constructor() { super("DIAGNOSTIC_PREPARATION_CHANGED"); }
}
const changed = () => new DiagnosticWorkerPreparationChanged();
const tuple = (value: unknown): string => Array.isArray(value) ? `[${value.map(tuple).join(",")}]` : value && typeof value === "object"
  ? `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${tuple(item)}`).join(",")}}` : JSON.stringify(value);

/** Read/normalize the registry's complete physical tuple before any resource lock.
 * An insert supplies every default explicitly, including its epoch and timestamp. */
export async function workerPlannedRow(tx: Tx, root: DiagnosticSourceRoot, patch: Record<string, unknown> | null, insert = false): Promise<DiagnosticSourceRow> {
  const next = patch === null ? {} : Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value === Prisma.DbNull || value === Prisma.JsonNull ? null : value]));
  const [row] = await tx.$queryRaw<{ source: DiagnosticSourceTuple | null; next: DiagnosticSourceTuple }[]>`
    SELECT public.diagnostic_source_project(public.diagnostic_source_read(${root.table},${JSON.stringify(root.key)}::jsonb),public.diagnostic_source_meta(${root.table})->'fields') AS source,
      public.diagnostic_source_normalize(${root.table},coalesce(public.diagnostic_source_read(${root.table},${JSON.stringify(root.key)}::jsonb),'{}'::jsonb)||${JSON.stringify(next)}::jsonb) AS next
  `;
  if (!row || (insert ? row.source !== null : !row.source)) throw changed();
  return { ...root, verb: insert ? "insert" : patch === null ? "delete" : "update",
    expected: insert ? "absent" : { source: row.source }, next: patch === null ? null : row.next } as DiagnosticSourceRow;
}

const rootsFor = (rows: readonly DiagnosticSourceRow[], roots: readonly DiagnosticSourceRoot[]) => {
  const unique = new Map<string, DiagnosticSourceRoot>();
  for (const root of [...roots, ...rows.map(row => ({ table: row.table, key: row.key }) as DiagnosticSourceRoot)]) unique.set(JSON.stringify(root), root);
  return [...unique.values()];
};

/** Source SQL owns material/proof/request/anchor effects and campaign composition.
 * Call only once at outer transaction entry, never beneath an ordinary prefix. */
export function workerSource<T>(tx: Tx, operation: Extract<DiagnosticSourceOperation, "identity_material_change" | "proof_expire" | "ownership_expire">, rows: readonly DiagnosticSourceRow[], cutoff: Date | null,
  work: () => Promise<T>, roots: readonly DiagnosticSourceRoot[] = []): Promise<T> {
  return withDiagnosticSourceCommand(tx, { operation, roots: rootsFor(rows, roots), rows, cutoff,
    actorUserId: null, sessionId: null, campaign: null }, work);
}

/** PDF/report-evidence and scalar lease writes are ordinary source exclusions.
 * Still prepare their exact campaign mutations and the registry's retained/absent
 * upstream closure before report, FK, unique-index or resource advisory locks.
 * Keep the campaign receipt open through the write, not just through discovery. */
export async function workerOrdinary<T>(tx: Tx, rows: readonly DiagnosticSourceRow[], work: () => Promise<T>, roots: readonly DiagnosticSourceRoot[] = []): Promise<T> {
  if (!rows.length) throw changed();
  const command = { operation: "order_change", roots: rootsFor(rows, roots), rows, actorUserId: null, sessionId: null, cutoff: null, campaign: null };
  const discover = async () => {
    const [found] = await tx.$queryRaw<{ scope: Scope; keys: unknown; campaigns: string[]; mutations: CampaignMutation[] }[]>`
      WITH discovered AS MATERIALIZED (SELECT public.diagnostic_source_scope(${JSON.stringify(command)}::jsonb) AS scope)
      SELECT scope,public.diagnostic_source_lock_keys(scope,${JSON.stringify(command)}::jsonb) AS keys,
        public.diagnostic_source_campaigns(scope,${JSON.stringify(command)}::jsonb) AS campaigns,
        public.campaign_source_mutations(scope,${JSON.stringify(command)}::jsonb) AS mutations FROM discovered
    `;
    if (!found) throw changed();
    return found;
  };
  const before = await discover();
  const tables = await tx.$queryRaw<{ table: string; namespace: number }[]>`
    SELECT m->>'table' AS table,(m->>'namespace')::int AS namespace
    FROM jsonb_array_elements(public.diagnostic_source_registry()) m ORDER BY (m->>'namespace')::int
  `;
  return withCampaignPreparation(tx, before.mutations, async () => {
    for (const table of tables) {
      if (!/^[a-z_]+$/.test(table.table)) throw changed();
      // Match the existing message-prefix try-lock rule. Never wait for a message
      // writer which may already be waiting for one of our retained rows.
      if (table.namespace === 898310) {
        const locks = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock((k->>'namespace')::int,(k->>'key')::int) AS acquired
          FROM jsonb_array_elements(${JSON.stringify(before.keys)}::jsonb) k WHERE (k->>'namespace')::int=${table.namespace} ORDER BY (k->>'key')::int`;
        if (locks.some(lock => !lock.acquired)) throw changed();
      } else await tx.$queryRaw`SELECT pg_advisory_xact_lock((k->>'namespace')::int,(k->>'key')::int)::text
        FROM jsonb_array_elements(${JSON.stringify(before.keys)}::jsonb) k WHERE (k->>'namespace')::int=${table.namespace} ORDER BY (k->>'key')::int`;
      for (const row of before.scope.filter(row => row.table === table.table).sort((a, b) => JSON.stringify(a.key) < JSON.stringify(b.key) ? -1 : JSON.stringify(a.key) > JSON.stringify(b.key) ? 1 : 0)) {
        await tx.$queryRawUnsafe(`SELECT 1 FROM public.${table.table} s WHERE to_jsonb(s) @> $1::jsonb FOR UPDATE`, JSON.stringify(row.key));
      }
    }
    if (JSON.stringify(await discover()) !== JSON.stringify(before)) throw changed();
    // Ordinary preparation does not parse a source command. Assert the planned
    // OLD/absent tuples ourselves after the complete prefix, before caller work.
    for (const row of rows) {
      const [current] = await tx.$queryRaw<{ source: DiagnosticSourceTuple | null }[]>`
        SELECT public.diagnostic_source_project(public.diagnostic_source_read(${row.table},${JSON.stringify(row.key)}::jsonb),public.diagnostic_source_meta(${row.table})->'fields') AS source
      `;
      if (!current || tuple(current.source) !== tuple(row.expected === "absent" ? null : row.expected.source)) throw changed();
    }
    const result = await work();
    // Campaign guards fence namespaces, not the caller's complete material tuple.
    // Check the actual post-trigger result before finishing this ordinary receipt.
    for (const row of rows) {
      const [current] = await tx.$queryRaw<{ source: DiagnosticSourceTuple | null }[]>`
        SELECT public.diagnostic_source_project(public.diagnostic_source_read(${row.table},${JSON.stringify(row.key)}::jsonb),public.diagnostic_source_meta(${row.table})->'fields') AS source
      `;
      if (!current || tuple(current.source) !== tuple(row.next)) throw changed();
    }
    return result;
  });
}
