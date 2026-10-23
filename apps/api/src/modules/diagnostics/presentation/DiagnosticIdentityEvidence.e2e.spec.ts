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
import { DIAGNOSTIC_OBJECTS, type DiagnosticObjects } from "../domain/ports/DiagnosticObjects";

const suite = defineE2eSuite("diagnostic-identity-evidence-http");
const people = ["buyer", "other", "reception", "technician", "technicianB", "reviewer", "reviewerA", "reviewerB", "unassigned", "admin"] as const;
type Person = typeof people[number];
const capability: Partial<Record<Person, string>> = { reception: "diagnostics.reception", technician: "diagnostics.technician",
  technicianB: "diagnostics.technician", reviewer: "diagnostics.reviewer", reviewerA: "diagnostics.reviewer", reviewerB: "diagnostics.reviewer", unassigned: "diagnostics.technician" };
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
const corrected: Observation = { ...original, observedAt: "2026-10-21T10:30:00.000Z", mileageKm: 123001, manualReference: "Synthetic fixture, corrected transcription 014" };
const explanation = "Transcribed 014 as 041; new close-up shows 014";
const identifier = (provenanceId: string, value = "SYN-CHASSIS-041") => ({ kind: "chassis_stamp", location: "Right frame rail", value, provenanceIds: [provenanceId] });
const metadata = (id: string, image: Image = red) => ({ id, sha256: image.sha256, mime: "image/webp", sizeBytes: image.sizeBytes });
const privateNoStore = (response: { headers: Record<string, string> }) => {
  expect(response.headers["cache-control"]).toContain("private");
  expect(response.headers["cache-control"]).toContain("no-store");
};
const deniedBody = { statusCode: 403, code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection request could not be completed", timestamp: expect.any(String), requestId: "unknown" };

/** Prepared RED only. Real HTTP, PostgreSQL, current identity authority and private S3 adapter.
 * No proof issuance, consumption, transfer or fabricated diagnostic persistence. */
describe("classified physical identity evidence and explicit correction history", () => {
  let app: NestFastifyApplication; let db: PrismaService; let jwt: JwtService;
  let request: ReturnType<typeof supertest>; let objects: S3Client; let storage: DiagnosticObjects;
  let templateId: string; let now = initialTime;
  const ownedProvenance = new Set<string>();
  const headers = (who: Person) => ({ authorization: `Bearer ${jwt.sign({ sub: suite.id(who), sid: suite.id(`${who}-session`), role: who === "admin" ? "admin" : "buyer" })}` });
  const post = (who: Person, path: string, body: object) => request.post(`/api/v1/diagnostics/${path}`).set(headers(who)).send(body);
  const get = (who: Person, path: string) => request.get(`/api/v1/diagnostics/${path}`).set(headers(who));
  const evidencePath = (o: Order) => `orders/${o.id}/identity-evidence`;
  const provenancePath = (o: Order, id?: string) => `orders/${o.id}/identity-provenance${id ? `/${id}` : ""}`;
  const comparisonPath = (b: Order, reportId: string) => `orders/${b.id}/reinspection-comparison?predecessorId=${reportId}`;
  const comparativeBytes = (b: Order, reportId: string, p: string) => `orders/${b.id}/reinspection-comparison/provenance/${p}?predecessorId=${reportId}`;
  const history = async (o: Order): Promise<Raw[]> => (await get("technician", `orders/${o.id}/identity-records`).expect(200)).body;
  const version = async (o: Order) => (await get("technician", `orders/${o.id}`).expect(200)).body.version as number;
  async function cleanup() {
    if (!db) return;
    // Exact owned keys only. Never list/delete a shared bucket or another suite's prefix.
    for (const id of ownedProvenance) for (const image of [red, blue]) {
      await objects.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: `diagnostic-evidence/${id}/${image.sha256}` }));
    }
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
    await db.listing.deleteMany({ where: { sellerId: suite.id("buyer") } });
    await cleanSuiteFixtures(db, suite, { userAliases: people });
  }
  beforeAll(async () => {
    const testing = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, load: [() => ({ DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private" })] }),
      EventEmitterModule.forRoot(), bullTestRoot(), DiagnosticsModule, JwtModule.register({ global: true, secret: "synthetic-diagnostic-test" })] })
      .overrideProvider(IDENTITY_CLOCK_PORT).useValue({ now: () => now })
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => now, id: randomUUID, publicSyntheticAllowed: () => true,
        syntheticAllowed: ({ userId }: { userId: string }) => people.some(who => suite.id(who) === userId) }).compile();
    app = testing.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    db = app.get(PrismaService); jwt = app.get(JwtService); storage = app.get(DIAGNOSTIC_OBJECTS);
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
    objects = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000", region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
    try { await objects.send(new CreateBucketCommand({ Bucket: "diagnostic-test-private" })); }
    catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 409) throw error; }
    await cleanup();
    for (const who of people) {
      await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), role: who === "admin" ? "admin" : "buyer", phoneVerifiedAt: now } });
      await db.session.create({ data: { id: suite.id(`${who}-session`), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: future, adminTotpExpiresAt: future } });
      if (capability[who]) await db.staffGrant.create({ data: { userId: suite.id(who), capability: capability[who]! } });
    }
    await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("center"), names: localized } });
    for (const who of people) if (capability[who]) await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id(who), capability: capability[who]!, qualifiedUntil: future } });
    await db.staffGrant.create({ data: { userId: suite.id("reception"), capability: "diagnostics.templates" } });
    await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: future } });
    await seedSuiteCatalog(db, suite);
    await db.listing.create({ data: { id: suite.id("car"), sellerId: suite.id("buyer"), brandId: suite.catalog.brandId, modelId: suite.catalog.modelId,
      cityId: suite.catalog.cityId, status: "active", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    const definition = { title: localized, limitations: localized, syntheticNotice: localized,
      checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
    templateId = (await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true }).expect(201)).body.id;
  });
  afterAll(async () => { try { await cleanup(); } finally { objects?.destroy(); await app?.close(); } });
  async function visit(observation: Observation = original, staff: Person[] = ["technician", "reviewer", "reviewerA"], audience = "buyer_private"): Promise<Order> {
    let { body: order } = await post("buyer", "orders", { requestKey: randomUUID(), centerId, templateVersionId: templateId, audience,
      ...(audience === "listing_public" ? { listingId: suite.id("car") } : {}), synthetic: true }).expect(201);
    for (const who of staff) ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version, userId: suite.id(who), capability: capability[who], active: true }).expect(201));
    for (const kind of audience === "listing_public" ? ["physical", "publication"] : ["physical"]) {
      ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind, authorityReference: `Synthetic ${kind} authorization` }).expect(201));
    }
    for (const state of ["confirmed", "arrived"]) ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201));
    ({ body: order } = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: order.version, ...observation }).expect(201));
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
  async function append(o: Order, raw: Raw, input: ReturnType<typeof capture>, image: Image = red) {
    const response = await post("technician", evidencePath(o), input).expect(201);
    privateNoStore(response);
    expect(response.body).toEqual({ id: input.id, orderId: o.id, orderVersion: o.version + 1, identityRecordId: raw.id,
      observationHash: raw.observationHash, observation: raw.observation, identifiers: input.identifiers,
      provenance: input.identifiers[0]!.provenanceIds.map(id => metadata(id, image)), rights, correction: input.correction,
      recordHash: expect.stringMatching(/^[a-f0-9]{64}$/), recordedBy: suite.id("technician"), recordedAt: now.toISOString() });
    o.version += 1;
    expect(await version(o)).toBe(o.version);
    return response.body;
  }
  async function release(o: Order, duringDraft?: () => Promise<void>) {
    const { body: draft } = await post("technician", `orders/${o.id}/reports`, { reportId: randomUUID(), expectedOrderVersion: o.version }).expect(201);
    if (duringDraft) await duringDraft();
    const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    await post("technician", `reports/${draft.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${draft.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${draft.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
    return (await get("reviewer", `reports/${draft.id}`).expect(200)).body;
  }
  async function bytes(who: Person, path: string, image: Image = red) {
    const response = await get(who, path).expect(200);
    privateNoStore(response); expect(response.headers["content-type"]).toContain("image/webp");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(response.body).toString("base64")).toBe(image.output);
  }
  async function denied(who: Person, path: string) {
    const response = await get(who, path).expect(403);
    privateNoStore(response); expect(response.body).toEqual(deniedBody);
  }
  async function error(response: PromiseLike<supertest.Response>, status: number, code: string) {
    const result = await response;
    expect(result.status).toBe(status); privateNoStore(result);
    expect(result.body).toEqual({ statusCode: status, code, message: code === "DIAGNOSTIC_INVALID_INPUT" ? "Invalid diagnostic request" : "Inspection request could not be completed",
      timestamp: expect.any(String), requestId: "unknown" });
  }

  it("stages before collection, preserves E0 and its first-draft report pin, and exposes only explicit corrections", async () => {
    const a = await visit(original, undefined, "listing_public");
    const p0 = suite.id("journey-p0");
    // FIRST NEW ASSERTION. Absent at supplied base: root must observe 404 versus 201.
    await stage(a, p0);
    await stage(a, p0); // identical classified intent is read-only
    expect(await version(a)).toBe(a.version);
    const verified0 = await upload(a, p0).expect(200);
    privateNoStore(verified0); expect(verified0.body).toEqual({ ...metadata(p0), state: "verified" });
    expect((await upload(a, p0).expect(200)).body).toEqual(verified0.body);
    await bytes("technician", provenancePath(a, p0));
    const [i0] = await history(a);
    expect(i0).toEqual({ id: expect.stringMatching(/^[a-f0-9-]{36}$/), orderId: a.id, orderVersion: a.version,
      observationHash: expect.stringMatching(/^[a-f0-9]{64}$/), observation: original, recordedBy: suite.id("technician"), recordedAt: initialTime.toISOString() });
    const beforeRaw = await history(a);
    const input0 = capture(a, i0!, p0, "SYN-CHASSIS-041", null, suite.id("journey-e0"));
    const e0 = await append(a, i0!, input0);
    expect((await post("technician", evidencePath(a), input0).expect(201)).body).toEqual(e0);
    expect((await get("technician", evidencePath(a)).expect(200)).body).toEqual([e0]);
    expect(await history(a)).toEqual(beforeRaw); expect(await version(a)).toBe(e0.orderVersion);
    await error(post("technician", evidencePath(a), { ...input0, identifiers: [identifier(p0, "CHANGED")] }), 409, "DIAGNOSTIC_EVIDENCE_CONFLICT");

    let i1: Raw;
    // Raw reobservation during the draft must not move its original observation pin.
    const released = await release(a, async () => {
      const updated = await post("technician", `orders/${a.id}/vehicle`, { expectedVersion: a.version, ...corrected }).expect(201);
      a.version = updated.body.version; i1 = (await history(a))[1]!;
    });
    const commissionerBefore = (await get("buyer", `reports/${released.id}`).expect(200)).body;
    const publicBefore = (await request.get(`/api/v1/public-diagnostics/reports/${released.id}`).expect(200)).body;
    const documentsBefore = (await get("buyer", `reports/${released.id}/documents`).expect(200)).body;
    const b = await visit(corrected, ["technician", "technicianB", "reviewer", "reviewerB"]);
    const [ib] = await history(b); const pb = suite.id("journey-pb"); await verified(b, pb, blue);
    const eb = await append(b, ib!, capture(b, ib!, pb, "SYN-CHASSIS-014"), blue);
    const beforeCorrection = await get("reviewer", comparisonPath(b, released.id)).expect(200);
    privateNoStore(beforeCorrection);
    expect(beforeCorrection.body).toEqual({ predecessor: { reportId: released.id, reportVersion: 3, snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      identityRecordId: i0!.id, identityRecordHash: i0!.observationHash,
      identity: { observation: original, evidence: e0, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } },
    candidate: { orderId: b.id, orderVersion: b.version, identityRecordId: ib!.id, identityRecordHash: ib!.observationHash,
      identity: { observation: corrected, evidence: eb, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } } });
    const p1 = suite.id("journey-p1"); await verified(a, p1, blue);
    const e1 = await append(a, i1!, capture(a, i1!, p1, "SYN-CHASSIS-014", { supersedesId: e0.id, explanation }, suite.id("journey-e1")), blue);
    expect(e1.recordHash).not.toBe(e0.recordHash);
    expect((await get("reviewer", evidencePath(a)).expect(200)).body).toEqual([e0, e1]);
    expect(await history(a)).toEqual([...beforeRaw, i1!]);
    const unrelated = { ...corrected, manualReference: "Unrelated later observation must not explain E0", mileageKm: 123099 };
    a.version = (await post("technician", `orders/${a.id}/vehicle`, { expectedVersion: a.version, ...unrelated }).expect(201)).body.version;
    const i2 = (await history(a))[2]!;
    const p2 = suite.id("journey-unrelated-p2"); await verified(a, p2);
    const e2 = await append(a, i2, capture(a, i2, p2, "UNRELATED-ROOT"));
    const comparison = await get("reviewer", comparisonPath(b, released.id)).expect(200); privateNoStore(comparison);
    expect(comparison.body).toEqual({ predecessor: { reportId: released.id, reportVersion: 3, snapshotHash: beforeCorrection.body.predecessor.snapshotHash,
      identityRecordId: i0!.id, identityRecordHash: i0!.observationHash,
      identity: { observation: original, evidence: e0, corrections: [e1!], evidenceGeneration: 3, correctionHeadHash: e1!.recordHash } },
    candidate: { orderId: b.id, orderVersion: b.version, identityRecordId: ib!.id, identityRecordHash: ib!.observationHash,
      identity: { observation: corrected, evidence: eb, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } } });
    const pinned = comparison.body;
    const serialized = JSON.stringify(pinned);
    for (const secret of [i2.id, i2.observationHash, e2.id, e2.recordHash, unrelated.manualReference, "UNRELATED-ROOT", p2]) expect(serialized).not.toContain(secret);
    await bytes("reviewer", comparativeBytes(b, released.id, p0));
    await bytes("reviewer", comparativeBytes(b, released.id, suite.id("journey-p1")), blue);
    await denied("reviewer", comparativeBytes(b, released.id, p2));
    expect((await get("reviewer", `reports/${released.id}`).expect(200)).body).toEqual(released);
    expect((await get("buyer", `reports/${released.id}`).expect(200)).body).toEqual(commissionerBefore);
    expect((await request.get(`/api/v1/public-diagnostics/reports/${released.id}`).expect(200)).body).toEqual(publicBefore);
    expect((await get("buyer", `reports/${released.id}/documents`).expect(200)).body).toEqual(documentsBefore);
    expect(released).toMatchObject({ observedAt: original.observedAt, mileageKm: 123000 });
    for (const body of [released, commissionerBefore, publicBefore, documentsBefore, (await get("buyer", `orders/${a.id}/reports`).expect(200)).body]) {
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/identityRecordId|identityRecordHash|observationHash|snapshotHash|recordHash|provenance|correctionHeadHash|evidenceGeneration|manualReference|supplierRestrictions/);
      for (const value of [i0!.id, i0!.observationHash, i1!.id, i1!.observationHash, original.manualReference!, corrected.manualReference!, p0, e0.id, e0.recordHash, e1!.id, e1!.recordHash, red.sha256, blue.sha256, explanation, "SYN-CHASSIS-041", "SYN-CHASSIS-014"]) expect(text).not.toContain(value);
    }
    const { body: editorial } = await post("technician", `reports/${released.id}/corrections`, { expectedVersion: 3, successorId: randomUUID(), reason: "Synthetic editorial correction" }).expect(201);
    await post("technician", `reports/${editorial.id}/transition`, { expectedVersion: 0, action: "submit" }).expect(201);
    await post("reviewer", `reports/${editorial.id}/transition`, { expectedVersion: 1, action: "finalize" }).expect(201);
    const inherited = await get("reviewer", comparisonPath(b, editorial.id)).expect(200);
    expect(inherited.body).toEqual({ predecessor: { ...pinned.predecessor, reportId: editorial.id, reportVersion: 2, snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/) }, candidate: pinned.candidate });
    expect(inherited.body.predecessor.snapshotHash).not.toBe(pinned.predecessor.snapshotHash);
    expect((await get("reviewer", comparisonPath(b, released.id)).expect(200)).body).toEqual(pinned);
    for (const who of ["technicianB", "reviewerA", "reviewerB", "buyer", "admin", "other", "unassigned"] as const) {
      for (const reportId of [released.id, suite.id("unknown-report")]) {
        await denied(who, comparisonPath(b, reportId)); await denied(who, comparativeBytes(b, reportId, p0));
        await denied(who, comparativeBytes(b, reportId, suite.id("unknown-provenance")));
      }
    }
    for (const who of ["buyer", "other", "admin", "unassigned", "technicianB"] as const) {
      await denied(who, evidencePath(a)); await denied(who, provenancePath(a, p0));
      await denied(who, provenancePath(a, suite.id("unknown-provenance")));
    }
    const sameJwt = headers("reviewer");
    await post("reception", `orders/${a.id}/assignments`, { expectedVersion: a.version, userId: suite.id("reviewer"), capability: capability.reviewer, active: false }).expect(201);
    const revoked = await request.get(`/api/v1/diagnostics/${comparisonPath(b, released.id)}`).set(sameJwt).expect(403);
    privateNoStore(revoked); expect(revoked.body).toEqual(deniedBody);
    await denied("reviewer", comparativeBytes(b, released.id, p0));
    expect((await get("technician", comparisonPath(b, released.id)).expect(200)).body).toEqual(pinned);
  });

  it("rejects strict invalid collection bodies and invalid provenance without changing observation, version or evidence", async () => {
    const a = await visit(); const [raw] = await history(a);
    const p = suite.id("validation-p"); await verified(a, p);
    const input = capture(a, raw!, p);
    const beforeRaw = await history(a); const beforeVersion = a.version;
    const badRights = [ { ...rights, extra: true }, { ...rights, purpose: " " }, { ...rights, basis: "" }, { ...rights, provenance: "" },
      { ...rights, category: "customer_document" }, { ...rights, identifiability: "anonymous" }, { ...rights, use: ["service", "export"] },
      { ...rights, schedule: { ...rights.schedule, extra: true } }, { ...rights, schedule: { ...rights.schedule, reason: " " } },
      { ...rights, schedule: { kind: "forever" } }, { ...rights, hold: { reason: "Caller cannot grant a hold" } } ];
    const validIntent = intent(a, suite.id("invalid-intent"));
    const invalidStages = [ { ...validIntent, synthetic: true }, { ...validIntent, audience: "staff_only" }, { ...validIntent, actor: suite.id("technician") },
      { ...validIntent, sha256: red.sha256 }, { ...validIntent, sizeBytes: 0 }, { ...validIntent, sizeBytes: 10 * 1024 * 1024 + 1 },
      { ...validIntent, contentType: "application/pdf" }, { ...validIntent, rights: {} }, ...badRights.map(value => ({ ...validIntent, rights: value })) ];
    const invalidEvidence = [ { ...input, audience: "staff_only" }, { ...input, recordHash: red.sha256 }, { ...input, recordedBy: suite.id("reviewer") },
      { ...input, identifiers: [] }, { ...input, identifiers: Array.from({ length: 21 }, () => identifier(p)) },
      { ...input, identifiers: [{ ...identifier(p), extra: true }] }, { ...input, identifiers: [{ ...identifier(p), kind: "registration_document" }] },
      { ...input, identifiers: [{ ...identifier(p), location: " " }] }, { ...input, identifiers: [{ ...identifier(p), location: "x".repeat(301) }] },
      { ...input, identifiers: [{ ...identifier(p), value: " " }] }, { ...input, identifiers: [{ ...identifier(p), value: "x".repeat(501) }] },
      { ...input, identifiers: [identifier(p), identifier(p)] }, { ...input, identifiers: [{ ...identifier(p), provenanceIds: [] }] },
      { ...input, identifiers: [{ ...identifier(p), provenanceIds: [p, p] }] }, { ...input, identifiers: [identifier("https://invalid.example/chassis.png")] },
      { ...input, correction: { supersedesId: randomUUID(), explanation: " " } },
      { ...input, correction: { supersedesId: randomUUID(), explanation: "x".repeat(1001) } },
      { ...input, correction: { supersedesId: randomUUID(), explanation, extra: true } },
      { ...input, rights: {} }, ...badRights.map(value => ({ ...input, rights: value })) ];
    // Strict syntax response is independent of whether the addressed order exists.
    for (const target of [a, { id: suite.id("unknown-order"), version: a.version }]) {
      for (const body of invalidStages) await error(post("technician", provenancePath(target), body), 400, "DIAGNOSTIC_INVALID_INPUT");
      for (const body of invalidEvidence) await error(post("technician", evidencePath(target), body), 400, "DIAGNOSTIC_INVALID_INPUT");
    }
    const unverified = suite.id("validation-staged"); await stage(a, unverified);
    const b = await visit(); const foreign = suite.id("validation-foreign"); await verified(b, foreign);
    for (const provenanceId of [suite.id("missing-provenance"), unverified, foreign]) {
      await error(post("technician", evidencePath(a), { ...input, identifiers: [identifier(provenanceId)] }), 403, "DIAGNOSTIC_NO_ACCESS");
    }
    await error(post("technician", evidencePath(a), { ...input, rights: { ...rights, schedule: { ...rights.schedule, until: "2026-10-20T00:00:00.000Z" } } }), 403, "DIAGNOSTIC_NO_ACCESS");
    await error(post("technician", provenancePath(a), { ...validIntent, rights: { ...rights, schedule: { ...rights.schedule, until: "2026-10-20T00:00:00.000Z" } } }), 403, "DIAGNOSTIC_NO_ACCESS");
    // Missing classification does not create an intent; it cannot be bypassed with binary upload.
    const { rights: omittedRights, ...withoutRights } = validIntent;
    expect(omittedRights).toEqual(rights);
    await error(post("technician", provenancePath(a), withoutRights), 400, "DIAGNOSTIC_INVALID_INPUT");
    await error(upload(a, validIntent.id), 403, "DIAGNOSTIC_NO_ACCESS");
    for (const who of ["reviewer", "reception", "buyer", "admin", "unassigned"] as const) {
      await error(post(who, provenancePath(a), validIntent), 403, "DIAGNOSTIC_NO_ACCESS");
      await error(post(who, evidencePath(a), input), 403, "DIAGNOSTIC_NO_ACCESS");
      await error(post(who, evidencePath(a), { ...input, expectedOrderVersion: 0, identifiers: [identifier(suite.id("missing-provenance"))] }), 403, "DIAGNOSTIC_NO_ACCESS");
      await error(post(who, provenancePath({ id: suite.id("unknown-order"), version: a.version }), validIntent), 403, "DIAGNOSTIC_NO_ACCESS");
    }
    expect((await get("technician", evidencePath(a)).expect(200)).body).toEqual([]);
    expect(await version(a)).toBe(beforeVersion); expect(await history(a)).toEqual(beforeRaw);
  });

  it("keeps intent and upload retries immutable and refuses mismatched binary content or strict query fields", async () => {
    const a = await visit(); const p = suite.id("binary-p"); await stage(a, p);
    await error(post("technician", provenancePath(a), intent(a, p, blue)), 409, "DIAGNOSTIC_EVIDENCE_CONFLICT");
    const put = (query: string, body: Buffer, mime = "image/png") => request.put(`/api/v1/diagnostics/${provenancePath(a, p)}?${query}`)
      .set(headers("technician")).set("content-type", "application/octet-stream").set("x-evidence-type", mime).send(body);
    await error(put(`expectedOrderVersion=${a.version}&extra=true`, Buffer.from(red.input, "base64")), 400, "DIAGNOSTIC_INVALID_INPUT");
    await error(put(`expectedOrderVersion=${a.version}`, Buffer.alloc(95, 65)), 400, "REPORT_EVIDENCE_INVALID");
    await error(put(`expectedOrderVersion=${a.version}`, Buffer.from(red.input, "base64"), "image/jpeg"), 400, "REPORT_EVIDENCE_INVALID");
    await error(put(`expectedOrderVersion=${a.version}`, Buffer.from(red.input, "base64").subarray(0, 94)), 400, "REPORT_EVIDENCE_INVALID");
    await denied("technician", provenancePath(a, p));
    const expected = { ...metadata(p), state: "verified" };
    expect((await upload(a, p).expect(200)).body).toEqual(expected);
    expect((await upload(a, p).expect(200)).body).toEqual(expected);
    // A second valid PNG of the same declared input size sanitizes to different bytes.
    // PNG permits trailing data; pad blue's 94 input bytes to the staged 95 bytes.
    await error(put(`expectedOrderVersion=${a.version}`, Buffer.concat([Buffer.from(blue.input, "base64"), Buffer.from([0])])), 409, "DIAGNOSTIC_EVIDENCE_CONFLICT");
    await bytes("technician", provenancePath(a, p));
    expect(await version(a)).toBe(a.version);
  });

  it("allows one correction winner, makes exact stale retries read-only and leaves no partial losing append", async () => {
    const a = await visit(); const [i0] = await history(a); const p0 = suite.id("race-p0"); await verified(a, p0);
    const rootInput = capture(a, i0!, p0); const e0 = await append(a, i0!, rootInput);
    const p1 = suite.id("race-p1"); const p2 = suite.id("race-p2"); await verified(a, p1, blue); await verified(a, p2, blue);
    const left = capture(a, i0!, p1, "SYN-CHASSIS-014", { supersedesId: e0.id, explanation });
    const right = capture(a, i0!, p2, "SYN-CHASSIS-014", { supersedesId: e0.id, explanation });
    await error(post("technician", evidencePath(a), { ...left, expectedOrderVersion: a.version - 1 }), 409, "DIAGNOSTIC_STALE_VERSION");
    const beforeRaw = await history(a); const beforeVersion = a.version;
    const outcomes = await Promise.all([post("technician", evidencePath(a), left), post("technician", evidencePath(a), right)]);
    expect(outcomes.map(result => result.status).sort()).toEqual([201, 409]);
    const winnerIndex = outcomes.findIndex(result => result.status === 201);
    const winner = outcomes[winnerIndex]!; const loser = outcomes[1 - winnerIndex]!;
    privateNoStore(winner); await error(Promise.resolve(loser), 409, "DIAGNOSTIC_STALE_VERSION");
    const winnerInput = [left, right][winnerIndex]!; const loserInput = [left, right][1 - winnerIndex]!;
    expect(winner.body).toEqual({ id: winnerInput.id, orderId: a.id, orderVersion: beforeVersion + 1, identityRecordId: i0!.id,
      observationHash: i0!.observationHash, observation: original, identifiers: winnerInput.identifiers, provenance: [metadata(winnerInput.identifiers[0]!.provenanceIds[0]!, blue)],
      rights, correction: { supersedesId: e0.id, explanation }, recordHash: expect.stringMatching(/^[a-f0-9]{64}$/), recordedBy: suite.id("technician"), recordedAt: initialTime.toISOString() });
    a.version += 1;
    expect((await post("technician", evidencePath(a), winnerInput).expect(201)).body).toEqual(winner.body);
    expect((await post("technician", evidencePath(a), rootInput).expect(201)).body).toEqual(e0);
    await error(post("technician", evidencePath(a), { ...loserInput, expectedOrderVersion: a.version }), 409, "DIAGNOSTIC_STALE_VERSION");
    await error(post("technician", evidencePath(a), { ...winnerInput, rights: { ...rights, basis: "Changed retry" } }), 409, "DIAGNOSTIC_EVIDENCE_CONFLICT");
    // Reusing original provenance supplies no new supporting reference for a correction.
    await error(post("technician", evidencePath(a), capture(a, i0!, p0, "SYN-CHASSIS-014", { supersedesId: winner.body.id, explanation })), 403, "DIAGNOSTIC_NO_ACCESS");
    expect((await get("reviewer", evidencePath(a)).expect(200)).body).toEqual([e0, winner.body]);
    expect(await history(a)).toEqual(beforeRaw); expect(await version(a)).toBe(beforeVersion + 1);
  });

  it("retains contradictory physical evidence despite equal VIN and never treats manualReference as evidence or backfills an earlier report pin", async () => {
    const observed: Observation = { ...original, method: "vin", vin: "JTDBR32E720123456", manualReference: null };
    const a = await visit(observed); const [ia] = await history(a); const pa = suite.id("vin-pa"); await verified(a, pa);
    const ea = await append(a, ia!, capture(a, ia!, pa, "SYN-CHASSIS-014")); const released = await release(a);
    const b = await visit(observed); const [ib] = await history(b); const pb = suite.id("vin-pb"); await verified(b, pb, blue);
    const eb = await append(b, ib!, capture(b, ib!, pb, "SYN-CHASSIS-999"), blue);
    const compared = await get("reviewer", comparisonPath(b, released.id)).expect(200);
    expect(compared.body).toEqual({ predecessor: { reportId: released.id, reportVersion: 3, snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      identityRecordId: ia!.id, identityRecordHash: ia!.observationHash,
      identity: { observation: observed, evidence: ea, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } },
    candidate: { orderId: b.id, orderVersion: b.version, identityRecordId: ib!.id, identityRecordHash: ib!.observationHash,
      identity: { observation: observed, evidence: eb, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } } });
    expect(JSON.stringify(compared.body)).not.toMatch(/same_vehicle|proofId|resolved/);
    const manual = { ...original, manualReference: "same car as A" };
    const c = await visit(manual); const [ic] = await history(c);
    expect((await get("technician", evidencePath(c)).expect(200)).body).toEqual([]);
    const absent = { observation: manual, evidence: null, corrections: [], evidenceGeneration: 0, correctionHeadHash: null };
    const noEvidence = await get("reviewer", comparisonPath(c, released.id)).expect(200);
    expect(noEvidence.body.candidate).toEqual({ orderId: c.id, orderVersion: c.version, identityRecordId: ic!.id, identityRecordHash: ic!.observationHash, identity: absent });
    const earlyReport = await release(c); const before = (await get("buyer", `reports/${earlyReport.id}`).expect(200)).body;
    const pc = suite.id("late-pc"); await verified(c, pc); await append(c, ic!, capture(c, ic!, pc, "SYN-CHASSIS-014"));
    const oldPin = await get("reviewer", comparisonPath(b, earlyReport.id)).expect(200);
    expect(oldPin.body.predecessor).toEqual({ reportId: earlyReport.id, reportVersion: 3, snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      identityRecordId: ic!.id, identityRecordHash: ic!.observationHash, identity: { ...absent, evidenceGeneration: 1 } });
    expect((await get("buyer", `reports/${earlyReport.id}`).expect(200)).body).toEqual(before);
    // Issuance refusals belong to the later proof suite. Capture cannot manufacture a proof.
  });

  it("pins the structured leaf at first draft even when a correction is captured before release", async () => {
    const a = await visit(); const [ia] = await history(a); const pa = suite.id("draft-pa"); await verified(a, pa);
    const ea = await append(a, ia!, capture(a, ia!, pa));
    let later: typeof ea;
    const released = await release(a, async () => {
      const pb = suite.id("draft-pb"); await verified(a, pb, blue);
      later = await append(a, ia!, capture(a, ia!, pb, "SYN-CHASSIS-014", { supersedesId: ea.id, explanation }), blue);
    });
    const b = await visit(); const [ib] = await history(b); const pb0 = suite.id("draft-bp0"); await verified(b, pb0);
    const eb0 = await append(b, ib!, capture(b, ib!, pb0)); const pb1 = suite.id("draft-bp1"); await verified(b, pb1, blue);
    const eb1 = await append(b, ib!, capture(b, ib!, pb1, "SYN-CHASSIS-014", { supersedesId: eb0.id, explanation }), blue);
    const comparison = await get("reviewer", comparisonPath(b, released.id)).expect(200);
    expect(comparison.body.candidate.identity).toEqual({ observation: original, evidence: eb1, corrections: [eb0], evidenceGeneration: 2, correctionHeadHash: null });
    expect(comparison.body.predecessor.identity).toEqual({ observation: original, evidence: ea, corrections: [later!], evidenceGeneration: 2, correctionHeadHash: later!.recordHash });
    expect((await get("technician", evidencePath(a)).expect(200)).body).toEqual([ea, later!]);
  });

  it("returns a generic unavailable response without bytes, keys or upstream details when an authorized retained object is missing", async () => {
    const a = await visit(); const [ia] = await history(a); const pa = suite.id("unavailable-pa"); await verified(a, pa);
    await append(a, ia!, capture(a, ia!, pa)); const released = await release(a); const b = await visit();
    const key = `diagnostic-evidence/${pa}/${red.sha256}`;
    await objects.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: key }));
    for (const path of [provenancePath(a, pa), comparativeBytes(b, released.id, pa)]) {
      const response = await get("reviewer", path);
      await error(Promise.resolve(response), 503, "DIAGNOSTIC_EVIDENCE_UNAVAILABLE");
      for (const secret of [pa, red.sha256, red.output, key, "NoSuchKey", "S3", "MinIO"]) expect(response.text).not.toContain(secret);
      await denied("buyer", path);
    }
  });

  it("withholds actual private object bytes when the same JWT loses either-order authority during the read", async () => {
    const a = await visit(); const [ia] = await history(a); const pa = suite.id("held-pa"); await verified(a, pa); await append(a, ia!, capture(a, ia!, pa));
    const released = await release(a); const b = await visit();
    const sameJwt = headers("reviewer");
    for (const target of [a, b]) {
      let entered!: () => void; let resume!: () => void;
      const enteredRead = new Promise<void>(resolve => { entered = resolve; });
      const releaseRead = new Promise<void>(resolve => { resume = resolve; });
      const read = storage.read.bind(storage);
      // The real S3 read and integrity check complete before withholding its result.
      const held = vi.spyOn(storage, "read").mockImplementationOnce(async (...args) => {
        const result = await read(...args); entered(); await releaseRead; return result;
      });
      const path = comparativeBytes(b, released.id, pa);
      const pending = request.get(`/api/v1/diagnostics/${path}`).set(sameJwt).then(response => response);
      try {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([enteredRead, pending.then(response => { throw new Error(`Read completed before storage barrier: HTTP ${response.status}`); }),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Storage read barrier not reached")), 10_000); })]);
        } finally { clearTimeout(timer); }
        target.version = (await post("reception", `orders/${target.id}/assignments`, { expectedVersion: target.version,
          userId: suite.id("reviewer"), capability: capability.reviewer, active: false }).expect(201)).body.version;
      } finally { resume(); held.mockRestore(); await pending; }
      const withheld = await pending;
      await error(Promise.resolve(withheld), 403, "DIAGNOSTIC_NO_ACCESS");
      expect(withheld.headers["content-type"]).toContain("application/json");
      expect(withheld.text).not.toContain(red.output); expect(withheld.text).not.toContain(red.sha256);
      await denied("reviewer", comparativeBytes(b, released.id, suite.id("missing-held-p")));
      target.version = (await post("reception", `orders/${target.id}/assignments`, { expectedVersion: target.version,
        userId: suite.id("reviewer"), capability: capability.reviewer, active: true }).expect(201)).body.version;
      await bytes("reviewer", path);
    }
    // A revoked current Session also denies with the identical token, without byte disclosure.
    await db.session.delete({ where: { id: suite.id("reviewer-session") } });
    await error(request.get(`/api/v1/diagnostics/${provenancePath(a, pa)}`).set(sameJwt), 403, "DIAGNOSTIC_NO_ACCESS");
    await error(request.get(`/api/v1/diagnostics/${comparisonPath(b, released.id)}`).set(sameJwt), 403, "DIAGNOSTIC_NO_ACCESS");
    await db.session.create({ data: { id: suite.id("reviewer-session"), userId: suite.id("reviewer"), refreshTokenHash: suite.id("reviewer-refresh"), expiresAt: future, adminTotpExpiresAt: future } });
  });

  it("refuses retained bytes and exact retries after declared rights expire, and denies staff whose qualification expires", async () => {
    const a = await visit(); const [ia] = await history(a); const pa = suite.id("expiry-pa");
    const shortRights = { ...rights, schedule: { ...rights.schedule, until: "2026-10-22T00:00:00.000Z" } };
    await verified(a, pa, red, shortRights);
    const input = { ...capture(a, ia!, pa), rights: shortRights };
    const captured = await post("technician", evidencePath(a), input).expect(201); a.version += 1;
    expect(captured.body.rights).toEqual(shortRights);
    const released = await release(a); const b = await visit();
    await bytes("technician", provenancePath(a, pa));
    try {
      now = new Date("2026-10-22T00:00:00.000Z");
      await denied("technician", provenancePath(a, pa));
      await denied("reviewer", comparativeBytes(b, released.id, pa));
      await denied("reviewer", comparisonPath(b, released.id));
      await error(post("technician", evidencePath(a), input), 403, "DIAGNOSTIC_NO_ACCESS");
      await error(upload(a, pa), 403, "DIAGNOSTIC_NO_ACCESS");
      expect((await get("technician", evidencePath(a)).expect(200)).body).toEqual([]);
      const expired = capture(a, ia!, pa);
      await error(post("technician", evidencePath(a), expired), 403, "DIAGNOSTIC_NO_ACCESS");
    } finally { now = initialTime; }
    // Qualification is fixture authority, not fabricated diagnostic content.
    await db.diagnosticCenterAssignment.updateMany({ where: { centerId, userId: suite.id("reviewer"), capability: capability.reviewer! }, data: { qualifiedUntil: initialTime } });
    try {
      await denied("reviewer", comparisonPath(b, released.id)); await denied("reviewer", comparativeBytes(b, released.id, pa));
      await denied("reviewer", provenancePath(a, pa));
    } finally {
      await db.diagnosticCenterAssignment.updateMany({ where: { centerId, userId: suite.id("reviewer"), capability: capability.reviewer! }, data: { qualifiedUntil: future } });
    }
  });
});
