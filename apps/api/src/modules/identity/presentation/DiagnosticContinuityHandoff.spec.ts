import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService, Prisma } from "@auto-tm/db";
import { DiagnosticMemoryDatabase, diagnosticTestId as id, diagnosticTestNow as now } from "@auto-tm/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiagnosticsModule } from "../../diagnostics/diagnostics.module";
import { DiagnosticReportsController } from "../../diagnostics/presentation/DiagnosticReportsController";
import { DIAGNOSTIC_RUNTIME } from "../../diagnostics/domain/ports/DiagnosticIntakePort";
import { CheckStaffAuthority } from "../application/CheckStaffAuthority";
import { CheckBusinessAuthority } from "../application/CheckBusinessAuthority";
import { PrismaStaffAuthority } from "../infrastructure/PrismaStaffAuthority";
import { PrismaBusinessAuthority } from "../infrastructure/PrismaBusinessAuthority";
import { PrismaStaffBindings } from "../infrastructure/PrismaStaffBindings";
import { PrismaPublisherBindings } from "../infrastructure/PrismaPublisherBindings";
import { STAFF_AUTHORITY_PORT, BUSINESS_AUTHORITY_PORT, STAFF_BINDING_PORT, PUBLISHER_BINDING_PORT } from "../identity.public";

const future = new Date("2027-01-01T00:00:00Z");
const rights = { category: "vehicle_observation", purpose: "Synthetic discovery", basis: "Owned synthetic fixture",
  provenance: "Generated fixture", identifiability: "pseudonymous", use: ["service"],
  schedule: { kind: "until", until: future.toISOString(), reason: "Fixture permission" }, supplierRestrictions: "No export", hold: null };
const observation = { observedAt: "2026-10-21T12:00:00.000Z", mileageKm: 100, method: "vin", vin: "SYN-923", manualReference: null };
const reviewer = { userId: id(1), sessionId: id(101) };
const b = id(20);
const technician = { userId: id(2), sessionId: id(102) };

describe("B-owned continuity handoff through real HTTP, application, authority and database-boundary fake", () => {
  let app: NestFastifyApplication; let memory: DiagnosticMemoryDatabase; let db: PrismaService; let currentTime: Date;
  const subjectHeaders = (actor = reviewer) => ({ "x-test-user": actor.userId, "x-test-session": actor.sessionId });
  const get = async (route: string, actor = reviewer) => {
    const response = await app.inject({ method: "GET", url: `/api/v1/diagnostics/orders/${route}`, headers: subjectHeaders(actor) });
    return { status: response.statusCode, body: response.json(), headers: response.headers };
  };
  function staff(n: number, capability: string, name: string) {
    memory.seed("user", { id: id(n), displayName: name, suspendedAt: null, deletionScheduledAt: null, role: "buyer", dealershipMemberships: [], staffGrants: [{ capability }] });
    memory.seed("session", { id: id(n + 100), userId: id(n), expiresAt: future, adminTotpExpiresAt: future });
    memory.seed("staffGrant", { userId: id(n), capability, revokedAt: null, grantedAt: now });
    memory.seed("diagnosticCenterAssignment", { id: id(n + 200), centerId: id(10), userId: id(n), capability, revokedAt: null, qualifiedUntil: future });
  }
  function assign(orderId: string, n: number, capability = "diagnostics.reviewer") {
    memory.seed("diagnosticOrderAssignment", { id: randomUUID(), orderId, userId: id(n), capability, revokedAt: null });
  }
  function visit(n: number, report = true) {
    const orderId = id(n);
    memory.seed("inspectionOrder", { id: orderId, centerId: id(10), commissionerId: id(9), synthetic: true, erasedAt: null, audience: "buyer_private", listingId: null,
      templateVersionId: id(500), epoch: id(n + 6000), version: 1, status: "arrived", physicalAuthorization: {}, observedVehicle: observation, identityEvidenceGeneration: 1 });
    assign(orderId, 1);
    memory.seed("diagnosticIdentityRecord", { id: id(n + 1000), orderId, orderVersion: 1, observation, observationHash: "a".repeat(64), erasedAt: null });
    memory.seed("diagnosticIdentityProvenance", { id: id(n + 2000), orderId, state: "verified", erasedAt: null, cleanupRequestedAt: null, objectKey: "private-fixture", sha256: "c".repeat(64), rights, rightsUntil: future });
    memory.seed("diagnosticIdentityEvidence", { id: id(n + 3000), orderId, orderVersion: 1, identityRecordId: id(n + 1000), observationHash: "a".repeat(64), recordHash: "b".repeat(64),
      rights, rightsUntil: future, erasedAt: null, supersedesId: null, recordedById: id(2), recordedAt: now,
      identifiers: [{ kind: "vin_stamp", location: "Synthetic plate", value: "SYN-923", provenanceIds: [id(n + 2000)] }],
      provenance: [{ id: id(n + 2000), sha256: "c".repeat(64), mime: "image/webp", sizeBytes: 72 }] });
    if (report) memory.seed("diagnosticReportRecord", { id: id(n + 4000), orderId, audience: "buyer_private", status: "finalized", erasedAt: null, snapshot: {}, snapshotHash: "d".repeat(64),
      identityRecordId: id(n + 1000), identityRecordHash: "a".repeat(64), identityEvidenceId: id(n + 3000), identityEvidenceHash: "b".repeat(64), version: 1, state: { id: id(n + 4000), orderId, audience: "buyer_private", templateVersionId: id(500), status: "finalized", observedAt: observation.observedAt, mileageKm: 100, findings: [], authorId: id(2), reviewerId: id(1), successorOf: null, correctionReason: null, returnReason: null, finalizedAt: now.toISOString(), withdrawnAt: null, withdrawalReason: null }, createdAt: new Date(now.getTime() - 1000) });
  }
  beforeEach(async () => {
    memory = new DiagnosticMemoryDatabase(); db = memory.client; currentTime = now;
    staff(1, "diagnostics.reviewer", "Reviewer"); staff(2, "diagnostics.technician", "B technician"); staff(3, "diagnostics.technician", "Foreign technician");
    const text = { tk: "Synthetic", ru: "Synthetic", en: "Synthetic" };
    memory.seed("diagnosticTemplateVersion", { id: id(500), synthetic: true, definition: { title: text, limitations: text, syntheticNotice: text, checks: [{ id: "brakes", label: text, required: true, evidenceRequired: false, measurement: null }], panels: [] } });
    visit(20, false); assign(b, 2, "diagnostics.technician");
    const runtime = { now: () => currentTime, id: (() => { let next = 800000; return () => id(next++); })(), syntheticAllowed: () => true, publicSyntheticAllowed: () => false };
    const module = await Test.createTestingModule({ controllers: [DiagnosticReportsController],
      // Use production diagnostic composition, replacing only database/time/config boundaries.
      providers: [...Reflect.getMetadata("providers", DiagnosticsModule),
        { provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: new ConfigService({}) },
        { provide: DIAGNOSTIC_RUNTIME, useValue: runtime },
        { provide: STAFF_AUTHORITY_PORT, useValue: new CheckStaffAuthority(new PrismaStaffAuthority(db), runtime) },
        { provide: BUSINESS_AUTHORITY_PORT, useValue: new CheckBusinessAuthority(new PrismaBusinessAuthority(db), runtime) },
        { provide: STAFF_BINDING_PORT, useClass: PrismaStaffBindings }, { provide: PUBLISHER_BINDING_PORT, useClass: PrismaPublisherBindings }],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // Authentication network boundary supplies a principal. Current Session/grants are real Identity checks.
    app.getHttpAdapter().getInstance().addHook("preHandler", (request, _reply, next) => { const req = request as unknown as { headers: Record<string, string>; user?: object }; req.user = { sub: req.headers["x-test-user"], sid: req.headers["x-test-session"] }; next(); });
    await app.init(); await app.getHttpAdapter().getInstance().ready();
  });
  afterEach(async () => { await app?.close(); });

  async function post(route: string, body: object, actor = reviewer) {
    const response = await app.inject({ method: "POST", url: `/api/v1/diagnostics/orders/${route}`, headers: subjectHeaders(actor), payload: body });
    return { status: response.statusCode, body: response.json(), headers: response.headers };
  }
  async function issue() {
    visit(30);
    const issued = await post(`${b}/continuity-proofs`, { predecessorId: id(4030), expectedPredecessorVersion: 1, expectedOrderVersion: 1,
      predecessorIdentityRecordId: id(1030), candidateIdentityRecordId: id(1020), linkingTechnicianId: id(2), method: "comparative_attestation", rationale: "Private reviewer rationale", provenanceRecordIds: [id(2030), id(2020)] });
    expect(issued.status).toBe(201);
    expect((await get(`${b}/continuity-proofs/${issued.body.proofId}`)).status).toBe(200);
    return issued.body.proofId as string;
  }
  it("lets only the selected current B technician reload a minimal usable handle without A access", async () => {
    const proofId = await issue();
    const response = await get(`${b}/continuity-handoffs`, technician);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store, private");
    expect(response.body).toEqual({ handoffs: [{ proofId, status: "usable", expectedOrderVersion: 1 }], result: null, nextCursor: null, scope: "current_b_owned_handoffs" });
    expect((await get(`${b}/continuity-proofs/${proofId}`, technician)).status).toBe(403);
    expect((await get(`${b}/continuity-handoffs`)).status).toBe(403);
    expect((await get(`${b}/continuity-handoffs`, { userId: id(3), sessionId: id(103) })).status).toBe(403);
    assign(b, 3, "diagnostics.technician");
    expect((await get(`${b}/continuity-handoffs`, { userId: id(3), sessionId: id(103) })).body).toEqual({ handoffs: [], result: null, nextCursor: null, scope: "current_b_owned_handoffs" });
  });
  it("uses only B command fields and recovers B after proof payload loss and later A erasure", async () => {
    const proofId = await issue();
    const command = { reportId: id(9000), expectedOrderVersion: 1, reason: "B visit follow-up" };
    const created = await post(`${b}/continuity-handoffs/${proofId}/consume`, command, technician);
    expect(created.status).toBe(201); expect(created.body).toEqual({ reportId: id(9000) });
    await db.diagnosticContinuityProof.update({ where: { id: proofId }, data: { content: Prisma.DbNull, bindings: Prisma.DbNull, erasedAt: now, issuerId: null, issuerSessionId: null, linkingTechnicianId: null, candidateOrderId: null, predecessorReportId: null, predecessorOrderId: null } });
    await db.inspectionOrder.update({ where: { id: id(30) }, data: { erasedAt: now } });
    await db.diagnosticReportRecord.update({ where: { id: id(4030) }, data: { erasedAt: now } });
    const recovered = await get(`${b}/continuity-handoffs`, technician);
    expect(recovered.body).toEqual({ handoffs: [], result: { proofId, reportId: id(9000) }, nextCursor: null, scope: "current_b_owned_handoffs" });
    expect(await post(`${b}/continuity-handoffs/${proofId}/consume`, command, technician)).toMatchObject({ status: 201, body: { reportId: id(9000) } });
    expect((await post(`${b}/continuity-handoffs/${proofId}/consume`, { ...command, reason: "Changed" }, technician)).status).toBe(409);
    expect((await post(`${b}/continuity-handoffs/${randomUUID()}/consume`, command, technician)).status).toBe(409);
    expect(await db.diagnosticAudit.count({ where: { action: "CONTINUITY_PROOF_CONSUMED" } })).toBe(1);
    await db.diagnosticReportRecord.update({ where: { id: id(9000) }, data: { erasedAt: now } });
    expect((await get(`${b}/continuity-handoffs`, technician)).body.result).toBeNull();
    expect((await post(`${b}/continuity-handoffs/${proofId}/consume`, command, technician)).status).toBe(409);
  });

  it.each([
    ["issuer Session expiry", "session", { id: id(101) }, { expiresAt: now }],
    ["issuer grant loss", "staffGrant", { userId: id(1) }, { revokedAt: now }],
    ["issuer qualification loss", "diagnosticCenterAssignment", { userId: id(1) }, { qualifiedUntil: now }],
    ["issuer A assignment loss", "diagnosticOrderAssignment", { orderId: id(30), userId: id(1) }, { revokedAt: now }],
    ["issuer B assignment loss", "diagnosticOrderAssignment", { orderId: b, userId: id(1) }, { revokedAt: now }],
    ["A erasure", "inspectionOrder", { id: id(30) }, { erasedAt: now }],
    ["A raw erasure", "diagnosticIdentityRecord", { orderId: id(30) }, { erasedAt: now }],
    ["A rights expiry", "diagnosticIdentityProvenance", { orderId: id(30) }, { rightsUntil: now }],
    ["B rights expiry", "diagnosticIdentityEvidence", { orderId: b }, { rightsUntil: now }],
    ["changed B version", "inspectionOrder", { id: b }, { version: 2 }],
    ["changed A version", "diagnosticReportRecord", { id: id(4030) }, { version: 2 }],
    ["proof rights expiry", "diagnosticContinuityProof", {}, { rightsUntil: now }],
    ["permanent invalidation", "diagnosticContinuityProof", {}, { invalidatedAt: now }],
  ] as const)("uniformly omits and refuses %s at read and again at action", async (_name, table, where, data) => {
    const proofId = await issue();
    expect((await get(`${b}/continuity-handoffs`, technician)).body.handoffs).toHaveLength(1);
    // Database mutation boundary; fake has no trigger behavior. Admission must reject even without triggers.
    await (db[table].updateMany as (args: object) => Promise<unknown>)({ where, data });
    expect((await get(`${b}/continuity-handoffs`, technician)).body).toEqual({ handoffs: [], result: null, nextCursor: null, scope: "current_b_owned_handoffs" });
    const denied = await post(`${b}/continuity-handoffs/${proofId}/consume`, { reportId: id(9000), expectedOrderVersion: 1, reason: "B follow-up" }, technician);
    expect(denied).toMatchObject({ status: 403, body: { code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection request could not be completed" } });
    expect(await db.diagnosticReportRecord.count({ where: { orderId: b } })).toBe(0);
    expect(await db.diagnosticAudit.count({ where: { action: "CONTINUITY_PROOF_CONSUMED" } })).toBe(0);
  });
  it.each([
    ["Session", "session", { id: id(102) }, { expiresAt: now }],
    ["grant", "staffGrant", { userId: id(2) }, { revokedAt: now }],
    ["qualification", "diagnosticCenterAssignment", { userId: id(2) }, { qualifiedUntil: now }],
    ["B assignment", "diagnosticOrderAssignment", { orderId: b, userId: id(2) }, { revokedAt: now }],
  ] as const)("fences B %s changes even on empty pages and consumed result recovery", async (_name, table, where, data) => {
    const proofId = await issue(); const command = { reportId: id(9000), expectedOrderVersion: 1, reason: "B follow-up" };
    expect((await post(`${b}/continuity-handoffs/${proofId}/consume`, command, technician)).status).toBe(201);
    await (db[table].updateMany as (args: object) => Promise<unknown>)({ where, data });
    expect((await get(`${b}/continuity-handoffs`, technician)).status).toBe(403);
    expect((await post(`${b}/continuity-handoffs/${proofId}/consume`, command, technician)).status).toBe(403);
  });
  it("keeps readable historical proofs separate from current usability and traverses beyond 50", async () => {
    const proofId = await issue();
    const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    for (let n = 10000; n < 10061; n++) memory.seed("diagnosticContinuityProof", { ...proof, id: id(n), content: { ...(proof.content as object), proofId: id(n) }, invalidatedAt: now });
    expect((await get(`${b}/continuity-proofs/${id(10000)}`)).status).toBe(200);
    let route = `${b}/continuity-handoffs`; const handles: string[] = []; let pages = 0;
    for (; pages < 10; pages++) {
      const response = await get(route, technician); expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual(["handoffs", "nextCursor", "result", "scope"]);
      handles.push(...response.body.handoffs.map((handle: { proofId: string }) => handle.proofId));
      if (!response.body.nextCursor) break;
      expect(response.body.nextCursor).toHaveLength(1062);
      route = `${b}/continuity-handoffs?cursor=${response.body.nextCursor}`;
    }
    expect(pages).toBe(3); expect(handles).toEqual([proofId]);
    expect((await get(`${b}/continuity-handoffs`, technician)).body.handoffs).toEqual([]);
  });
  it("binds continuation to the query, actor, Session, B and expiry, without inherited authority", async () => {
    const proofId = await issue(); const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    for (let n = 10000; n < 10021; n++) memory.seed("diagnosticContinuityProof", { ...proof, id: id(n), invalidatedAt: now });
    const cursor = (await get(`${b}/continuity-handoffs`, technician)).body.nextCursor;
    expect((await get(`${b}/predecessor-candidates?cursor=${cursor}`)).status).toBe(403);
    expect((await get(`${b}/continuity-handoffs?cursor=${cursor.slice(0, -1)}!`, technician)).status).toBe(403);
    currentTime = new Date(now.getTime() + 15 * 60_000);
    expect((await get(`${b}/continuity-handoffs?cursor=${cursor}`, technician)).status).toBe(403);
  });
  it("rejects A bindings, protected fields and unrecognized query/command fields", async () => {
    const proofId = await issue(); const command = { reportId: id(9000), expectedOrderVersion: 1, reason: "B follow-up" };
    for (const extra of [{ predecessorId: id(4030) }, { rationale: "private" }, { requestId: randomUUID() }])
      expect((await post(`${b}/continuity-handoffs/${proofId}/consume`, { ...command, ...extra }, technician)).status).toBe(400);
    expect((await get(`${b}/continuity-handoffs?predecessorId=${id(4030)}`, technician)).status).toBe(400);
  });

  // #923 commit-bound requests. Existing handoff cases above remain unchanged.
  const requestPath = `${b}/continuity-requests`;
  const issuanceCommand = () => ({ predecessorId: id(4030), expectedPredecessorVersion: 1, expectedOrderVersion: 1,
    predecessorIdentityRecordId: id(1030), candidateIdentityRecordId: id(1020), linkingTechnicianId: id(2),
    method: "comparative_attestation", rationale: "Private reviewer rationale", provenanceRecordIds: [id(2030), id(2020)] });
  async function prepare(kind: "issue" | "consume", actor = reviewer) {
    const response = await post(requestPath, { kind }, actor);
    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store, private");
    return response.body.requestId as string;
  }
  it("recovers lost preparation and issuance replies without storing pending text or duplicating issuance", async () => {
    visit(30);
    // Existing real issuance/comparison fixtures work before the new route is exercised.
    const legacy = await post(`${b}/continuity-proofs`, issuanceCommand());
    expect(legacy.status).toBe(201);
    const requestId = await prepare("issue");
    expect((await get(requestPath)).body).toEqual({ requests: [{ requestId, kind: "issue", state: "pending_input" }], nextCursor: null });
    expect((await post(`${requestPath}/${requestId}/execute`, {})).status).toBe(400);
    const command = issuanceCommand();
    const executed = await post(`${requestPath}/${requestId}/execute`, { kind: "issue", command });
    expect(executed.status).toBe(201);
    const expected = { requestId, kind: "issue", state: "completed", proofId: executed.body.proofId, usability: "historical" };
    // Reload needs neither command nor an ID retained in the browser.
    expect((await get(requestPath)).body).toEqual({ requests: [expected], nextCursor: null });
    expect((await get(`${requestPath}/${requestId}`)).body).toEqual(expected);
    expect((await post(`${requestPath}/${requestId}/execute`, { kind: "issue", command })).body).toEqual(expected);
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: b } })).toBe(2);
    expect(await db.diagnosticAudit.count({ where: { action: "CONTINUITY_PROOF_ISSUED" } })).toBe(2);
    const other = await prepare("issue");
    expect((await post(`${requestPath}/${other}/execute`, { kind: "issue", command })).status).toBe(201);
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: b } })).toBe(3);
    for (const change of [{ rationale: "Changed" }, { linkingTechnicianId: id(3) }, { expectedOrderVersion: 2 }, { provenanceRecordIds: [id(2030)] }])
      expect((await post(`${requestPath}/${requestId}/execute`, { kind: "issue", command: { ...command, ...change } })).status).toBe(409);
  });
  it("recovers a B-only committed request after proof disposal and A erasure without its command", async () => {
    const proofId = await issue();
    const requestId = await prepare("consume", technician);
    const command = { proofId, reportId: id(9000), expectedOrderVersion: 1, reason: "B own follow-up" };
    const expected = { requestId, kind: "consume", state: "completed", result: { proofId, reportId: id(9000) } };
    expect((await post(`${requestPath}/${requestId}/execute`, { kind: "consume", command }, technician)).body).toEqual(expected);
    // DB boundary simulates disposal; real SQL deletion/rollback is covered in hosted declarations.
    await db.diagnosticContinuityProof.update({ where: { id: proofId }, data: { content: Prisma.DbNull, bindings: Prisma.DbNull, erasedAt: now, issuerId: null, issuerSessionId: null } });
    await db.inspectionOrder.update({ where: { id: id(30) }, data: { erasedAt: now } });
    await db.diagnosticReportRecord.update({ where: { id: id(4030) }, data: { erasedAt: now } });
    expect((await get(requestPath, technician)).body).toEqual({ requests: [expected], nextCursor: null });
    expect((await get(`${requestPath}/${requestId}`, technician)).body).toEqual(expected);
    expect((await post(`${requestPath}/${requestId}/execute`, { kind: "consume", command }, technician)).body).toEqual(expected);
    for (const change of [{ reason: "Changed" }, { expectedOrderVersion: 2 }, { proofId: randomUUID() }, { reportId: id(9001) }])
      expect((await post(`${requestPath}/${requestId}/execute`, { kind: "consume", command: { ...command, ...change } }, technician)).status).toBe(409);
    expect(await db.diagnosticAudit.count({ where: { action: "CONTINUITY_PROOF_CONSUMED" } })).toBe(1);
    expect(await db.diagnosticAudit.count({ where: { action: "REPORT_REINSPECTION_CREATED" } })).toBe(1);
    await db.diagnosticOrderAssignment.updateMany({ where: { orderId: b, userId: technician.userId }, data: { revokedAt: now } });
    expect((await get(`${requestPath}/${requestId}`, technician)).status).toBe(403);
  });
  it("refuses unknown identities, new Sessions, wrong actors/kinds and pending command fields", async () => {
    const proofId = await issue();
    const requestId = await prepare("consume", technician);
    expect((await post(requestPath, { kind: "consume", reason: "Never collect this" }, technician)).status).toBe(400);
    memory.seed("session", { id: id(999), userId: technician.userId, expiresAt: future, adminTotpExpiresAt: future });
    const newSession = { ...technician, sessionId: id(999) };
    expect((await get(`${requestPath}/${requestId}`, newSession)).status).toBe(403);
    expect((await get(`${requestPath}/${requestId}`, reviewer)).status).toBe(403);
    const command = { proofId, reportId: id(9000), expectedOrderVersion: 1, reason: "B own follow-up" };
    expect((await post(`${requestPath}/${randomUUID()}/execute`, { kind: "consume", command }, technician)).status).toBe(403);
    expect((await post(`${requestPath}/${requestId}/execute`, { kind: "issue", command: issuanceCommand() }, technician)).status).toBe(403);
    expect((await post(`${requestPath}/${requestId}/execute`, { kind: "consume", command }, newSession)).status).toBe(403);
    expect(await db.diagnosticReportRecord.count({ where: { orderId: b } })).toBe(0);
    expect((await get(requestPath, technician)).body.requests).toEqual([{ requestId, kind: "consume", state: "pending_input" }]);
  });
  it("keeps an invalidated issued request historical and refuses first consumption after authority loss", async () => {
    visit(30);
    const requestId = await prepare("issue"); const command = issuanceCommand();
    const executed = await post(`${requestPath}/${requestId}/execute`, { kind: "issue", command });
    expect(executed.status).toBe(201);
    await db.diagnosticContinuityProof.update({ where: { id: executed.body.proofId }, data: { invalidatedAt: now } });
    expect((await get(`${requestPath}/${requestId}`)).body.usability).toBe("historical");
    expect((await post(`${requestPath}/${requestId}/execute`, { kind: "issue", command })).body.usability).toBe("historical");
    const pending = await prepare("consume", technician);
    await db.diagnosticCenterAssignment.updateMany({ where: { userId: technician.userId }, data: { qualifiedUntil: now } });
    expect((await post(`${requestPath}/${pending}/execute`, { kind: "consume", command: { proofId: executed.body.proofId, reportId: id(9000), expectedOrderVersion: 1, reason: "B follow-up" } }, technician)).status).toBe(403);
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: b } })).toBe(1);
  });

  it("bounds request discovery, binds continuations to Session/B/query and stages linkage only", async () => {
    for (let n = 0; n < 21; n++) await prepare("consume", technician);
    const first = await get(requestPath, technician);
    expect(first.body.requests).toHaveLength(20);
    const cursor = first.body.nextCursor as string;
    expect(cursor).toHaveLength(1062);
    const next = await get(`${requestPath}?cursor=${cursor}`, technician);
    expect(next.body.requests).toHaveLength(1); expect(next.body.nextCursor).toBeNull();
    expect(new Set([...first.body.requests, ...next.body.requests].map((r: { requestId: string }) => r.requestId)).size).toBe(21);
    expect((await get(`${b}/continuity-handoffs?cursor=${cursor}`, technician)).status).toBe(403);
    const rows = await db.diagnosticContinuityRequest.findMany({ where: { orderId: b } });
    for (const row of rows) {
      // Fake CRUD adds its general defaults; selected persisted command fields must remain absent.
      expect(row).not.toHaveProperty("command"); expect(row).not.toHaveProperty("reason"); expect(row).not.toHaveProperty("commandHash");
      expect(row).toMatchObject({ actorId: technician.userId, sessionId: technician.sessionId, kind: "consume", orderId: b });
    }
    currentTime = new Date(now.getTime() + 15 * 60_000);
    expect((await get(`${requestPath}?cursor=${cursor}`, technician)).status).toBe(403);
  });

});
