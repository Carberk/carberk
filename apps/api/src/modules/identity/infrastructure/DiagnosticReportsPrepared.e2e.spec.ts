import "reflect-metadata";
import { createHash } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { PrismaService, withDiagnosticSourceCommand, type Prisma, type DiagnosticSourceCommand } from "@auto-tm/db";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { CheckBusinessAuthority } from "../application/CheckBusinessAuthority";
import { CheckStaffAuthority } from "../application/CheckStaffAuthority";
import { PrismaBusinessAuthority } from "./PrismaBusinessAuthority";
import { PrismaPublisherBindings } from "./PrismaPublisherBindings";
import { DiagnosticPublicBindings } from "../../diagnostics/infrastructure/DiagnosticPublicBindings";
import { PrismaStaffBindings } from "./PrismaStaffBindings";
import { PrismaDiagnosticReports } from "../../diagnostics/infrastructure/PrismaDiagnosticReports";
import { PrismaDiagnosticDocuments } from "../../diagnostics/infrastructure/PrismaDiagnosticDocuments";
import { PrismaDiagnosticContinuityProofs } from "../../diagnostics/infrastructure/PrismaDiagnosticContinuityProofs";
import { DiagnosticDiscoveryCursor } from "../../diagnostics/infrastructure/DiagnosticDiscoveryCursor";
import { PrismaStaffAuthority } from "./PrismaStaffAuthority";
import { DiagnosticAuthority } from "../../diagnostics/infrastructure/DiagnosticAuthority";
import { CampaignDiagnosticAdmission } from "../../diagnostics/infrastructure/campaignDiagnosticAdmission";
import { DiagnosticReportAccess } from "../../diagnostics/infrastructure/DiagnosticReportAccess";
import { PrismaDiagnosticIdentityEvidence } from "../../diagnostics/infrastructure/PrismaDiagnosticIdentityEvidence";
import { PrismaDiagnosticEvidence } from "../../diagnostics/infrastructure/PrismaDiagnosticEvidence";
import { PrismaDiagnosticIntake, diagnosticObservationHash } from "../../diagnostics/infrastructure/PrismaDiagnosticIntake";
import { diagnosticPlannedRow } from "../../diagnostics/infrastructure/DiagnosticPreparedIntake";
import type { DiagnosticObjects } from "../../diagnostics/domain/ports/DiagnosticObjects";
import type { DiagnosticIdentityEvidencePort } from "../../diagnostics/domain/ports/DiagnosticIdentityEvidencePort";
import type { DiagnosticEvidencePort } from "../../diagnostics/domain/ports/DiagnosticEvidencePort";

/** R5 AUTHORED ONLY. Never imported, collected or executed during this task.
 * Production entrypoints oppose each other in race cases. Fault injection is
 * explicitly named and uses real SQL guards; integrity triggers stay active.
 * Storage alone is a fake system boundary. Parent assembly owns execution. */
const suite = defineE2eSuite("diagnostic-report-r5");
const text = { en: "Synthetic", ru: "Synthetic", tk: "Synthetic" };
describe("real prepared R5 report, proof, request and document adapters", () => {
  let db: PrismaService, pool: Pool, intake: PrismaDiagnosticIntake, authority: DiagnosticAuthority, identity: DiagnosticIdentityEvidencePort, evidence: DiagnosticEvidencePort;
  let reports: PrismaDiagnosticReports, documents: PrismaDiagnosticDocuments, proofs: PrismaDiagnosticContinuityProofs;
  let generatedId = 0, sequence = 0, orderId: string, rawId: string, reportId: string, centerId: string;
  let clock: Date, putFailure: boolean, afterPut: (() => Promise<void>) | undefined, afterRead: (() => Promise<void>) | undefined;
  const stored = new Map<string, Uint8Array>(), bytes = new Uint8Array([1, 2, 3]);
  const id = (name: string) => suite.id(`${sequence}-${name}`);
  const subject = () => ({ userId: id("technician"), sessionId: id("session") });
  const rights = (): D.DiagnosticIdentityRights => ({ category: "vehicle_observation", purpose: "Restricted visit comparison", basis: "Synthetic fixture declaration", provenance: "Synthetic fixture only",
    identifiability: "personal", use: ["service"], schedule: { kind: "until", until: new Date(clock.getTime() + 3600_000).toISOString(), reason: "Declared synthetic end" }, supplierRestrictions: "Comparison only", hold: null });
  const stage = (name = "provenance", version = 1) => ({ id: id(name), expectedOrderVersion: version, contentType: "image/png" as const, sizeBytes: bytes.length, rights: rights() });
  const capture = (p: string, name = "capture", version = 1): D.DiagnosticIdentityEvidenceCapture => ({ id: id(name), identityRecordId: rawId, expectedOrderVersion: version, rights: rights(), correction: null,
    identifiers: [{ kind: "manufacturer_plate", location: "engine bay", value: "Synthetic plate", provenanceIds: [p] }] });
  async function guards(enabled: boolean) {
    const rows = await pool.query<{ table: string; name: string }>(`SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')`);
    for (const row of rows.rows) await pool.query(`ALTER TABLE public."${row.table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER "${row.name}"`);
  }
  const objects: DiagnosticObjects = {
    sanitize: async input => ({ bytes: input, mime: "image/webp" }),
    put: async (key, input) => { stored.set(key, input); if (afterPut) await afterPut(); if (putFailure) throw new Error("r5_lost_put_reply"); },
    read: async key => { if (afterRead) await afterRead(); const content = stored.get(key); if (!content) throw new Error("r5_absent_bytes"); return content; },
    remove: async key => { stored.delete(key); },
  };
  beforeAll(async () => {
    db = new PrismaService(); pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
    const runtime = { now: () => new Date(clock), id: () => id(`generated-${++generatedId}`), syntheticAllowed: () => true, publicSyntheticAllowed: () => false };
    const business = new CheckBusinessAuthority(new PrismaBusinessAuthority(db), runtime);
    authority = new DiagnosticAuthority(new CheckStaffAuthority(new PrismaStaffAuthority(db), runtime), business, runtime, new CampaignDiagnosticAdmission(new ConfigService()));
    intake = new PrismaDiagnosticIntake(db, authority, business, new DiagnosticPublicBindings(new PrismaPublisherBindings()), runtime);
    identity = new PrismaDiagnosticIdentityEvidence(db, authority, objects, runtime);
    const access = new DiagnosticReportAccess(authority, runtime), bindings = new DiagnosticPublicBindings(new PrismaPublisherBindings());
    evidence = new PrismaDiagnosticEvidence(db, access, objects, runtime);
    reports = new PrismaDiagnosticReports(db, authority, runtime, access, identity as PrismaDiagnosticIdentityEvidence, bindings);
    documents = new PrismaDiagnosticDocuments(db, access, objects);
    proofs = new PrismaDiagnosticContinuityProofs(new DiagnosticDiscoveryCursor(Buffer.alloc(32, 5)), db, authority, new PrismaStaffBindings(), reports, identity as PrismaDiagnosticIdentityEvidence, bindings, runtime);
  });
  beforeEach(async () => {
    await guards(false); sequence++; generatedId = 0; clock = new Date(); putFailure = false; afterPut = undefined; afterRead = undefined; stored.clear();
    centerId = id("center"); orderId = id("order"); rawId = id("raw"); reportId = id("report");
    const templateId = id("template"), userId = subject().userId;
    await db.user.create({ data: { id: userId } });
    await db.session.create({ data: { id: subject().sessionId, userId, refreshTokenHash: id("refresh"), expiresAt: new Date(clock.getTime() + 86400_000), adminTotpExpiresAt: new Date(clock.getTime() + 86400_000) } });
    await db.staffGrant.create({ data: { userId, capability: "diagnostics.technician" } });
    await db.diagnosticCenter.create({ data: { id: centerId, code: centerId, names: text } });
    await db.diagnosticCenterAssignment.create({ data: { id: id("qualification"), centerId, userId, capability: "diagnostics.technician", qualifiedUntil: new Date(clock.getTime() + 86400_000) } });
    await db.staffGrant.create({ data: { userId, capability: "diagnostics.reception" } });
    await db.diagnosticCenterAssignment.create({ data: { id: id("reception-qualification"), centerId, userId, capability: "diagnostics.reception", qualifiedUntil: new Date(clock.getTime() + 86400_000) } });
    await db.diagnosticTemplateVersion.create({ data: { id: templateId, centerId, version: 1, definition: { title: text, limitations: text, syntheticNotice: text, checks: [{ id: "brakes", label: text, required: false, evidenceRequired: false, measurement: null }], panels: [] }, synthetic: true } });
    const observation = { method: "manual" as const, vin: null, manualReference: "Synthetic plate", mileageKm: 100, observedAt: clock.toISOString() };
    await db.inspectionOrder.create({ data: { id: orderId, centerId, templateVersionId: templateId, commissionerId: userId, requestKey: id("request"), audience: "buyer_private", status: "arrived", version: 1,
      physicalAuthorization: { authorityReference: "Synthetic physical permission", recordedBy: userId, recordedAt: clock.toISOString() }, observedVehicle: observation, synthetic: true } });
    await db.diagnosticOrderAssignment.create({ data: { id: id("assignment"), orderId, userId, capability: "diagnostics.technician" } });
    await db.diagnosticOrderAssignment.create({ data: { id: id("reception-assignment"), orderId, userId, capability: "diagnostics.reception" } });
    await db.diagnosticIdentityRecord.create({ data: { id: rawId, orderId, orderVersion: 1, observation, observationHash: diagnosticObservationHash(orderId, 1, observation), recordedAt: clock, recordedById: userId } });
    await db.staffGrant.create({ data: { userId, capability: "diagnostics.reviewer" } });
    await db.diagnosticCenterAssignment.create({ data: { id: id("reviewer-qualification"), centerId, userId, capability: "diagnostics.reviewer", qualifiedUntil: new Date(clock.getTime() + 86400_000) } });
    await db.diagnosticOrderAssignment.create({ data: { id: id("reviewer-assignment"), orderId, userId, capability: "diagnostics.reviewer" } });
    const technicianId = id("linker"), b = id("b");
    await db.user.create({ data: { id: technicianId } });
    await db.session.create({ data: { id: id("linker-session"), userId: technicianId, refreshTokenHash: id("linker-refresh"), expiresAt: new Date(clock.getTime() + 86400_000), adminTotpExpiresAt: new Date(clock.getTime() + 86400_000) } });
    await db.staffGrant.create({ data: { userId: technicianId, capability: "diagnostics.technician" } });
    await db.diagnosticCenterAssignment.create({ data: { id: id("linker-qualification"), centerId, userId: technicianId, capability: "diagnostics.technician", qualifiedUntil: new Date(clock.getTime() + 86400_000) } });
    const observedB = { ...observation, mileageKm: 120 };
    await db.inspectionOrder.create({ data: { id: b, centerId, templateVersionId: templateId, commissionerId: userId, requestKey: id("b-request"), audience: "buyer_private", status: "arrived", version: 1,
      physicalAuthorization: { authorityReference: "B physical permission", recordedBy: userId, recordedAt: clock.toISOString() }, observedVehicle: observedB, synthetic: true } });
    await db.diagnosticIdentityRecord.create({ data: { id: id("b-raw"), orderId: b, orderVersion: 1, observation: observedB, observationHash: diagnosticObservationHash(b, 1, observedB), recordedAt: clock, recordedById: technicianId } });
    for (const [name, actor, capability] of [["b-tech", technicianId, "diagnostics.technician"], ["b-review", userId, "diagnostics.reviewer"], ["b-reception", userId, "diagnostics.reception"]]) {
      await db.diagnosticOrderAssignment.create({ data: { id: id(name!), orderId: b, userId: actor!, capability: capability! } });
    }
    await guards(true);
    const integrity = await pool.query<{ tgname: string; tgenabled: string }>("SELECT tgname,tgenabled FROM pg_trigger WHERE tgname=ANY($1::text[]) ORDER BY tgname", [["diagnostic_report_identity_pin", "diagnostic_report_evidence_pin", "diagnostic_identity_record_immutable", "diagnostic_identity_evidence_guard", "diagnostic_identity_provenance_guard"]]);
    expect(integrity.rows).toHaveLength(5);
    expect(integrity.rows.every(row => row.tgenabled === "O")).toBe(true);
    for (const currentOrderId of [orderId, b]) {
      const order = await db.inspectionOrder.findUniqueOrThrow({ where: { id: currentOrderId } });
      const raw = await db.diagnosticIdentityRecord.findFirstOrThrow({ where: { orderId: currentOrderId }, orderBy: { orderVersion: "desc" } });
      expect(raw).toMatchObject({ orderVersion: order.version, observation: order.observedVehicle, observationHash: diagnosticObservationHash(order.id, order.version, D.DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }).parse(order.observedVehicle)) });
    }
    expect((await db.$queryRaw<{ ready: boolean }[]>`SELECT diagnostic_source_guards_ready() AS ready`)[0]?.ready).toBe(true);
    expect((await pool.query<{ tgenabled: string }>("SELECT tgenabled FROM pg_trigger WHERE tgrelid='diagnostic_reports'::regclass AND tgname='diagnostic_report_identity_pin'")).rows).toEqual([{ tgenabled: "O" }]);
  });
  afterAll(async () => {
    // This disposable worker database is owned by the configured E2E runner.
    // No broad user/foreign cleanup or operator reset is performed here.
    if (pool) { await guards(false); await pool.end(); }
    await db?.onModuleDestroy();
  });
  const linker = () => ({ userId: id("linker"), sessionId: id("linker-session") });
  const finding = (ids: string[] = []): D.DiagnosticFinding => ({ id: id("finding"), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: ids, kind: null, source: null, measurement: null, location: null });
  const draft = (version = 1) => reports.create(subject(), orderId, { reportId, expectedOrderVersion: version });
  const submit = (version = 0) => reports.transition(subject(), reportId, { expectedVersion: version, action: "submit" });
  const finalize = (version = 1) => reports.transition(subject(), reportId, { expectedVersion: version, action: "finalize", privateSelfReview: true, reason: "Private authorized review" });
  async function state() {
    const orders = [orderId, id("b")];
    return {
      orders: await db.inspectionOrder.findMany({ where: { id: { in: orders } }, orderBy: { id: "asc" } }),
      raw: await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: orders } }, orderBy: { id: "asc" } }),
      identity: await db.diagnosticIdentityEvidence.findMany({ where: { orderId: { in: orders } }, orderBy: { id: "asc" } }),
      provenance: await db.diagnosticIdentityProvenance.findMany({ where: { orderId: { in: orders } }, orderBy: { id: "asc" } }),
      reports: await db.diagnosticReportRecord.findMany({ where: { orderId: { in: orders } }, orderBy: { id: "asc" } }),
      evidence: await db.diagnosticEvidence.findMany({ where: { report: { orderId: { in: orders } } }, orderBy: { id: "asc" } }),
      artifacts: await db.diagnosticPdfArtifact.findMany({ where: { report: { orderId: { in: orders } } }, orderBy: { id: "asc" } }),
      proofs: await db.diagnosticContinuityProof.findMany({ where: { candidateOrderId: { in: orders } }, orderBy: { id: "asc" } }),
      requests: await db.diagnosticContinuityRequest.findMany({ where: { orderId: { in: orders } }, orderBy: { id: "asc" } }),
      audits: await db.diagnosticAudit.findMany({ where: { orderId: { in: orders } }, orderBy: { id: "asc" } }),
    };
  }
  async function material(order: string, raw: string, actor: ReturnType<typeof subject>, name: string) {
    const p = id(`${name}-p`), input = { ...stage(), id: p };
    await identity.stage(actor, order, input);
    await identity.upload(actor, order, p, { expectedOrderVersion: 1, mime: "image/png", bytes });
    await identity.append(actor, order, { ...capture(p), id: id(`${name}-e`), identityRecordId: raw });
  }
  async function pair() {
    await material(orderId, rawId, subject(), "a");
    await material(id("b"), id("b-raw"), linker(), "b");
    await draft(2);
    const pin = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } });
    const leaf = await db.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: id("a-e") } });
    expect(pin).toMatchObject({ identityRecordId: rawId, identityEvidenceId: leaf.id, identityEvidenceHash: leaf.recordHash });
    await submit(); await finalize();
    expect(await db.diagnosticPdfArtifact.count({ where: { reportId } })).toBe(3);
    return { predecessorId: reportId, expectedPredecessorVersion: 2, expectedOrderVersion: 2,
      predecessorIdentityRecordId: rawId, candidateIdentityRecordId: id("b-raw"), linkingTechnicianId: linker().userId,
      method: "comparative_attestation" as const, rationale: "Same independently observed manufacturer plate", provenanceRecordIds: [id("a-p"), id("b-p")] };
  }
  const consumption = (proofId: string) => ({ reportId: id("b-report"), predecessorId: reportId, expectedOrderVersion: 2, proofId, reason: "Fresh independent visit" });
  /** Fault injection only. The sentinel runs after actual DML, or at finish after
   * the existing completion trigger. All integrity/source triggers stay enabled. */
  async function rollbackAt(table: string, event: string, work: () => Promise<unknown>, finish = false) {
    const name = finish ? "zz_r5_finish" : "r5_actual_write", message = finish ? "r5_finish_rollback" : "r5_actual_write_rollback";
    await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '${message}'; END $$;
      CREATE TRIGGER ${name} ${finish ? "BEFORE" : "AFTER"} ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    const before = await state();
    try { await expect(work()).rejects.toThrow(message); }
    finally { await pool.query(`DROP TRIGGER ${name} ON ${table}; DROP FUNCTION ${name}()`); }
    expect(await state()).toEqual(before);
    expect((await pool.query("SELECT count(*)::int AS n FROM diagnostic_source_commands WHERE command->>'actorUserId'=ANY($1::text[])", [[subject().userId, linker().userId]])).rows).toEqual([{ n: 0 }]);
  }
  it("creates a genuinely current pinned original, saves, returns, finalizes three exact intents and corrects", async () => {
    const original = await draft();
    expect(original).toMatchObject({ status: "draft", findings: [] });
    const raw = await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } });
    const pinned = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } });
    expect(pinned).toMatchObject({ identityRecordId: raw.id, identityRecordHash: raw.observationHash });
    await reports.save(subject(), reportId, { expectedVersion: 0, finding: finding() });
    await submit(1);
    await reports.transition(subject(), reportId, { expectedVersion: 2, action: "return", privateSelfReview: true, reason: "Check again" });
    await submit(3); await finalize(4);
    const released = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } });
    const artifacts = await db.diagnosticPdfArtifact.findMany({ where: { reportId }, orderBy: { locale: "asc" } });
    expect(artifacts.map(a => [a.locale, a.state, a.snapshotHash, a.generation])).toEqual(["en", "ru", "tk"].map(locale => [locale, "pending", released.snapshotHash, 1]));
    expect(new Set(artifacts.map(a => a.epoch)).size).toBe(3);
    expect(new Set(artifacts.map(a => a.objectKey)).size).toBe(3);
    for (const a of artifacts) expect(a.objectKey).toBe(`diagnostic-pdf/${reportId}/${a.id}.pdf`);
    const correction = { successorId: id("correction"), expectedVersion: 5, reason: "New recording" };
    const successor = await reports.correct(subject(), reportId, correction);
    expect(await reports.correct(subject(), reportId, correction)).toEqual(successor);
    const before = await state();
    await expect(reports.correct(subject(), reportId, { ...correction, reason: "Changed reason" })).rejects.toThrow("DIAGNOSTIC_CORRECTION_CONFLICT");
    expect(await state()).toEqual(before);
    await reports.transition(subject(), reportId, { expectedVersion: 5, action: "withdraw", reason: "Retained withdrawal" });
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } })).toEqual(raw);
  });
  async function attachedEvidence() {
    await draft();
    const uploaded = await evidence.upload(subject(), { reportId, evidenceId: id("evidence"), findingId: id("finding"), expectedVersion: 0, mime: "image/png", bytes });
    await reports.save(subject(), reportId, { expectedVersion: 0, finding: finding([uploaded.id]) });
    return uploaded.id;
  }
  it("removing verified evidence plans its exact cleanup UPDATE and retains bytes for cleanup", async () => {
    const evidenceId = await attachedEvidence(), before = await db.diagnosticEvidence.findUniqueOrThrow({ where: { id: evidenceId } });
    await reports.save(subject(), reportId, { expectedVersion: 1, finding: finding() });
    expect(await db.diagnosticEvidence.findUniqueOrThrow({ where: { id: evidenceId } })).toEqual({ ...before, state: "cleanup_pending", cleanupRequestedAt: clock });
    expect(stored.get(before.objectKey)).toEqual(bytes);
  });
  it.each(["write", "finish"] as const)("actual report draft %s rollback restores all rows", async kind => {
    await rollbackAt(kind === "finish" ? "diagnostic_source_commands" : "diagnostic_audits", kind === "finish" ? "DELETE" : "INSERT", () => draft(), kind === "finish");
  });
  it.each(["write", "finish"] as const)("actual finalization %s rollback restores snapshot, pins, intents, audit", async kind => {
    await draft(); await submit();
    await rollbackAt(kind === "finish" ? "diagnostic_source_commands" : "diagnostic_pdf_artifacts", kind === "finish" ? "DELETE" : "INSERT", () => finalize(), kind === "finish");
  });
  it.each(["write", "finish"] as const)("actual evidence retirement %s rollback restores evidence, state and audits", async kind => {
    await attachedEvidence();
    await rollbackAt(kind === "finish" ? "diagnostic_source_commands" : "diagnostic_evidence", kind === "finish" ? "DELETE" : "UPDATE", () => reports.save(subject(), reportId, { expectedVersion: 1, finding: finding() }), kind === "finish");
  });
  it.each(["write", "finish"] as const)("actual correction %s rollback leaves no successor or audit", async kind => {
    await draft(); await submit(); await finalize();
    await rollbackAt(kind === "finish" ? "diagnostic_source_commands" : "diagnostic_audits", kind === "finish" ? "DELETE" : "INSERT", () => reports.correct(subject(), reportId, { successorId: id("correction"), expectedVersion: 2, reason: "Correction" }), kind === "finish");
  });
  it("issues, historically reads, discovers and consumes private proof once with exact B retry", async () => {
    const command = await pair(), { proofId } = await proofs.issue(subject(), id("b"), command);
    expect(await proofs.read(subject(), id("b"), proofId)).toMatchObject({ proofId });
    expect(await proofs.handoffs(linker(), id("b"), {})).toMatchObject({ handoffs: [{ proofId, status: "usable" }] });
    const input = consumption(proofId), result = await proofs.consume(linker(), id("b"), input);
    expect(result).toMatchObject({ id: input.reportId, findings: [], mileageKm: 120, lineageKind: "reinspection" });
    expect(await proofs.consume(linker(), id("b"), input)).toEqual(result);
    expect(await proofs.useHandoff(linker(), id("b"), proofId, input)).toEqual({ reportId: input.reportId });
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toMatchObject({ consumedReportId: input.reportId, consumedAt: clock });
  });
  it.each(["write", "finish"] as const)("private issuance %s rollback restores material, pins and audit", async kind => {
    const command = await pair();
    await rollbackAt(kind === "finish" ? "diagnostic_source_commands" : "diagnostic_audits", kind === "finish" ? "DELETE" : "INSERT", () => proofs.issue(subject(), id("b"), command), kind === "finish");
  });
  it.each(["write", "finish"] as const)("private consumption %s rollback restores proof, B report and both audits", async kind => {
    const command = await pair(), { proofId } = await proofs.issue(subject(), id("b"), command);
    await rollbackAt(kind === "finish" ? "diagnostic_source_commands" : "diagnostic_audits", kind === "finish" ? "DELETE" : "INSERT", () => proofs.consume(linker(), id("b"), consumption(proofId)), kind === "finish");
  });
  it("prepares, executes, recovers and discovers exact issue/consume request results", async () => {
    const command = await pair(), b = id("b");
    const issue = await proofs.prepareRequest(subject(), b, { kind: "issue" });
    const issued = await proofs.executeRequest(subject(), b, issue.requestId, { kind: "issue", command });
    expect(await proofs.executeRequest(subject(), b, issue.requestId, { kind: "issue", command })).toEqual(issued);
    expect(await proofs.recoverRequest(subject(), b, issue.requestId)).toEqual(issued);
    const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { requestId: issue.requestId } });
    const consume = await proofs.prepareRequest(linker(), b, { kind: "consume" }), input = consumption(proof.id);
    const consumed = await proofs.executeRequest(linker(), b, consume.requestId, { kind: "consume", command: input });
    expect(await proofs.recoverRequest(linker(), b, consume.requestId)).toEqual(consumed);
    expect(await proofs.executeRequest(linker(), b, consume.requestId, { kind: "consume", command: input })).toEqual(consumed);
    expect(await proofs.discoverRequests(linker(), b, {})).toMatchObject({ requests: [consumed] });
    const before = await state();
    await expect(proofs.executeRequest(linker(), b, consume.requestId, { kind: "consume", command: { ...input, reportId: id("different-b") } })).rejects.toThrow("DIAGNOSTIC_REINSPECTION_CONFLICT");
    expect(await state()).toEqual(before);
  });
  it.each(["issue", "consume"] as const)("request %s result and binding roll back at reachable finish", async kind => {
    const command = await pair(), b = id("b"), { proofId } = await proofs.issue(subject(), b, command);
    const actor = kind === "issue" ? subject() : linker(), request = await proofs.prepareRequest(actor, b, { kind });
    await rollbackAt("diagnostic_source_commands", "DELETE", () => proofs.executeRequest(actor, b, request.requestId,
      kind === "issue" ? { kind, command } : { kind, command: consumption(proofId) }), true);
  });
  it.each(["issuer", "stale", "missing", "rights"] as const)("private issuer refuses concrete %s defect without residue", async defect => {
    const command = await pair(), before = await state();
    const input = defect === "issuer" ? { ...command, linkingTechnicianId: subject().userId }
      : defect === "stale" ? { ...command, expectedOrderVersion: 1 }
      : defect === "missing" ? { ...command, provenanceRecordIds: [id("missing-provenance")] } : command;
    if (defect === "rights") clock = new Date(rights().schedule.until);
    await expect(proofs.issue(subject(), id("b"), input)).rejects.toThrow(defect === "stale" ? "DIAGNOSTIC_STALE_VERSION" : "DIAGNOSTIC_NO_ACCESS");
    expect(await state()).toEqual(before);
  });
  /** SQL command corruption is fault injection, never a production opponent. */
  it.each(["omission", "wrongverb", "mismatch"] as const)("guards reject %s for actual evidence retirement with no residue", async defect => {
    const evidenceId = await attachedEvidence(), before = await state();
    await expect(db.$transaction(async tx => {
      const root = { table: "diagnostic_evidence" as const, key: { id: evidenceId } };
      const row = await diagnosticPlannedRow(tx, root, { state: "cleanup_pending", cleanupRequestedAt: clock });
      const rows = defect === "wrongverb" ? [{ ...row, verb: "delete", next: null }] : [row];
      const command = { operation: "report_change", roots: [root], rows, actorUserId: subject().userId, sessionId: subject().sessionId, cutoff: null, campaign: null } as DiagnosticSourceCommand;
      await withDiagnosticSourceCommand(tx, command, async () => {
        // Omit the protected report effect deliberately. Ordinary finding evidence
        // is a dependency-only table, so it must not be used as a naked-DML guard assertion.
        if (defect === "omission") await tx.diagnosticReportRecord.update({ where: { id: reportId }, data: { version: 2 } });
        await tx.diagnosticEvidence.update({ where: { id: evidenceId }, data: { state: "cleanup_pending", cleanupRequestedAt: defect === "mismatch" ? new Date(clock.getTime() + 1) : clock } });
      });
    })).rejects.toThrow(defect === "omission" ? "diagnostic_source_uncovered_effect" : defect === "wrongverb" ? "diagnostic_source_row" : "diagnostic_source_final_effect");
    expect(await state()).toEqual(before);
  });
  it("naked report mutation cannot bypass preparation", async () => {
    await draft(); const before = await state();
    await expect(db.diagnosticReportRecord.update({ where: { id: reportId }, data: { version: 100 } })).rejects.toThrow("diagnostic_source_unprepared");
    expect(await state()).toEqual(before);
  });
  async function blockedBy(pid: number, query: string) {
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      const result = await pool.query<{ pid: number }>("SELECT pid FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid)) AND query LIKE $2", [pid, query]);
      if (result.rows[0]) return result.rows[0].pid;
    }
    throw new Error("r5_expected_observed_backend_wait");
  }
  const outcome = <T>(p: Promise<T>) => p.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
  /** Both calls are real outer production entrypoints. The gate pauses actual
   * first DML after its source locks; opposing preparation must wait on its PID. */
  async function opposing(first: () => Promise<unknown>, second: () => Promise<unknown>, table: string, event: string, key = "orderId", secondSucceeds = false, secondRefusal = "diagnostic_source_graph_changed") {
    const gate = await pool.connect();
    let a: ReturnType<typeof outcome> | undefined, b: ReturnType<typeof outcome> | undefined;
    let failed = false, failure: unknown, installed = false;
    try {
      await gate.query("SELECT pg_advisory_lock(18975,hashtext($1))", [orderId]);
      const gatePid = (await gate.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
      await pool.query(`CREATE FUNCTION diagnostic_r5_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(18975,hashtext('${orderId}')); RETURN NEW; END $$;
        CREATE TRIGGER diagnostic_r5_gate BEFORE ${event} ON ${table} FOR EACH ROW WHEN (NEW."${key}"='${orderId}') EXECUTE FUNCTION diagnostic_r5_gate()`);
      installed = true;
      a = outcome(first());
      const holder = await blockedBy(gatePid, `%${event}%${table}%`);
      b = outcome(second());
      await blockedBy(holder, "%diagnostic_prepare_source%");
    } catch (error) { failed = true; failure = error; }
    finally {
      try { await gate.query("SELECT pg_advisory_unlock(18975,hashtext($1))", [orderId]); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
      finally {
        try { gate.release(true); }
        catch (error) { if (!failed) { failed = true; failure = error; } }
        finally { await Promise.all([a, b]); }
      }
      try { if (installed) await pool.query(`DROP TRIGGER diagnostic_r5_gate ON ${table}; DROP FUNCTION diagnostic_r5_gate()`); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
    }
    if (failed) throw failure;
    const firstResult = await a!, secondResult = await b!;
    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(secondSucceeds);
    if (!secondResult.ok) expect(() => { throw secondResult.error; }).toThrow(secondRefusal);
    return { firstResult, secondResult };
  }
  it.each(["save", "assignment"] as const)("actual save/assignment serialize with %s first", async first => {
    await draft();
    const save = () => reports.save(subject(), reportId, { expectedVersion: 0, finding: finding() });
    const assign = () => intake.assign(subject(), orderId, { expectedVersion: 1, userId: subject().userId, capability: "diagnostics.technician", active: true });
    const raw = await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } });
    await opposing(first === "save" ? save : assign, first === "save" ? assign : save, first === "save" ? "diagnostic_reports" : "inspection_orders", "UPDATE", first === "save" ? "orderId" : "id");
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({ version: first === "save" ? 1 : 0, identityRecordId: raw.id, identityRecordHash: raw.observationHash });
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } })).toEqual(raw);
    expect(await db.diagnosticAudit.count({ where: { orderId, action: "REPORT_FINDING_SAVED" } })).toBe(first === "save" ? 1 : 0);
  });
  it.each(["proof", "assignment"] as const)("actual issuer and A assignment serialize complete pair with %s first", async first => {
    const command = await pair();
    const issue = () => proofs.issue(subject(), id("b"), command);
    const assign = () => intake.assign(subject(), orderId, { expectedVersion: 2, userId: subject().userId, capability: "diagnostics.technician", active: true });
    await opposing(first === "proof" ? issue : assign, first === "proof" ? assign : issue, first === "proof" ? "diagnostic_continuity_proofs" : "inspection_orders", first === "proof" ? "INSERT" : "UPDATE", first === "proof" ? "predecessorOrderId" : "id", false, first === "proof" ? "diagnostic_source_graph_changed" : "DIAGNOSTIC_NO_ACCESS");
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: id("b") } })).toBe(first === "proof" ? 1 : 0);
    expect(await db.diagnosticAudit.count({ where: { orderId: id("b"), action: "CONTINUITY_PROOF_ISSUED" } })).toBe(first === "proof" ? 1 : 0);
  });
  it.each(["left", "right"] as const)("same proof duplicate consume with %s winning leaves one B draft and exact retry", async winner => {
    const command = await pair(), { proofId } = await proofs.issue(subject(), id("b"), command), input = consumption(proofId);
    const other = { ...input, reportId: id("other-b-report") }, firstInput = winner === "left" ? input : other, secondInput = winner === "left" ? other : input;
    await opposing(() => proofs.consume(linker(), id("b"), firstInput), () => proofs.consume(linker(), id("b"), secondInput), "diagnostic_continuity_proofs", "UPDATE", "predecessorOrderId", false, "DIAGNOSTIC_NO_ACCESS");
    expect(await db.diagnosticReportRecord.findUnique({ where: { id: secondInput.reportId } })).toBeNull();
    expect(await proofs.consume(linker(), id("b"), firstInput)).toMatchObject({ id: firstInput.reportId });
    expect(await db.diagnosticAudit.count({ where: { orderId: id("b"), action: "CONTINUITY_PROOF_CONSUMED" } })).toBe(1);
  });
  it.each(["session", "qualification", "rights"] as const)("issuer revalidates %s after an observed preparation wait", async defect => {
    // Explicit authority fixture timing through existing prepared operations.
    // Distinct cutoffs make each refusal stage reachable while other fences live.
    if (defect !== "rights") await db.$transaction(async tx => {
      const root = defect === "session" ? { table: "sessions" as const, key: { id: subject().sessionId } }
        : { table: "diagnostic_center_assignments" as const, key: { id: id("reviewer-qualification") } };
      const end = new Date(clock.getTime() + 600_000), next = defect === "session" ? { expiresAt: end } : { qualifiedUntil: end };
      const row = await diagnosticPlannedRow(tx, root, next);
      await withDiagnosticSourceCommand(tx, { operation: defect === "session" ? "session_change" : "staff_eligibility", roots: [root], rows: [row], actorUserId: null, sessionId: null, cutoff: null, campaign: null }, async () => {
        if (defect === "session") await tx.session.update({ where: { id: subject().sessionId }, data: { expiresAt: end } });
        else await tx.diagnosticCenterAssignment.update({ where: { id: id("reviewer-qualification") }, data: { qualifiedUntil: end } });
      });
    });
    const command = await pair(), before = await state(), gate = await pool.connect();
    // Lock-only test barrier, not a source mutation or a production opponent.
    let issued: ReturnType<typeof outcome> | undefined;
    let failed = false, failure: unknown;
    try {
      await gate.query("BEGIN");
      await gate.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [subject().userId]);
      const gatePid = (await gate.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
      issued = outcome(proofs.issue(subject(), id("b"), command));
      await blockedBy(gatePid, "%diagnostic_prepare_source%");
      if (defect === "rights") clock = new Date(clock.getTime() + 3600_000);
      else if (defect === "session") clock = new Date((await db.session.findUniqueOrThrow({ where: { id: subject().sessionId } })).expiresAt);
      else clock = new Date((await db.diagnosticCenterAssignment.findUniqueOrThrow({ where: { id: id("reviewer-qualification") } })).qualifiedUntil!);
      const session = await db.session.findUniqueOrThrow({ where: { id: subject().sessionId } });
      const qualification = await db.diagnosticCenterAssignment.findUniqueOrThrow({ where: { id: id("reviewer-qualification") } });
      const provenance = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: id("a-p") } });
      expect(session.expiresAt > clock).toBe(defect !== "session");
      expect(qualification.qualifiedUntil! > clock).toBe(defect !== "qualification");
      expect(provenance.rightsUntil! > clock).toBe(defect !== "rights");
    } catch (error) { failed = true; failure = error; }
    finally {
      try { await gate.query("ROLLBACK"); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
      finally {
        // Destroying the barrier connection also releases its locks if ROLLBACK failed.
        try { gate.release(true); }
        catch (error) { if (!failed) { failed = true; failure = error; } }
        finally { await issued; }
      }
    }
    if (failed) throw failure;
    const result = await issued!;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(() => { throw result.error; }).toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await state()).toEqual(before);
  });
  it("real assignment invalidates an unused proof while preserving authorized historical reading", async () => {
    const command = await pair(), { proofId } = await proofs.issue(subject(), id("b"), command);
    await intake.assign(subject(), orderId, { expectedVersion: 2, userId: subject().userId, capability: "diagnostics.technician", active: true });
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toMatchObject({ invalidatedAt: expect.any(Date), consumedReportId: null });
    expect(await proofs.read(subject(), id("b"), proofId)).toMatchObject({ proofId });
    const before = await state();
    await expect(proofs.consume(linker(), id("b"), consumption(proofId))).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await state()).toEqual(before);
  });
  it("public gate stays closed and proofless reinspection is refused", async () => {
    await draft(); await submit(); await finalize();
    await expect(reports.read(subject(), reportId)).resolves.toMatchObject({ id: reportId, status: "finalized" });
    expect(await reports.forOrder(subject(), orderId)).toHaveLength(1);
    expect(await documents.list(subject(), reportId)).toMatchObject(["en", "ru", "tk"].map(locale => ({ locale, state: "pending" })));
    await expect(documents.list(null, reportId)).rejects.toThrow("DIAGNOSTIC_PUBLIC_UNAVAILABLE");
    await expect(reports.reinspect(subject(), id("b"), { reportId: id("b-report"), predecessorId: reportId, expectedOrderVersion: 1, reason: "No proof" })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
  });

  it.each(["epoch", "bytes", "session", "storage"] as const)("PDF delivery rechecks current descriptor/permission after %s during external read", async defect => {
    await draft(); await submit(); await finalize();
    const artifact = await db.diagnosticPdfArtifact.findFirstOrThrow({ where: { reportId, locale: "en" } });
    const pdf = new Uint8Array([37, 80, 68, 70]);
    stored.set(artifact.objectKey, pdf);
    // Explicit worker-boundary fixture transition on dependency-only artifact DML.
    await db.diagnosticPdfArtifact.update({ where: { id: artifact.id }, data: { state: "ready", sha256: createHash("sha256").update(pdf).digest("hex"), sizeBytes: pdf.length, verifiedAt: clock } });
    expect(await documents.download(subject(), reportId, "en")).toEqual(pdf);
    afterRead = async () => {
      afterRead = undefined;
      if (defect === "epoch") await db.diagnosticPdfArtifact.update({ where: { id: artifact.id }, data: { epoch: id("replacement-epoch") } });
      if (defect === "bytes") stored.set(artifact.objectKey, new Uint8Array([0, 0, 0, 0]));
      if (defect === "session") clock = new Date((await db.session.findUniqueOrThrow({ where: { id: subject().sessionId } })).expiresAt);
      if (defect === "storage") stored.delete(artifact.objectKey);
    };
    await expect(documents.download(subject(), reportId, "en")).rejects.toThrow(defect === "epoch" ? "DIAGNOSTIC_PDF_NOT_READY" : defect === "session" ? "DIAGNOSTIC_NO_ACCESS" : "DIAGNOSTIC_PDF_UNAVAILABLE");
  });
  it.each(["first", "second"] as const)("two real same-version saves have one winner with %s launched first", async order => {
    await draft();
    const left = () => reports.save(subject(), reportId, { expectedVersion: 0, finding: finding() });
    const right = () => reports.save(subject(), reportId, { expectedVersion: 0, finding: { ...finding(), explanation: "Other recording" } });
    await opposing(order === "first" ? left : right, order === "first" ? right : left, "diagnostic_reports", "UPDATE");
    const row = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } });
    expect(row.version).toBe(1);
    expect(await db.diagnosticAudit.count({ where: { orderId, action: "REPORT_FINDING_SAVED" } })).toBe(1);
  });
  it.each(["correction", "consumption"] as const)("correction/reinspection compete on A with %s first", async first => {
    const command = await pair(), { proofId } = await proofs.issue(subject(), id("b"), command);
    const correct = () => reports.correct(subject(), reportId, { successorId: id("correction"), expectedVersion: 2, reason: "Same visit correction" });
    const consume = () => proofs.consume(linker(), id("b"), consumption(proofId));
    await opposing(first === "correction" ? correct : consume, first === "correction" ? consume : correct,
      first === "correction" ? "diagnostic_reports" : "diagnostic_continuity_proofs", first === "correction" ? "INSERT" : "UPDATE", first === "correction" ? "orderId" : "predecessorOrderId", false, first === "correction" ? "DIAGNOSTIC_NO_ACCESS" : "diagnostic_source_graph_changed");
    expect(await db.diagnosticReportRecord.count({ where: { predecessorId: reportId } })).toBe(1);
    expect(await db.diagnosticReportRecord.findUnique({ where: { id: first === "correction" ? id("b-report") : id("correction") } })).toBeNull();
  });

  it.each(["issue", "consume"] as const)("same-request %s winner is recovered through a read after the observed wait", async kind => {
    const command = await pair(), b = id("b"), actor = kind === "issue" ? subject() : linker();
    const request = await proofs.prepareRequest(actor, b, { kind });
    const { proofId } = kind === "consume" ? await proofs.issue(subject(), b, command) : { proofId: id("not-used") };
    const input: D.DiagnosticContinuityRequestExecute = kind === "issue" ? { kind, command }
      : { kind, command: { proofId, reportId: id("b-report"), expectedOrderVersion: 2, reason: "Fresh independent visit" } };
    const execute = () => proofs.executeRequest(actor, b, request.requestId, input);
    const result = await opposing(execute, execute, "diagnostic_continuity_proofs", kind === "issue" ? "INSERT" : "UPDATE", "predecessorOrderId", true);
    expect(result.firstResult).toEqual(result.secondResult);
    if (result.firstResult.ok) expect(await proofs.recoverRequest(actor, b, request.requestId)).toEqual(result.firstResult.value);
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: b } })).toBe(1);
    expect(await db.diagnosticAudit.count({ where: { orderId: b, action: kind === "issue" ? "CONTINUITY_PROOF_ISSUED" : "CONTINUITY_PROOF_CONSUMED" } })).toBe(1);
  });
  async function disposeProvenance(provenanceId: string) {
    // Explicit disposal fault injection through the accepted material operation.
    // This is not represented as a production caller race opponent.
    await db.$transaction(async tx => {
      const root = { table: "diagnostic_identity_provenance" as const, key: { id: provenanceId } };
      const next = { state: "cleanup_pending", cleanupRequestedAt: clock };
      const row = await diagnosticPlannedRow(tx, root, next);
      await withDiagnosticSourceCommand(tx, { operation: "identity_material_change", roots: [root], rows: [row], actorUserId: null, sessionId: null, cutoff: null, campaign: null }, async () => {
        await tx.diagnosticIdentityProvenance.update({ where: { id: provenanceId }, data: next });
      });
    });
  }
  it("material cleanup deletes bound proof and issue request while exact surviving B retry and release remain available", async () => {
    const command = await pair(), b = id("b"), request = await proofs.prepareRequest(subject(), b, { kind: "issue" });
    await proofs.executeRequest(subject(), b, request.requestId, { kind: "issue", command });
    const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { requestId: request.requestId } }), input = consumption(proof.id);
    const created = await proofs.consume(linker(), b, input);
    await disposeProvenance(id("a-p"));
    expect(await db.diagnosticContinuityProof.findUnique({ where: { id: proof.id } })).toBeNull();
    expect(await db.diagnosticContinuityRequest.findUnique({ where: { id: request.requestId } })).toBeNull();
    expect(await proofs.consume(linker(), b, input)).toEqual(created);
    expect(await proofs.useHandoff(linker(), b, proof.id, input)).toEqual({ reportId: input.reportId });
    await reports.transition(linker(), input.reportId, { expectedVersion: 0, action: "submit" });
    expect(await reports.transition(subject(), input.reportId, { expectedVersion: 1, action: "finalize" })).toMatchObject({ status: "finalized", id: input.reportId });
    expect(await db.diagnosticPdfArtifact.count({ where: { reportId: input.reportId } })).toBe(3);
  });
  it("comparison provenance delivery repeats current pair/material validation after disposal during I/O", async () => {
    await pair();
    afterRead = async () => { afterRead = undefined; await disposeProvenance(id("a-p")); };
    await expect(reports.comparisonProvenance(subject(), id("b"), reportId, id("a-p"))).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
  });

  it("a fault-mutated PDF intent is refused by exact finish projection after actual INSERT", async () => {
    await draft(); await submit(); const before = await state();
    await pool.query(`CREATE FUNCTION diagnostic_r5_pdf_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.attempts=1; RETURN NEW; END $$;
      CREATE TRIGGER diagnostic_r5_pdf_fault BEFORE INSERT ON diagnostic_pdf_artifacts FOR EACH ROW EXECUTE FUNCTION diagnostic_r5_pdf_fault()`);
    try { await expect(finalize()).rejects.toThrow("diagnostic_source_final_effect"); }
    finally { await pool.query("DROP TRIGGER diagnostic_r5_pdf_fault ON diagnostic_pdf_artifacts; DROP FUNCTION diagnostic_r5_pdf_fault()"); }
    expect(await state()).toEqual(before);
  });

  it("discovers a complete initial two-proof handoff page with retained pins and no admission", async () => {
    const command = await pair(), first = await proofs.issue(subject(), id("b"), command), second = await proofs.issue(subject(), id("b"), command), before = await state();
    const page = await proofs.handoffs(linker(), id("b"), {});
    expect(page.handoffs.map(item => item.proofId).sort()).toEqual([first.proofId, second.proofId].sort());
    expect(page.handoffs.every(item => item.status === "usable" && item.expectedOrderVersion === 2)).toBe(true);
    expect(await state()).toEqual(before);
  });
});
