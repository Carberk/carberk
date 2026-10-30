import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { S3Client, CreateBucketCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaService } from "@auto-tm/db";
import sharp from "sharp";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME, type DiagnosticRuntime } from "../domain/ports/DiagnosticIntakePort";
import { DIAGNOSTIC_OBJECTS, type DiagnosticObjects } from "../domain/ports/DiagnosticObjects";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";

const suite = defineE2eSuite("diagnostic-report-authority");
const people = ["buyer", "other", "reception", "technician", "reviewer", "admin", "revisitTechnician"] as const;
type Person = typeof people[number];
const now = new Date("2026-10-18T00:00:00.000Z");
const future = new Date("2026-11-18T00:00:00.000Z");
const localized = { tk: "Synag", ru: "Тест", en: "Synthetic" };
const definition = { title: localized, limitations: localized, syntheticNotice: localized,
  checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
const capability: Partial<Record<Person, string>> = { reception: "diagnostics.reception", technician: "diagnostics.technician", reviewer: "diagnostics.reviewer", revisitTechnician: "diagnostics.technician" };
const centerId = suite.id("center");

/** Full HTTP/Prisma/identity/storage composition against disposable hosted services.
 * Templates, intake, observation, authorship and release are exercised through HTTP. */
describe("diagnostic authoring and immutable audience release", () => {
  let app: NestFastifyApplication; let db: PrismaService; let jwt: JwtService;
  let request: ReturnType<typeof supertest>; let objects: S3Client;
  const headers = (who: Person) => ({ authorization: `Bearer ${jwt.sign({ sub: suite.id(who), sid: suite.id(`${who}-session`), role: who === "admin" ? "admin" : "buyer" })}` });
  const post = (who: Person, path: string, body: object) => request.post(`/api/v1/diagnostics/${path}`).set(headers(who)).send(body);
  const get = (who: Person, path: string) => request.get(`/api/v1/diagnostics/${path}`).set(headers(who));
  const continuityOwned = { proofs: [] as string[], evidence: [] as string[], provenance: [] as string[], keys: new Set<string>() };
  const continuityMaterials = new Map<string, { rawId: string; provenanceId: string }>();
  async function cleanup() {
    if (!db) return;
    for (const key of continuityOwned.keys) {
      await objects.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: key }));
      await expect(objects.send(new HeadObjectCommand({ Bucket: "diagnostic-test-private", Key: key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
    }
    await db.diagnosticContinuityProof.deleteMany({ where: { id: { in: continuityOwned.proofs } } });
    const structured = await db.diagnosticIdentityEvidence.findMany({ where: { order: { centerId } }, select: { id: true } });
    const provenance = await db.diagnosticIdentityProvenance.findMany({ where: { order: { centerId } }, select: { id: true } });
    expect(structured.every(row => continuityOwned.evidence.includes(row.id)), "Unknown structured fixture descendant").toBe(true);
    expect(provenance.every(row => continuityOwned.provenance.includes(row.id)), "Unknown provenance fixture descendant").toBe(true);
    const reports = await db.diagnosticReportRecord.findMany({ where: { order: { centerId } }, orderBy: { createdAt: "desc" } });
    const evidence = await db.diagnosticEvidence.findMany({ where: { reportId: { in: reports.map(row => row.id) } } });
    for (const item of evidence) await objects.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: item.objectKey }));
    const artifacts = await db.diagnosticPdfArtifact.findMany({ where: { reportId: { in: reports.map(row => row.id) } } });
    for (const item of artifacts) await objects.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: item.objectKey }));
    await db.diagnosticPdfArtifact.deleteMany({ where: { reportId: { in: reports.map(row => row.id) } } });
    await db.diagnosticEvidence.deleteMany({ where: { id: { in: evidence.map(row => row.id) } } });
    // Corrections reference their predecessor, so retire leaves before roots.
    while (reports.length) {
      const leaf = reports.find(row => !reports.some(other => other.predecessorId === row.id));
      if (!leaf) throw new Error("Diagnostic fixture correction cycle");
      await db.diagnosticReportRecord.delete({ where: { id: leaf.id } }); reports.splice(reports.indexOf(leaf), 1);
    }
    await db.diagnosticAudit.deleteMany({ where: { centerId } });
    await db.diagnosticOrderAssignment.deleteMany({ where: { order: { centerId } } });
    await db.inspectionOrder.deleteMany({ where: { centerId } });
    continuityOwned.proofs.length = 0; continuityOwned.evidence.length = 0; continuityOwned.provenance.length = 0;
    continuityOwned.keys.clear(); continuityMaterials.clear();
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
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => now, id: randomUUID, publicSyntheticAllowed: () => true, syntheticAllowed: ({ userId }: { userId: string }) => people.some(who => suite.id(who) === userId) }).compile();
    app = testing.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    db = app.get(PrismaService); jwt = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
    objects = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000", region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
    try { await objects.send(new CreateBucketCommand({ Bucket: "diagnostic-test-private" })); }
    catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 409) throw error; }
  });
  afterAll(async () => { await cleanup(); objects?.destroy(); await app?.close(); });
  beforeEach(async () => {
    await cleanup();
    for (const who of people) {
      await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), role: who === "admin" ? "admin" : "buyer", phoneVerifiedAt: now } });
      await db.session.create({ data: { id: suite.id(`${who}-session`), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: future, adminTotpExpiresAt: future } });
      if (capability[who]) await db.staffGrant.create({ data: { userId: suite.id(who), capability: capability[who]! } });
    }
    await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("center"), names: localized } });
    for (const who of ["reception", "technician", "reviewer"] as const) await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id(who), capability: capability[who]!, qualifiedUntil: future } });
  });
  async function draft(audience: "buyer_private" | "listing_public" = "buyer_private") {
    if (audience === "listing_public") {
      await seedSuiteCatalog(db, suite);
      await db.listing.create({ data: { id: suite.id("public-car"), sellerId: suite.id("buyer"), brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, status: "active", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    }
    // The template publisher has distinct current authority; it does not inherit report access.
    await db.staffGrant.create({ data: { userId: suite.id("reception"), capability: "diagnostics.templates" } });
    await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: future } });
    const { body: template } = await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true }).expect(201);
    let { body: order } = await post("buyer", "orders", { requestKey: randomUUID(), centerId, templateVersionId: template.id, audience, ...(audience === "listing_public" ? { listingId: suite.id("public-car") } : {}), synthetic: true }).expect(201);
    for (const who of ["technician", "reviewer"] as const) ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version, userId: suite.id(who), capability: capability[who], active: true }).expect(201));
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind: "physical", authorityReference: "Synthetic customer authorization" }).expect(201));
    if (audience === "listing_public") ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind: "publication", authorityReference: "Synthetic separate public consent" }).expect(201));
    for (const state of ["confirmed", "arrived"]) ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201));
    ({ body: order } = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: order.version, observedAt: now.toISOString(), mileageKm: 123000, method: "manual", manualReference: "Synthetic vehicle", vin: null }).expect(201));
    const { body: report } = await post("technician", `orders/${order.id}/reports`, { reportId: randomUUID(), expectedOrderVersion: order.version }).expect(201);
    return { order, report };
  }
  it("finds only current assigned work and preserves the exact pinned template after newer publications", async () => {
    const { order } = await draft();
    for (let version = 1; version < 27; version++) await post("reception", `centers/${centerId}/templates`, { expectedVersion: version, definition, synthetic: true }).expect(201);
    const work = await get("technician", "assigned").expect(200);
    expect(work.body.map((item: { id: string }) => item.id)).toEqual([order.id]);
    const context = await get("technician", `orders/${order.id}/workspace`).expect(200);
    expect(context.body.template.id).toBe(order.templateVersionId);
    expect(context.body.capabilities).toEqual(["diagnostics.technician"]);
    expect(context.body.staffChoices).toEqual([]);
    const reception = await get("reception", `orders/${order.id}/workspace`).expect(200);
    expect(reception.body.staffChoices.some((item: { userId: string }) => item.userId === suite.id("reviewer"))).toBe(true);
    for (const who of ["buyer", "other", "admin"] as const) await get(who, `orders/${order.id}/workspace`).expect(403);
    await db.diagnosticCenterAssignment.updateMany({ where: { centerId, userId: suite.id("technician") }, data: { revokedAt: now } });
    expect((await get("technician", "assigned").expect(200)).body).toEqual([]);
    await get("technician", `orders/${order.id}/workspace`).expect(403);
  });
  const normal = () => ({ id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null });
  it("serializes edits, releases complete private readers separately from PDFs and rechecks revoked assignments", async () => {
    const { report, order } = await draft();
    for (const who of ["buyer", "other", "admin"] as const) await get(who, `reports/${report.id}`).expect(403);
    const finding = normal();
    const saves = await Promise.all([post("technician", `reports/${report.id}/findings`, { expectedVersion: 0, finding }), post("technician", `reports/${report.id}/findings`, { expectedVersion: 0, finding })]);
    expect(saves.map(row => row.status).sort()).toEqual([201, 409]);
    await post("technician", `reports/${report.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);
    const read = await get("buyer", `reports/${report.id}`).expect(200);
    expect(read.body.findings).toEqual([finding]); expect(read.body.authorId).toBeNull();
    expect((await db.diagnosticPdfArtifact.findMany({ where: { reportId: report.id }, orderBy: { locale: "asc" } })).map(row => [row.locale, row.state])).toEqual([["en", "pending"], ["ru", "pending"], ["tk", "pending"]]);
    for (const who of ["other", "admin"] as const) await get(who, `reports/${report.id}`).expect(403);
    await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version, userId: suite.id("technician"), capability: "diagnostics.technician", active: false }).expect(201);
    await get("technician", `reports/${report.id}`).expect(403);
  });
  it("preserves released bytes and observation facts across corrections and withdrawal", async () => {
    const { report } = await draft(); const finding = normal();
    await post("technician", `reports/${report.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${report.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);
    const before = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: report.id } });
    const correctionId = randomUUID();
    const correction = await post("technician", `reports/${report.id}/corrections`, { expectedVersion: 3, successorId: correctionId, reason: "Corrected explanation" }).expect(201);
    expect(correction.body).toMatchObject({ observedAt: now.toISOString(), mileageKm: 123000, successorOf: report.id, findings: [finding] });
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Association disputed" }).expect(201);
    const after = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: report.id } });
    expect(after.snapshot).toEqual(before.snapshot); expect(after.snapshotHash).toBe(before.snapshotHash);
    expect((await get("buyer", `reports/${report.id}`).expect(200)).body.status).toBe("withdrawn");
  });
  it("reports pending PDF honestly and denies known document requests to other audiences", async () => {
    const { report } = await draft();
    await post("technician", `reports/${report.id}/findings`, { expectedVersion: 0, finding: normal() }).expect(201);
    await post("technician", `reports/${report.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);
    const pending = await get("buyer", `reports/${report.id}/documents`).expect(200);
    expect(pending.body.map((item: { locale: string; state: string }) => [item.locale, item.state])).toEqual([["en", "pending"], ["ru", "pending"], ["tk", "pending"]]);
    expect(JSON.stringify(pending.body)).not.toMatch(/objectKey|sha256|diagnostic-pdf\//);
    const download = await get("buyer", `reports/${report.id}/documents/tk`).expect(409);
    expect(download.body.code).toBe("DIAGNOSTIC_PDF_NOT_READY");
    expect(download.headers["cache-control"]).toContain("no-store");
    for (const who of ["other", "admin"] as const) {
      await get(who, `reports/${report.id}/documents`).expect(403);
      await get(who, `reports/${report.id}/documents/tk`).expect(403);
    }
    await db.session.delete({ where: { id: suite.id("reviewer-session") } });
    await get("reviewer", `reports/${report.id}/documents/tk`).expect(403);
  });
  /** Existing download safeguards, now verified over real PostgreSQL, HTTP and
   * private S3 bytes. Only the storage port is wrapped to pause after real I/O. */
  async function readyDocument(audience: "buyer_private" | "listing_public" = "buyer_private") {
    const { report } = await draft(audience);
    await post("technician", `reports/${report.id}/findings`, { expectedVersion: 0, finding: normal() }).expect(201);
    await post("technician", `reports/${report.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);
    const storage = app.get<DiagnosticObjects>(DIAGNOSTIC_OBJECTS);
    const artifact = await db.diagnosticPdfArtifact.findFirstOrThrow({ where: { reportId: report.id, locale: "tk" } });
    const bytes = await readFile(resolve(__dirname, "../../../../../../docs/evidence/issue-916/pdf/short-tk.pdf"));
    await storage.put(artifact.objectKey, bytes, "application/pdf");
    await db.diagnosticPdfArtifact.update({ where: { id: artifact.id }, data: { state: "ready", sizeBytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), verifiedAt: now } });
    return { report, artifact, bytes, storage };
  }
  it("downloads exact verified PDF bytes privately and denies access after session revocation during storage I/O", async () => {
    const { report, bytes, storage } = await readyDocument();
    const downloaded = await get("buyer", `reports/${report.id}/documents/tk`).expect(200);
    expect(downloaded.headers["content-type"]).toContain("application/pdf");
    expect(downloaded.headers["cache-control"]).toContain("no-store");
    expect(downloaded.headers["content-disposition"]).toBe("attachment; filename=inspection-report.pdf");
    expect(Buffer.from(downloaded.body)).toEqual(bytes);
    const read = storage.read.bind(storage);
    const paused = vi.spyOn(storage, "read").mockImplementationOnce(async (...args) => {
      const result = await read(...args);
      await db.session.delete({ where: { id: suite.id("buyer-session") } });
      return result;
    });
    try {
      const denied = await get("buyer", `reports/${report.id}/documents/tk`).expect(403);
      expect(denied.headers["content-type"]).not.toContain("application/pdf");
      expect(denied.headers["cache-control"]).toContain("no-store");
    } finally { paused.mockRestore(); }
  });
  it("withholds public PDF bytes when the report is withdrawn during real storage I/O", async () => {
    const { report, bytes, storage } = await readyDocument("listing_public");
    const path = `/api/v1/public-diagnostics/reports/${report.id}/documents/tk`;
    const downloaded = await request.get(path).expect(200);
    expect(Buffer.from(downloaded.body)).toEqual(bytes);
    const read = storage.read.bind(storage);
    const paused = vi.spyOn(storage, "read").mockImplementationOnce(async (...args) => {
      const result = await read(...args);
      await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Synthetic withdrawal during download" }).expect(201);
      return result;
    });
    try {
      const denied = await request.get(path).expect(404);
      expect(denied.headers["content-type"]).not.toContain("application/pdf");
      expect(denied.headers["cache-control"]).toContain("no-store");
      expect(JSON.stringify(denied.body)).not.toContain(report.id);
    } finally { paused.mockRestore(); }
  });
  it("withholds downloaded bytes after the artifact generation epoch changes during storage I/O", async () => {
    const { report, artifact, storage } = await readyDocument();
    const read = storage.read.bind(storage);
    const paused = vi.spyOn(storage, "read").mockImplementationOnce(async (...args) => {
      const result = await read(...args);
      await db.diagnosticPdfArtifact.update({ where: { id: artifact.id }, data: { epoch: randomUUID() } });
      return result;
    });
    try {
      const denied = await get("buyer", `reports/${report.id}/documents/tk`).expect(409);
      expect(denied.body.code).toBe("DIAGNOSTIC_PDF_NOT_READY");
      expect(denied.headers["content-type"]).not.toContain("application/pdf");
    } finally { paused.mockRestore(); }
  });
  it("projects complete public findings only while the exact vehicle association remains eligible", async () => {
    const { report, order } = await draft("listing_public"); const finding = normal();
    const publicGet = (path: string) => request.get(`/api/v1/public-diagnostics/${path}`);
    await publicGet(`reports/${report.id}`).expect(404);
    await publicGet(`listings/${suite.id("public-car")}`).expect(404);
    await post("technician", `reports/${report.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${report.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);
    const availability = await publicGet(`listings/${suite.id("public-car")}`).expect(200);
    expect(availability.body).toEqual({ listingId: suite.id("public-car"), reportId: report.id, observedAt: now.toISOString(), mileageKm: 123000, synthetic: true });
    expect(availability.headers["cache-control"]).toContain("no-store");
    const reader = await publicGet(`reports/${report.id}`).expect(200);
    expect(reader.body).toMatchObject({ id: report.id, findings: [finding], authorId: null, reviewerId: null, status: "finalized" });
    expect(JSON.stringify(reader.body)).not.toMatch(/authorityReference|commissionerId|recordedBy|observedVehicle/);
    await db.listing.update({ where: { id: suite.id("public-car") }, data: { year: 2020 } });
    await publicGet(`listings/${suite.id("public-car")}`).expect(404);
    await publicGet(`reports/${report.id}`).expect(404);
    await db.listing.update({ where: { id: suite.id("public-car") }, data: { year: null } });
    await publicGet(`reports/${report.id}`).expect(404);
    const currentOrder = await get("technician", `orders/${order.id}`).expect(200);
    await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: currentOrder.body.version, observedAt: now.toISOString(), mileageKm: 123000, method: "manual", manualReference: "Synthetic identity revalidation", vin: null }).expect(201);
    await publicGet(`reports/${report.id}`).expect(200);
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Synthetic consent dispute" }).expect(201);
    await publicGet(`listings/${suite.id("public-car")}`).expect(404);
    await publicGet(`reports/${report.id}`).expect(404);
    expect((await get("buyer", `reports/${report.id}`).expect(200)).body.status).toBe("withdrawn");
  });
  /** One commissioner, one Listing and one matching VIN across two physical visits.
   * Each visit has its own intake, consent, arrival, observation and template pin. */
  const vin = "SYNTHVIN000000914";
  async function arrive(templateVersionId: string, audience: "buyer_private" | "listing_public", observedAt: Date, mileageKm: number, technician: Person = "technician") {
    let { body: order } = await post("buyer", "orders", { requestKey: randomUUID(), centerId, templateVersionId, audience, listingId: suite.id("public-car"), synthetic: true }).expect(201);
    for (const who of [technician, "reviewer"] as const) ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version, userId: suite.id(who), capability: capability[who], active: true }).expect(201));
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind: "physical", authorityReference: `Synthetic visit authorization ${observedAt.toISOString()}` }).expect(201));
    if (audience === "listing_public") ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind: "publication", authorityReference: `Synthetic public consent ${observedAt.toISOString()}` }).expect(201));
    for (const state of ["confirmed", "arrived"]) ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201));
    ({ body: order } = await post(technician, `orders/${order.id}/vehicle`, { expectedVersion: order.version, observedAt: observedAt.toISOString(), mileageKm, method: "vin", vin, manualReference: null }).expect(201));
    if (audience === "listing_public") await continuityCapture(order, technician);
    return order;
  }
  // Only the legacy public reinspection fixtures gain classified capture. Their original
  // report/evidence/snapshot/disclosure assertions below remain intact.
  async function continuityCapture(order: { id: string; version: number }, technician: Person) {
    const provenanceId = randomUUID(); continuityOwned.provenance.push(provenanceId);
    const evidenceId = randomUUID(); continuityOwned.evidence.push(evidenceId);
    const input = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4z8AARwgWXg4ArpMP8aaUSCMAAAAASUVORK5CYII=", "base64");
    continuityOwned.keys.add(`diagnostic-evidence/${provenanceId}/2639253ab66f01c5c4121c41b648a4d492d71527101073024166d926a0be22c1`);
    const rights = { category: "vehicle_observation", purpose: "Synthetic public reinspection", basis: "Owned generated fixture",
      provenance: "Independent synthetic VIN tile for this visit", identifiability: "pseudonymous", use: ["service"], supplierRestrictions: "No redistribution", hold: null,
      schedule: { kind: "until", until: "2026-11-10T00:00:00.000Z", reason: "Declared fixture rights" } };
    const path = `orders/${order.id}/identity-provenance`;
    await post(technician, path, { id: provenanceId, expectedOrderVersion: order.version, contentType: "image/png", sizeBytes: input.length, rights }).expect(201);
    await request.put(`/api/v1/diagnostics/${path}/${provenanceId}?expectedOrderVersion=${order.version}`).set(headers(technician))
      .set("content-type", "application/octet-stream").set("x-evidence-type", "image/png").send(input).expect(200);
    const { body: raw } = await get(technician, `orders/${order.id}/identity-records`).expect(200);
    await post(technician, `orders/${order.id}/identity-evidence`, { id: evidenceId, expectedOrderVersion: order.version, identityRecordId: raw[0].id,
      identifiers: [{ kind: "vin_stamp", location: "Synthetic VIN stamp", value: vin, provenanceIds: [provenanceId] }], rights, correction: null }).expect(201);
    order.version++;
    continuityMaterials.set(order.id, { rawId: raw[0].id, provenanceId });
  }
  async function continuityProof(first: { id: string; orderId: string }, second: { id: string; version: number }, technician: Person = "technician") {
    const a = continuityMaterials.get(first.orderId)!; const b = continuityMaterials.get(second.id)!;
    const response = await post("reviewer", `orders/${second.id}/continuity-proofs`, { predecessorId: first.id, expectedPredecessorVersion: 3,
      expectedOrderVersion: second.version, predecessorIdentityRecordId: a.rawId, candidateIdentityRecordId: b.rawId,
      linkingTechnicianId: suite.id(technician), method: "comparative_attestation", rationale: "Independent retained VIN tiles establish the same synthetic vehicle",
      provenanceRecordIds: [a.provenanceId,b.provenanceId] });
    if (typeof response.body.proofId === "string") continuityOwned.proofs.push(response.body.proofId);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.proofId as string;
  }
  it("releases a public reinspection from a new physical visit without inheriting findings, evidence or the old snapshot", async () => {
    const earlier = new Date("2026-09-18T00:00:00.000Z"); const later = new Date("2026-10-25T00:00:00.000Z");
    const publicGet = (path: string) => request.get(`/api/v1/public-diagnostics/${path}`);
    await seedSuiteCatalog(db, suite);
    await db.listing.create({ data: { id: suite.id("public-car"), sellerId: suite.id("buyer"), brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, status: "active", vin, priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    await db.staffGrant.create({ data: { userId: suite.id("reception"), capability: "diagnostics.templates" } });
    await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: future } });
    const { body: firstTemplate } = await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true }).expect(201);

    // Predecessor visit: released publicly with real sanitized evidence.
    const firstOrder = await arrive(firstTemplate.id, "listing_public", earlier, 118000);
    const { body: first } = await post("technician", `orders/${firstOrder.id}/reports`, { reportId: randomUUID(), expectedOrderVersion: firstOrder.version }).expect(201);
    const worn = { ...normal(), assessment: "fault", explanation: "Observed synthetic brake wear", evidenceIds: [randomUUID()] };
    const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).jpeg().toBuffer();
    await request.put(`/api/v1/diagnostics/reports/${first.id}/evidence/${worn.evidenceIds[0]}?findingId=${worn.id}&expectedVersion=0`).set(headers("technician")).set("content-type", "application/octet-stream").set("x-evidence-type", "image/jpeg").send(image).expect(200);
    await post("technician", `reports/${first.id}/findings`, { expectedVersion: 0, finding: worn }).expect(201);
    await post("technician", `reports/${first.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${first.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);
    const released = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: first.id } });
    const releasedArtifacts = await db.diagnosticPdfArtifact.findMany({ where: { reportId: first.id }, orderBy: { locale: "asc" } });
    expect((await publicGet(`listings/${suite.id("public-car")}`).expect(200)).body.reportId).toBe(first.id);

    // A later visit under a newer template: the only route to the new draft is the reinspection link.
    const reinspectionDefinition = { ...definition, title: { tk: "Gaýtadan", ru: "Повторная", en: "Reinspection" } };
    const { body: secondTemplate } = await post("reception", `centers/${centerId}/templates`, { expectedVersion: 1, definition: reinspectionDefinition, synthetic: true }).expect(201);
    const clock = vi.spyOn(app.get<DiagnosticRuntime>(DIAGNOSTIC_RUNTIME), "now").mockReturnValue(later);
    try {
      const secondOrder = await arrive(secondTemplate.id, "listing_public", later, 123500);
      const reason = "Scheduled reinspection after brake service";
      const unproved = { reportId: randomUUID(), predecessorId: first.id, expectedOrderVersion: secondOrder.version, reason };
      await post("technician", `orders/${secondOrder.id}/reinspections`, unproved).expect(403);
      const proofId = await continuityProof(first, secondOrder);
      const created = await post("technician", `orders/${secondOrder.id}/reinspections`, { ...unproved, proofId }).expect(201);
      const reinspection = created.body;
      expect(created.headers["cache-control"]).toContain("no-store");
      expect(reinspection).toMatchObject({ orderId: secondOrder.id, audience: "listing_public", status: "draft", templateVersionId: secondTemplate.id,
        observedAt: later.toISOString(), mileageKm: 123500, findings: [], authorId: suite.id("technician"), reviewerId: null, successorOf: first.id,
        correctionReason: reason, finalizedAt: null, template: reinspectionDefinition, supersededBy: null });

      // Current order authority: assigned non-authors, the commissioner and outsiders cannot link a visit.
      for (const who of ["reception", "reviewer", "buyer", "other", "admin"] as const) {
        await post(who, `orders/${secondOrder.id}/reinspections`, { reportId: randomUUID(), predecessorId: first.id, expectedOrderVersion: secondOrder.version, reason }).expect(403);
      }
      expect((await get("technician", `orders/${secondOrder.id}/reports`).expect(200)).body.map((item: { id: string }) => item.id)).toEqual([reinspection.id]);
      // An unreleased reinspection does not displace the current public release.
      expect((await publicGet(`listings/${suite.id("public-car")}`).expect(200)).body.reportId).toBe(first.id);
      await publicGet(`reports/${reinspection.id}`).expect(404);

      // Prior-visit evidence never carries across orders, even under its original finding identity.
      const inherited = await post("technician", `reports/${reinspection.id}/findings`, { expectedVersion: 0, finding: worn }).expect(400);
      expect(inherited.body.code).toBe("REPORT_EVIDENCE_UNAVAILABLE");
      expect((await get("technician", `reports/${reinspection.id}`).expect(200)).body).toMatchObject({ version: 0, findings: [] });

      const serviced = normal();
      await post("technician", `reports/${reinspection.id}/findings`, { expectedVersion: 0, finding: serviced }).expect(201);
      await post("technician", `reports/${reinspection.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
      await post("technician", `reports/${reinspection.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(403);
      await post("reviewer", `reports/${reinspection.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);

      const availability = await publicGet(`listings/${suite.id("public-car")}`).expect(200);
      expect(availability.body).toEqual({ listingId: suite.id("public-car"), reportId: reinspection.id, observedAt: later.toISOString(), mileageKm: 123500, synthetic: true });
      expect((await publicGet(`reports/${reinspection.id}`).expect(200)).body).toMatchObject({ id: reinspection.id, status: "finalized", observedAt: later.toISOString(),
        mileageKm: 123500, findings: [serviced], successorOf: first.id, templateVersionId: secondTemplate.id, template: reinspectionDefinition, supersededBy: null });
      expect((await publicGet(`reports/${first.id}`).expect(200)).body).toMatchObject({ id: first.id, observedAt: earlier.toISOString(), mileageKm: 118000,
        findings: [worn], templateVersionId: firstTemplate.id, template: definition, supersededBy: reinspection.id });
      const unchanged = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: first.id } });
      expect(unchanged.snapshot).toEqual(released.snapshot); expect(unchanged.snapshotHash).toBe(released.snapshotHash);
      expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: first.id }, orderBy: { locale: "asc" } })).toEqual(releasedArtifacts);
      const newArtifacts = await db.diagnosticPdfArtifact.findMany({ where: { reportId: reinspection.id }, orderBy: { locale: "asc" } });
      expect(newArtifacts.map(row => [row.locale, row.state])).toEqual([["en", "pending"], ["ru", "pending"], ["tk", "pending"]]);
      expect(newArtifacts.some(row => row.snapshotHash === released.snapshotHash)).toBe(false);

      // Audience is never crossed: a private visit by the same commissioner on the same car cannot link a public release.
      const privateOrder = await arrive(secondTemplate.id, "buyer_private", later, 123600);
      await post("technician", `orders/${privateOrder.id}/reinspections`, { reportId: randomUUID(), predecessorId: reinspection.id, expectedOrderVersion: privateOrder.version, reason }).expect(403);
      expect((await get("technician", `orders/${privateOrder.id}/reports`).expect(200)).body).toEqual([]);

      // Withdrawal removes the badge and reader with no fallback to the older favorable release.
      await post("reviewer", `reports/${reinspection.id}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Synthetic reinspection dispute" }).expect(201);
      await publicGet(`listings/${suite.id("public-car")}`).expect(404);
      await publicGet(`reports/${reinspection.id}`).expect(404);
      expect((await get("buyer", `reports/${reinspection.id}`).expect(200)).body.status).toBe("withdrawn");
    } finally { clock.mockRestore(); }
  });
  it("retries a reinspection link exactly, refuses conflicting links and keeps each visit's evidence and successor disclosure separate", async () => {
    const earlier = new Date("2026-09-18T00:00:00.000Z");
    const publicGet = (path: string) => request.get(`/api/v1/public-diagnostics/${path}`);
    const upload = (reportId: string, evidenceId: string, findingId: string, image: Buffer) => request.put(`/api/v1/diagnostics/reports/${reportId}/evidence/${evidenceId}?findingId=${findingId}&expectedVersion=0`)
      .set(headers("technician")).set("content-type", "application/octet-stream").set("x-evidence-type", "image/jpeg").send(image).expect(200);
    await seedSuiteCatalog(db, suite);
    await db.listing.create({ data: { id: suite.id("public-car"), sellerId: suite.id("buyer"), brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, status: "active", vin, priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    await db.staffGrant.create({ data: { userId: suite.id("reception"), capability: "diagnostics.templates" } });
    await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: future } });
    const { body: template } = await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true }).expect(201);
    const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).jpeg().toBuffer();
    const firstOrder = await arrive(template.id, "listing_public", earlier, 118000);
    const { body: first } = await post("technician", `orders/${firstOrder.id}/reports`, { reportId: randomUUID(), expectedOrderVersion: firstOrder.version }).expect(201);
    const worn = { ...normal(), assessment: "fault", explanation: "Observed synthetic brake wear", evidenceIds: [randomUUID()] };
    await upload(first.id, worn.evidenceIds[0]!, worn.id, image);
    await post("technician", `reports/${first.id}/findings`, { expectedVersion: 0, finding: worn }).expect(201);
    await post("technician", `reports/${first.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${first.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);

    const secondOrder = await arrive(template.id, "listing_public", new Date("2026-10-01T00:00:00.000Z"), 120000);
    const reason = "Follow-up visit after repair";
    const link = { reportId: randomUUID(), predecessorId: first.id, expectedOrderVersion: secondOrder.version, reason, proofId: await continuityProof(first, secondOrder) };
    const { body: reinspection } = await post("technician", `orders/${secondOrder.id}/reinspections`, link).expect(201);
    expect(reinspection).toMatchObject({ lineageKind: "reinspection", supersededBy: null });
    expect(reinspection).not.toHaveProperty("successorKind");
    expect((await post("technician", `orders/${secondOrder.id}/reinspections`, link).expect(201)).body).toEqual(reinspection);
    expect(await db.diagnosticAudit.count({ where: { orderId: secondOrder.id, action: "REPORT_REINSPECTION_CREATED" } })).toBe(1);
    expect((await post("technician", `orders/${secondOrder.id}/reinspections`, { ...link, reason: "Another reason" }).expect(409)).body.code).toBe("DIAGNOSTIC_REINSPECTION_CONFLICT");
    expect((await post("technician", `orders/${secondOrder.id}/reinspections`, { ...link, reportId: randomUUID(), expectedOrderVersion: secondOrder.version + 1 }).expect(409)).body.code).toBe("DIAGNOSTIC_REINSPECTION_CONFLICT");
    expect((await post("technician", `orders/${secondOrder.id}/reinspections`, { ...link, reportId: randomUUID() }).expect(409)).body.code).toBe("DIAGNOSTIC_REINSPECTION_CONFLICT");
    expect((await post("technician", `orders/${secondOrder.id}/reports`, { reportId: randomUUID(), expectedOrderVersion: secondOrder.version }).expect(409)).body.code).toBe("DIAGNOSTIC_REPORT_EXISTS");
    // A draft successor is never disclosed, and a physical revisit is not an editorial correction.
    expect((await get("technician", `reports/${first.id}`).expect(200)).body.supersededBy).toBeNull();
    expect((await publicGet(`reports/${first.id}`).expect(200)).body.supersededBy).toBeNull();
    for (const response of [await get("technician", `reports/${first.id}`).expect(200), await publicGet(`reports/${first.id}`).expect(200)]) {
      expect(response.body).toMatchObject({ lineageKind: "original", supersededBy: null });
      expect(response.body).not.toHaveProperty("successorKind");
    }
    expect((await post("technician", `reports/${first.id}/corrections`, { expectedVersion: 3, successorId: reinspection.id, reason }).expect(409)).body.code).toBe("DIAGNOSTIC_CORRECTION_CONFLICT");
    expect((await post("technician", `reports/${first.id}/corrections`, { expectedVersion: 3, successorId: randomUUID(), reason }).expect(409)).body.code).toBe("DIAGNOSTIC_CORRECTION_CONFLICT");
    const thirdOrder = await arrive(template.id, "listing_public", new Date("2026-10-02T00:00:00.000Z"), 120100);
    expect((await post("technician", `orders/${thirdOrder.id}/reinspections`, { ...link, reportId: randomUUID(), expectedOrderVersion: thirdOrder.version }).expect(403)).body.code).toBe("DIAGNOSTIC_NO_ACCESS");

    // Continuity is admitted at link time only: a later predecessor-side reobservation does not block the new visit.
    const current = await get("technician", `orders/${firstOrder.id}`).expect(200);
    await post("technician", `orders/${firstOrder.id}/vehicle`, { expectedVersion: current.body.version, observedAt: earlier.toISOString(), mileageKm: 118000, method: "manual", manualReference: "Synthetic predecessor rematch", vin: null }).expect(201);
    const repaired = { ...normal(), assessment: "fault", explanation: "Residual synthetic brake wear", evidenceIds: [randomUUID()] };
    await upload(reinspection.id, repaired.evidenceIds[0]!, repaired.id, image);
    await post("technician", `reports/${reinspection.id}/findings`, { expectedVersion: 0, finding: repaired }).expect(201);
    await post("technician", `reports/${reinspection.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${reinspection.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);

    // A correction of the reinspection reuses that visit's evidence and never the earlier visit's.
    const correction = await post("technician", `reports/${reinspection.id}/corrections`, { expectedVersion: 3, successorId: randomUUID(), reason: "Corrected wording" }).expect(201);
    expect(correction.body.lineageKind).toBe("correction");
    expect((await publicGet(`reports/${reinspection.id}`).expect(200)).body.lineageKind).toBe("reinspection");
    expect((await publicGet(`reports/${reinspection.id}`).expect(200)).body).not.toHaveProperty("successorKind");
    expect(correction.body).toMatchObject({ orderId: secondOrder.id, successorOf: reinspection.id, findings: [repaired] });
    expect((await post("technician", `reports/${correction.body.id}/findings`, { expectedVersion: 0, finding: { ...repaired, evidenceIds: worn.evidenceIds } }).expect(400)).body.code).toBe("REPORT_EVIDENCE_UNAVAILABLE");
    await post("technician", `reports/${correction.body.id}/findings`, { expectedVersion: 0, finding: { ...repaired, explanation: "Residual synthetic brake wear, corrected" } }).expect(201);

    // Each successor id is disclosed only through its own public availability or its own commissioner.
    expect((await publicGet(`reports/${first.id}`).expect(200)).body.supersededBy).toBe(reinspection.id);
    expect((await publicGet(`reports/${first.id}`).expect(200)).body).toMatchObject({ lineageKind: "original", supersededBy: reinspection.id, successorKind: "reinspection" });
    expect((await get("technician", `reports/${first.id}`).expect(200)).body).toMatchObject({ supersededBy: reinspection.id, successorKind: "reinspection" });
    await post("reviewer", `reports/${reinspection.id}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Synthetic revisit dispute" }).expect(201);
    expect((await publicGet(`reports/${first.id}`).expect(200)).body.supersededBy).toBeNull();
    expect((await get("technician", `reports/${first.id}`).expect(200)).body.supersededBy).toBeNull();
    expect((await get("buyer", `reports/${first.id}`).expect(200)).body.supersededBy).toBe(reinspection.id);
    for (const response of [await publicGet(`reports/${first.id}`).expect(200), await get("technician", `reports/${first.id}`).expect(200)]) {
      expect(response.body).not.toHaveProperty("successorKind");
    }
    expect((await get("buyer", `reports/${first.id}`).expect(200)).body).toMatchObject({ supersededBy: reinspection.id, successorKind: "reinspection" });
  });
  /** One released public visit and a separately arrived later visit on the same Listing, commissioner and VIN. */
  async function contestedPredecessor(revisitTechnician: Person) {
    await seedSuiteCatalog(db, suite);
    await db.listing.create({ data: { id: suite.id("public-car"), sellerId: suite.id("buyer"), brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, status: "active", vin, priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    await db.staffGrant.create({ data: { userId: suite.id("reception"), capability: "diagnostics.templates" } });
    await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: future } });
    if (revisitTechnician !== "technician") await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id(revisitTechnician), capability: "diagnostics.technician", qualifiedUntil: future } });
    const { body: template } = await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true }).expect(201);
    const firstOrder = await arrive(template.id, "listing_public", new Date("2026-09-18T00:00:00.000Z"), 118000);
    const { body: first } = await post("technician", `orders/${firstOrder.id}/reports`, { reportId: randomUUID(), expectedOrderVersion: firstOrder.version }).expect(201);
    const finding = normal();
    await post("technician", `reports/${first.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${first.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${first.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);
    const secondOrder = await arrive(template.id, "listing_public", new Date("2026-10-01T00:00:00.000Z"), 120000, revisitTechnician);
    // Released bytes, hash and artifacts of the predecessor; no contender may change them.
    const released = async () => {
      const { snapshot, snapshotHash, state, status, version, finalizedAt } = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: first.id } });
      return { snapshot, snapshotHash, state, status, version, finalizedAt, artifacts: await db.diagnosticPdfArtifact.findMany({ where: { reportId: first.id }, orderBy: { locale: "asc" } }) };
    };
    return { template, firstOrder, first, finding, secondOrder, released };
  }
  const audits = async () => (await db.diagnosticAudit.findMany({ where: { centerId } })).map(row => ({ id: row.id, orderId: row.orderId, actorId: row.actorId, action: row.action, reportId: (row.details as { reportId?: string }).reportId }));
  /** Real PostgreSQL barrier, no fixed delay: the test holds both visit rows until every dispatched
   * request is observed waiting on them (directly or queued behind another contender's identity
   * lock), then releases them together so the transactions contend inside the product's own locks.
   * Requests are only awaited after the holder has unwound (waiting earlier would deadlock on its rows);
   * a barrier failure drains them first and stays the thrown error, otherwise any request failure propagates. */
  async function contend(orderIds: string[], dispatch: () => ReturnType<typeof post>[]) {
    let settled: Promise<PromiseSettledResult<Awaited<ReturnType<typeof post>>>[]> | undefined;
    try {
      await db.$transaction(async tx => {
        const [holder] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        for (const id of [...orderIds].sort()) await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${id} FOR UPDATE`;
        // allSettled sends every request and observes its rejection at once, and never rejects itself.
        const requests = dispatch(); settled = Promise.allSettled(requests);
        // pg_stat_activity is snapshotted per transaction, so waiters are observed outside the holder.
        for (let attempt = 0; ; attempt++) {
          const [observed] = await db.$queryRaw<{ waiting: number }[]>`WITH direct AS (SELECT activity.pid FROM pg_stat_activity activity WHERE ${holder!.pid}::int = ANY(pg_blocking_pids(activity.pid)))
            SELECT ((SELECT count(*) FROM direct) + (SELECT count(*) FROM pg_stat_activity activity WHERE activity.pid NOT IN (SELECT pid FROM direct) AND pg_blocking_pids(activity.pid) && ARRAY(SELECT pid FROM direct)))::int AS waiting`;
          if (observed!.waiting >= requests.length) break;
          if (attempt === 500) throw new Error(`Only ${observed!.waiting} of ${requests.length} diagnostic requests reached the row-lock barrier`);
        }
      });
    } catch (barrierFailure) {
      // The holder has rolled back and released the rows, so draining cannot deadlock or throw.
      await settled;
      throw barrierFailure;
    }
    const results = await settled!;
    const failed = results.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
    return results.map(result => (result as PromiseFulfilledResult<Awaited<ReturnType<typeof post>>>).value);
  }
  it("links one reinspection when identical requests contend for the same visit and predecessor", async () => {
    const { first, secondOrder, released } = await contestedPredecessor("technician");
    const before = await released();
    const link = { reportId: randomUUID(), predecessorId: first.id, expectedOrderVersion: secondOrder.version, reason: "Concurrent follow-up visit", proofId: await continuityProof(first, secondOrder, "technician") };
    const prior = await audits();
    const responses = await contend([first.orderId, secondOrder.id], () => [post("technician", `orders/${secondOrder.id}/reinspections`, link), post("technician", `orders/${secondOrder.id}/reinspections`, link)]);
    expect(responses.map(response => response.status)).toEqual([201, 201]);
    expect(responses[1]!.body).toEqual(responses[0]!.body);
    expect(responses[0]!.body).toMatchObject({ id: link.reportId, orderId: secondOrder.id, lineageKind: "reinspection", successorOf: first.id, status: "draft", version: 0,
      observedAt: "2026-10-01T00:00:00.000Z", mileageKm: 120000, findings: [], authorId: suite.id("technician"), correctionReason: link.reason, supersededBy: null });

    // One successor, one report on the new visit and one creation audit; the predecessor is consumed once.
    expect((await db.diagnosticReportRecord.findMany({ where: { predecessorId: first.id } })).map(row => row.id)).toEqual([link.reportId]);
    expect((await db.diagnosticReportRecord.findMany({ where: { orderId: secondOrder.id } })).map(row => row.id)).toEqual([link.reportId]);
    expect((await db.diagnosticReportRecord.findMany({ where: { orderId: first.orderId } })).map(row => row.id)).toEqual([first.id]);
    const added = (await audits()).filter(row => !prior.some(item => item.id === row.id));
    expect(added.filter(row => row.action === "CONTINUITY_PROOF_CONSUMED")).toHaveLength(1);
    const created = added.filter(row => row.action !== "CONTINUITY_PROOF_CONSUMED");
    expect(created.map(({ id: _, ...row }) => row)).toEqual([{ orderId: secondOrder.id, actorId: suite.id("technician"), action: "REPORT_REINSPECTION_CREATED", reportId: link.reportId }]);
    expect(await released()).toEqual(before);

    // A matching retry after the race stays read-only.
    const stored = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: link.reportId } });
    expect((await post("technician", `orders/${secondOrder.id}/reinspections`, link).expect(201)).body).toEqual(responses[0]!.body);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: link.reportId } })).toEqual(stored);
    expect(await audits()).toHaveLength(prior.length + 2);
    expect(await released()).toEqual(before);
  });
  it("admits exactly one successor when a correction and a reinspection race for the same released predecessor", async () => {
    const { template, first, finding, secondOrder, released } = await contestedPredecessor("revisitTechnician");
    const before = await released();
    const correction = { expectedVersion: 3, successorId: randomUUID(), reason: "Concurrent editorial correction" };
    const link = { reportId: randomUUID(), predecessorId: first.id, expectedOrderVersion: secondOrder.version, reason: "Concurrent follow-up visit", proofId: await continuityProof(first, secondOrder, "revisitTechnician") };
    const prior = await audits();
    // Distinct current technicians on each visit, so no shared identity lock serializes the contenders.
    const [corrected, linked] = await contend([first.orderId, secondOrder.id], () => [post("technician", `reports/${first.id}/corrections`, correction),
      post("revisitTechnician", `orders/${secondOrder.id}/reinspections`, link)]);
    expect([corrected!.status, linked!.status].sort()).toEqual([201, 409]);
    const correctionWon = corrected!.status === 201;
    const [winner, loser] = correctionWon ? [corrected!, linked!] : [linked!, corrected!];
    const [winnerId, loserId] = correctionWon ? [correction.successorId, link.reportId] : [link.reportId, correction.successorId];
    expect(loser.body.code).toBe(correctionWon ? "DIAGNOSTIC_REINSPECTION_CONFLICT" : "DIAGNOSTIC_CORRECTION_CONFLICT");
    expect(winner.body).toMatchObject(correctionWon
      ? { id: winnerId, orderId: first.orderId, lineageKind: "correction", successorOf: first.id, status: "draft", observedAt: "2026-09-18T00:00:00.000Z", mileageKm: 118000,
        findings: [finding], templateVersionId: template.id, authorId: suite.id("technician"), correctionReason: correction.reason }
      : { id: winnerId, orderId: secondOrder.id, lineageKind: "reinspection", successorOf: first.id, status: "draft", observedAt: "2026-10-01T00:00:00.000Z", mileageKm: 120000,
        findings: [], templateVersionId: template.id, authorId: suite.id("revisitTechnician"), correctionReason: link.reason });

    // The loser leaves no successor, report or audit; the predecessor's released bytes are untouched.
    expect((await db.diagnosticReportRecord.findMany({ where: { predecessorId: first.id } })).map(row => row.id)).toEqual([winnerId]);
    expect(await db.diagnosticReportRecord.findUnique({ where: { id: loserId } })).toBeNull();
    expect((await db.diagnosticReportRecord.findMany({ where: { orderId: secondOrder.id } })).map(row => row.id)).toEqual(correctionWon ? [] : [winnerId]);
    expect((await db.diagnosticReportRecord.findMany({ where: { orderId: first.orderId } })).map(row => row.id).sort()).toEqual((correctionWon ? [first.id, winnerId] : [first.id]).sort());
    const added = (await audits()).filter(row => !prior.some(item => item.id === row.id));
    expect(added.filter(row => row.action === "CONTINUITY_PROOF_CONSUMED")).toHaveLength(correctionWon ? 0 : 1);
    const created = added.filter(row => row.action !== "CONTINUITY_PROOF_CONSUMED");
    expect(created.map(({ id: _, ...row }) => row)).toEqual([correctionWon
      ? { orderId: first.orderId, actorId: suite.id("technician"), action: "REPORT_CORRECTION_CREATED", reportId: winnerId }
      : { orderId: secondOrder.id, actorId: suite.id("revisitTechnician"), action: "REPORT_REINSPECTION_CREATED", reportId: winnerId }]);
    expect(await released()).toEqual(before);

    // After the race, the winner's matching retry is read-only and the loser's retry keeps its conflict.
    const stored = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: winnerId } });
    const retry = correctionWon ? post("technician", `reports/${first.id}/corrections`, correction) : post("revisitTechnician", `orders/${secondOrder.id}/reinspections`, link);
    expect((await retry.expect(201)).body).toEqual(winner.body);
    const again = correctionWon ? post("revisitTechnician", `orders/${secondOrder.id}/reinspections`, link) : post("technician", `reports/${first.id}/corrections`, correction);
    expect((await again.expect(409)).body.code).toBe(loser.body.code);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: winnerId } })).toEqual(stored);
    expect(await db.diagnosticReportRecord.findUnique({ where: { id: loserId } })).toBeNull();
    expect(await audits()).toHaveLength(prior.length + (correctionWon ? 1 : 2));
    expect(await released()).toEqual(before);
  });
  it("does not disclose private reports through anonymous known IDs or artifacts", async () => {
    const { report } = await draft();
    await post("technician", `reports/${report.id}/findings`, { expectedVersion: 0, finding: normal() }).expect(201);
    await post("technician", `reports/${report.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);
    for (const path of [`reports/${report.id}`, `reports/${report.id}/documents`, `reports/${report.id}/documents/tk`]) {
      const denied = await request.get(`/api/v1/public-diagnostics/${path}`).expect(404);
      expect(JSON.stringify(denied.body)).not.toContain(report.id);
      expect(denied.headers["cache-control"]).toContain("no-store");
    }
  });
  it("allows an authorized author to discard an upload that failed before creating an intent without leaking another report", async () => {
    const { report } = await draft();
    const absent = randomUUID();
    await post("technician", `reports/${report.id}/evidence/${absent}/abandon`, {}).expect(201);
    for (const who of ["buyer", "other", "admin", "reviewer"] as const) await post(who, `reports/${report.id}/evidence/${absent}/abandon`, {}).expect(403);
  });
  it("protects actual sanitized evidence bytes from other audiences and revoked sessions", async () => {
    const { report } = await draft(); const finding = { ...normal(), assessment: "fault", explanation: "Observed synthetic damage", evidenceIds: [randomUUID()] };
    const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).jpeg().toBuffer();
    await request.put(`/api/v1/diagnostics/reports/${report.id}/evidence/${finding.evidenceIds[0]}?findingId=${finding.id}&expectedVersion=0`).set(headers("technician")).set("content-type", "application/octet-stream").set("x-evidence-type", "image/jpeg").send(image).expect(200);
    await post("technician", `reports/${report.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    const content = await get("technician", `reports/${report.id}/evidence/${finding.evidenceIds[0]}`).expect(200);
    expect(content.headers["content-type"]).toContain("image/webp"); expect(content.headers["cache-control"]).toContain("no-store");
    for (const who of ["buyer", "other", "admin"] as const) await get(who, `reports/${report.id}/evidence/${finding.evidenceIds[0]}`).expect(403);
    await db.session.delete({ where: { id: suite.id("technician-session") } });
    await get("technician", `reports/${report.id}/evidence/${finding.evidenceIds[0]}`).expect(403);
  });
});
