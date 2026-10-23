import { createHash, randomUUID } from "node:crypto";

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
    if (!object(wanted)) return actual === wanted;
    return Object.entries(wanted).every(([op, value]) => {
      if (op === "not") return actual !== value;
      if (op === "in") return (value as unknown[]).includes(actual);
      if (op === "lt") return actual != null && (actual as number) < (value as number);
      if (op === "lte") return actual != null && (actual as number) <= (value as number);
      if (op === "gt") return actual != null && (actual as number) > (value as number);
      if (op === "none") return Array.isArray(actual) && !actual.some(r => matches(r as Row, value as Row));
      if (op === "some") return Array.isArray(actual) && actual.some(r => matches(r as Row, value as Row));
      return object(actual) && matches(actual, { [op]: value });
    });
  });
}
/** Database boundary fake: CRUD/filter/CAS only. It does not implement projection,
 * authorization, generation, cleanup, erasure SQL or transaction/row-lock semantics. */
export class DiagnosticMemoryDatabase {
  private readonly tables = new Map<string, Row[]>();
  readonly client: PrismaService;
  private table(name: string): Row[] {
    const rows = this.tables.get(name);
    if (!rows) throw new Error(`Unknown fake table ${name}`);
    return rows;
  }
  constructor() {
    const client: Row = { $queryRaw: async () => [], $executeRaw: async () => 0 };
    for (const name of ["user", "session", "dealershipMember", "inspectionOrder", "listing", "diagnosticReportRecord", "diagnosticPdfArtifact", "diagnosticEvidence", "diagnosticTemplateVersion", "diagnosticOrderAssignment", "diagnosticCenterAssignment", "diagnosticIdentityEvidence", "diagnosticIdentityProvenance"]) {
      this.tables.set(name, []);
      const rows = () => this.table(name);
      const reportRelations = (row: Row): Row => ({ ...row, order: this.table("inspectionOrder").find(o => o["id"] === row["orderId"]), artifacts: this.table("diagnosticPdfArtifact").filter(a => a["reportId"] === row["id"]) });
      const related = (row: Row): Row => ({ ...row,
        ...(name === "diagnosticReportRecord" ? { order: this.table("inspectionOrder").find(o => o["id"] === row["orderId"]), artifacts: this.table("diagnosticPdfArtifact").filter(a => a["reportId"] === row["id"]), evidence: [], predecessor: this.table("diagnosticReportRecord").filter(r => r["id"] === row["predecessorId"]).map(reportRelations)[0] ?? null } : {}),
        ...(["diagnosticEvidence", "diagnosticPdfArtifact"].includes(name) ? { report: this.table("diagnosticReportRecord").filter(r => r["id"] === row["reportId"]).map(r => ({ ...reportRelations(r), predecessor: this.table("diagnosticReportRecord").filter(p => p["id"] === r["predecessorId"]).map(reportRelations)[0] ?? null }))[0] } : {}) });
      const findMany = async (args: Args = {}) => {
        let result = rows().map(related).filter(r => matches(r, args.where));
        const order = args.orderBy ? Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy] : [];
        result.sort((a, b) => {
          for (const clause of order) for (const [key, direction] of Object.entries(clause)) {
            const av = a[key] as string | number | Date | null, bv = b[key] as string | number | Date | null;
            if (av === bv) continue;
            const diff = av == null ? -1 : bv == null ? 1 : av < bv ? -1 : 1;
            return direction === "desc" ? -diff : diff;
          }
          return 0;
        });
        if (args.take) result = result.slice(0, args.take);
        return result.map(row => {
          const relations = ["order", "artifacts", "evidence", "report", "predecessor"];
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
        for (const row of selected) for (const [key, value] of Object.entries(args.data ?? {})) row[key] = object(value) && "increment" in value ? Number(row[key]) + Number(value["increment"]) : clone(value);
        return { count: selected.length };
      };
      client[name] = { findMany, findFirst, findUnique: findFirst, findUniqueOrThrow, findFirstOrThrow: findUniqueOrThrow, updateMany,
        update: async (args: Args) => { await updateMany(args); return findUniqueOrThrow({ where: args.where }); },
        create: async (args: Args) => { const row = { id: randomUUID(), epoch: randomUUID(), state: "pending", generation: 1, attempts: 0, retryAt: null, failureCode: null, leaseUntil: null, sha256: null, sizeBytes: null, verifiedAt: null, cleanupRequestedAt: null, cleanupCompletedAt: null, createdAt: new Date("2026-10-23T00:00:00Z"), ...clone(args.data) }; rows().push(row); return clone(row); } };
    }
    client["$transaction"] = async (fn: (tx: unknown) => Promise<unknown>) => fn(client);
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
