import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { DiagnosticMemoryDatabase, diagnosticTestId as id, diagnosticTestSha as sha } from "@auto-tm/db/testing";
import type { DiagnosticSourceCommand, Prisma, PrismaService } from "@auto-tm/db";
import { CheckBusinessAuthority } from "../CheckBusinessAuthority";
import { CheckStaffAuthority } from "../CheckStaffAuthority";
import { PrismaBusinessAuthority } from "../../infrastructure/PrismaBusinessAuthority";
import { PrismaStaffAuthority } from "../../infrastructure/PrismaStaffAuthority";
import { PrismaStaffBindings } from "../../infrastructure/PrismaStaffBindings";
import { PrismaPublisherBindings } from "../../infrastructure/PrismaPublisherBindings";
import { DiagnosticAuthority } from "../../../diagnostics/infrastructure/DiagnosticAuthority";
import { CampaignDiagnosticAdmission } from "../../../diagnostics/infrastructure/campaignDiagnosticAdmission";
import { DiagnosticReportAccess } from "../../../diagnostics/infrastructure/DiagnosticReportAccess";
import { DiagnosticPublicBindings } from "../../../diagnostics/infrastructure/DiagnosticPublicBindings";
import { PrismaDiagnosticReports } from "../../../diagnostics/infrastructure/PrismaDiagnosticReports";
import { PrismaDiagnosticDocuments } from "../../../diagnostics/infrastructure/PrismaDiagnosticDocuments";
import { PrismaDiagnosticIdentityEvidence } from "../../../diagnostics/infrastructure/PrismaDiagnosticIdentityEvidence";
import { PrismaDiagnosticContinuityProofs } from "../../../diagnostics/infrastructure/PrismaDiagnosticContinuityProofs";
import { DiagnosticDiscoveryCursor } from "../../../diagnostics/infrastructure/DiagnosticDiscoveryCursor";
import type { DiagnosticObjects } from "../../../diagnostics/domain/ports/DiagnosticObjects";

type Row = Record<string, unknown>;
const tables = { user: "users", session: "sessions", staffGrant: "staff_grants", inspectionOrder: "inspection_orders", diagnosticReportRecord: "diagnostic_reports", diagnosticIdentityRecord: "diagnostic_identity_records", diagnosticIdentityEvidence: "diagnostic_identity_evidence", diagnosticIdentityProvenance: "diagnostic_identity_provenance", diagnosticEvidence: "diagnostic_evidence", diagnosticAudit: "diagnostic_audits", diagnosticOrderAssignment: "diagnostic_order_assignments", diagnosticCenterAssignment: "diagnostic_center_assignments", dealershipMember: "dealership_members", diagnosticTemplateVersion: "diagnostic_template_versions", diagnosticPdfArtifact: "diagnostic_pdf_artifacts", diagnosticContinuityRequest: "diagnostic_continuity_requests", diagnosticContinuityProof: "diagnostic_continuity_proofs", listing: "listings" };
type Model = keyof typeof tables;
type Delegate = { findUnique(args: { where: Row }): Promise<Row | null>; findMany(): Promise<Row[]> };
/** Finite database-boundary protocol replies and atomic rollback. No PostgreSQL
 * lock, trigger, closure or concurrency claims are made by this offline fake. */
export function reportPreparedHarness() {
  let memory = new DiagnosticMemoryDatabase(), clock = new Date("2026-10-25T12:00:00Z"), active = false;
  let finishFailure = false, writeFailure: Model | undefined, onRead: (() => Promise<void>) | undefined;
  const commands: DiagnosticSourceCommand[] = [];
  const subject = { userId: id(1), sessionId: id(2) }, orderId = id(3), reportId = id(4), centerId = id(6);
  const seed = (model: Model, row: Row) => memory.seed(model, row);
  const scope = async (roots: unknown[]) => [...roots, ...await Promise.all(Object.entries(tables).flatMap(([model, table]) => [
    (memory.client[model as Model] as unknown as Delegate).findMany().then(rows => rows.map(row => ({ table, key: { id: row["id"] } }))),
  ])).then(rows => rows.flat()), { table: "diagnostic_centers", key: { id: centerId } }];
  const transaction = async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => {
    const snapshot = await Promise.all(Object.keys(tables).map(async name => [name, await (memory.client[name as Model] as unknown as Delegate).findMany()] as const));
    let prefix = false, command: DiagnosticSourceCommand | undefined;
    const query = async (sql: string, values: unknown[]) => {
      if (sql.includes("diagnostic_source_project")) {
        const model = Object.entries(tables).find(([, table]) => table === values[0])![0] as Model;
        const source = await (memory.client[model] as unknown as Delegate).findUnique({ where: JSON.parse(String(values[1])) as Row });
        return [{ source, next: { ...source, ...JSON.parse(String(values.at(-1))) } }];
      }
      if (sql.includes("diagnostic_prepare_source")) { command = JSON.parse(String(values[0])) as DiagnosticSourceCommand; commands.push(command); prefix = true; return [{ receipt: "r5-receipt" }]; }
      if (sql.includes("diagnostic_assert_source")) { if (values[0] !== "r5-receipt" || values[1] !== command?.operation) throw new Error("diagnostic_source_receipt"); return []; }
      if (sql.includes("SELECT scope FROM")) return [{ scope: await scope([...(command?.roots ?? []), ...(command?.rows ?? [])]) }];
      if (sql.includes("diagnostic_finish_source")) { if (finishFailure) throw new Error("r5_finish_rollback"); return []; }
      if (sql.includes("diagnostic_source_scope")) { prefix = true; return [{ scope: await scope((JSON.parse(String(values[0])) as { roots: unknown[] }).roots), keys: [], campaigns: [], mutations: [] }]; }
      if (sql.includes("diagnostic_source_registry")) return [];
      if (sql.includes("campaign_prepare")) return [{ receipt: "ordinary-campaign" }];
      if (/FOR (UPDATE|SHARE)/.test(sql) && !prefix) throw new Error("r5_outer_prefix_required");
      return [];
    };
    const tx = new Proxy(memory.client, { get(target, property) {
      if (property === "$queryRaw") return (parts: TemplateStringsArray, ...values: unknown[]) => query(parts.join("?"), values);
      if (property === "$queryRawUnsafe") return query;
      const value = Reflect.get(target, property);
      if (!(typeof property === "string" && property in tables)) return value;
      return new Proxy(value as object, { get(model, method) {
        const fn = Reflect.get(model, method) as (args: unknown) => Promise<unknown>;
        if (!["create", "update", "updateMany"].includes(String(method))) return fn;
        return async (args: unknown) => {
          if (!prefix) throw new Error("r5_outer_prefix_required");
          const input = args as { data: Row };
          const result = await fn(property === "diagnosticReportRecord" && method === "create" ? { ...input, data: { predecessorId: null, reinspection: false, identityEvidenceId: null, identityEvidenceHash: null, ...input.data } } : args);
          if (writeFailure === property) throw new Error("r5_actual_write_rollback");
          return result;
        };
      } });
    } });
    active = true;
    try { return await work(tx); }
    catch (error) { memory = new DiagnosticMemoryDatabase(); for (const [model, rows] of snapshot) for (const row of rows) memory.seed(model, row); throw error; }
    finally { active = false; }
  };
  const db = new Proxy({} as PrismaService, { get(_target, property) { return property === "$transaction" ? transaction : Reflect.get(memory.client, property); } });
  const runtime = { now: () => new Date(clock), id: randomUUID, syntheticAllowed: () => true, publicSyntheticAllowed: () => false };
  const authority = new DiagnosticAuthority(new CheckStaffAuthority(new PrismaStaffAuthority(db), runtime), new CheckBusinessAuthority(new PrismaBusinessAuthority(db), runtime), runtime, new CampaignDiagnosticAdmission(new ConfigService()));
  const bindings = new DiagnosticPublicBindings(new PrismaPublisherBindings()), access = new DiagnosticReportAccess(authority, runtime);
  const stored = new Map<string, Uint8Array>();
  const objects: DiagnosticObjects = { sanitize: async bytes => ({ bytes, mime: "image/webp" }), put: async (key, bytes) => { stored.set(key, bytes); }, remove: async key => { stored.delete(key); },
    read: async (key, size, hash) => { if (active) throw new Error("r5_storage_inside_transaction"); if (onRead) await onRead(); const bytes = stored.get(key); if (!bytes || bytes.length !== size || sha(bytes) !== hash) throw new Error("integrity"); return bytes; } };
  const evidence = new PrismaDiagnosticIdentityEvidence(db, authority, objects, runtime);
  const reports = new PrismaDiagnosticReports(db, authority, runtime, access, evidence, bindings);
  const documents = new PrismaDiagnosticDocuments(db, access, objects);
  const proofs = new PrismaDiagnosticContinuityProofs(new DiagnosticDiscoveryCursor(Buffer.alloc(32, 7)), db, authority, new PrismaStaffBindings(), reports, evidence, bindings, runtime);
  seed("user", { id: subject.userId, role: "user", suspendedAt: null, deletionScheduledAt: null, dealershipMemberships: [] });
  seed("session", { id: subject.sessionId, userId: subject.userId, expiresAt: new Date("2027-01-01"), adminTotpExpiresAt: new Date("2027-01-01") });
  for (const [n, capability] of ["diagnostics.technician", "diagnostics.reviewer"].entries()) {
    seed("staffGrant", { userId: subject.userId, capability, revokedAt: null });
    seed("diagnosticCenterAssignment", { id: id(10 + n), centerId, userId: subject.userId, capability, qualifiedUntil: new Date("2027-01-01"), revokedAt: null });
    seed("diagnosticOrderAssignment", { id: id(12 + n), orderId, userId: subject.userId, capability, revokedAt: null });
  }
  const text = { en: "Synthetic", ru: "Synthetic", tk: "Synthetic" };
  seed("diagnosticTemplateVersion", { id: id(9), synthetic: true, definition: { title: text, limitations: text, syntheticNotice: text, checks: [{ id: "brakes", label: text, required: false, evidenceRequired: false, measurement: null }], panels: [] } });
  const observation = { method: "manual", vin: null, manualReference: "Synthetic plate", mileageKm: 100, observedAt: "2026-10-25T11:00:00.000Z" };
  seed("inspectionOrder", { id: orderId, centerId, templateVersionId: id(9), status: "arrived", physicalAuthorization: {}, version: 1, identityEvidenceGeneration: 0, synthetic: true, erasedAt: null, listingId: null, audience: "buyer_private", commissionerId: subject.userId, observedVehicle: observation });
  seed("diagnosticIdentityRecord", { id: id(5), orderId, orderVersion: 1, observation, observationHash: "a".repeat(64), erasedAt: null });
  return { db, reports, proofs, documents, access, subject, orderId, reportId, seed, commands, stored, id, sha,
    clock: (now: Date) => { clock = now; }, onRead: (fn?: () => Promise<void>) => { onRead = fn; }, failFinish: () => { finishFailure = true; }, failWrite: (model: Model) => { writeFailure = model; } };
}
