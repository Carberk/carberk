import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { DiagnosticMemoryDatabase, diagnosticTestId as id, diagnosticTestSha as sha } from "@auto-tm/db/testing";
import type { DiagnosticSourceCommand, Prisma, PrismaService } from "@auto-tm/db";
import { CheckBusinessAuthority } from "../../../identity/application/CheckBusinessAuthority";
import { CheckStaffAuthority } from "../../../identity/application/CheckStaffAuthority";
import { PrismaBusinessAuthority } from "../../../identity/infrastructure/PrismaBusinessAuthority";
import { PrismaStaffAuthority } from "../../../identity/infrastructure/PrismaStaffAuthority";
import { DiagnosticAuthority } from "../../infrastructure/DiagnosticAuthority";
import { CampaignDiagnosticAdmission } from "../../infrastructure/campaignDiagnosticAdmission";
import { DiagnosticReportAccess } from "../../infrastructure/DiagnosticReportAccess";
import { PrismaDiagnosticEvidence } from "../../infrastructure/PrismaDiagnosticEvidence";
import { PrismaDiagnosticIdentityEvidence } from "../../infrastructure/PrismaDiagnosticIdentityEvidence";
import type { DiagnosticObjects } from "../../domain/ports/DiagnosticObjects";
import { rights } from "./ownershipGrantHarness";

type Row = Record<string, unknown>;
const tables = { user: "users", session: "sessions", staffGrant: "staff_grants", inspectionOrder: "inspection_orders", diagnosticReportRecord: "diagnostic_reports", diagnosticIdentityRecord: "diagnostic_identity_records", diagnosticIdentityEvidence: "diagnostic_identity_evidence", diagnosticIdentityProvenance: "diagnostic_identity_provenance", diagnosticEvidence: "diagnostic_evidence", diagnosticAudit: "diagnostic_audits", diagnosticOrderAssignment: "diagnostic_order_assignments", diagnosticCenterAssignment: "diagnostic_center_assignments", dealershipMember: "dealership_members" };
type Model = keyof typeof tables;
/** CRUD/rollback and finite protocol replies at the database boundary. It does not
 * model SQL closure, locks, trigger effects, collision semantics or concurrency. */
export function materialHarness() {
  let memory = new DiagnosticMemoryDatabase(), clock = new Date("2026-10-25T12:00:00Z"), active = false;
  const subject = { userId: id(1), sessionId: id(2) }, orderId = id(3), reportId = id(4), rawId = id(5);
  let afterPrepare: (() => Promise<void>) | undefined, finishFailure = false;
  const commands: DiagnosticSourceCommand[] = [];
  const seed = (model: Model, row: Row) => memory.seed(model, row);
  const scope = (roots: unknown[]) => [...roots, { table: "diagnostic_centers", key: { id: id(6) } }];
  const modelFor = (table: string) => Object.entries(tables).find(([, value]) => value === table)?.[0] as Model;
  const query = async (sql: string, values: unknown[], state: { prefix: boolean; command?: DiagnosticSourceCommand; discovered?: unknown[] }) => {
    if (sql.includes("diagnostic_source_project")) {
      const table = String(values[0]), key = JSON.parse(String(values[1])) as Row;
      const source = await memory.client[modelFor(table)].findUnique({ where: key as never });
      return [{ source, next: { ...source as object, ...JSON.parse(String(values.at(-1))) } }];
    }
    if (sql.includes("diagnostic_prepare_source")) {
      const command = JSON.parse(String(values[0])) as DiagnosticSourceCommand;
      commands.push(command); state.command = command; state.prefix = true;
      if (afterPrepare) await afterPrepare();
      return [{ receipt: "material-receipt" }];
    }
    if (sql.includes("diagnostic_assert_source")) {
      if (values[0] !== "material-receipt" || values[1] !== state.command?.operation) throw new Error("diagnostic_source_receipt");
      return [];
    }
    if (sql.includes("SELECT scope FROM")) return [{ scope: scope([...(state.command?.roots ?? []), ...(state.command?.rows ?? [])]) }];
    if (sql.includes("diagnostic_finish_source")) { if (finishFailure) throw new Error("material_finish_rollback"); return []; }
    if (sql.includes("diagnostic_source_scope")) {
      state.discovered = scope((JSON.parse(String(values[0])) as { roots: unknown[] }).roots);
      state.prefix = true;
      return [{ scope: state.discovered, keys: [], campaigns: [], mutations: [] }];
    }
    if (sql.includes("diagnostic_source_registry")) return [];
    if (sql.includes("campaign_prepare")) return [{ receipt: "ordinary-campaign" }];
    if (/FOR (UPDATE|SHARE)/.test(sql) && !state.prefix) throw new Error("material_outer_prefix_required");
    return [];
  };
  const transaction = async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => {
    const snapshot = await Promise.all(Object.keys(tables).map(async name => [name, await memory.client[name as Model].findMany()] as const));
    const state = { prefix: false };
    const tx = new Proxy(memory.client, { get(target, property) {
      if (property === "$queryRaw") return (parts: TemplateStringsArray, ...values: unknown[]) => query(parts.join("?"), values, state);
      if (property === "$queryRawUnsafe") return (sql: string, ...values: unknown[]) => query(sql, values, state);
      const value = Reflect.get(target, property);
      if (!(typeof property === "string" && property in tables)) return value;
      return new Proxy(value as object, { get(model, method) {
        const delegate = Reflect.get(model, method) as (args: unknown) => Promise<unknown>;
        if (method !== "create") return delegate;
        return (args: { data: Row; include?: Row }) => delegate({ ...args, data: { state: "staged", erasedAt: null, writeLeaseUntil: null, ...args.data } });
      } });
    } });
    active = true;
    try { return await work(tx); }
    catch (error) { memory = new DiagnosticMemoryDatabase(); for (const [name, rows] of snapshot) for (const row of rows) memory.seed(name, row as Row); throw error; }
    finally { active = false; }
  };
  const db = new Proxy({} as PrismaService, { get(_target, property) { return property === "$transaction" ? transaction : Reflect.get(memory.client, property); } });
  const runtime = { now: () => new Date(clock), id: randomUUID, syntheticAllowed: () => true };
  const business = new CheckBusinessAuthority(new PrismaBusinessAuthority(db), runtime);
  const staff = new CheckStaffAuthority(new PrismaStaffAuthority(db), runtime);
  const authority = new DiagnosticAuthority(staff, business, runtime, new CampaignDiagnosticAdmission(new ConfigService()));
  const stored = new Map<string, Uint8Array>();
  let onPut: (() => Promise<void>) | undefined, onRead: (() => Promise<void>) | undefined, putFailure = false;
  const objects: DiagnosticObjects = {
    sanitize: async bytes => { if (active) throw new Error("storage_inside_transaction"); return { bytes, mime: "image/webp" }; },
    put: async (key, bytes) => { if (active) throw new Error("storage_inside_transaction"); stored.set(key, bytes); if (onPut) await onPut(); if (putFailure) throw new Error("storage_lost_reply"); },
    read: async (key, size, hash) => { if (active) throw new Error("storage_inside_transaction"); if (onRead) await onRead(); const bytes = stored.get(key); if (!bytes || bytes.length !== size || sha(bytes) !== hash) throw new Error("storage_integrity"); return bytes; },
    remove: async key => { stored.delete(key); },
  };
  seed("user", { id: subject.userId, role: "user", suspendedAt: null, deletionScheduledAt: null, dealershipMemberships: [] });
  seed("session", { id: subject.sessionId, userId: subject.userId, expiresAt: new Date("2027-01-01"), adminTotpExpiresAt: new Date("2027-01-01") });
  seed("staffGrant", { userId: subject.userId, capability: "diagnostics.technician", revokedAt: null });
  seed("diagnosticCenterAssignment", { id: id(7), centerId: id(6), userId: subject.userId, capability: "diagnostics.technician", qualifiedUntil: new Date("2027-01-01"), revokedAt: null });
  seed("diagnosticOrderAssignment", { id: id(8), orderId, userId: subject.userId, capability: "diagnostics.technician", revokedAt: null });
  seed("inspectionOrder", { id: orderId, centerId: id(6), templateVersionId: id(9), status: "arrived", physicalAuthorization: {}, version: 1, identityEvidenceGeneration: 0, synthetic: true, erasedAt: null, listingId: null, audience: "buyer_private", commissionerId: id(10) });
  seed("diagnosticIdentityRecord", { id: rawId, orderId, orderVersion: 1, observation: { method: "manual", vin: null, manualReference: "Synthetic plate", mileageKm: 100, observedAt: "2026-10-25T11:00:00.000Z" }, observationHash: "a".repeat(64), erasedAt: null });
  seed("diagnosticReportRecord", { id: reportId, orderId, version: 1, erasedAt: null, snapshot: null, audience: "buyer_private", state: { status: "draft", authorId: subject.userId, findings: [] } });
  const identity = new PrismaDiagnosticIdentityEvidence(db, authority, objects, runtime);
  const evidence = new PrismaDiagnosticEvidence(db, new DiagnosticReportAccess(authority, runtime), objects, runtime);
  const bytes = new Uint8Array([1, 2, 3]);
  const stage = (provenanceId = id(11)) => ({ id: provenanceId, expectedOrderVersion: 1, contentType: "image/png" as const, sizeBytes: bytes.length, rights });
  return { db, identity, evidence, subject, orderId, reportId, rawId, bytes, stored, commands, seed, stage, rights, id,
    clock: (now: Date) => { clock = now; }, afterPrepare: (fn?: () => Promise<void>) => { afterPrepare = fn; }, failFinish: () => { finishFailure = true; },
    onPut: (fn?: () => Promise<void>) => { onPut = fn; }, onRead: (fn?: () => Promise<void>) => { onRead = fn; }, failPut: () => { putFailure = true; } };
}
