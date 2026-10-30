import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { Prisma } from "../../generated/prisma/client/client";
import type { PrismaService } from "../prisma.service";

type Row = Record<string, unknown>;
type Args = { where?: Row | undefined; data?: Row; include?: Row; select?: Row; orderBy?: Row | Row[]; take?: number };
const clone = <T>(value: T): T => structuredClone(value);
const object = (value: unknown): value is Row => !!value && typeof value === "object" && !(value instanceof Date);
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, wanted]) => {
    if (key === "AND") return (Array.isArray(wanted) ? wanted : [wanted]).every(w => matches(row, w as Row));
    if (key === "OR") return (wanted as Row[]).some(w => matches(row, w));
    const actual = row[key];
    if (key.includes("_") && object(wanted)) return matches(row, wanted);
    if (!object(wanted)) return actual instanceof Date && wanted instanceof Date ? actual.getTime() === wanted.getTime() : actual === wanted;
    return Object.entries(wanted).every(([op, value]) => {
      if (op === "is") return actual === value;
      if (op === "not") return actual !== value;
      if (op === "in") return (value as unknown[]).includes(actual);
      if (op === "notIn") return actual != null && !(value as unknown[]).includes(actual);
      if (op === "lt") return actual != null && (actual instanceof Date ? actual.getTime() : actual as number) < (value instanceof Date ? value.getTime() : value as number);
      if (op === "lte") return actual != null && (actual instanceof Date ? actual.getTime() : actual as number) <= (value instanceof Date ? value.getTime() : value as number);
      if (op === "gt") return actual != null && (actual instanceof Date ? actual.getTime() : actual as number) > (value instanceof Date ? value.getTime() : value as number);
      if (op === "none") return Array.isArray(actual) && !actual.some(r => matches(r as Row, value as Row));
      if (op === "some") return Array.isArray(actual) && actual.some(r => matches(r as Row, value as Row));
      return object(actual) && matches(actual, { [op]: value });
    });
  });
}
type Mutation = { table: string; key: Record<string, string>; verb: string; next: Row | null };
type MemoryTransaction = { receipt?: string; mutations?: Mutation[] };
const physical: Record<string, string> = {
  diagnostic_centers: "diagnosticCenter",
  users: "user", sessions: "session", staff_grants: "staffGrant", listings: "listing", dealership_members: "dealershipMember",
  inspection_orders: "inspectionOrder", diagnostic_reports: "diagnosticReportRecord", diagnostic_pdf_artifacts: "diagnosticPdfArtifact",
  diagnostic_evidence: "diagnosticEvidence", diagnostic_template_versions: "diagnosticTemplateVersion", diagnostic_order_assignments: "diagnosticOrderAssignment",
  diagnostic_center_assignments: "diagnosticCenterAssignment", diagnostic_identity_records: "diagnosticIdentityRecord", diagnostic_identity_evidence: "diagnosticIdentityEvidence",
  diagnostic_identity_provenance: "diagnosticIdentityProvenance", diagnostic_continuity_proofs: "diagnosticContinuityProof", diagnostic_continuity_requests: "diagnosticContinuityRequest",
  diagnostic_audits: "diagnosticAudit", diagnostic_ownership_grants: "diagnosticOwnershipGrant", diagnostic_ownership_components: "diagnosticOwnershipComponent",
};
const memoryKey = (table: string, row: Row): Record<string, string> => table === "staff_grants" ? { userId: String(row["userId"]), capability: String(row["capability"]) }
  : table === "diagnostic_ownership_components" ? { identityRecordId: String(row["identityRecordId"]) } : { id: String(row["id"]) };
const wire = (value: unknown): Row => JSON.parse(JSON.stringify(value)) as Row;

/** Database boundary fake for CRUD/filter/CAS and ordinary finite campaign plans.
 * It checks absent/OLD/NEW tuples and rollback at that boundary. It does not model
 * PostgreSQL source receipts, guards, authorization, advisory locks or waits;
 * prepared-source and race acceptance must use real restricted PostgreSQL. */
export class DiagnosticMemoryDatabase {
  private readonly tables = new Map<string, Row[]>();
  private readonly transactions = new AsyncLocalStorage<MemoryTransaction>();
  readonly client: PrismaService;
  private table(name: string): Row[] {
    const rows = this.tables.get(name);
    if (!rows) throw new Error(`Unknown fake table ${name}`);
    return rows;
  }
  private readPhysical(table: string, key: Record<string, string>): Row | null {
    const name = physical[table];
    if (!name) throw new Error(`Unsupported memory source table ${table}`);
    const row = this.table(name).find(row => matches(row, key));
    return row ? wire(row) : null;
  }
  private ordinaryScope(command: { roots: Mutation[]; rows: Mutation[] }) {
    const selected = new Map<string, { table: string; key: Record<string, string> }>();
    const add = (table: string, key: Record<string, string>) => { if (physical[table]) selected.set(JSON.stringify([table, key]), { table, key }); };
    for (const root of [...command.roots, ...command.rows]) add(root.table, root.key);
    const references: Record<string, string> = { orderId: "inspection_orders", reportId: "diagnostic_reports", predecessorId: "diagnostic_reports",
      predecessorReportId: "diagnostic_reports", candidateOrderId: "inspection_orders", predecessorOrderId: "inspection_orders", identityRecordId: "diagnostic_identity_records",
      templateVersionId: "diagnostic_template_versions", listingId: "listings", commissionerId: "users", sellerId: "users", createdById: "users", recordedById: "users",
      issuerId: "users", linkingTechnicianId: "users", issuerSessionId: "sessions", sessionId: "sessions", actorId: "users", grantId: "diagnostic_ownership_grants" };
    let previous = -1;
    while (previous !== selected.size) {
      previous = selected.size;
      for (const root of [...selected.values()]) {
        const row = this.readPhysical(root.table, root.key) ?? command.rows.find(row => row.table === root.table && JSON.stringify(row.key) === JSON.stringify(root.key))?.next;
        if (row) for (const [field, table] of Object.entries(references)) if (typeof row[field] === "string") add(table, { id: row[field] as string });
      }
      for (const [table, model] of Object.entries(physical)) for (const row of this.table(model)) {
        if (Object.entries(references).some(([field, target]) => ["inspection_orders", "diagnostic_reports", "diagnostic_identity_records"].includes(target) &&
          typeof row[field] === "string" && selected.has(JSON.stringify([target, { id: row[field] }])))) add(table, memoryKey(table, row));
      }
      if (selected.size > 1000) throw new Error("diagnostic_source_scope_limit");
    }
    return [...selected.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))).map(root => ({ ...root, row: this.readPhysical(root.table, root.key) }));
  }
  private assertOrdinaryWrite(model: string, verb: string, old: Row | null, next: Row): void {
    const context = this.transactions.getStore();
    if (!context?.receipt) return;
    const table = Object.keys(physical).find(table => physical[table] === model);
    if (!table) throw new Error("campaign_preparation_uncovered");
    const key = memoryKey(table, next);
    const mutation = context.mutations?.find(row => row.table === table && JSON.stringify(row.key) === JSON.stringify(key));
    if (!mutation || mutation.verb !== verb || (verb === "insert" && old) || canonical(wire(mutation.next)) !== canonical(wire(next))) throw new Error("campaign_preparation_changed");
  }
  constructor() {
    const client: Row = { $queryRaw: async (parts: TemplateStringsArray, ...values: string[]) => {
      // Material SELECTs used to bind staffing, with locks deliberately unmodelled.
      const sql = parts.join("?");
      if (sql.includes("diagnostic_prepare_source")) throw new Error("Prepared source acceptance requires real PostgreSQL");
      if (sql.includes("diagnostic_source_project(public.diagnostic_source_read")) {
        const table = values[0] ?? "", key = JSON.parse(values[1] ?? "{}") as Record<string, string>;
        const source = this.readPhysical(table, key);
        return [{ source, ...(sql.includes("diagnostic_source_normalize") ? { next: { ...source, ...JSON.parse(values.at(-1) ?? "{}") as Row } } : {}) }];
      }
      if (sql.includes("WITH discovered AS MATERIALIZED")) {
        const command = JSON.parse(values[0] ?? "{}") as { roots: Mutation[]; rows: Mutation[] };
        const scope = this.ordinaryScope(command);
        const mutations: Mutation[] = scope.map(root => command.rows.find(row => row.table === root.table && JSON.stringify(row.key) === JSON.stringify(root.key)) ??
          { table: root.table, key: root.key, verb: root.row ? "update" : "insert", next: root.row ?? {} });
        return [{ scope, keys: [], campaigns: [], mutations }];
      }
      if (sql.includes("FROM jsonb_array_elements(public.diagnostic_source_registry())")) return Object.keys(physical).map((table, namespace) => ({ table, namespace }));
      if (sql.includes("public.campaign_prepare(")) {
        const context = this.transactions.getStore();
        const mutations = JSON.parse(values[0] ?? "[]") as Mutation[];
        if (!context || context.receipt || mutations.length < 1 || mutations.length > 1000) throw new Error("campaign_preparation_shape");
        context.receipt = randomUUID(); context.mutations = mutations;
        return [{ receipt: context.receipt }];
      }
      if (sql.includes("public.campaign_finish(")) {
        const context = this.transactions.getStore();
        if (!context?.receipt || context.receipt !== values[0]) throw new Error("campaign_preparation_receipt");
        delete context.receipt; delete context.mutations;
        return [];
      }
      if (sql.includes('SELECT id,"orderId","userId"')) return clone(this.table("diagnosticOrderAssignment").filter(row => values.slice(0, 2).includes(row["orderId"] as string) && values.slice(2).includes(row["userId"] as string)).sort((a, b) => String(a["id"]).localeCompare(String(b["id"]))));
      if (sql.includes('SELECT id,"centerId","userId"')) return clone(this.table("diagnosticCenterAssignment").filter(row => values.slice(0, 2).includes(row["centerId"] as string) && values.slice(2).includes(row["userId"] as string)).sort((a, b) => String(a["id"]).localeCompare(String(b["id"]))));
      return [];
    }, $executeRaw: async () => 0, $queryRawUnsafe: async () => [] };
    for (const name of Object.values(physical)) {
      this.tables.set(name, []);
      const rows = () => this.table(name);
      const reportRelations = (row: Row): Row => ({ ...row, order: this.table("inspectionOrder").filter(o => o["id"] === row["orderId"]).map(orderRelations)[0], artifacts: this.table("diagnosticPdfArtifact").filter(a => a["reportId"] === row["id"]) });
      const orderRelations = (row: Row): Row => ({ ...row, assignments: this.table("diagnosticOrderAssignment").filter(a => a["orderId"] === row["id"]) });
      const related = (row: Row): Row => ({ ...row,
        ...(name === "inspectionOrder" ? orderRelations(row) : {}),
        ...(name === "session" ? { user: (() => {
          const user = this.table("user").find(u => u["id"] === row["userId"]);
          const grants = this.table("staffGrant").filter(g => g["userId"] === row["userId"]);
          return user ? { ...user, ...(grants.length ? { staffGrants: grants.filter(g => !g["revokedAt"]) } : {}) } : row["user"];
        })() } : {}),
        ...(name === "diagnosticIdentityEvidence" ? { identityRecord: this.table("diagnosticIdentityRecord").find(r => r["id"] === row["identityRecordId"]), successor: this.table("diagnosticIdentityEvidence").find(r => r["supersedesId"] === row["id"]) ?? null } : {}),
        ...(name === "diagnosticReportRecord" ? { order: this.table("inspectionOrder").filter(o => o["id"] === row["orderId"]).map(orderRelations)[0], artifacts: this.table("diagnosticPdfArtifact").filter(a => a["reportId"] === row["id"]), evidence: [], predecessor: this.table("diagnosticReportRecord").filter(r => r["id"] === row["predecessorId"]).map(reportRelations)[0] ?? null } : {}),
        ...(["diagnosticEvidence", "diagnosticPdfArtifact"].includes(name) ? { report: this.table("diagnosticReportRecord").filter(r => r["id"] === row["reportId"]).map(r => ({ ...reportRelations(r), predecessor: this.table("diagnosticReportRecord").filter(p => p["id"] === r["predecessorId"]).map(reportRelations)[0] ?? null }))[0] } : {}) });
      const findMany = async (args: Args = {}) => {
        let result = rows().map(related).filter(r => matches(r, args.where));
        const order = args.orderBy ? Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy] : [];
        result.sort((a, b) => {
          for (const clause of order) for (const [key, direction] of Object.entries(clause)) {
            const left = a[key] as string | number | Date | null, right = b[key] as string | number | Date | null;
            const av = left instanceof Date ? left.getTime() : left, bv = right instanceof Date ? right.getTime() : right;
            if (av === bv) continue;
            const diff = av == null ? -1 : bv == null ? 1 : av < bv ? -1 : 1;
            return direction === "desc" ? -diff : diff;
          }
          return 0;
        });
        if (args.take) result = result.slice(0, args.take);
        return result.map(row => {
          const relations = ["order", "artifacts", "evidence", "report", "predecessor", "assignments", "identityRecord"];
          const output = Object.fromEntries(Object.entries(row).filter(([key]) => !relations.includes(key) || args.include?.[key]));
          return clone(args.select ? Object.fromEntries(Object.keys(args.select).map(k => [k, row[k]])) : output);
        });
      };
      const findFirst = async (args: Args) => (await findMany(args))[0] ?? null;
      const findUniqueOrThrow = async (args: Args) => { const row = await findFirst(args); if (!row) throw new Error("Missing fake database row"); return row; };
      const updateMany = async (args: Args) => {
        const selected = rows().filter(row => matches(related(row), args.where));
        if (name === "diagnosticPdfArtifact") for (const row of selected) {
          for (const key of ["id", "reportId", "snapshotHash", "locale", "rendererVersion", "generation", "objectKey"]) {
            if (args.data && key in args.data && args.data[key] !== row[key]) throw new Error("diagnostic_pdf_identity_immutable");
          }
        }
        for (const row of selected) {
          const next = { ...row };
          for (const [key, value] of Object.entries(args.data ?? {})) next[key] = value === Prisma.DbNull || value === Prisma.JsonNull ? null : object(value) && "increment" in value ? Number(row[key]) + Number(value["increment"]) : clone(value);
          this.assertOrdinaryWrite(name, "update", row, next);
          Object.assign(row, next);
        }
        return { count: selected.length };
      };
      client[name] = { count: async (args: Args) => (await findMany(args)).length, findMany, findFirst, findUnique: findFirst, findUniqueOrThrow, findFirstOrThrow: findUniqueOrThrow, updateMany,
        update: async (args: Args) => { await updateMany(args); return findUniqueOrThrow({ where: args.where }); },
        create: async (args: Args) => { const row = { id: randomUUID(), epoch: randomUUID(), state: "pending", generation: 1, attempts: 0, retryAt: null, failureCode: null, leaseUntil: null, sha256: null, sizeBytes: null, verifiedAt: null, cleanupRequestedAt: null, cleanupCompletedAt: null, createdAt: new Date("2026-10-23T00:00:00Z"), ...(name === "diagnosticReportRecord" ? { status: "draft", version: 0, erasedAt: null, snapshot: null, withdrawnAt: null, withdrawalReason: null } : {}), ...(name === "diagnosticContinuityProof" ? { consumedReportId: null, consumedAt: null, invalidatedAt: null, erasedAt: null } : {}), ...clone(args.data) }; this.assertOrdinaryWrite(name, "insert", rows().find(old => old["id"] === row.id) ?? null, row); rows().push(row); return clone(row); } };
    }
    client["$transaction"] = async (fn: (tx: unknown) => Promise<unknown>) => {
      const before = clone([...this.tables.entries()]);
      return this.transactions.run({}, async () => {
        try {
          const result = await fn(client);
          if (this.transactions.getStore()?.receipt) throw new Error("campaign_preparation_unfinished");
          return result;
        } catch (error) { this.tables.clear(); for (const [name, rows] of before) this.tables.set(name, rows); throw error; }
      });
    };
    this.client = client as unknown as PrismaService;
  }
  seed(table: string, row: Row) { this.table(table).push(clone(row)); }
}
export const diagnosticTestId = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
export const diagnosticTestNow = new Date("2026-10-23T00:00:00.000Z");
export const diagnosticTestSha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : object(value) ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
export async function diagnosticReaderFixture() {
  const memory = new DiagnosticMemoryDatabase(), db = memory.client, id = diagnosticTestId;
  const localized = { tk: "Synag nusgasy", ru: "Синтетический образец", en: "Synthetic sample" };
  const template = { title: localized, limitations: localized, syntheticNotice: localized, checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
  const listing = { id: id(8), sellerId: id(7), businessId: null, vin: "SYN-123", brandId: id(9), modelId: id(10), year: 2020, deletedAt: null, status: "active", seller: { deletionScheduledAt: null, suspendedAt: null } };
  const listingIdentityDigest = diagnosticTestSha(JSON.stringify([listing.id, listing.sellerId, null, "SYN-123", listing.brandId, listing.modelId, 2020]));
  memory.seed("listing", listing);
  for (const n of [1, 2]) memory.seed("inspectionOrder", { id: id(n + 2), commissionerId: id(n === 1 ? 6 : 7), centerId: id(12), erasedAt: null, synthetic: true, audience: "listing_public", listingId: n === 2 ? id(8) : null, publicationAuthorization: {}, associationValidatedAt: diagnosticTestNow, listingIdentityDigest });
  const finding = { id: id(20), checkId: "brakes", assessment: "normal", explanation: "B own observation", evidenceIds: [], kind: null, source: null, measurement: null, location: null };
  const state = { id: id(2), orderId: id(4), templateVersionId: id(5), audience: "listing_public", status: "finalized", observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 124100, authorId: id(30), reviewerId: id(31), successorOf: id(1), correctionReason: "Independent visit", returnReason: null, finalizedAt: diagnosticTestNow.toISOString(), withdrawnAt: null, withdrawalReason: null, findings: [finding] };
  const snapshot = { report: state, template, synthetic: true };
  memory.seed("diagnosticTemplateVersion", { id: id(5), synthetic: true, definition: template });
  memory.seed("diagnosticReportRecord", { id: id(1), orderId: id(3), erasedAt: null, snapshotHash: "a".repeat(64), state: {}, snapshot: {} });
  memory.seed("diagnosticReportRecord", { id: id(2), orderId: id(4), templateVersionId: id(5), audience: "listing_public", reinspection: true, predecessorId: id(1), state, snapshot, snapshotHash: diagnosticTestSha(canonical(snapshot)), status: "finalized", erasedAt: null, withdrawnAt: null, withdrawalReason: null, version: 3 });
  for (const [index, locale] of ["tk", "ru", "en"].entries()) await db.diagnosticPdfArtifact.create({ data: { id: id(40 + index), reportId: id(2), snapshotHash: diagnosticTestSha(canonical(snapshot)), locale, rendererVersion: "v1", objectKey: `diagnostic-pdf/${id(2)}/${id(40 + index)}.pdf` } });
  const eraseA = async () => { await db.diagnosticReportRecord.update({ where: { id: id(1) }, data: { erasedAt: diagnosticTestNow } }); await db.inspectionOrder.update({ where: { id: id(3) }, data: { erasedAt: diagnosticTestNow, commissionerId: null } }); };
  return { memory, db, snapshot, eraseA };
}
