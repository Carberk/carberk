import "reflect-metadata";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { S3Client, HeadBucketCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaService } from "@auto-tm/db";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { workerDatabaseName, workerUrls } from "../../../../test/helpers/testDatabases";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../domain/ports/DiagnosticIntakePort";

const suite = defineE2eSuite("diagnostic-consumed-private-link-erasure");
const people = ["buyer", "founder", "reception", "technician", "reviewer"] as const;
type Person = typeof people[number];
const capability: Partial<Record<Person, string>> = {
  reception: "diagnostics.reception", technician: "diagnostics.technician", reviewer: "diagnostics.reviewer",
};
const expiry = "2026-10-21T12:05:00.000Z";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const centerId = suite.id("center");
const initialTime = new Date("2026-10-21T12:00:00.000Z");
const future = new Date("2027-01-01T00:00:00.000Z");
const localized = { tk: "Synag", ru: "Тест", en: "Synthetic" };
const rights = { category: "vehicle_observation", purpose: "Synthetic diagnostic identity comparison", basis: "Owned synthetic fixture only",
  provenance: "Generated chassis fixture, not a customer document", identifiability: "pseudonymous", use: ["service"],
  schedule: { kind: "until", until: "2026-12-01T00:00:00.000Z", reason: "Synthetic fixture authorization" },
  supplierRestrictions: "No export or redistribution", hold: null };
// Offline Sharp 0.34.5 / libwebp 1.6.0 preparation. Both input and sanitized output are literal.
// These 4x4 color tiles are synthetic references, not photographs of actual identifiers.
const red = { input: "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4z8AARwgWXg4ArpMP8aaUSCMAAAAASUVORK5CYII=",
  inputSize: 95, output: "UklGRkAAAABXRUJQVlA4IDQAAAAwAgCdASoEAAQAAMASJaACdLoB+AH4AARoAAD++iGX/3easNN39a3/9aOfron+tHP/WVgA",
  sizeBytes: 72, sha256: "2639253ab66f01c5c4121c41b648a4d492d71527101073024166d926a0be22c1" };
const blue = { input: "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVR4nGNgYPiPhIjiAACOsw/xs6MvMwAAAABJRU5ErkJggg==",
  inputSize: 94, output: "UklGRj4AAABXRUJQVlA4IDIAAADwAQCdASoEAAQAAMASJaACdLoB+AAETAAA/v5mof/60c/XRP9aOf+tHP/lKotU24oAAA==",
  sizeBytes: 70, sha256: "b7b11262b6b5f09879357d0857c949d7713b380c8b3a4682b0421390a0c7f873" };
type Image = typeof red;
type Observation = { observedAt: string; mileageKm: number; method: "manual" | "vin"; vin: string | null; manualReference: string | null };
type Order = { id: string; version: number };
type Raw = { id: string; orderId: string; orderVersion: number; observationHash: string; observation: Observation; recordedBy: string; recordedAt: string };
const original: Observation = { observedAt: "2026-10-21T10:00:00.000Z", mileageKm: 123000,
  method: "manual", vin: null, manualReference: "Synthetic physical chassis A" };
const successorObservation: Observation = { observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100,
  method: "manual", vin: null, manualReference: "Synthetic physical chassis B" };
const identifier = (provenanceId: string) => ({ kind: "chassis_stamp", location: "Synthetic chassis plate", value: "SYN-CHASSIS-041", provenanceIds: [provenanceId] });
const metadata = (id: string, image: Image = red) => ({ id, sha256: image.sha256, mime: "image/webp", sizeBytes: image.sizeBytes });
const privateNoStore = (response: { headers: Record<string, string> }) => {
  expect(response.headers["cache-control"]).toContain("private");
  expect(response.headers["cache-control"]).toContain("no-store");
};
// One serial case owns both visits. No processor or concurrent HTTP runs during cleanup.
describe("consumed private diagnostic link after predecessor material rights expire", () => {
  let app: NestFastifyApplication; let db: PrismaService; let jwt: JwtService;
  let request: ReturnType<typeof supertest>; let objects: S3Client;
  let templateId: string;
  let now = initialTime;
  const headers = (who: Person) => ({ authorization: `Bearer ${jwt.sign({ sub: suite.id(who), sid: suite.id(`${who}-session`), role: "buyer" })}` });
  const post = (who: Person, path: string, body: object) => request.post(`/api/v1/diagnostics/${path}`).set(headers(who)).send(body);
  const get = (who: Person, path: string) => request.get(`/api/v1/diagnostics/${path}`).set(headers(who));
  const evidencePath = (o: Order) => `orders/${o.id}/identity-evidence`;
  const provenancePath = (o: Order, id?: string) => `orders/${o.id}/identity-provenance${id ? `/${id}` : ""}`;
  const comparisonPath = (b: Order, reportId: string) => `orders/${b.id}/reinspection-comparison?predecessorId=${reportId}`;
  const history = async (o: Order): Promise<Raw[]> => (await get("technician", `orders/${o.id}/identity-records`).expect(200)).body;
  const version = async (o: Order) => (await get("technician", `orders/${o.id}`).expect(200)).body.version as number;
  async function cleanup() {
    if (!db) return;
    const rows = await db.diagnosticIdentityProvenance.findMany({ where: { order: { centerId } }, select: { objectKey: true } });
    for (const row of rows) if (row.objectKey) { try { await objects.send(new HeadObjectCommand({ Bucket: "diagnostic-test-private", Key: row.objectKey })); } catch { /* already removed */ } }
    await db.diagnosticContinuityProof.deleteMany({ where: { candidateOrder: { centerId } } });
    await db.diagnosticPdfArtifact.deleteMany({ where: { report: { order: { centerId } } } });
    const reports = await db.diagnosticReportRecord.findMany({ where: { order: { centerId } } });
    for (const report of reports.sort((a, b) => Number(Boolean(b.predecessorId)) - Number(Boolean(a.predecessorId)))) await db.diagnosticReportRecord.delete({ where: { id: report.id } }).catch(() => undefined);
    await db.diagnosticIdentityEvidence.deleteMany({ where: { order: { centerId } } });
    await db.diagnosticIdentityProvenance.deleteMany({ where: { order: { centerId } } });
    await db.diagnosticAudit.deleteMany({ where: { centerId } });
    await db.diagnosticOrderAssignment.deleteMany({ where: { order: { centerId } } });
    await db.inspectionOrder.deleteMany({ where: { centerId } });
    await db.diagnosticTemplateVersion.deleteMany({ where: { centerId } });
    await db.diagnosticCenterAssignment.deleteMany({ where: { centerId } });
    await db.diagnosticCenter.deleteMany({ where: { id: centerId } });
    await cleanSuiteFixtures(db, suite, { userAliases: people });
  }
  beforeAll(async () => {
    // Existing erasure/lifecycle pattern: deterministic Date, with real timers still active.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(initialTime);
    const testing = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, load: [() => ({ DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private" })] }),
      EventEmitterModule.forRoot(), bullTestRoot(), DiagnosticsModule, JwtModule.register({ global: true, secret: "synthetic-diagnostic-test" })] })
      .overrideProvider(IDENTITY_CLOCK_PORT).useValue({ now: () => now })
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => now, id: randomUUID, publicSyntheticAllowed: () => false,
        syntheticAllowed: ({ userId }: { userId: string }) => people.some(who => suite.id(who) === userId) }).compile();
    app = testing.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    db = app.get(PrismaService); jwt = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
    objects = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000", region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
    await objects.send(new HeadBucketCommand({ Bucket: "diagnostic-test-private" }));
    await cleanup();
    await seedSuiteCatalog(db, suite);
    for (const who of people) {
      await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), role: "buyer", phoneVerifiedAt: now } });
      await db.session.create({ data: { id: suite.id(`${who}-session`), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: future, adminTotpExpiresAt: future } });
      if (capability[who]) await db.staffGrant.create({ data: { userId: suite.id(who), capability: capability[who]! } });
    }
    await db.staffGrant.createMany({ data: ["staff.manage", "founder.control"].map(capability => ({ userId: suite.id("founder"), capability })) });
    await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("center"), names: localized } });
    for (const who of people) if (capability[who]) await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id(who), capability: capability[who]!, qualifiedUntil: future } });
    await db.staffGrant.create({ data: { userId: suite.id("reception"), capability: "diagnostics.templates" } });
    await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: future } });
    const definition = { title: localized, limitations: localized, syntheticNotice: localized,
      checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
    templateId = (await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true }).expect(201)).body.id;
  });
  afterAll(async () => {
    try { await cleanup(); } finally { try { objects?.destroy(); await app?.close(); } finally { vi.useRealTimers(); } }
  });
  async function visit(observation: Observation, visitName: string): Promise<Order> {
    let { body: order } = await post("buyer", "orders", { requestKey: randomUUID(), centerId,
      templateVersionId: templateId, audience: "buyer_private", synthetic: true }).expect(201);
    expect(order).toMatchObject({ version: 0, audience: "buyer_private", listingId: null });
    for (const who of ["technician", "reviewer"] as const) {
      ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version,
        userId: suite.id(who), capability: capability[who], active: true }).expect(201));
    }
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version,
      kind: "physical", authorityReference: `Synthetic physical authorization for visit ${visitName}` }).expect(201));
    for (const state of ["confirmed", "arrived"]) {
      ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201));
    }
    ({ body: order } = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: order.version, ...observation }).expect(201));
    expect(order).toMatchObject({ version: 6, status: "arrived", physicalAuthorized: true, observedVehicle: observation });
    return order;
  }
  function intent(o: Order, id: string, image: Image = red, classification = rights) {
    return { id, expectedOrderVersion: o.version, contentType: "image/png", sizeBytes: image.inputSize, rights: classification };
  }
  async function stage(o: Order, id: string, image: Image = red, classification = rights) {
    const response = await post("technician", provenancePath(o), intent(o, id, image, classification)).expect(201);
    privateNoStore(response); expect(response.body).toEqual({ id, state: "staged" });
  }
  const upload = (o: Order, id: string, image: Image = red) => request.put(`/api/v1/diagnostics/${provenancePath(o, id)}?expectedOrderVersion=${o.version}`)
    .set(headers("technician")).set("content-type", "application/octet-stream").set("x-evidence-type", "image/png").send(Buffer.from(image.input, "base64"));
  async function verified(o: Order, id: string, image: Image = red, classification = rights) {
    await stage(o, id, image, classification);
    const response = await upload(o, id, image).expect(200);
    privateNoStore(response); expect(response.body).toEqual({ ...metadata(id, image), state: "verified" });
    return response.body;
  }
  function capture(o: Order, raw: Raw, p: string, id: string = randomUUID(), classification = rights) {
    return { id, expectedOrderVersion: o.version, identityRecordId: raw.id, identifiers: [identifier(p)], rights: classification, correction: null };
  }
  async function append(o: Order, raw: Raw, input: ReturnType<typeof capture>, image: Image = red) {
    expect(o.version).toBe(6);
    const response = await post("technician", evidencePath(o), input).expect(201);
    privateNoStore(response);
    expect(response.body).toEqual({ id: input.id, orderId: o.id, orderVersion: 7, identityRecordId: raw.id,
      observationHash: raw.observationHash, observation: raw.observation, identifiers: input.identifiers,
      provenance: input.identifiers[0]!.provenanceIds.map(id => metadata(id, image)), rights: input.rights, correction: input.correction,
      recordHash: expect.stringMatching(/^[a-f0-9]{64}$/), recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" });
    o.version = 7;
    expect(await version(o)).toBe(7);
    return response.body;
  }
  async function release(o: Order) {
    const { body: draft } = await post("technician", `orders/${o.id}/reports`, { reportId: randomUUID(), expectedOrderVersion: o.version }).expect(201);
    const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    await post("technician", `reports/${draft.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${draft.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${draft.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
    return (await get("reviewer", `reports/${draft.id}`).expect(200)).body;
  }
  async function comparativeBytes(b: Order, reportId: string, p: string, image: Image) {
    const response = await get("reviewer", `orders/${b.id}/reinspection-comparison/provenance/${p}?predecessorId=${reportId}`).expect(200);
    privateNoStore(response);
    expect(response.headers["content-type"]).toContain("image/webp");
    expect(Buffer.from(response.body).toString("base64")).toBe(image.output);
  }

  async function bytes(who: Person, path: string, image: Image) {
    const response = await get(who, path).expect(200); privateNoStore(response);
    expect(response.headers["content-type"]).toContain("image/webp");
    expect(Buffer.from(response.body).toString("base64")).toBe(image.output);
  }
  const key = (id: string, image: Image) => `diagnostic-evidence/${id}/${image.sha256}`;
  const setTime = (instant: string) => { now = new Date(instant); vi.setSystemTime(now); };

  it("erases only A's expired restricted material while consumed B retains exact retry and own finding writes", async () => {
    const a = await visit(original, "A"); const [ia] = await history(a);
    const pa = randomUUID(); const declaredA = { ...rights, schedule: { ...rights.schedule, until: expiry } };
    await verified(a, pa, red, declaredA);
    const ea = await append(a, ia!, capture(a, ia!, pa, randomUUID(), declaredA));
    const released = await release(a);
    const documents = (await get("buyer", `reports/${released.id}/documents`).expect(200)).body as { id: string; locale: string; generation: number; state: string }[];
    expect(documents.map(d => [d.locale, d.generation, d.state])).toEqual([["en", 1, "pending"], ["ru", 1, "pending"], ["tk", 1, "pending"]]);
    expect(new Set(documents.map(d => d.id)).size).toBe(3);
    const b = await visit(successorObservation, "B"); const [ib] = await history(b);
    const pb = randomUUID(); await verified(b, pb, blue);
    const eb = await append(b, ib!, capture(b, ib!, pb), blue);
    expect(ia!.id).not.toBe(ib!.id); expect(ea.id).not.toBe(eb.id); expect(pa).not.toBe(pb);
    const comparison = await get("reviewer", comparisonPath(b, released.id)).expect(200); privateNoStore(comparison);
    expect(comparison.body).toEqual({ predecessor: { reportId: released.id, reportVersion: 3,
      snapshotHash: expect.stringMatching(hash), identityRecordId: ia!.id, identityRecordHash: ia!.observationHash,
      identity: { observation: original, evidence: ea, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } },
      candidate: { orderId: b.id, orderVersion: 7, identityRecordId: ib!.id, identityRecordHash: ib!.observationHash,
        identity: { observation: successorObservation, evidence: eb, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } } });
    await comparativeBytes(b, released.id, pa, red); await comparativeBytes(b, released.id, pb, blue);
    await bytes("technician", provenancePath(a, pa), red); await bytes("technician", provenancePath(b, pb), blue);
    const issuance = await post("reviewer", `orders/${b.id}/continuity-proofs`, {
      predecessorId: released.id, expectedPredecessorVersion: 3, expectedOrderVersion: 7,
      predecessorIdentityRecordId: ia!.id, candidateIdentityRecordId: ib!.id,
      linkingTechnicianId: suite.id("technician"), method: "comparative_attestation",
      rationale: "Same stamped chassis; independently observed on both visits", provenanceRecordIds: [pa, pb],
    }).expect(201); privateNoStore(issuance);
    expect(issuance.body).toEqual({ proofId: expect.stringMatching(uuid) });
    const proofId = issuance.body.proofId as string;
    const proofPath = `orders/${b.id}/continuity-proofs/${proofId}`;
    const input = { reportId: randomUUID(), predecessorId: released.id, expectedOrderVersion: 7,
      reason: "New physical visit with independent chassis material", proofId };
    const sameJwt = headers("technician");
    const send = () => request.post(`/api/v1/diagnostics/orders/${b.id}/reinspections`).set(sameJwt).send(input);
    const created = await send().expect(201); privateNoStore(created);
    expect(created.body).toMatchObject({ id: input.reportId, orderId: b.id, version: 0, status: "draft", findings: [],
      templateVersionId: templateId, successorOf: released.id, observedAt: successorObservation.observedAt, mileageKm: 123100 });
    expect((await get("technician", `reports/${input.reportId}/documents`).expect(200)).body).toEqual([]);
    expect((await get("reviewer", `orders/${a.id}/reports`).expect(200)).body.map((r: { id: string }) => r.id)).toEqual([released.id]);
    expect((await get("technician", `orders/${b.id}/reports`).expect(200)).body).toEqual([created.body]);

    // Explicit IDs came from requests or HTTP responses. Never discover an allowlist from
    // an unfiltered table. These exact-id snapshots are also the subprocess's full-row oracle.
    const reports = await db.diagnosticReportRecord.findMany({ where: { id: { in: [released.id, input.reportId] } }, orderBy: { id: "asc" } });
    const evidence = await db.diagnosticIdentityEvidence.findMany({ where: { id: { in: [ea.id, eb.id] } }, orderBy: { id: "asc" } });
    const provenance = await db.diagnosticIdentityProvenance.findMany({ where: { id: { in: [pa, pb] } }, orderBy: { id: "asc" } });
    const pdfs = await db.diagnosticPdfArtifact.findMany({ where: { id: { in: documents.map(d => d.id) } }, orderBy: { id: "asc" } });
    const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    const orders = await db.inspectionOrder.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: "asc" } });
    const raw = await db.diagnosticIdentityRecord.findMany({ where: { id: { in: [ia!.id, ib!.id] } }, orderBy: { id: "asc" } });
    expect(reports).toHaveLength(2); expect(evidence).toHaveLength(2); expect(provenance).toHaveLength(2);
    expect(pdfs).toHaveLength(3); expect(orders).toHaveLength(2); expect(raw).toHaveLength(2);
    for (const [o, i, e, p, image, until] of [[a, ia!, ea, pa, red, expiry], [b, ib!, eb, pb, blue, rights.schedule.until]] as const) {
      expect(orders.find(row => row.id === o.id)).toMatchObject({ centerId, commissionerId: suite.id("buyer"), synthetic: true,
        erasedAt: null, identityEvidenceGeneration: 1 });
      expect(raw.find(row => row.id === i.id)).toMatchObject({ orderId: o.id, observationHash: i.observationHash });
      expect(evidence.find(row => row.id === e.id)).toMatchObject({ orderId: o.id, identityRecordId: i.id,
        observationHash: i.observationHash, recordHash: e.recordHash, provenance: [metadata(p, image)], rightsUntil: new Date(until), erasedAt: null });
      expect(provenance.find(row => row.id === p)).toMatchObject({ orderId: o.id, state: "verified", objectKey: key(p, image),
        sha256: image.sha256, sizeBytes: image.sizeBytes, mime: "image/webp", rightsUntil: new Date(until),
        writeLeaseUntil: null, cleanupLeaseUntil: null, cleanupRequestedAt: null, cleanupCompletedAt: null, erasedAt: null });
    }
    expect(reports.find(row => row.id === released.id)).toMatchObject({ orderId: a.id, predecessorId: null, status: "finalized",
      version: 3, identityRecordId: ia!.id, identityEvidenceId: ea.id, identityEvidenceHash: ea.recordHash, erasedAt: null });
    expect(reports.find(row => row.id === input.reportId)).toMatchObject({ orderId: b.id, predecessorId: released.id,
      status: "draft", version: 0, identityRecordId: ib!.id, identityEvidenceId: eb.id, identityEvidenceHash: eb.recordHash,
      continuityProofId: proofId, erasedAt: null });
    for (const pdf of pdfs) expect(pdf).toMatchObject({ reportId: released.id, snapshotHash: comparison.body.predecessor.snapshotHash,
      locale: documents.find(d => d.id === pdf.id)!.locale, generation: 1, state: "pending", objectKey: `diagnostic-pdf/${released.id}/${pdf.id}.pdf`,
      cleanupRequestedAt: null, cleanupCompletedAt: null, leaseUntil: null });
    expect(proof).toMatchObject({ predecessorReportId: released.id, predecessorOrderId: a.id, candidateOrderId: b.id,
      issuerId: suite.id("reviewer"), issuerSessionId: suite.id("reviewer-session"), linkingTechnicianId: suite.id("technician"),
      consumedReportId: input.reportId, consumedAt: initialTime, rightsUntil: new Date(expiry), erasedAt: null, invalidatedAt: null });
    expect(proof.content).toMatchObject({ predecessor: { identityRecordId: ia!.id, identityRecordHash: ia!.observationHash },
      candidate: { identityRecordId: ib!.id, identityRecordHash: ib!.observationHash } });
    expect(proof.bindings).toMatchObject({ predecessor: { id: a.id, commissionerId: suite.id("buyer") }, candidate: { id: b.id, commissionerId: suite.id("buyer") },
      evidencePins: [{ orderId: a.id, id: ea.id, hash: ea.recordHash }, { orderId: b.id, id: eb.id, hash: eb.recordHash }] });
    const audits = () => db.diagnosticAudit.findMany({ where: { centerId }, orderBy: { id: "asc" } });
    const beforeAudits = await audits();
    const restricted = [proofPath, evidencePath(a), provenancePath(a, pa), comparisonPath(b, released.id),
      `orders/${b.id}/reinspection-comparison/provenance/${pa}?predecessorId=${released.id}`];
    setTime("2026-10-21T12:04:59.999Z");
    for (const who of ["technician", "reviewer"] as const) {
      for (const path of restricted) privateNoStore(await get(who, path).expect(200));
    }
    setTime(expiry);
    async function refused() {
      for (const who of ["technician", "reviewer"] as const) for (const path of restricted) {
        const response = await get(who, path).expect(403); privateNoStore(response);
        expect(response.body).toEqual({ code: "DIAGNOSTIC_NO_ACCESS", message: "Diagnostic resource unavailable" });
        for (const secret of [red.output, red.sha256, key(pa, red), "SYN-CHASSIS-041", ia!.observationHash, ea.recordHash]) expect(response.text).not.toContain(secret);
      }
      for (const path of [`orders/${b.id}/continuity-proofs/${randomUUID()}`, provenancePath(a, randomUUID())]) {
        const response = await get("reviewer", path).expect(403); privateNoStore(response);
        expect(response.body).toEqual({ code: "DIAGNOSTIC_NO_ACCESS", message: "Diagnostic resource unavailable" });
      }
    }
    await refused();
    expect((await get("technician", evidencePath(b)).expect(200)).body).toEqual([eb]);
    await bytes("technician", provenancePath(b, pb), blue);
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(proof);

    // Root must establish the external exclusive-writer premise. This attestation is a
    // prerequisite, not a concurrency lock. No cleanup or alternate database on refusal.
    const databases = inject("apiTestDatabases");
    if (!databases) throw new Error("Erasure isolation refused: missing injected apiTestDatabases");
    const pool = Number(process.env["VITEST_POOL_ID"]);
    const expectedUrl = workerUrls(databases, pool).databaseUrl;
    const expectedName = workerDatabaseName(databases.prefix, pool);
    const manifest = { diagnosticReportRecord: reports, diagnosticEvidence: [], diagnosticPdfArtifact: pdfs,
      diagnosticIdentityEvidence: evidence, diagnosticIdentityProvenance: provenance, diagnosticContinuityProof: [proof] };
    const workerRoot = resolve(__dirname, "../../../../../worker");
    const script = `
      require('reflect-metadata'); require('tsx/cjs');
      const assert = require('node:assert/strict');
      const { randomUUID } = require('node:crypto');
      const { PrismaService } = require('@auto-tm/db');
      const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
      const { DiagnosticArtifactWorker } = require('./src/jobs/diagnostics/DiagnosticArtifactWorker.ts');
      const { S3DiagnosticArtifactObjects } = require('./src/jobs/diagnostics/S3DiagnosticArtifactObjects.ts');
      async function main() {
        const db = new PrismaService(); let s3;
        const normalize = value => JSON.parse(JSON.stringify(value));
        try {
          assert.equal(process.env.DIAGNOSTIC_ERASURE_EXCLUSIVE_POOL, 'serial-no-http-or-processors',
            'Erasure isolation refused: Root must establish exclusive serial pool, no concurrent HTTP or processors');
          assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Erasure isolation refused: hosted disposable services required');
          assert.equal(process.env.DATABASE_URL, ${JSON.stringify(expectedUrl)}, 'Erasure isolation refused: unexpected worker URL');
          const expected = new URL(${JSON.stringify(expectedUrl)}); const base = new URL(${JSON.stringify(databases.baseDatabaseUrl)});
          assert.notEqual(expected.pathname, base.pathname, 'Erasure isolation refused: base database');
          assert.match(expected.hostname, new RegExp('^(localhost|127[.]0[.]0[.]1)$'));
          const connected = await db.$queryRawUnsafe('SELECT current_database() AS name');
          assert.deepEqual(connected, [{ name: ${JSON.stringify(expectedName)} }], 'Erasure isolation refused: connected database');
          const endpoint = process.env.MINIO_ENDPOINT || '';
          assert.match(endpoint, new RegExp('^http://(localhost|127[.]0[.]0[.]1):[0-9]+$'), 'Erasure isolation refused: hosted-local MinIO required');
          const bucket = 'diagnostic-test-private';
          s3 = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials: {
            accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin', secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin' } });
          await s3.send(new HeadBucketCommand({ Bucket: bucket }));
          const manifest = ${JSON.stringify(manifest)};
          // ALL rows, including ineligible and completed intents. Equality checks counts,
          // IDs, keys, bindings and full state before the first cleanup mutation.
          for (const [model, rows] of Object.entries(manifest)) {
            const actual = await db[model].findMany({ orderBy: { id: 'asc' } });
            assert.deepEqual(normalize(actual), rows, 'Erasure isolation refused: foreign, missing or changed ' + model);
          }
          assert.deepEqual(normalize(await db.inspectionOrder.findMany({ where: { id: { in: ${JSON.stringify([a.id, b.id])} } }, orderBy: { id: 'asc' } })), ${JSON.stringify(orders)});
          assert.deepEqual(normalize(await db.diagnosticIdentityRecord.findMany({ where: { id: { in: ${JSON.stringify([ia!.id, ib!.id])} } }, orderBy: { id: 'asc' } })), ${JSON.stringify(raw)});
          const objects = new S3DiagnosticArtifactObjects(s3, bucket);
          const worker = new DiagnosticArtifactWorker(db, objects, {}, { now: () => new Date(${JSON.stringify(expiry)}), id: randomUUID, enabled: () => true });
          assert.equal(await worker.cleanup(), 1, 'Expected only A provenance cleanup');
        } finally { s3?.destroy(); await db.$disconnect(); }
      }
      void main().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    await promisify(execFile)(process.execPath, ["-e", script], {
      cwd: workerRoot, env: { ...process.env, TSX_TSCONFIG_PATH: resolve(workerRoot, "tsconfig.json") }, timeout: 30000, killSignal: "SIGKILL",
    });
    expect(await db.diagnosticContinuityProof.findUnique({ where: { id: proofId } })).toBeNull();
    expect(await db.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: ea.id } })).toEqual({ ...evidence.find(e => e.id === ea.id),
      observationHash: null, identifiers: null, provenance: null, rights: null, explanation: null, recordHash: null, erasedAt: now });
    const erased = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: pa } });
    expect(erased).toMatchObject({ orderId: a.id, objectKey: key(pa, red), rights: null, state: "removed", erasedAt: now,
      cleanupRequestedAt: now, cleanupCompletedAt: now, cleanupAttempts: 1, cleanupLeaseUntil: null, cleanupFailureCode: null });
    expect(erased.epoch).not.toBe(provenance.find(p => p.id === pa)!.epoch);
    await expect(objects.send(new HeadObjectCommand({ Bucket: "diagnostic-test-private", Key: key(pa, red) })))
      .rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: a.id } })).toEqual({ ...orders.find(o => o.id === a.id), identityEvidenceGeneration: 2 });
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: b.id } })).toEqual(orders.find(o => o.id === b.id));
    expect(await db.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: eb.id } })).toEqual(evidence.find(e => e.id === eb.id));
    expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: pb } })).toEqual(provenance.find(p => p.id === pb));
    expect((await objects.send(new HeadObjectCommand({ Bucket: "diagnostic-test-private", Key: key(pb, blue) }))).ContentLength).toBe(blue.sizeBytes);
    await bytes("technician", provenancePath(b, pb), blue);
    expect((await get("technician", evidencePath(b)).expect(200)).body).toEqual([eb]);
    expect(await db.diagnosticReportRecord.findMany({ where: { id: { in: [released.id, input.reportId] } }, orderBy: { id: "asc" } })).toEqual(reports);
    expect(await db.diagnosticIdentityRecord.findMany({ where: { id: { in: [ia!.id, ib!.id] } }, orderBy: { id: "asc" } })).toEqual(raw);
    expect(await db.diagnosticPdfArtifact.findMany({ where: { id: { in: documents.map(d => d.id) } }, orderBy: { id: "asc" } })).toEqual(pdfs);
    expect((await get("buyer", `reports/${released.id}`).expect(200)).body).toEqual(released);
    expect((await get("buyer", `reports/${released.id}/documents`).expect(200)).body).toEqual(documents);
    await refused();
    expect(await audits()).toEqual(beforeAudits);
    expect((await send().expect(201)).body).toEqual(created.body);
    expect(await audits()).toEqual(beforeAudits);
    const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    await post("technician", `reports/${input.reportId}/findings`, { expectedVersion: 0, finding }).expect(201);
    const current = (await get("technician", `reports/${input.reportId}`).expect(200)).body;
    expect(current).toMatchObject({ version: 1, findings: [finding], successorOf: released.id });
    const afterWrite = await audits();
    expect(afterWrite).toHaveLength(beforeAudits.length + 1);
    expect((await send().expect(201)).body).toEqual(current);
    expect(await audits()).toEqual(afterWrite);
    expect(await db.diagnosticContinuityProof.findUnique({ where: { id: proofId } })).toBeNull();
  });
});
