import "reflect-metadata";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { S3Client, CreateBucketCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaService } from "@auto-tm/db";
import supertest from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { workerDatabaseName } from "../../../../test/helpers/testDatabases";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../domain/ports/DiagnosticIntakePort";

const suite = defineE2eSuite("diagnostic-private-proof-issuance");
const people = ["buyer", "otherBuyer", "erasureBuyer", "erasureReadBuyer", "founder", "reception", "technician", "reviewer", "alternateReviewer"] as const;
type Person = typeof people[number];
const capability: Partial<Record<Person, string>> = {
  reception: "diagnostics.reception", technician: "diagnostics.technician", reviewer: "diagnostics.reviewer", alternateReviewer: "diagnostics.reviewer",
};
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
const original: Observation = { observedAt: "2026-10-21T10:00:00.000Z", mileageKm: 123000, method: "manual", vin: null, manualReference: "Synthetic fixture, initial transcription 041" };
const successorObservation: Observation = { observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100,
  method: "manual", vin: null, manualReference: "Synthetic fixture B, independently observed chassis 041" };
const newestA: Observation = { ...original, observedAt: "2026-10-21T10:30:00.000Z", mileageKm: 123001,
  manualReference: "Synthetic fixture A, later observation of chassis 041" };
const identifier = (provenanceId: string, value = "SYN-CHASSIS-041") => ({ kind: "chassis_stamp", location: "Right frame rail", value, provenanceIds: [provenanceId] });
const metadata = (id: string, image: Image = red) => ({ id, sha256: image.sha256, mime: "image/webp", sizeBytes: image.sizeBytes });
const privateNoStore = (response: { headers: Record<string, string> }) => {
  expect(response.headers["cache-control"]).toContain("private");
  expect(response.headers["cache-control"]).toContain("no-store");
};
/** Offline test preparation only. Parent has classified the exact-base evidence lifecycle GREEN.
 * Root still owns integration and hosted execution of this new test. Real HTTP/Prisma/current authority/private S3 composition. */
describe("first private comparative diagnostic continuity proof issuance", () => {
  let app: NestFastifyApplication; let db: PrismaService; let jwt: JwtService;
  let request: ReturnType<typeof supertest>; let objects: S3Client;
  let templateId: string;
  const now = initialTime;
  let allowPublic = false;
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
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => now, id: randomUUID, publicSyntheticAllowed: () => allowPublic,
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
  afterEach(async () => {
    allowPublic = false;
    // Restore only established cross-context authority fixtures, even after expected RED.
    for (const who of ["reviewer", "technician"] as const) {
      await db.user.update({ where: { id: suite.id(who) }, data: { suspendedAt: null, deletionScheduledAt: null } });
      await db.session.upsert({ where: { id: suite.id(`${who}-session`) },
        create: { id: suite.id(`${who}-session`), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: future, adminTotpExpiresAt: future },
        update: { expiresAt: future, adminTotpExpiresAt: future } });
      await db.staffGrant.upsert({ where: { userId_capability: { userId: suite.id(who), capability: capability[who]! } },
        create: { userId: suite.id(who), capability: capability[who]! }, update: { revokedAt: null } });
      await db.diagnosticCenterAssignment.updateMany({ where: { centerId, userId: suite.id(who) }, data: { qualifiedUntil: future, revokedAt: null } });
    }
  });
  async function visit(observation: Observation, visitName: string, commissioner: Person = "buyer", audience: "buyer_private" | "listing_public" = "buyer_private"): Promise<Order> {
    let listingId: string | null = null;
    if (audience === "listing_public") {
      allowPublic = true;
      listingId = randomUUID();
      await db.listing.create({ data: { id: listingId, sellerId: suite.id(commissioner), brandId: suite.catalog.brandId,
        modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, status: "active", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    }
    let { body: order } = await post(commissioner, "orders", { requestKey: randomUUID(), centerId,
      templateVersionId: templateId, audience, ...(listingId ? { listingId } : {}), synthetic: true }).expect(201);
    expect(order).toMatchObject({ version: 0, audience, listingId });
    // Each visit independently receives T and the distinct reviewer R through reception HTTP.
    for (const who of ["technician", "reviewer"] as const) {
      ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version,
        userId: suite.id(who), capability: capability[who], active: true }).expect(201));
    }
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version,
      kind: "physical", authorityReference: `Synthetic physical authorization for visit ${visitName}` }).expect(201));
    if (audience === "listing_public") ({ body: order } = await post("reception", `orders/${order.id}/authorization`, {
      expectedVersion: order.version, kind: "publication", authorityReference: `Separate synthetic publication authorization ${visitName}` }).expect(201));
    for (const state of ["confirmed", "arrived"]) {
      ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201));
    }
    ({ body: order } = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: order.version, ...observation }).expect(201));
    expect(order).toMatchObject({ version: audience === "buyer_private" ? 6 : 7, status: "arrived", physicalAuthorized: true, observedVehicle: observation });
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
  function capture(o: Order, raw: Raw, p: string, value = "SYN-CHASSIS-041", correction: { supersedesId: string; explanation: string } | null = null, id: string = randomUUID()) {
    return { id, expectedOrderVersion: o.version, identityRecordId: raw.id, identifiers: [identifier(p, value)], rights, correction };
  }
  async function append(o: Order, raw: Raw, input: ReturnType<typeof capture>, image: Image = red, audience: "buyer_private" | "listing_public" = "buyer_private") {
    expect(o.version).toBe(audience === "buyer_private" ? 6 : 7);
    const response = await post("technician", evidencePath(o), input).expect(201);
    privateNoStore(response);
    expect(response.body).toEqual({ id: input.id, orderId: o.id, orderVersion: audience === "buyer_private" ? 7 : 8, identityRecordId: raw.id,
      observationHash: raw.observationHash, observation: raw.observation, identifiers: input.identifiers,
      provenance: input.identifiers[0]!.provenanceIds.map(id => metadata(id, image)), rights, correction: input.correction,
      recordHash: expect.stringMatching(/^[a-f0-9]{64}$/), recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" });
    o.version = audience === "buyer_private" ? 7 : 8;
    expect(await version(o)).toBe(audience === "buyer_private" ? 7 : 8);
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

  it("issues the first private comparative continuity proof only after retained manual evidence is independently prepared", async () => {
    const a = await visit(original, "A");
    const [ia] = await history(a);
    expect(await history(a)).toEqual([{ id: expect.stringMatching(uuid), orderId: a.id, orderVersion: 6,
      observationHash: expect.stringMatching(hash), observation: original, recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" }]);
    const pa = suite.id("issuance-a-provenance");
    await verified(a, pa);
    const ea = await append(a, ia!, capture(a, ia!, pa, "SYN-CHASSIS-041"));
    const releasedA = await release(a);
    const releasedRepresentation = (await get("buyer", `reports/${releasedA.id}`).expect(200)).body;
    expect(releasedRepresentation).toMatchObject({ id: releasedA.id, version: 3, status: "finalized", supersededBy: null });
    // Reobserve the same chassis after release without appending a correction. This must not
    // replace A's raw/evidence report pins or make a different-vehicle comparison fixture.
    a.version = (await post("technician", `orders/${a.id}/vehicle`, { expectedVersion: a.version, ...newestA }).expect(201)).body.version;
    expect(a.version).toBe(8);
    const aHistory = await history(a);
    expect(aHistory).toEqual([ia, { id: expect.stringMatching(uuid), orderId: a.id, orderVersion: 8,
      observationHash: expect.stringMatching(hash), observation: newestA, recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" }]);
    expect(aHistory[1]!.id).not.toBe(ia!.id);
    expect((await get("reviewer", `orders/${a.id}/reports`).expect(200)).body).toEqual([releasedA]);

    const b = await visit(successorObservation, "B");
    const [ib] = await history(b);
    expect(b.id).not.toBe(a.id);
    expect(ib!.id).not.toBe(ia!.id);
    expect(await history(b)).toEqual([{ id: expect.stringMatching(uuid), orderId: b.id, orderVersion: 6,
      observationHash: expect.stringMatching(hash), observation: successorObservation, recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" }]);
    const pb = suite.id("issuance-b-provenance");
    await verified(b, pb, blue);
    const eb = await append(b, ib!, capture(b, ib!, pb, "SYN-CHASSIS-041"), blue);

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
    expect(comparison.body.predecessor.identityRecordId).not.toBe(aHistory[1]!.id);
    await comparativeBytes(b, releasedA.id, pa, red);
    await comparativeBytes(b, releasedA.id, pb, blue);
    const beforeA = await get("buyer", `reports/${releasedA.id}`).expect(200);
    privateNoStore(beforeA);
    expect(beforeA.body).toEqual(releasedRepresentation);
    // No HTTP audit reader exists. Read only the existing namespace-owned audit table,
    // without depending on a future proof model or inventing its audit action spelling.
    const auditsBefore = await db.diagnosticAudit.findMany({ where: { centerId } });

    // FIRST NEW ASSERTION. At the supplied base this route is absent, so root must
    // observe the real hosted 404 after the setup above has passed.
    const issuance = await post("reviewer", `orders/${b.id}/continuity-proofs`, {
      predecessorId: releasedA.id,
      expectedPredecessorVersion: 3,
      expectedOrderVersion: 7,
      predecessorIdentityRecordId: comparison.body.predecessor.identityRecordId,
      candidateIdentityRecordId: comparison.body.candidate.identityRecordId,
      linkingTechnicianId: suite.id("technician"),
      method: "comparative_attestation",
      rationale: "Same stamped chassis; independently observed on both visits",
      provenanceRecordIds: [pa, pb],
    });
    expect(issuance.status).toBe(201);
    privateNoStore(issuance);
    expect(issuance.body).toEqual({ proofId: expect.stringMatching(uuid) });
    const issuedAudits = await db.diagnosticAudit.findMany({ where: { centerId, id: { notIn: auditsBefore.map(row => row.id) } } });
    expect(issuedAudits).toHaveLength(1);
    expect(issuedAudits[0]).toMatchObject({ orderId: b.id, actorId: suite.id("reviewer") });

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
      method: "comparative_attestation",
      result: "same_vehicle",
      rationale: "Same stamped chassis; independently observed on both visits",
      provenanceRecordIds: [pa, pb],
      issuedBy: suite.id("reviewer"),
      issuedAt: "2026-10-21T12:00:00.000Z",
    });
    // Exact equality above excludes any extra findings, contacts, object keys or history.
    for (const secret of [aHistory[1]!.id, aHistory[1]!.observationHash, newestA.manualReference!,
      releasedA.findings[0].id, suite.phone("buyer"), suite.phone("technician"),
      `diagnostic-evidence/${pa}/${red.sha256}`, `diagnostic-evidence/${pb}/${blue.sha256}`]) {
      expect(proof.text).not.toContain(secret);
    }
    expect((await get("reviewer", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);
    expect(await version(b)).toBe(7);
    expect((await get("buyer", `reports/${releasedA.id}`).expect(200)).body).toEqual(beforeA.body);
    expect((await get("reviewer", `orders/${a.id}/reports`).expect(200)).body).toEqual([releasedA]);
    expect((await get("reviewer", comparisonPath(b, releasedA.id)).expect(200)).body).toEqual(comparison.body);
    expect(await db.diagnosticAudit.findMany({ where: { centerId, id: { notIn: auditsBefore.map(row => row.id) } } })).toEqual(issuedAudits);
  });

  type PairOptions = {
    commissionerA?: Person; commissionerB?: Person;
    audienceA?: "buyer_private" | "listing_public"; audienceB?: "buyer_private" | "listing_public";
    material?: "freeform" | "different" | "contradictory";
  };
  async function pair(options: PairOptions = {}) {
    const a = await visit(original, "denial A", options.commissionerA, options.audienceA);
    const [ia] = await history(a); const pa = randomUUID();
    if (options.material !== "freeform") {
      await verified(a, pa);
      await append(a, ia!, capture(a, ia!, pa), red, options.audienceA);
    }
    const released = await release(a);
    expect(released).toMatchObject({ version: 3, status: "finalized", supersededBy: null });
    const b = await visit(successorObservation, "denial B", options.commissionerB, options.audienceB);
    const [ib] = await history(b); const pb = randomUUID();
    if (options.material !== "freeform") {
      await verified(b, pb, blue);
      const input = capture(b, ib!, pb, options.material === "different" ? "SYN-CHASSIS-999" : "SYN-CHASSIS-041");
      if (options.material === "contradictory") input.identifiers.push({ ...identifier(pb, "SYN-CHASSIS-999"), location: "Second stamped chassis location" });
      await append(b, ib!, input, blue, options.audienceB);
    }
    expect((await get("reviewer", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);
    // Gate normal same-commissioner pairs on actual restricted comparison and retained bytes.
    if (!options.material && !options.audienceA && !options.audienceB && options.commissionerA === options.commissionerB) {
      const comparison = await get("reviewer", comparisonPath(b, released.id)).expect(200);
      privateNoStore(comparison);
      expect(comparison.body.predecessor).toMatchObject({ reportId: released.id, reportVersion: 3, identityRecordId: ia!.id, identityRecordHash: ia!.observationHash });
      expect(comparison.body.candidate).toMatchObject({ orderId: b.id, orderVersion: 7, identityRecordId: ib!.id, identityRecordHash: ib!.observationHash });
      await comparativeBytes(b, released.id, pa, red); await comparativeBytes(b, released.id, pb, blue);
    }
    return { a, b, commissionerA: options.commissionerA ?? "buyer", commissionerB: options.commissionerB ?? "buyer", released, ia: ia!, ib: ib!, pa, pb, body: {
      predecessorId: released.id as string, expectedPredecessorVersion: 3, expectedOrderVersion: b.version,
      predecessorIdentityRecordId: ia!.id, candidateIdentityRecordId: ib!.id,
      linkingTechnicianId: suite.id("technician"), method: "comparative_attestation",
      rationale: "Same stamped chassis; independently observed on both visits", provenanceRecordIds: [pa, pb],
    } };
  }
  type Pair = Awaited<ReturnType<typeof pair>>;
  const issuancePath = (p: Pair) => `orders/${p.b.id}/continuity-proofs`;
  async function assignment(o: Order, who: Person, active: boolean, purpose = "diagnostics.reviewer") {
    o.version = (await post("reception", `orders/${o.id}/assignments`, {
      expectedVersion: await version(o), userId: suite.id(who), capability: purpose, active,
    }).expect(201)).body.version;
  }
  const grant = (target: Person, enabled: boolean) => request.post("/api/v1/staff/grants").set(headers("founder"))
    .send({ targetUserId: suite.id(target), capability: "diagnostics.reviewer", reason: "Synthetic issuance revocation coverage", grant: enabled });
  async function stored(p: Pair) {
    // Audit has no HTTP reader. Stored reports also catch a hidden draft successor after
    // refusal, including when erasure/revocation closes staff access to that report.
    // Observe existing state only, never seed a proof, release pin, marker or audit.
    return {
      reports: await db.diagnosticReportRecord.findMany({ where: { orderId: { in: [p.a.id, p.b.id] } }, orderBy: { id: "asc" } }),
      representations: await Promise.all((["a", "b"] as const).map(async side => {
        const order = p[side];
        const row = await db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id }, select: { erasedAt: true } });
        if (row.erasedAt) return db.diagnosticReportRecord.findMany({ where: { orderId: order.id }, orderBy: { id: "asc" } });
        const who = side === "a" ? p.commissionerA : p.commissionerB;
        return (await get(who, `orders/${order.id}/reports`).expect(200)).body;
      })),
      orders: await db.inspectionOrder.findMany({ where: { id: { in: [p.a.id, p.b.id] } }, orderBy: { id: "asc" } }),
      audits: await db.diagnosticAudit.findMany({ where: { centerId }, orderBy: { id: "asc" } }),
    };
  }
  async function refused(p: Pair, send: () => PromiseLike<supertest.Response>, status = 403, code = "DIAGNOSTIC_NO_ACCESS") {
    const before = await stored(p);
    try {
      const response = await send();
      expect(response.status).toBe(status);
      privateNoStore(response);
      expect(response.body).toEqual({ statusCode: status, code, message: status === 400 ? "Invalid diagnostic request" : "Inspection request could not be completed",
        timestamp: "2026-10-21T12:00:00.000Z", requestId: "unknown" });
      // Exact generic envelope excludes ids, rationale, hashes, findings, contact and storage data.
      expect(response.text).not.toContain(p.released.id);
      expect(response.text).not.toContain(p.ia.observationHash);
      expect(response.text).not.toContain(p.pa);
      return response.body;
    } finally {
      expect(await stored(p)).toEqual(before);
    }
  }
  async function ordinaryProof(p: Pair, who: Person = "reviewer") {
    const response = await post(who, issuancePath(p), p.body);
    // Read denial tests cannot pass this gate at the supplied base. Never seed a proof handle.
    expect(response.status).toBe(201); privateNoStore(response);
    expect(response.body).toEqual({ proofId: expect.stringMatching(uuid) });
    const readable = await get(who, `${issuancePath(p)}/${response.body.proofId}`).expect(200);
    privateNoStore(readable); expect(readable.body.proofId).toBe(response.body.proofId);
    return response.body.proofId as string;
  }

  const reinspectionInput = (p: Pair, proofId: string, reportId = randomUUID()) => ({
    reportId, predecessorId: p.released.id, expectedOrderVersion: p.b.version,
    reason: "Private manual continuity follow-up", proofId,
  });

  async function consumptionMaterial(evidenceId: string) {
    const a = await visit(original, "consumption A");
    const [ia] = await history(a); const pa = randomUUID();
    await verified(a, pa); await append(a, ia!, capture(a, ia!, pa));
    const draft = (await post("technician", `orders/${a.id}/reports`, { reportId: randomUUID(), expectedOrderVersion: a.version }).expect(201)).body;
    const finding = { id: randomUUID(), checkId: "brakes", assessment: "fault", explanation: "Observed synthetic brake wear",
      evidenceIds: [evidenceId], kind: null, source: null, measurement: null, location: null };
    await request.put(`/api/v1/diagnostics/reports/${draft.id}/evidence/${evidenceId}?findingId=${finding.id}&expectedVersion=0`)
      .set(headers("technician")).set("content-type", "application/octet-stream").set("x-evidence-type", "image/png")
      .send(Buffer.from(red.input, "base64")).expect(200);
    await post("technician", `reports/${draft.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${draft.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${draft.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
    const released = (await get("reviewer", `reports/${draft.id}`).expect(200)).body;
    const templates = (await get("reception", `centers/${centerId}/templates`).expect(200)).body;
    const definition = { ...released.template, title: { tk: "Gaýtadan", ru: "Повторная", en: "Private follow-up" } };
    const published = (await post("reception", `centers/${centerId}/templates`, { expectedVersion: templates[0].version, definition, synthetic: true }).expect(201)).body;
    const previousTemplate = templateId;
    let b: Order;
    try { templateId = published.id; b = await visit(successorObservation, "consumption B"); }
    finally { templateId = previousTemplate; }
    const [ib] = await history(b); const pb = randomUUID();
    await verified(b, pb, blue); await append(b, ib!, capture(b, ib!, pb), blue);
    // This reader has ordinary B authority before proof issuance, and none on A.
    await assignment(b, "alternateReviewer", true);
    const p = { a, b, commissionerA: "buyer" as const, commissionerB: "buyer" as const, released, ia: ia!, ib: ib!, pa, pb, body: {
      predecessorId: released.id as string, expectedPredecessorVersion: 3, expectedOrderVersion: b.version,
      predecessorIdentityRecordId: ia!.id, candidateIdentityRecordId: ib!.id, linkingTechnicianId: suite.id("technician"),
      method: "comparative_attestation", rationale: "Same stamped chassis; independently observed on both visits", provenanceRecordIds: [pa, pb],
    } };
    await comparativeBytes(b, released.id, pa, red); await comparativeBytes(b, released.id, pb, blue);
    return { p, definition, candidateTemplateId: published.id as string, finding };
  }

  it("consumes the current technician-bound private manual proof into a fresh B report without copying A material", async () => {
    const evidenceId = randomUUID();
    try {
      const { p, definition, candidateTemplateId, finding } = await consumptionMaterial(evidenceId);
      expect(candidateTemplateId).not.toBe(p.released.templateVersionId);
      const sourceImage = await get("technician", `reports/${p.released.id}/evidence/${evidenceId}`).expect(200);
      expect(Buffer.from(sourceImage.body).toString("base64")).toBe(red.output);
      const documentsA = (await get("technician", `reports/${p.released.id}/documents`).expect(200)).body;
      expect(documentsA).toHaveLength(3);
      for (const suffix of ["", `/evidence/${evidenceId}`, "/documents", "/documents/en"]) {
        await get("alternateReviewer", `reports/${p.released.id}${suffix}`).expect(403);
      }
      const proofId = await ordinaryProof(p);
      const before = await stored(p);
      const artifactsA = await db.diagnosticPdfArtifact.findMany({ where: { reportId: p.released.id }, orderBy: { id: "asc" } });
      const input = reinspectionInput(p, proofId);
      // FIRST new behavior assertion: real ordinary HTTP, no contract/source shortcut.
      const created = await post("technician", `orders/${p.b.id}/reinspections`, input);
      expect(created.status).toBe(201);
      privateNoStore(created);
      expect(created.body).toMatchObject({ id: input.reportId, orderId: p.b.id, audience: "buyer_private", status: "draft", version: 0,
        templateVersionId: candidateTemplateId, template: definition, observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100,
        findings: [], authorId: suite.id("technician"), reviewerId: null, successorOf: p.released.id,
        correctionReason: input.reason, finalizedAt: null, supersededBy: null, lineageKind: "reinspection" });
      expect((await get("technician", `orders/${p.b.id}/reports`).expect(200)).body).toEqual([created.body]);
      for (const who of ["reviewer", "buyer"] as const) {
        const predecessor = await get(who, `reports/${p.released.id}`).expect(200);
        privateNoStore(predecessor);
        expect(predecessor.body).toMatchObject({ id: p.released.id, findings: [finding], supersededBy: null });
        expect(predecessor.body).not.toHaveProperty("successorKind");
      }
      expect((await get("alternateReviewer", `reports/${created.body.id}`).expect(200)).body.id).toBe(created.body.id);
      for (const suffix of ["", `/evidence/${evidenceId}`, "/documents", "/documents/en"]) {
        await get("alternateReviewer", `reports/${p.released.id}${suffix}`).expect(403);
      }
      await get("technician", `reports/${created.body.id}/evidence/${evidenceId}`).expect(403);
      const copied = await post("technician", `reports/${created.body.id}/findings`, { expectedVersion: 0, finding }).expect(400);
      expect(copied.body.code).toBe("REPORT_EVIDENCE_UNAVAILABLE");
      expect((await get("technician", `reports/${created.body.id}`).expect(200)).body).toMatchObject({ version: 0, findings: [] });
      expect((await get("technician", `reports/${created.body.id}/documents`).expect(200)).body).toEqual([]);
      expect(await db.diagnosticEvidence.count({ where: { reportId: created.body.id } })).toBe(0);
      expect(await db.diagnosticPdfArtifact.count({ where: { reportId: created.body.id } })).toBe(0);
      expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: p.released.id }, orderBy: { id: "asc" } })).toEqual(artifactsA);
      const after = await stored(p);
      expect(after.reports.find(row => row.id === p.released.id)).toEqual(before.reports.find(row => row.id === p.released.id));
      expect(after.reports).toHaveLength(2);
      expect(after.reports.find(row => row.id === created.body.id)).toMatchObject({ predecessorId: p.released.id, reinspection: true, status: "draft", version: 0 });
      const addedAudits = after.audits.filter(row => !before.audits.some(prior => prior.id === row.id));
      expect(addedAudits.length).toBeGreaterThan(0);
      expect(addedAudits.filter(row => row.action === "REPORT_REINSPECTION_CREATED")).toHaveLength(1);
    } finally {
      // Only this new fixture's exact report evidence row/object, even on setup RED.
      try { await objects.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: `diagnostic-evidence/${evidenceId}/${red.sha256}` })); }
      finally { await db.diagnosticEvidence.deleteMany({ where: { id: evidenceId } }); }
    }
  });

  it("returns the exact private reinspection result on an unchanged proof retry without duplicating report or consumption audit", async () => {
    const p = await pair();
    const proofId = await ordinaryProof(p);
    const input = reinspectionInput(p, proofId);
    const first = await post("technician", `orders/${p.b.id}/reinspections`, input);
    expect(first.status).toBe(201);
    privateNoStore(first);
    const beforeRetry = await stored(p);
    const retry = await post("technician", `orders/${p.b.id}/reinspections`, input);
    expect(retry.status).toBe(201);
    privateNoStore(retry);
    expect(retry.body).toEqual(first.body);
    expect(await stored(p)).toEqual(beforeRetry);
    expect(await db.diagnosticReportRecord.count({ where: { predecessorId: p.released.id } })).toBe(1);
    expect((await db.diagnosticAudit.findMany({ where: { centerId, orderId: p.b.id, action: "REPORT_REINSPECTION_CREATED" } })).length).toBe(1);
  });

  it.each(["proof", "reason", "order version"] as const)("conflicts on changed %s in an existing private reinspection retry without persistence changes", async binding => {
    const p = await pair();
    const proofId = await ordinaryProof(p);
    const otherProofId = await ordinaryProof(p);
    expect(otherProofId).not.toBe(proofId);
    const input = reinspectionInput(p, proofId);
    const first = await post("technician", `orders/${p.b.id}/reinspections`, input);
    expect(first.status).toBe(201);
    const before = await stored(p);
    const changedInput = { ...input };
    if (binding === "proof") changedInput.proofId = otherProofId;
    if (binding === "reason") changedInput.reason = "Changed follow-up reason";
    if (binding === "order version") changedInput.expectedOrderVersion = 8;
    const changed = await post("technician", `orders/${p.b.id}/reinspections`, changedInput);
    expect(changed.status).toBe(409);
    privateNoStore(changed);
    expect(changed.body.code).toBe("DIAGNOSTIC_REINSPECTION_CONFLICT");
    expect(await stored(p)).toEqual(before);
    // The original binding still retries exactly after the refused changed input.
    expect((await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201)).body).toEqual(first.body);
    expect(await stored(p)).toEqual(before);
  });

  it("refuses a second private successor that tries to consume an already used proof", async () => {
    const p = await pair();
    const proofId = await ordinaryProof(p);
    const firstInput = reinspectionInput(p, proofId);
    const first = await post("technician", `orders/${p.b.id}/reinspections`, firstInput);
    expect(first.status).toBe(201);
    const before = await stored(p);
    const second = await post("technician", `orders/${p.b.id}/reinspections`, reinspectionInput(p, proofId));
    expect(second.status).toBe(409);
    privateNoStore(second);
    expect(second.body.code).toBe("DIAGNOSTIC_REINSPECTION_CONFLICT");
    expect(await stored(p)).toEqual(before);
    expect(await db.diagnosticReportRecord.count({ where: { predecessorId: p.released.id } })).toBe(1);
  });

  it.each(["candidate", "predecessor"] as const)("permanently invalidates an unused proof after ordinary %s assignment revocation and reassignment", async side => {
    const p = await pair();
    const proofId = await ordinaryProof(p);
    const issued = await get("reviewer", `${issuancePath(p)}/${proofId}`).expect(200);
    const proofBefore = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    expect(proofBefore.invalidatedAt).toBeNull();
    const target = side === "candidate" ? p.b : p.a;
    const orderBefore = await db.inspectionOrder.findUniqueOrThrow({ where: { id: target.id }, select: { version: true, identityEvidenceGeneration: true } });
    expect(orderBefore).toEqual({ version: 7, identityEvidenceGeneration: 1 });
    const reportBefore = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id }, select: { version: true } });
    expect(reportBefore.version).toBe(3);

    await assignment(target, "reviewer", false);
    const assignmentKey = { orderId_userId_capability: { orderId: target.id, userId: suite.id("reviewer"), capability: "diagnostics.reviewer" } };
    expect((await db.diagnosticOrderAssignment.findUniqueOrThrow({ where: assignmentKey })).revokedAt).toEqual(initialTime);
    const revoked = await db.inspectionOrder.findUniqueOrThrow({ where: { id: target.id }, select: { version: true } });
    expect(revoked.version).toBe(8);
    const invalidatedAt = (await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId }, select: { invalidatedAt: true } })).invalidatedAt;
    expect(invalidatedAt).toEqual(expect.any(Date));
    // The technician retains independent current authority on both visits.
    const historical = await get("technician", `${issuancePath(p)}/${proofId}`).expect(200);
    privateNoStore(historical);
    expect(historical.body).toEqual(issued.body);

    await assignment(target, "reviewer", true);
    expect((await db.diagnosticOrderAssignment.findUniqueOrThrow({ where: assignmentKey })).revokedAt).toBeNull();
    const reassigned = await db.inspectionOrder.findUniqueOrThrow({ where: { id: target.id }, select: { version: true } });
    expect(reassigned.version).toBe(9);
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } }))
      .toEqual({ ...proofBefore, invalidatedAt });
    const restored = await get("reviewer", `${issuancePath(p)}/${proofId}`).expect(200);
    privateNoStore(restored); expect(restored.body).toEqual(historical.body);
    expect((await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id }, select: { version: true } })).version)
      .toBe(reportBefore.version);
  });

  it("rolls back a proof when the real PostgreSQL audit INSERT fails for this candidate", async () => {
    const p = await pair();
    await ordinaryProof(p);
    // Refuse DDL outside the run's disposable, exact worker database.
    const databases = inject("apiTestDatabases");
    if (!databases) throw new Error("Audit fault requires the hosted per-worker test database");
    const worker = Number(process.env["VITEST_POOL_ID"]);
    expect(Number.isInteger(worker) && worker >= 1 && worker <= databases.workers).toBe(true);
    expect(await db.$queryRaw`SELECT current_database() AS name`).toEqual([{ name: workerDatabaseName(databases.prefix, worker) }]);
    const proofs = () => db.diagnosticContinuityProof.findMany({ where: { candidateOrderId: p.b.id }, orderBy: { id: "asc" } });
    const before = { ...await stored(p), proofs: await proofs() };
    expect(before.proofs).toHaveLength(1);
    // Only generated UUIDs enter this DDL. No environment values or caller input.
    for (const id of [p.a.id, p.b.id, p.released.id, centerId, suite.id("reviewer")]) expect(id).toMatch(uuid);
    const namespace = `proof914_${p.b.id.replaceAll("-", "")}`;
    const triggerName = `${namespace}_audit`;
    // Install atomically: failed installation leaves no partial fault behind.
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${namespace}"`);
      await tx.$executeRawUnsafe(`CREATE SEQUENCE "${namespace}".audit_reached`);
      await tx.$executeRawUnsafe(`CREATE FUNCTION "${namespace}".refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF (SELECT count(*) FROM public.diagnostic_continuity_proofs
              WHERE "candidateOrderId" = '${p.b.id}' AND "predecessorReportId" = '${p.released.id}') = 2 THEN
            -- Sequences survive rollback: receipt of the actual audit INSERT with
            -- the second proof already visible, not a fabricated proof or audit.
            PERFORM nextval('"${namespace}".audit_reached');
          END IF;
          RAISE EXCEPTION 'issue914 exact candidate audit INSERT fault';
        END $$`);
      await tx.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON public.diagnostic_audits
        FOR EACH ROW WHEN (NEW."orderId" = '${p.b.id}' AND NEW."centerId" = '${centerId}'
          AND NEW."actorId" = '${suite.id("reviewer")}' AND NEW.action = 'CONTINUITY_PROOF_ISSUED')
        EXECUTE FUNCTION "${namespace}".refuse_audit()`);
    });
    try {
      expect(await db.$queryRawUnsafe(`SELECT is_called FROM "${namespace}".audit_reached`)).toEqual([{ is_called: false }]);
      const response = await post("reviewer", issuancePath(p), p.body);
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({ statusCode: 500, code: "INTERNAL_SERVER_ERROR" });
      expect(response.text).not.toContain(namespace);
      expect(await db.$queryRawUnsafe(`SELECT last_value::int, is_called FROM "${namespace}".audit_reached`))
        .toEqual([{ last_value: 1, is_called: true }]);
      // Persistence assertions prove rollback, including hidden drafts/successors,
      // order versions/generations and audit rows that HTTP readers cannot expose.
      expect({ ...await stored(p), proofs: await proofs() }).toEqual(before);
    } finally {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON public.diagnostic_audits`);
        await tx.$executeRawUnsafe(`DROP FUNCTION "${namespace}".refuse_audit()`);
        await tx.$executeRawUnsafe(`DROP SEQUENCE "${namespace}".audit_reached`);
        await tx.$executeRawUnsafe(`DROP SCHEMA "${namespace}"`);
      });
    }
    expect(await db.$queryRaw`SELECT nspname FROM pg_namespace WHERE nspname = ${namespace}`).toEqual([]);
    // Same ordinary request succeeds after removing the external fault.
    const recoveredId = await ordinaryProof(p);
    expect((await proofs()).map(row => row.id)).toContain(recoveredId);
    expect(await proofs()).toHaveLength(2);
    const recovered = await stored(p);
    expect(recovered.orders).toEqual(before.orders);
    expect(recovered.reports).toEqual(before.reports);
    const newAudits = recovered.audits.filter(row => !before.audits.some(prior => prior.id === row.id));
    expect(newAudits).toHaveLength(1);
    expect(newAudits[0]).toMatchObject({ orderId: p.b.id, action: "CONTINUITY_PROOF_ISSUED" });
  });

  it("refuses a B-only linking technician without disclosing whether the predecessor exists", async () => {
    const p = await pair();
    await assignment(p.a, "technician", false, "diagnostics.technician");
    const real = await refused(p, () => post("technician", issuancePath(p), p.body));
    const unknown = await refused(p, () => post("technician", issuancePath(p), { ...p.body, predecessorId: randomUUID() }));
    expect(unknown).toEqual(real);
  });

  it.each(["A", "B"] as const)("refuses a qualified reviewer never assigned to %s", async missing => {
    const p = await pair();
    await assignment(missing === "A" ? p.b : p.a, "alternateReviewer", true);
    p.body.expectedOrderVersion = p.b.version;
    await refused(p, () => post("alternateReviewer", issuancePath(p), p.body));
  });

  it.each(["A", "B"] as const)("withholds an ordinarily issued proof from a qualified reviewer missing %s assignment", async missing => {
    const p = await pair(); const proofId = await ordinaryProof(p);
    await assignment(missing === "A" ? p.b : p.a, "alternateReviewer", true);
    const real = await refused(p, () => get("alternateReviewer", `${issuancePath(p)}/${proofId}`));
    expect(await refused(p, () => get("alternateReviewer", `${issuancePath(p)}/${randomUUID()}`))).toEqual(real);
  });

  it("refuses the linking technician even with reviewer qualification and both reviewer assignments", async () => {
    const p = await pair();
    await grant("technician", true).expect(204);
    await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id("technician"), capability: "diagnostics.reviewer", qualifiedUntil: future } });
    await assignment(p.a, "technician", true); await assignment(p.b, "technician", true);
    p.body.expectedOrderVersion = p.b.version;
    try { await refused(p, () => post("technician", issuancePath(p), p.body)); }
    finally {
      await grant("technician", false).expect(204);
      await db.diagnosticCenterAssignment.deleteMany({ where: { centerId, userId: suite.id("technician"), capability: "diagnostics.reviewer" } });
    }
  });

  const authorityLosses = ["missing grant", "revoked grant", "revoked A assignment", "revoked B assignment", "expired qualification", "expired session", "suspended issuer", "deleting issuer"] as const;
  type AuthorityLoss = typeof authorityLosses[number];
  async function loseAuthority(p: Pair, loss: AuthorityLoss) {
    if (loss === "missing grant") await db.staffGrant.delete({ where: { userId_capability: { userId: suite.id("reviewer"), capability: "diagnostics.reviewer" } } });
    if (loss === "revoked grant") await grant("reviewer", false).expect(204);
    if (loss === "revoked A assignment") await assignment(p.a, "reviewer", false);
    if (loss === "revoked B assignment") await assignment(p.b, "reviewer", false);
    if (loss === "expired qualification") await db.diagnosticCenterAssignment.updateMany({ where: { centerId, userId: suite.id("reviewer"), capability: "diagnostics.reviewer" }, data: { qualifiedUntil: initialTime } });
    if (loss === "expired session") await db.session.update({ where: { id: suite.id("reviewer-session") }, data: { expiresAt: initialTime } });
    if (loss === "suspended issuer") await db.user.update({ where: { id: suite.id("reviewer") }, data: { suspendedAt: initialTime } });
    if (loss === "deleting issuer") await request.delete("/api/v1/me").set(headers("reviewer")).expect(204, "");
  }
  it.each(authorityLosses)("refuses issuance with the identical JWT after %s", async loss => {
    const p = await pair(); const sameJwt = headers("reviewer");
    await get("reviewer", comparisonPath(p.b, p.released.id)).set(sameJwt).expect(200);
    await loseAuthority(p, loss);
    await refused(p, () => request.post(`/api/v1/diagnostics/${issuancePath(p)}`).set(sameJwt).send(p.body));
  });
  it.each(authorityLosses)("normalizes real and unknown proof reads after %s using the identical JWT", async loss => {
    const p = await pair(); const sameJwt = headers("reviewer"); const proofId = await ordinaryProof(p);
    await loseAuthority(p, loss);
    const real = await refused(p, () => request.get(`/api/v1/diagnostics/${issuancePath(p)}/${proofId}`).set(sameJwt));
    const unknown = await refused(p, () => request.get(`/api/v1/diagnostics/${issuancePath(p)}/${randomUUID()}`).set(sameJwt));
    expect(unknown).toEqual(real);
  });
  it.each([["buyer", "buyer"], ["B-only technician", "technician"], ["unassigned alternate reviewer", "alternateReviewer"]] as const)("withholds real and unknown proof handles from %s", async (_label, who) => {
    const p = await pair(); const proofId = await ordinaryProof(p);
    if (who === "technician") await assignment(p.a, "technician", false, "diagnostics.technician");
    const real = await refused(p, () => get(who, `${issuancePath(p)}/${proofId}`));
    expect(await refused(p, () => get(who, `${issuancePath(p)}/${randomUUID()}`))).toEqual(real);
  });

  it("lets a current qualified technician assigned to both orders read the same restricted proof as the reviewer", async () => {
    const p = await pair(); const proofId = await ordinaryProof(p);
    const comparison = await get("reviewer", comparisonPath(p.b, p.released.id)).expect(200);
    const expected = {
      proofId,
      policyVersion: "ADR-0108",
      predecessor: {
        reportId: p.released.id,
        reportVersion: 3,
        snapshotHash: comparison.body.predecessor.snapshotHash,
        identityRecordId: p.ia.id,
        identityRecordHash: p.ia.observationHash,
      },
      candidate: {
        orderId: p.b.id,
        orderVersion: 7,
        identityRecordId: p.ib.id,
        identityRecordHash: p.ib.observationHash,
      },
      linkingTechnicianId: suite.id("technician"),
      method: "comparative_attestation",
      result: "same_vehicle",
      rationale: "Same stamped chassis; independently observed on both visits",
      provenanceRecordIds: [p.pa, p.pb],
      issuedBy: suite.id("reviewer"),
      issuedAt: "2026-10-21T12:00:00.000Z",
    };
    const before = await stored(p);
    try {
      const reviewer = await get("reviewer", `${issuancePath(p)}/${proofId}`).expect(200);
      const technician = await get("technician", `${issuancePath(p)}/${proofId}`).expect(200);
      privateNoStore(reviewer); privateNoStore(technician);
      expect(reviewer.body).toEqual(expected);
      expect(technician.body).toEqual(expected);
      expect(technician.body).toEqual(reviewer.body);
    } finally {
      expect(await stored(p)).toEqual(before);
    }
  });

  it("returns generic denial for an unknown proof handle to the current qualified reviewer", async () => {
    const p = await pair(); await ordinaryProof(p);
    await refused(p, () => get("reviewer", `${issuancePath(p)}/${randomUUID()}`));
  });

  const malformedBodies: [string, (p: Pair) => object][] = [
    ["unknown field", p => ({ ...p.body, extra: true })],
    ["client proof id", p => ({ ...p.body, proofId: randomUUID() })],
    ["client audience", p => ({ ...p.body, audience: "listing_public" })],
    ["client actor", p => ({ ...p.body, issuedBy: suite.id("reviewer") })],
    ["client rights", p => ({ ...p.body, rights })],
    ["client result", p => ({ ...p.body, result: "same_vehicle" })],
    ["malformed predecessor", p => ({ ...p.body, predecessorId: "not-a-uuid" })],
    ["negative version", p => ({ ...p.body, expectedOrderVersion: -1 })],
    ["fractional version", p => ({ ...p.body, expectedPredecessorVersion: 1.5 })],
    ["string version", p => ({ ...p.body, expectedOrderVersion: "7" })],
    ["null raw pin", p => ({ ...p.body, candidateIdentityRecordId: null })],
    ["malformed provenance", p => ({ ...p.body, provenanceRecordIds: ["not-a-uuid"] })],
    ["nested provenance", p => ({ ...p.body, provenanceRecordIds: [{ id: p.pa, extra: true }] })],
    ["missing linking technician", p => { const { linkingTechnicianId: _omitted, ...body } = p.body; return body; }],
    ["missing rationale", p => { const { rationale: _omitted, ...body } = p.body; return body; }],
    ["empty rationale", p => ({ ...p.body, rationale: "" })],
    ["automatic method outside this slice", p => ({ ...p.body, method: "automatic_vin" })],
    ["public transfer method outside this slice", p => ({ ...p.body, method: "public_transfer" })],
  ];
  it.each(malformedBodies)("rejects strict issuance input: %s", async (_label, body) => {
    const p = await pair();
    await refused(p, () => post("reviewer", issuancePath(p), body(p)), 400, "DIAGNOSTIC_INVALID_INPUT");
  });
  it("rejects unknown issuance query fields", async () => {
    const p = await pair();
    await refused(p, () => post("reviewer", `${issuancePath(p)}?extra=true`, p.body), 400, "DIAGNOSTIC_INVALID_INPUT");
  });
  it.each(["not-a-uuid", "unknown-query"])("rejects malformed proof read input: %s", async input => {
    const p = await pair(); const proofId = await ordinaryProof(p);
    const path = input === "unknown-query" ? `${issuancePath(p)}/${proofId}?extra=true` : `${issuancePath(p)}/${input}`;
    await refused(p, () => get("reviewer", path), 400, "DIAGNOSTIC_INVALID_INPUT");
  });

  it.each(["predecessor version", "order version", "predecessor raw pin", "candidate raw pin"] as const)("returns an authorized conflict for stale %s", async stale => {
    const p = await pair(); const body = { ...p.body };
    if (stale === "predecessor version") body.expectedPredecessorVersion = 2;
    if (stale === "order version") body.expectedOrderVersion = 6;
    if (stale === "predecessor raw pin") {
      p.a.version = (await post("technician", `orders/${p.a.id}/vehicle`, { expectedVersion: p.a.version, ...newestA }).expect(201)).body.version;
      const records = await history(p.a); body.predecessorIdentityRecordId = records[1]!.id;
      expect(body.predecessorIdentityRecordId).not.toBe(p.ia.id);
    }
    if (stale === "candidate raw pin") {
      p.b.version = (await post("technician", `orders/${p.b.id}/vehicle`, { expectedVersion: p.b.version, ...successorObservation, mileageKm: 123101 }).expect(201)).body.version;
      body.expectedOrderVersion = 8;
      expect((await history(p.b))[1]!.id).not.toBe(body.candidateIdentityRecordId);
    }
    await refused(p, () => post("reviewer", issuancePath(p), body), 409, "DIAGNOSTIC_STALE_VERSION");
  });

  it.each(["arbitrary", "unverified", "verified but unretained"] as const)("refuses %s provenance without changing either visit", async kind => {
    const p = await pair(); const foreign = randomUUID();
    if (kind === "unverified") await stage(p.b, foreign);
    if (kind === "verified but unretained") await verified(p.b, foreign);
    await refused(p, () => post("reviewer", issuancePath(p), { ...p.body, provenanceRecordIds: [p.pa, foreign] }));
  });
  it.each(["freeform", "different", "contradictory"] as const)("refuses %s identity material despite reviewer authority on both visits", async material => {
    const p = await pair({ material });
    // Freeform references have real observations/releases but no classified retained evidence.
    await refused(p, () => post("reviewer", issuancePath(p), p.body));
  });
  it("refuses provenance that omits either visit's retained evidence", async () => {
    const p = await pair();
    await refused(p, () => post("reviewer", issuancePath(p), { ...p.body, provenanceRecordIds: [p.pa] }));
  });
  it("refuses different private commissioners", async () => {
    const p = await pair({ commissionerB: "otherBuyer" });
    await refused(p, () => post("reviewer", issuancePath(p), p.body));
  });
  it.each(["public A", "public B", "both public"] as const)("keeps %s outside private comparative admission", async audiences => {
    const p = await pair({ audienceA: audiences === "public B" ? "buyer_private" : "listing_public",
      audienceB: audiences === "public A" ? "buyer_private" : "listing_public" });
    await refused(p, () => post("reviewer", issuancePath(p), p.body));
  });

  async function purgeCommissioner(who: "erasureBuyer" | "erasureReadBuyer") {
    await request.delete("/api/v1/me").set(headers(who)).expect(204, "");
    const scheduled = await db.user.findUniqueOrThrow({ where: { id: suite.id(who) } });
    expect(scheduled.deletionScheduledAt?.toISOString()).toBe("2026-11-20T12:00:00.000Z");
    expect(await db.session.count({ where: { userId: suite.id(who) } })).toBe(0);
    // Established worker-job subprocess pattern. Refuse global selection before any purge
    // when it could reach another suite's due account or expired sign-in code.
    const workerRoot = resolve(__dirname, "../../../../../worker");
    const script = `
      require('reflect-metadata'); require('tsx/cjs');
      const { PrismaService } = require('@auto-tm/db');
      const { PurgeExpiredAccounts } = require('./src/jobs/PurgeExpiredAccounts.ts');
      async function main() {
        const db = new PrismaService();
        try {
          const now = new Date(${JSON.stringify(scheduled.deletionScheduledAt!.toISOString())});
          const target = ${JSON.stringify(suite.id(who))};
          const due = await db.user.findMany({ where: { deletionScheduledAt: { lte: now } }, select: { id: true } });
          if (due.length !== 1 || due[0].id !== target) throw new Error('Issuance erasure isolation refused: foreign or missing due account');
          const stale = await db.otpRequest.findMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 86400000) } }, select: { userId: true, destination: true } });
          if (stale.some(row => !(row.userId === target || row.userId === null && row.destination === ${JSON.stringify(suite.phone(who))}))) throw new Error('Issuance erasure isolation refused: foreign expired OTP rows');
          const result = await new PurgeExpiredAccounts(db).execute({ now });
          if (result.purgedCount !== 1) throw new Error('Expected exactly one product-scheduled purge');
        } finally { await db.$disconnect(); }
      }
      void main().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    await promisify(execFile)(process.execPath, ["-e", script], { cwd: workerRoot,
      env: { ...process.env, TSX_TSCONFIG_PATH: resolve(workerRoot, "tsconfig.json") }, timeout: 30000, killSignal: "SIGKILL" });
    expect(await db.user.findUniqueOrThrow({ where: { id: suite.id(who) }, select: { phone: true, deletionScheduledAt: true } }))
      .toEqual({ phone: null, deletionScheduledAt: null });
  }
  it("normalizes erased/null-commissioner and unknown predecessors without a new audit or successor", async () => {
    const p = await pair({ commissionerA: "erasureBuyer", commissionerB: "erasureBuyer" });
    await purgeCommissioner("erasureBuyer");
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.a.id }, select: { commissionerId: true, erasedAt: true } }))
      .toEqual({ commissionerId: null, erasedAt: new Date("2026-11-20T12:00:00.000Z") });
    const erased = await refused(p, () => post("reviewer", issuancePath(p), p.body));
    expect(await refused(p, () => post("reviewer", issuancePath(p), { ...p.body, predecessorId: randomUUID() }))).toEqual(erased);
  });
  it("normalizes erased and unknown proof handles after product commissioner purge", async () => {
    const p = await pair({ commissionerA: "erasureReadBuyer", commissionerB: "erasureReadBuyer" });
    const proofId = await ordinaryProof(p);
    await purgeCommissioner("erasureReadBuyer");
    const erased = await refused(p, () => get("reviewer", `${issuancePath(p)}/${proofId}`));
    expect(await refused(p, () => get("reviewer", `${issuancePath(p)}/${randomUUID()}`))).toEqual(erased);
  });

  // Private consumption authority slice. This block is appended so the original
  // issuance/read cases above remain byte-for-byte unchanged.
  async function consumptionState(p: Pair, proofId: string) {
    return {
      reports: await db.diagnosticReportRecord.findMany({ where: { OR: [{ orderId: { in: [p.a.id, p.b.id] } }, { predecessorId: p.released.id }] }, orderBy: { id: "asc" } }),
      proof: await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId }, select: { consumedReportId: true, consumedAt: true, invalidatedAt: true } }),
      audits: await db.diagnosticAudit.findMany({ where: { centerId }, orderBy: { id: "asc" } }),
    };
  }

  async function consumeDenied(p: Pair, proofId: string, input = reinspectionInput(p, proofId), sameJwt = headers("technician")) {
    const before = await consumptionState(p, proofId);
    expect(before.proof).toMatchObject({ consumedReportId: null, consumedAt: null });
    expect(before.reports.filter(row => row.orderId === p.b.id || row.predecessorId === p.released.id)).toEqual([]);
    try {
      const response = await request.post(`/api/v1/diagnostics/orders/${p.b.id}/reinspections`).set(sameJwt).send(input);
      expect(response.status).toBe(403);
      privateNoStore(response);
      expect(response.body).toEqual({ statusCode: 403, code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection request could not be completed",
        timestamp: "2026-10-21T12:00:00.000Z", requestId: "unknown" });
      expect(response.text).not.toContain(p.released.id);
      for (const secret of [proofId, p.ia.observationHash, p.ib.observationHash, p.pa, p.pb, p.body.rationale]) expect(response.text).not.toContain(secret);
      return response;
    } finally { expect(await consumptionState(p, proofId)).toEqual(before); }
  }

  it("lets a B-only linking technician consume a real proof without A assignment or A material access", async () => {
    const evidenceId = randomUUID();
    try {
      const { p } = await consumptionMaterial(evidenceId);
      await assignment(p.a, "technician", false, "diagnostics.technician");
      const proofId = await ordinaryProof(p);
      for (const path of [comparisonPath(p.b, p.released.id), `${issuancePath(p)}/${proofId}`, evidencePath(p.a),
        provenancePath(p.a, p.pa), `orders/${p.b.id}/reinspection-comparison/provenance/${p.pa}?predecessorId=${p.released.id}`,
        ...["", `/evidence/${evidenceId}`, "/documents", "/documents/en"].map(suffix => `reports/${p.released.id}${suffix}`)]) {
        const beforeRead = await consumptionState(p, proofId);
        try { await refused(p, () => get("technician", path)); }
        finally { expect(await consumptionState(p, proofId)).toEqual(beforeRead); }
      }
      const before = await consumptionState(p, proofId);
      const input = reinspectionInput(p, proofId);
      const consumed = await post("technician", `orders/${p.b.id}/reinspections`, input);
      expect(consumed.status).toBe(201);
      privateNoStore(consumed);
      expect(consumed.body).toMatchObject({ id: input.reportId, orderId: p.b.id, status: "draft", successorOf: p.released.id, findings: [] });
      const after = await consumptionState(p, proofId);
      expect(after.proof.consumedReportId).toBe(input.reportId);
      expect(after.proof.consumedAt).toEqual(new Date("2026-10-21T12:00:00.000Z"));
      expect(after.audits.filter(row => !before.audits.some(prior => prior.id === row.id)).map(row => row.action).sort())
        .toEqual(["CONTINUITY_PROOF_CONSUMED", "REPORT_REINSPECTION_CREATED"]);
      expect(after.reports.find(row => row.id === input.reportId)).toMatchObject({ predecessorId: p.released.id, reinspection: true, status: "draft" });
      expect((await get("technician", `reports/${input.reportId}/documents`).expect(200)).body).toEqual([]);
      expect(await db.diagnosticEvidence.count({ where: { reportId: input.reportId } })).toBe(0);
      const freshId = randomUUID();
      const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [freshId], kind: null, source: null, measurement: null, location: null };
      try {
        await request.put(`/api/v1/diagnostics/reports/${input.reportId}/evidence/${freshId}?findingId=${finding.id}&expectedVersion=0`)
          .set(headers("technician")).set("content-type", "application/octet-stream").set("x-evidence-type", "image/png")
          .send(Buffer.from(blue.input, "base64")).expect(200);
        await post("technician", `reports/${input.reportId}/findings`, { expectedVersion: 0, finding }).expect(201);
        expect((await get("technician", `reports/${input.reportId}`).expect(200)).body.findings).toEqual([finding]);
      } finally {
        try { await objects.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: `diagnostic-evidence/${freshId}/${blue.sha256}` })); }
        finally { await db.diagnosticEvidence.deleteMany({ where: { id: freshId } }); }
      }
    } finally {
      try { await objects.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: `diagnostic-evidence/${evidenceId}/${red.sha256}` })); }
      finally { await db.diagnosticEvidence.deleteMany({ where: { id: evidenceId } }); }
    }
  });

  const issuerConsumptionLosses = ["revoked grant", "revoked A assignment", "revoked B assignment", "expired qualification", "expired session", "suspended issuer", "deleting issuer"] as const;
  it.each(issuerConsumptionLosses)("denies consumption with the same JWT after issuer %s", async loss => {
    const p = await pair();
    const proofId = await ordinaryProof(p);
    const sameJwt = headers("technician");
    await loseAuthority(p, loss);
    const input = reinspectionInput(p, proofId);
    const real = await consumeDenied(p, proofId, input, sameJwt);
    expect((await consumeDenied(p, proofId, { ...input, proofId: randomUUID() }, sameJwt)).body).toEqual(real.body);
    expect((await consumeDenied(p, proofId, { ...input, predecessorId: randomUUID() }, sameJwt)).body).toEqual(real.body);
  });

  const technicianConsumptionLosses = ["revoked B assignment", "revoked technician grant", "expired technician qualification", "expired technician session", "suspended technician", "deleting technician"] as const;
  it.each(technicianConsumptionLosses)("denies consumption after linking technician %s", async loss => {
    const p = await pair();
    const proofId = await ordinaryProof(p);
    const sameJwt = headers("technician");
    if (loss === "revoked B assignment") await assignment(p.b, "technician", false, "diagnostics.technician");
    if (loss === "revoked technician grant") await request.post("/api/v1/staff/grants").set(headers("founder"))
      .send({ targetUserId: suite.id("technician"), capability: "diagnostics.technician", reason: "Synthetic consumption revocation coverage", grant: false }).expect(204);
    if (loss === "expired technician qualification") await db.diagnosticCenterAssignment.updateMany({ where: { centerId, userId: suite.id("technician"), capability: "diagnostics.technician" }, data: { qualifiedUntil: initialTime } });
    if (loss === "expired technician session") await db.session.update({ where: { id: suite.id("technician-session") }, data: { expiresAt: initialTime } });
    if (loss === "suspended technician") await db.user.update({ where: { id: suite.id("technician") }, data: { suspendedAt: initialTime } });
    if (loss === "deleting technician") await request.delete("/api/v1/me").set(sameJwt).expect(204, "");
    const input = reinspectionInput(p, proofId);
    const real = await consumeDenied(p, proofId, input, sameJwt);
    expect((await consumeDenied(p, proofId, { ...input, proofId: randomUUID() }, sameJwt)).body).toEqual(real.body);
    expect((await consumeDenied(p, proofId, { ...input, predecessorId: randomUUID() }, sameJwt)).body).toEqual(real.body);
    if (loss === "expired technician session") {
      const proofBeforeRestore = await consumptionState(p, proofId);
      await db.session.update({ where: { id: suite.id("technician-session") }, data: { expiresAt: future } });
      expect(await consumptionState(p, proofId)).toEqual(proofBeforeRestore);
      const retry = await request.post(`/api/v1/diagnostics/orders/${p.b.id}/reinspections`).set(sameJwt).send(input);
      expect(retry.status).toBe(201);
      expect(retry.body.id).toBe(input.reportId);
    }
  });

  it.each(["A", "B"] as const)("keeps a proof permanently invalid after reviewer %s assignment restoration", async side => {
    const p = await pair();
    const proofId = await ordinaryProof(p);
    const target = side === "A" ? p.a : p.b;
    await assignment(target, "reviewer", false);
    const invalidatedAt = (await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId }, select: { invalidatedAt: true } })).invalidatedAt;
    expect(invalidatedAt).toEqual(expect.any(Date));
    await assignment(target, "reviewer", true);
    p.body.expectedOrderVersion = p.b.version;
    const restored = await get("reviewer", `${issuancePath(p)}/${proofId}`).expect(200);
    privateNoStore(restored);
    // Current R can still compare and issue for the restored staffing/current version.
    // That new authority must not revive the original unused proof.
    expect(await ordinaryProof(p)).not.toBe(proofId);
    await consumeDenied(p, proofId, reinspectionInput(p, proofId));
    expect((await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId }, select: { invalidatedAt: true } })).invalidatedAt)
      .toEqual(invalidatedAt);
  });

  // Private consumption atomicity slice. Existing cases and helpers above stay unchanged.
  // Same bounded PostgreSQL barrier as DiagnosticReports.e2e.spec.ts: both requests
  // must reach actual row-lock contention before either may finish consumption.
  async function contendConsumption(p: Pair, inputs: ReturnType<typeof reinspectionInput>[]) {
    let settled: Promise<PromiseSettledResult<supertest.Response>[]> | undefined;
    try {
      await db.$transaction(async tx => {
        const [holder] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        for (const id of [p.a.id, p.b.id].sort()) await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${id} FOR UPDATE`;
        settled = Promise.allSettled(inputs.map(input => post("technician", `orders/${p.b.id}/reinspections`, input)));
        for (let attempt = 0; ; attempt++) {
          const [observed] = await db.$queryRaw<{ waiting: number }[]>`WITH direct AS (SELECT activity.pid FROM pg_stat_activity activity WHERE ${holder!.pid}::int = ANY(pg_blocking_pids(activity.pid)))
            SELECT ((SELECT count(*) FROM direct) + (SELECT count(*) FROM pg_stat_activity activity WHERE activity.pid NOT IN (SELECT pid FROM direct) AND pg_blocking_pids(activity.pid) && ARRAY(SELECT pid FROM direct)))::int AS waiting`;
          if (observed!.waiting >= inputs.length) break;
          if (attempt === 500) throw new Error(`Only ${observed!.waiting} of ${inputs.length} private consumption requests reached the row-lock barrier`);
        }
      });
    } catch (barrierFailure) {
      await settled;
      throw barrierFailure;
    }
    const results = await settled!;
    const failed = results.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
    return results.map(result => (result as PromiseFulfilledResult<supertest.Response>).value);
  }

  it.each(["identical request", "distinct report ids", "two unused proofs"] as const)("creates only one private successor under observed contention for %s", async scenario => {
    const p = await pair();
    const proofId = await ordinaryProof(p);
    const otherProofId = scenario === "two unused proofs" ? await ordinaryProof(p) : proofId;
    if (scenario === "two unused proofs") expect(otherProofId).not.toBe(proofId);
    const first = reinspectionInput(p, proofId);
    const second = scenario === "identical request" ? first : reinspectionInput(p, otherProofId);
    const before = await stored(p);
    const proofsBefore = await db.diagnosticContinuityProof.findMany({ where: { candidateOrderId: p.b.id }, orderBy: { id: "asc" } });
    expect(proofsBefore.every(row => row.consumedAt === null && row.consumedReportId === null && row.invalidatedAt === null)).toBe(true);
    const responses = await contendConsumption(p, [first, second]);
    for (const response of responses) privateNoStore(response);
    expect(responses.map(response => response.status).sort()).toEqual(scenario === "identical request" ? [201, 201] : scenario === "distinct report ids" ? [201, 409] : [201, 403]);
    const winner = responses.findIndex(response => response.status === 201);
    const winningInput = [first, second][winner]!;
    const result = responses[winner]!;
    expect(result.body).toMatchObject({ id: winningInput.reportId, orderId: p.b.id, status: "draft", successorOf: p.released.id, findings: [] });
    if (scenario === "identical request") expect(responses[1]!.body).toEqual(responses[0]!.body);
    else {
      const conflict = responses.find(response => response.status !== 201)!;
      expect(conflict.body).toEqual({ statusCode: scenario === "distinct report ids" ? 409 : 403,
        code: scenario === "distinct report ids" ? "DIAGNOSTIC_REINSPECTION_CONFLICT" : "DIAGNOSTIC_NO_ACCESS",
        message: "Inspection request could not be completed", timestamp: "2026-10-21T12:00:00.000Z", requestId: "unknown" });
    }
    const after = await stored(p);
    expect(after.orders).toEqual(before.orders);
    expect(after.reports.filter(row => row.orderId === p.a.id)).toEqual(before.reports);
    expect(after.reports.filter(row => row.orderId === p.b.id)).toHaveLength(1);
    expect(await db.diagnosticReportRecord.count({ where: { predecessorId: p.released.id } })).toBe(1);
    const proofsAfter = await db.diagnosticContinuityProof.findMany({ where: { candidateOrderId: p.b.id }, orderBy: { id: "asc" } });
    expect(proofsAfter.filter(row => row.consumedReportId !== null)).toHaveLength(1);
    expect(proofsAfter.find(row => row.id === winningInput.proofId)).toEqual({ ...proofsBefore.find(row => row.id === winningInput.proofId), consumedReportId: winningInput.reportId, consumedAt: initialTime });
    for (const unused of proofsBefore.filter(row => row.id !== winningInput.proofId)) expect(proofsAfter.find(row => row.id === unused.id)).toEqual({ ...unused, invalidatedAt: expect.any(Date) });
    const addedAudits = after.audits.filter(row => !before.audits.some(prior => prior.id === row.id));
    expect(addedAudits.map(row => row.action).sort()).toEqual(["CONTINUITY_PROOF_CONSUMED", "REPORT_REINSPECTION_CREATED"]);
    for (const audit of addedAudits) expect(audit).toMatchObject({ orderId: p.b.id, actorId: suite.id("technician"), details: { reportId: winningInput.reportId } });
    expect((await get("technician", `orders/${p.b.id}/reports`).expect(200)).body).toEqual([result.body]);
    expect((await post("technician", `orders/${p.b.id}/reinspections`, winningInput).expect(201)).body).toEqual(result.body);
    expect(await stored(p)).toEqual(after);
    expect(await db.diagnosticContinuityProof.findMany({ where: { candidateOrderId: p.b.id }, orderBy: { id: "asc" } })).toEqual(proofsAfter);
  });

  it.each(["REPORT_REINSPECTION_CREATED", "CONTINUITY_PROOF_CONSUMED"] as const)("rolls back all private consumption writes when the exact %s audit INSERT fails", async action => {
    const p = await pair();
    const proofId = await ordinaryProof(p);
    const input = reinspectionInput(p, proofId);
    const databases = inject("apiTestDatabases");
    if (!databases) throw new Error("Consumption audit fault requires the hosted per-worker test database");
    const worker = Number(process.env["VITEST_POOL_ID"]);
    expect(Number.isInteger(worker) && worker >= 1 && worker <= databases.workers).toBe(true);
    expect(await db.$queryRaw`SELECT current_database() AS name`).toEqual([{ name: workerDatabaseName(databases.prefix, worker) }]);
    const proofs = () => db.diagnosticContinuityProof.findMany({ where: { candidateOrderId: p.b.id }, orderBy: { id: "asc" } });
    const before = { ...await stored(p), proofs: await proofs() };
    expect(before.proofs).toHaveLength(1);
    expect(before.proofs[0]).toMatchObject({ consumedAt: null, consumedReportId: null });
    for (const id of [p.a.id, p.b.id, p.released.id, proofId, input.reportId, centerId, suite.id("technician")]) expect(id).toMatch(uuid);
    const namespace = `consume914_${p.b.id.replaceAll("-", "")}`;
    const triggerName = `${namespace}_audit`;
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${namespace}"`);
      await tx.$executeRawUnsafe(`CREATE SEQUENCE "${namespace}".audit_reached`);
      await tx.$executeRawUnsafe(`CREATE FUNCTION "${namespace}".refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF EXISTS (SELECT 1 FROM public.diagnostic_continuity_proofs
              WHERE id = '${proofId}' AND "consumedReportId" = '${input.reportId}' AND "consumedAt" IS NOT NULL)
            AND EXISTS (SELECT 1 FROM public.diagnostic_reports
              WHERE id = '${input.reportId}' AND "orderId" = '${p.b.id}' AND "predecessorId" = '${p.released.id}') THEN
            PERFORM nextval('"${namespace}".audit_reached');
          END IF;
          RAISE EXCEPTION 'issue914 exact consumption audit INSERT fault';
        END $$`);
      await tx.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON public.diagnostic_audits
        FOR EACH ROW WHEN (NEW."orderId" = '${p.b.id}' AND NEW."centerId" = '${centerId}'
          AND NEW."actorId" = '${suite.id("technician")}' AND NEW.action = '${action}'
          AND NEW.details->>'reportId' = '${input.reportId}')
        EXECUTE FUNCTION "${namespace}".refuse_audit()`);
    });
    try {
      expect(await db.$queryRawUnsafe(`SELECT is_called FROM "${namespace}".audit_reached`)).toEqual([{ is_called: false }]);
      const response = await post("technician", `orders/${p.b.id}/reinspections`, input);
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ statusCode: 500, code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred",
        timestamp: "2026-10-21T12:00:00.000Z", requestId: "unknown" });
      for (const secret of [namespace, action, proofId, input.reportId, p.released.id, p.ia.observationHash, p.ib.observationHash, p.body.rationale]) expect(response.text).not.toContain(secret);
      expect(await db.$queryRawUnsafe(`SELECT last_value::int, is_called FROM "${namespace}".audit_reached`)).toEqual([{ last_value: 1, is_called: true }]);
      expect({ ...await stored(p), proofs: await proofs() }).toEqual(before);
      expect(await db.diagnosticReportRecord.count({ where: { OR: [{ id: input.reportId }, { predecessorId: p.released.id }, { orderId: p.b.id }] } })).toBe(0);
    } finally {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON public.diagnostic_audits`);
        await tx.$executeRawUnsafe(`DROP FUNCTION "${namespace}".refuse_audit()`);
        await tx.$executeRawUnsafe(`DROP SEQUENCE "${namespace}".audit_reached`);
        await tx.$executeRawUnsafe(`DROP SCHEMA "${namespace}"`);
      });
    }
    expect(await db.$queryRaw`SELECT nspname FROM pg_namespace WHERE nspname = ${namespace}`).toEqual([]);
    expect((await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201)).body).toMatchObject({ id: input.reportId, successorOf: p.released.id, findings: [] });
  });

});
