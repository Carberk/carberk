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
import sharp from "sharp";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../domain/ports/DiagnosticIntakePort";
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
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => now, id: randomUUID, syntheticAllowed: ({ userId }: { userId: string }) => people.some(who => suite.id(who) === userId) }).compile();
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
  it("projects complete public findings only while the exact vehicle association remains eligible", async () => {
    const { report } = await draft("listing_public"); const finding = normal();
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
    await publicGet(`reports/${report.id}`).expect(200);
    await post("reviewer", `reports/${report.id}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Synthetic consent dispute" }).expect(201);
    await publicGet(`listings/${suite.id("public-car")}`).expect(404);
    await publicGet(`reports/${report.id}`).expect(404);
    expect((await get("buyer", `reports/${report.id}`).expect(200)).body.status).toBe("withdrawn");
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
