import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { S3Client, CreateBucketCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaService } from "@auto-tm/db";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../domain/ports/DiagnosticIntakePort";

const suite = defineE2eSuite("diagnostic-private-automatic-vin-proof");
const people = ["buyer", "founder", "reception", "technician", "reviewer"] as const;
type Person = typeof people[number];
const capability: Partial<Record<Person, string>> = {
  reception: "diagnostics.reception", technician: "diagnostics.technician", reviewer: "diagnostics.reviewer",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const centerId = suite.id("center");
const initialTime = new Date("2026-10-21T12:00:00.000Z");
const future = new Date("2027-01-01T00:00:00.000Z");
const localized = { tk: "Synag", ru: "Тест", en: "Synthetic" };
const rights = { category: "vehicle_observation", purpose: "Synthetic diagnostic identity comparison", basis: "Owned synthetic fixture only",
  provenance: "Generated VIN fixture, not a customer document", identifiability: "pseudonymous", use: ["service"],
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
  method: "vin", vin: "syn-vin-041", manualReference: null };
const successorObservation: Observation = { observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100,
  method: "vin", vin: "SYN-VIN-041", manualReference: null };
const identifier = (provenanceId: string) => ({ kind: "vin_stamp", location: "Synthetic VIN plate", value: "SYN-VIN-041", provenanceIds: [provenanceId] });
const metadata = (id: string, image: Image = red) => ({ id, sha256: image.sha256, mime: "image/webp", sizeBytes: image.sizeBytes });
const privateNoStore = (response: { headers: Record<string, string> }) => {
  expect(response.headers["cache-control"]).toContain("private");
  expect(response.headers["cache-control"]).toContain("no-store");
};
// The existing qualified reviewer is independently assigned on both visits and distinct
// from B's current linking technician. Broader automatic issuer authority is out of scope.
describe("private automatic normalized-VIN diagnostic continuity proof", () => {
  let app: NestFastifyApplication; let db: PrismaService; let jwt: JwtService;
  let request: ReturnType<typeof supertest>; let objects: S3Client;
  let templateId: string;
  const now = initialTime;
  const ownedProvenance = new Set<string>();
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
    // Exact owned keys only. Never list/delete a shared bucket or another suite's prefix.
    for (const id of ownedProvenance) for (const image of [red, blue]) {
      await objects.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: `diagnostic-evidence/${id}/${image.sha256}` }));
    }
    await db.diagnosticContinuityProof.deleteMany({ where: { candidateOrder: { centerId } } });
    await db.diagnosticPdfArtifact.deleteMany({ where: { report: { order: { centerId } } } });
    const reports = await db.diagnosticReportRecord.findMany({ where: { order: { centerId } } });
    while (reports.length) {
      const leaf = reports.find(row => !reports.some(other => other.predecessorId === row.id));
      if (!leaf) throw new Error("Synthetic diagnostic correction cycle");
      await db.diagnosticReportRecord.delete({ where: { id: leaf.id } }); reports.splice(reports.indexOf(leaf), 1);
    }
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
    try { await objects.send(new CreateBucketCommand({ Bucket: "diagnostic-test-private" })); }
    catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 409) throw error; }
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
    try { await cleanup(); } finally {
      try { objects?.destroy(); await app?.close(); } finally { vi.useRealTimers(); }
    }
  });
  async function visit(observation: Observation, visitName: string, inputVin: string): Promise<Order> {
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
    ({ body: order } = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: order.version, ...observation, vin: inputVin }).expect(201));
    expect(order).toMatchObject({ version: 6, status: "arrived", physicalAuthorized: true, observedVehicle: observation });
    return order;
  }
  function intent(o: Order, id: string, image: Image = red, classification = rights) {
    ownedProvenance.add(id);
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
  function capture(o: Order, raw: Raw, p: string, id: string = randomUUID()) {
    return { id, expectedOrderVersion: o.version, identityRecordId: raw.id, identifiers: [identifier(p)], rights, correction: null };
  }
  async function append(o: Order, raw: Raw, input: ReturnType<typeof capture>, image: Image = red) {
    expect(o.version).toBe(6);
    const response = await post("technician", evidencePath(o), input).expect(201);
    privateNoStore(response);
    expect(response.body).toEqual({ id: input.id, orderId: o.id, orderVersion: 7, identityRecordId: raw.id,
      observationHash: raw.observationHash, observation: raw.observation, identifiers: input.identifiers,
      provenance: input.identifiers[0]!.provenanceIds.map(id => metadata(id, image)), rights, correction: input.correction,
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
    await post("reviewer", `reports/${draft.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);
    return (await get("reviewer", `reports/${draft.id}`).expect(200)).body;
  }
  async function comparativeBytes(b: Order, reportId: string, p: string, image: Image) {
    const response = await get("reviewer", `orders/${b.id}/reinspection-comparison/provenance/${p}?predecessorId=${reportId}`).expect(200);
    privateNoStore(response);
    expect(response.headers["content-type"]).toContain("image/webp");
    expect(Buffer.from(response.body).toString("base64")).toBe(image.output);
  }

  it("issues and consumes a same-commissioner private proof from equal normalized observed VIN and consistent retained evidence", async () => {
    const a = await visit(original, "A", "  syn-vin-041  ");
    const [ia] = await history(a);
    expect(await history(a)).toEqual([{ id: expect.stringMatching(uuid), orderId: a.id, orderVersion: 6,
      observationHash: expect.stringMatching(hash), observation: original, recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" }]);
    const pa = suite.id("automatic-a-provenance");
    await verified(a, pa);
    const ea = await append(a, ia!, capture(a, ia!, pa));
    const releasedA = await release(a);
    const beforeA = (await get("buyer", `reports/${releasedA.id}`).expect(200)).body;
    expect(beforeA).toMatchObject({ id: releasedA.id, version: 3, status: "finalized", supersededBy: null });

    const b = await visit(successorObservation, "B", "SYN-VIN-041");
    const [ib] = await history(b);
    expect(b.id).not.toBe(a.id);
    expect(ib!.id).not.toBe(ia!.id);
    expect(await history(b)).toEqual([{ id: expect.stringMatching(uuid), orderId: b.id, orderVersion: 6,
      observationHash: expect.stringMatching(hash), observation: successorObservation, recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" }]);
    const pb = suite.id("automatic-b-provenance");
    await verified(b, pb, blue);
    const eb = await append(b, ib!, capture(b, ib!, pb), blue);
    // The capture and restricted comparison are the setup gate. Versions/material/time
    // are literal. Hashes bind server-generated order/raw ids, so retain the actual HTTP
    // hashes instead of importing production canonicalization or hashing algorithms.
    const comparison = await get("reviewer", comparisonPath(b, releasedA.id)).expect(200);
    privateNoStore(comparison);
    expect(comparison.body).toEqual({
      predecessor: {
        reportId: releasedA.id,
        reportVersion: 3,
        snapshotHash: comparison.body.predecessor.snapshotHash,
        identityRecordId: ia!.id,
        identityRecordHash: ia!.observationHash,
        identity: { observation: original, evidence: ea, corrections: [], evidenceGeneration: 1, correctionHeadHash: null },
      },
      candidate: {
        orderId: b.id,
        orderVersion: 7,
        identityRecordId: ib!.id,
        identityRecordHash: ib!.observationHash,
        identity: { observation: successorObservation, evidence: eb, corrections: [], evidenceGeneration: 1, correctionHeadHash: null },
      },
    });
    expect((await get("reviewer", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);
    expect(b.version).toBe(7);
    expect(comparison.body.predecessor.snapshotHash).toMatch(hash);
    await comparativeBytes(b, releasedA.id, pa, red);
    await comparativeBytes(b, releasedA.id, pb, blue);
    // SETUP BOUNDARY: all ordinary capture, release, comparison and both byte reads
    // above must succeed before any failure can establish missing automatic issuance.
    // Source predicts 400 DIAGNOSTIC_INVALID_INPUT at the strict method schema.
    // Preserve the actual hosted result; the required eligible-pair outcome stays 201.
    const issuance = await post("reviewer", `orders/${b.id}/continuity-proofs`, {
      predecessorId: releasedA.id,
      expectedPredecessorVersion: 3,
      expectedOrderVersion: 7,
      predecessorIdentityRecordId: comparison.body.predecessor.identityRecordId,
      candidateIdentityRecordId: comparison.body.candidate.identityRecordId,
      linkingTechnicianId: suite.id("technician"),
      method: "automatic_normalized_vin",
      rationale: "Equal normalized observed VIN; retained identity evidence is consistent; same private commissioner",
      provenanceRecordIds: [pa, pb],
    });
    expect(issuance.status, JSON.stringify(issuance.body)).toBe(201);
    privateNoStore(issuance);
    expect(issuance.body).toEqual({ proofId: expect.stringMatching(uuid) });
    expect(issuance.body.proofId).not.toBe(releasedA.id);
    expect(issuance.body.proofId).not.toBe(b.id);
    const proof = await get("reviewer", `orders/${b.id}/continuity-proofs/${issuance.body.proofId}`).expect(200);
    privateNoStore(proof);
    expect(proof.body).toEqual({
      proofId: issuance.body.proofId,
      policyVersion: "ADR-0108",
      predecessor: {
        reportId: releasedA.id,
        reportVersion: 3,
        snapshotHash: comparison.body.predecessor.snapshotHash,
        identityRecordId: ia!.id,
        identityRecordHash: ia!.observationHash,
      },
      candidate: {
        orderId: b.id,
        orderVersion: 7,
        identityRecordId: ib!.id,
        identityRecordHash: ib!.observationHash,
      },
      linkingTechnicianId: suite.id("technician"),
      method: "automatic_normalized_vin",
      result: "same_vehicle",
      rationale: "Equal normalized observed VIN; retained identity evidence is consistent; same private commissioner",
      provenanceRecordIds: [pa, pb],
      issuedBy: suite.id("reviewer"),
      issuedAt: "2026-10-21T12:00:00.000Z",
    });
    await get("buyer", `orders/${b.id}/continuity-proofs/${issuance.body.proofId}`).expect(403);
    expect((await get("technician", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);
    expect(await version(b)).toBe(7);
    expect((await get("buyer", `reports/${releasedA.id}`).expect(200)).body).toEqual(beforeA);
    const reportId = randomUUID();
    const created = await post("technician", `orders/${b.id}/reinspections`, { reportId, predecessorId: releasedA.id,
      expectedOrderVersion: 7, reason: "New physical visit with independently retained equal VIN", proofId: issuance.body.proofId }).expect(201);
    privateNoStore(created);
    expect(created.body).toMatchObject({ id: reportId, orderId: b.id, audience: "buyer_private", status: "draft", version: 0,
      templateVersionId: templateId, observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100,
      findings: [], authorId: suite.id("technician"), reviewerId: null, successorOf: releasedA.id,
      correctionReason: "New physical visit with independently retained equal VIN", finalizedAt: null,
      supersededBy: null, lineageKind: "reinspection" });
    expect((await get("technician", `orders/${b.id}/reports`).expect(200)).body).toEqual([created.body]);
    expect((await get("technician", `reports/${reportId}/documents`).expect(200)).body).toEqual([]);
    expect((await get("buyer", `reports/${releasedA.id}`).expect(200)).body).toEqual(beforeA);
    expect((await get("reviewer", `orders/${a.id}/reports`).expect(200)).body).toEqual([releasedA]);
  });
  it("discovers a retained predecessor and names only B's assigned technician through disposable HTTP/SQL", async () => {
    const a = await visit(original, "discovery-A", original.vin!);
    const [rawA] = await history(a);
    const pa = suite.id("discovery-a-provenance");
    await verified(a, pa);
    await append(a, rawA!, capture(a, rawA!, pa));
    const released = await release(a);
    const b = await visit(successorObservation, "discovery-B", successorObservation.vin!);
    const [rawB] = await history(b);
    const pb = suite.id("discovery-b-provenance");
    await verified(b, pb, blue);
    await append(b, rawB!, capture(b, rawB!, pb), blue);
    // Names are Identity-owned fixture facts. No reception capability is granted to reviewer.
    await db.user.update({ where: { id: suite.id("technician") }, data: { displayName: "Synthetic B technician" } });
    const choices = await get("reviewer", `orders/${b.id}/linking-technicians`).expect(200);
    privateNoStore(choices);
    expect(choices.body).toEqual({ technicians: [{ userId: suite.id("technician"), name: "Synthetic B technician" }] });
    const page = await get("reviewer", `orders/${b.id}/predecessor-candidates`).expect(200);
    privateNoStore(page);
    expect(page.body.scope).toBe("currently_authorized_retained_predecessors");
    expect(page.body.candidates).toContainEqual({ reportId: released.id, observedAt: original.observedAt, mileageKm: original.mileageKm });
    for (const candidate of page.body.candidates) expect(Object.keys(candidate).sort()).toEqual(["mileageKm", "observedAt", "reportId"]);
    for (const who of ["buyer", "reception"] as const) {
      privateNoStore(await get(who, `orders/${b.id}/predecessor-candidates`).expect(403));
      privateNoStore(await get(who, `orders/${b.id}/linking-technicians`).expect(403));
    }
    // A's current qualification and rights remain mandatory on every discovery page.
    await post("reception", `orders/${a.id}/assignments`, { expectedVersion: await version(a), userId: suite.id("reviewer"), capability: "diagnostics.reviewer", active: false }).expect(201);
    const unavailable = await get("reviewer", `orders/${b.id}/predecessor-candidates`).expect(200);
    expect(unavailable.body.candidates.some((candidate: { reportId: string }) => candidate.reportId === released.id)).toBe(false);
  });

});
