import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { S3Client, CreateBucketCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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
const people = ["buyer", "other", "reception", "technician", "reviewer", "admin"] as const;
type Person = typeof people[number];
const now = new Date("2026-10-18T00:00:00.000Z");
const future = new Date("2026-11-18T00:00:00.000Z");
const localized = { tk: "Synag", ru: "Тест", en: "Synthetic" };
const definition = { title: localized, limitations: localized, syntheticNotice: localized,
  checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
const capability: Partial<Record<Person, string>> = { reception: "diagnostics.reception", technician: "diagnostics.technician", reviewer: "diagnostics.reviewer" };
const centerId = suite.id("center");

/** Full HTTP/Prisma/identity/storage composition against disposable hosted services.
 * Templates, intake, observation, authorship and release are exercised through HTTP. */
describe("diagnostic authoring and immutable audience release", () => {
  let app: NestFastifyApplication; let db: PrismaService; let jwt: JwtService;
  let request: ReturnType<typeof supertest>; let objects: S3Client;
  const headers = (who: Person) => ({ authorization: `Bearer ${jwt.sign({ sub: suite.id(who), sid: suite.id(`${who}-session`), role: who === "admin" ? "admin" : "buyer" })}` });
  const post = (who: Person, path: string, body: object) => request.post(`/api/v1/diagnostics/${path}`).set(headers(who)).send(body);
  const get = (who: Person, path: string) => request.get(`/api/v1/diagnostics/${path}`).set(headers(who));
  async function cleanup() {
    if (!db) return;
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
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
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
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
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
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
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
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
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
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
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
  async function arrive(templateVersionId: string, audience: "buyer_private" | "listing_public", observedAt: Date, mileageKm: number) {
    let { body: order } = await post("buyer", "orders", { requestKey: randomUUID(), centerId, templateVersionId, audience, listingId: suite.id("public-car"), synthetic: true }).expect(201);
    for (const who of ["technician", "reviewer"] as const) ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version, userId: suite.id(who), capability: capability[who], active: true }).expect(201));
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind: "physical", authorityReference: `Synthetic visit authorization ${observedAt.toISOString()}` }).expect(201));
    if (audience === "listing_public") ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind: "publication", authorityReference: `Synthetic public consent ${observedAt.toISOString()}` }).expect(201));
    for (const state of ["confirmed", "arrived"]) ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201));
    ({ body: order } = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: order.version, observedAt: observedAt.toISOString(), mileageKm, method: "vin", vin, manualReference: null }).expect(201));
    return order;
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
    await post("reviewer", `reports/${first.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
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
      const created = await post("technician", `orders/${secondOrder.id}/reinspections`, { reportId: randomUUID(), predecessorId: first.id, expectedOrderVersion: secondOrder.version, reason }).expect(201);
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
      await post("technician", `reports/${reinspection.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(403);
      await post("reviewer", `reports/${reinspection.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);

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
  it("does not disclose private reports through anonymous known IDs or artifacts", async () => {
    const { report } = await draft();
    await post("technician", `reports/${report.id}/findings`, { expectedVersion: 0, finding: normal() }).expect(201);
    await post("technician", `reports/${report.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
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
