import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "@auto-tm/db";
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

describe("B-scoped discovery through real HTTP, application, authority and database-boundary fake", () => {
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
      version: 1, status: "arrived", physicalAuthorization: {}, observedVehicle: observation, identityEvidenceGeneration: 1 });
    assign(orderId, 1);
    memory.seed("diagnosticIdentityRecord", { id: id(n + 1000), orderId, orderVersion: 1, observation, observationHash: "a".repeat(64), erasedAt: null });
    memory.seed("diagnosticIdentityProvenance", { id: id(n + 2000), orderId, state: "verified", erasedAt: null, cleanupRequestedAt: null, objectKey: "private-fixture", sha256: "c".repeat(64), rights, rightsUntil: future });
    memory.seed("diagnosticIdentityEvidence", { id: id(n + 3000), orderId, orderVersion: 1, identityRecordId: id(n + 1000), observationHash: "a".repeat(64), recordHash: "b".repeat(64),
      rights, rightsUntil: future, erasedAt: null, supersedesId: null, recordedById: id(2), recordedAt: now,
      identifiers: [{ kind: "vin_stamp", location: "Synthetic plate", value: "SYN-923", provenanceIds: [id(n + 2000)] }],
      provenance: [{ id: id(n + 2000), sha256: "c".repeat(64), mime: "image/webp", sizeBytes: 72 }] });
    if (report) memory.seed("diagnosticReportRecord", { id: id(n + 4000), orderId, audience: "buyer_private", status: "finalized", erasedAt: null, snapshot: {}, snapshotHash: "d".repeat(64),
      identityRecordId: id(n + 1000), identityRecordHash: "a".repeat(64), identityEvidenceId: id(n + 3000), identityEvidenceHash: "b".repeat(64), version: 1, state: { observedAt: observation.observedAt, mileageKm: 100 }, createdAt: new Date(now.getTime() - 1000) });
  }
  beforeEach(async () => {
    memory = new DiagnosticMemoryDatabase(); db = memory.client; currentTime = now;
    staff(1, "diagnostics.reviewer", "Reviewer"); staff(2, "diagnostics.technician", "B technician"); staff(3, "diagnostics.technician", "Foreign technician");
    visit(20, false); assign(b, 2, "diagnostics.technician");
    const runtime = { now: () => currentTime, id: randomUUID, syntheticAllowed: () => true, publicSyntheticAllowed: () => false };
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

  it("traverses more than 50 with stable tie ordering and an anchored scan, without protected fields", async () => {
    for (let n = 30; n < 91; n++) visit(n);
    let route = `${b}/predecessor-candidates`; const seen: string[] = [];
    for (let page = 0; page < 20; page++) {
      const response = await get(route); expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store, private");
      expect(response.body.scope).toBe("currently_authorized_retained_predecessors");
      for (const candidate of response.body.candidates) {
        expect(Object.keys(candidate).sort()).toEqual(["mileageKm", "observedAt", "reportId"]); seen.push(candidate.reportId);
      }
      if (!response.body.nextCursor) { expect(response.body.exhausted).toBe(true); break; }
      expect(response.body.exhausted).toBe(false);
      expect(response.body.nextCursor).not.toContain(id(30));
      route = `${b}/predecessor-candidates?cursor=${encodeURIComponent(response.body.nextCursor)}`;
    }
    expect(seen).toEqual(Array.from({ length: 61 }, (_, index) => id(index + 4030)));
    expect(new Set(seen).size).toBe(61);
  });
  it("returns only named currently eligible distinct B technicians to a non-reception reviewer", async () => {
    expect(await get(`${b}/linking-technicians`)).toMatchObject({ status: 200, body: { technicians: [{ userId: id(2), name: "B technician" }] } });
    expect((await get(`${b}/linking-technicians`, { userId: id(3), sessionId: id(103) })).status).toBe(403);
    await db.diagnosticCenterAssignment.updateMany({ where: { userId: id(2) }, data: { qualifiedUntil: now } });
    expect((await get(`${b}/linking-technicians`)).body).toEqual({ technicians: [] });
  });
  it("uses scoped empty semantics and omits inaccessible or incomplete retained material", async () => {
    visit(30); visit(31); visit(32);
    await db.diagnosticOrderAssignment.updateMany({ where: { orderId: id(30) }, data: { revokedAt: now } });
    await db.diagnosticIdentityProvenance.updateMany({ where: { orderId: id(31) }, data: { rightsUntil: now } });
    await db.diagnosticIdentityRecord.updateMany({ where: { orderId: id(32) }, data: { erasedAt: now } });
    const response = await get(`${b}/predecessor-candidates`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ candidates: [], nextCursor: null, exhausted: true, scope: "currently_authorized_retained_predecessors" });
  });
  it("binds continuation to B, actor, Session and strict query scope", async () => {
    for (let n = 30; n < 51; n++) visit(n);
    const first = await get(`${b}/predecessor-candidates`); expect(first.status).toBe(200);
    const cursor = encodeURIComponent(first.body.nextCursor);
    visit(21, false);
    for (const route of [`${id(21)}/predecessor-candidates?cursor=${cursor}`, `${b}/predecessor-candidates?cursor=invalid`]) expect((await get(route)).status).toBe(403);
    expect((await get(`${b}/predecessor-candidates?cursor=${cursor}&predecessorId=${id(4030)}`)).status).toBe(400);
    expect((await get(`${b}/predecessor-candidates?cursor=${cursor}`, { userId: id(2), sessionId: id(102) })).status).toBe(403);
    await db.session.update({ where: { id: id(101) }, data: { expiresAt: now } });
    expect((await get(`${b}/predecessor-candidates?cursor=${cursor}`)).status).toBe(403);
  });
  it.each(["assignment", "qualification", "erasure", "session"])("normalizes current B %s loss and unknown B", async loss => {
    if (loss === "assignment") await db.diagnosticOrderAssignment.updateMany({ where: { orderId: b, userId: reviewer.userId }, data: { revokedAt: now } });
    if (loss === "qualification") await db.diagnosticCenterAssignment.updateMany({ where: { userId: reviewer.userId }, data: { qualifiedUntil: now } });
    if (loss === "erasure") await db.inspectionOrder.update({ where: { id: b }, data: { erasedAt: now } });
    if (loss === "session") await db.session.update({ where: { id: reviewer.sessionId }, data: { expiresAt: now } });
    for (const endpoint of ["predecessor-candidates", "linking-technicians"]) {
      const denied = await get(`${b}/${endpoint}`), missing = await get(`${id(999)}/${endpoint}`);
      expect(denied.status).toBe(403); expect(denied.body).toEqual(missing.body);
      expect(denied.headers["cache-control"]).toBe("no-store, private");
    }
  });
  it("replays a stable page, excludes later arrivals, and rechecks unseen A rights and assignments", async () => {
    for (let n = 30; n < 72; n++) visit(n);
    const first = await get(`${b}/predecessor-candidates`);
    expect(first.status).toBe(200); expect(first.body.candidates).toHaveLength(20);
    const next = `${b}/predecessor-candidates?cursor=${encodeURIComponent(first.body.nextCursor)}`;
    const page = await get(next);
    expect(page.status).toBe(200);
    expect((await get(next)).body.candidates).toEqual(page.body.candidates);
    // Later arrivals are outside this traversal's initial time fence, even if their id sorts earlier.
    visit(25);
    await db.diagnosticReportRecord.update({ where: { id: id(4025) }, data: { createdAt: new Date(now.getTime() + 1) } });
    await db.diagnosticIdentityProvenance.updateMany({ where: { orderId: id(50) }, data: { rightsUntil: now } });
    await db.diagnosticOrderAssignment.updateMany({ where: { orderId: id(51), userId: reviewer.userId }, data: { revokedAt: now } });
    const changed = await get(next); expect(changed.status).toBe(200);
    expect(changed.body.candidates.map((candidate: { reportId: string }) => candidate.reportId)).toEqual(Array.from({ length: 19 }, (_, index) => id(4052 + index)));
    expect(JSON.stringify(changed.body)).not.toContain(id(4050));
    expect(JSON.stringify(changed.body)).not.toContain(id(4051));
    expect(JSON.stringify(changed.body)).not.toContain(id(4025));
  });
  it("keeps many unassigned visits out of continuation and exhaustion semantics", async () => {
    visit(30);
    const before = await get(`${b}/predecessor-candidates`);
    for (let n = 31; n < 92; n++) visit(n);
    await db.diagnosticOrderAssignment.updateMany({ where: { orderId: { in: Array.from({ length: 61 }, (_, index) => id(31 + index)) } }, data: { revokedAt: now } });
    expect((await get(`${b}/predecessor-candidates`)).body).toEqual(before.body);
  });
  it.each(["grant", "inactive", "assignment", "unnamed"])("omits a B technician after current Identity or assignment %s loss", async loss => {
    if (loss === "grant") await db.staffGrant.updateMany({ where: { userId: id(2) }, data: { revokedAt: now } });
    if (loss === "inactive") await db.user.update({ where: { id: id(2) }, data: { suspendedAt: now } });
    if (loss === "assignment") await db.diagnosticOrderAssignment.updateMany({ where: { orderId: b, userId: id(2) }, data: { revokedAt: now } });
    if (loss === "unnamed") await db.user.update({ where: { id: id(2) }, data: { displayName: null } });
    const response = await get(`${b}/linking-technicians`);
    expect(response.status).toBe(200); expect(response.body).toEqual({ technicians: [] });
  });
  it("rejects a second current Session, cursor tampering without retaining pair data", async () => {
    for (let n = 30; n < 51; n++) visit(n);
    const first = await get(`${b}/predecessor-candidates`); expect(first.status).toBe(200);
    const cursor: string = first.body.nextCursor;
    expect(cursor).toHaveLength(1062);
    memory.seed("session", { id: id(111), userId: reviewer.userId, expiresAt: future, adminTotpExpiresAt: future });
    expect((await get(`${b}/predecessor-candidates?cursor=${cursor}`, { ...reviewer, sessionId: id(111) })).status).toBe(403);
    const tampered = `${cursor[0] === "A" ? "B" : "A"}${cursor.slice(1)}`;
    expect((await get(`${b}/predecessor-candidates?cursor=${tampered}`)).status).toBe(403);
    currentTime = new Date(now.getTime() + 15 * 60_000);
    expect((await get(`${b}/predecessor-candidates?cursor=${cursor}`)).status).toBe(403);
  });
  it("omits disconnected retained identity claims, expired B material and inconsistent raw history", async () => {
    visit(30);
    const before = await get(`${b}/predecessor-candidates`);
    expect(before.body.candidates).toEqual([{ reportId: id(4030), observedAt: observation.observedAt, mileageKm: 100 }]);
    const evidence = await db.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: id(3030) } });
    memory.seed("diagnosticIdentityEvidence", { ...evidence, id: id(9000), orderVersion: 2 });
    expect((await get(`${b}/predecessor-candidates`)).body.candidates).toEqual([]);
    visit(31);
    await db.diagnosticIdentityRecord.updateMany({ where: { orderId: id(31) }, data: { observation: { ...observation, vin: "CONTRADICTORY" } } });
    expect((await get(`${b}/predecessor-candidates`)).body.candidates).toEqual([]);
    visit(32);
    await db.diagnosticIdentityProvenance.updateMany({ where: { orderId: b }, data: { rightsUntil: now } });
    expect((await get(`${b}/predecessor-candidates`)).body.candidates).toEqual([]);
  });

  it("allows an empty bounded page to continue without claiming absence", async () => {
    for (let n = 30; n < 51; n++) visit(n);
    await db.diagnosticIdentityProvenance.updateMany({ where: { orderId: { in: Array.from({ length: 20 }, (_, index) => id(30 + index)) } }, data: { rightsUntil: now } });
    const first = await get(`${b}/predecessor-candidates`);
    expect(first.status).toBe(200); expect(first.body.candidates).toEqual([]);
    expect(first.body.exhausted).toBe(false); expect(first.body.nextCursor).toHaveLength(1062);
    const second = await get(`${b}/predecessor-candidates?cursor=${first.body.nextCursor}`);
    expect(second.body).toEqual({ candidates: [{ reportId: id(4050), observedAt: observation.observedAt, mileageKm: 100 }], nextCursor: null, exhausted: true, scope: "currently_authorized_retained_predecessors" });
  });
  it("omits malformed required retained evidence without a partial candidate or protected error", async () => {
    visit(30);
    await db.diagnosticIdentityEvidence.update({ where: { id: id(3030) }, data: { provenance: [{ id: id(2030), sha256: "f".repeat(64), mime: "image/webp", sizeBytes: 72 }] } });
    const response = await get(`${b}/predecessor-candidates`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ candidates: [], nextCursor: null, exhausted: true, scope: "currently_authorized_retained_predecessors" });
  });

});
