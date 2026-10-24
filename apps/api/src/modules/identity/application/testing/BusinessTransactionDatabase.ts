import { randomUUID } from "node:crypto";
import type { PrismaService } from "@auto-tm/db";

type Row = Record<string, unknown>;
type Args = { where?: Row; data?: Row; include?: Row; select?: Row; orderBy?: Row };
const tableNames = { users: "user", sessions: "session", dealership_members: "dealershipMember", dealerships: "dealership", dealership_invitations: "dealershipInvitation", audit_logs: "auditLog", measurement_state: "measurementState" } as const;
const fields: Record<string, string[]> = { dealership_members: ["id", "userId", "dealershipId", "role", "status"], dealerships: ["id", "status", "admissionMode", "admittedAt"] };
function matches(row: Row, where: Row = {}): boolean {
 return Object.entries(where).every(([key, expected]) => {
  const value = row[key];
  if (expected && typeof expected === "object" && !(expected instanceof Date)) {
   if ("not" in expected) return value !== expected.not;
   if ("in" in expected) return (expected.in as unknown[]).includes(value);
  }
  return value === expected;
 });
}
/** Finite Prisma boundary fake for Business callers. It models rollback and
 * rejects writes/locks before preparation. It does not emulate PostgreSQL
 * discovery, advisory locks, triggers, FKs or source SQL acceptance. */
export class BusinessTransactionDatabase {
 readonly client: PrismaService;
 private tables: Record<string, Row[]> = Object.fromEntries(Object.values(tableNames).concat("staffGrant").map(name => [name, []]));
 failAudit = false;
 beforePrepared: (() => void) | undefined;
 private prepared = false;
 private command: Row | undefined;
 constructor() {
  const client: Row = {};
  const related = (name: string, row: Row): Row => ({ ...row,
   ...(name === "session" ? { user: this.rows("user").find(u => u["id"] === row["userId"]) } : {}),
   ...(name === "user" ? { dealershipMemberships: this.rows("dealershipMember").filter(m => m["userId"] === row["id"]) } : {}),
   ...(name === "dealershipMember" || name === "dealershipInvitation" ? { dealership: this.rows("dealership").find(b => b["id"] === row["dealershipId"]) } : {}),
   ...(name === "dealership" ? { members: this.rows("dealershipMember").filter(m => m["dealershipId"] === row["id"] && m["role"] === "owner").map(m => ({ ...m, user: this.rows("user").find(u => u["id"] === m["userId"]) })) } : {}),
  });
  const write = () => { if (!this.prepared) throw new Error("write_before_preparation"); };
  for (const name of Object.keys(this.tables)) {
   const findMany = async (args: Args = {}) => this.rows(name).filter(row => matches(row, args.where)).sort((a,b) => String(a["id"]).localeCompare(String(b["id"]))).map(row => structuredClone(args.select ? Object.fromEntries(Object.keys(args.select).map(k => [k,row[k]])) : related(name,row)));
   const findUnique = async (args: Args) => (await findMany(args))[0] ?? null;
   const updateMany = async ({ where, data }: Args) => { write(); const rows = this.rows(name).filter(row => matches(row,where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; };
   const deleteMany = async ({ where }: Args) => { write(); const original = this.rows(name); this.tables[name] = original.filter(row => !matches(row,where)); return { count: original.length - this.rows(name).length }; };
   client[name] = { findMany, findUnique, findFirst: findUnique, updateMany, deleteMany,
    update: async (args: Args) => { const row = this.rows(name).find(row => matches(row,args.where)); if (!row) throw new Error("P2025"); await updateMany(args); return structuredClone(row); },
    delete: async (args: Args) => { const row = await findUnique(args); if (!row) throw new Error("P2025"); await deleteMany(args); return row; },
    create: async ({ data }: Args) => { write(); if (name === "auditLog" && this.failAudit) throw new Error("audit_failed"); const row = { id: randomUUID(), revokedAt: null, redeemedAt: null, admittedAt: null, ...data }; this.rows(name).push(row); return structuredClone(row); },
   };
  }
  client["$queryRaw"] = async (parts: TemplateStringsArray, ...values: unknown[]) => {
   const sql = parts.join("?");
   if (sql.includes("diagnostic_source_read")) {
    // The production SQL, not this fake, owns registry and normalization.
    const table = String(values[0]), id = String(values[1]), overlay = JSON.parse(String(values[2] ?? "{}")) as Row;
    const rows = this.rows(tableNames[table as keyof typeof tableNames]);
    const row = rows.find(row => row["id"] === id);
    const source = row ? Object.fromEntries((fields[table] ?? []).map(k => [k,row[k] instanceof Date ? (row[k] as Date).toISOString() : row[k] ?? null])) : null;
    return [{ source, next: { ...(source ?? {}), ...overlay } }];
   }
   if (sql.includes("diagnostic_prepare_source") || sql.includes("campaign_prepare")) {
    if (this.prepared) throw new Error("nested_preparation");
    this.beforePrepared?.(); this.beforePrepared = undefined;
    this.prepared = true; this.command = sql.includes("diagnostic_prepare_source") ? JSON.parse(String(values[0])) as Row : undefined;
    return [{ receipt: "00000000-0000-4000-8000-000000000001" }];
   }
   if (sql.includes("diagnostic_assert_source")) { if (!this.prepared) throw new Error("diagnostic_source_receipt"); return []; }
   if (sql.includes("diagnostic_finish_source") || sql.includes("campaign_finish")) { if (!this.prepared) throw new Error("unfinished_preparation"); this.prepared = false; this.command = undefined; return []; }
   if (sql.includes("FOR UPDATE")) { if (!this.prepared) throw new Error("lock_before_preparation"); }
   if (sql.includes("measurement_state")) return structuredClone(this.rows("measurementState").filter(row => row["key"] === "collector"));
   return [];
  };
  client["$transaction"] = async <T>(work: (tx: Row) => Promise<T>): Promise<T> => {
   const before = structuredClone(this.tables); this.prepared = false;
   try { const result = await work(client); if (this.prepared) throw new Error("unfinished_preparation"); return result; }
   catch (error) { this.tables = before; this.prepared = false; this.command = undefined; throw error; }
  };
  this.client = client as unknown as PrismaService;
 }
 seed(table: string, ...rows: Row[]) { this.rows(table).push(...structuredClone(rows)); }
 rows(table: string): Row[] { const rows = this.tables[table]; if (!rows) throw new Error(`unknown table ${table}`); return rows; }
 snapshot() { return structuredClone(this.tables); }
}
