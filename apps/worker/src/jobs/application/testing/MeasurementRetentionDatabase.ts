import type { PrismaService } from "@auto-tm/db";

const tables = ["measurement_records", "measurement_outbox", "measurement_principals", "measurement_visits", "measurement_rollups", "measurement_investigation_exports"] as const;
type Table = typeof tables[number];
type Row = { id: string; dueAt: Date; locked?: boolean };

/** Offline database boundary. Models transaction rollback and bounded due-row
 * deletion, not PostgreSQL's lock manager, triggers or FK cascades. */
export class MeasurementRetentionDatabase {
 readonly rows: Record<Table, Row[]> = {
  measurement_records: [], measurement_outbox: [], measurement_principals: [],
  measurement_visits: [], measurement_rollups: [], measurement_investigation_exports: [],
 };
 collectorEpoch: string | null = "current-external-epoch";
 collectorBusy = false;
 failAt: Table | null = null;
 readonly options: { timeout: number; maxWait: number }[] = [];

 asPrisma(): PrismaService { return this as unknown as PrismaService; }

 async $transaction<T>(work: (tx: object) => Promise<T>, options: { timeout: number; maxWait: number }): Promise<T> {
  this.options.push(options);
  const draft = structuredClone(this.rows);
  const tx = {
   $queryRaw: async (parts: TemplateStringsArray) => {
    const sql = parts.join("?");
    if (sql.includes('FROM "measurement_state"')) {
     if (sql.includes("FOR UPDATE") && this.collectorBusy) throw new Error("statement timeout waiting for collector");
     return this.collectorEpoch === null ? [] : [{ epoch: this.collectorEpoch }];
    }
    if (sql.includes("MIN(expiry)")) {
     const oldest = Object.values(draft).flat().map(row => row.dueAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
     return [{ oldest }];
    }
    throw new Error(`Unexpected database read: ${sql}`);
   },
   $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const sql = parts.join("?");
    if (sql === "SET LOCAL statement_timeout = '2000ms'") return 0;
    const table = tables.find(name => sql.includes(`DELETE FROM "${name}"`));
    if (!table) throw new Error(`Unexpected database write: ${sql}`);
    if (this.failAt === table) throw new Error("injected database failure");
    const cutoff = values[0] as Date, limit = values[1] as number;
    const selected = draft[table].filter(row => !row.locked && row.dueAt <= cutoff)
     .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id.localeCompare(b.id)).slice(0, limit);
    draft[table] = draft[table].filter(row => !selected.includes(row));
    return selected.length;
   },
  };
  const result = await work(tx);
  Object.assign(this.rows, draft);
  return result;
 }
}
