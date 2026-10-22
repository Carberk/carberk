import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { S3Client, DeleteObjectCommand, HeadBucketCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
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
import { defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../domain/ports/DiagnosticIntakePort";

const suite = defineE2eSuite("diagnostic-public-transfer-proof");
const people = ["sellerA", "sellerB", "outsider", "reception", "technician", "reviewer"] as const;
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
  provenance: "Generated VIN and chassis fixture, not a customer document", identifiability: "pseudonymous", use: ["service"],
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
const rightsB = { ...rights, provenance: "Independently generated B VIN and chassis tile, authorized by seller B for this visit" };
type Image = typeof red;
type Observation = { observedAt: string; mileageKm: number; method: "manual" | "vin"; vin: string | null; manualReference: string | null };
type Order = { id: string; version: number };
type Raw = { id: string; orderId: string; orderVersion: number; observationHash: string; observation: Observation; recordedBy: string; recordedAt: string };
const identifiers = (provenanceId: string, vin: "SYN-VIN-041") => [
  { kind: "vin_stamp", location: "Synthetic stamped VIN", value: vin, provenanceIds: [provenanceId] },
  { kind: "chassis_stamp", location: "Synthetic chassis plate", value: "SYN-CHASSIS-041", provenanceIds: [provenanceId] },
];
const definition = { title: localized, limitations: localized, syntheticNotice: localized,
  checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
const key = (id: string, image: Image) => `diagnostic-evidence/${id}/${image.sha256}`;
const metadata = (id: string, image: Image = red) => ({ id, sha256: image.sha256, mime: "image/webp", sizeBytes: image.sizeBytes });
const deniedBody = { statusCode: 403, code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection request could not be completed",
  timestamp: expect.any(String), requestId: "unknown" };
const privateNoStore = (response: { headers: Record<string, string> }) => {
  expect(response.headers["cache-control"]).toContain("private");
  expect(response.headers["cache-control"]).toContain("no-store");
};
// P1: separate personal publishers and physical visits. No Listing transfer is fabricated.
describe("public continuity across different sellers and Listings", { concurrent: false }, () => {
  let app: NestFastifyApplication; let db: PrismaService; let jwt: JwtService;
  let request: ReturnType<typeof supertest>; let objects: S3Client;
  let templateId: string;
  const now = initialTime;
  const owned = { orders: [] as string[], reports: [] as string[], pdfs: [] as string[],
    raw: [] as string[], evidence: [] as string[], provenance: [] as string[], proofs: [] as string[], keys: new Set<string>(), users: [] as string[],
    sessions: [] as string[], grants: [] as { userId: string; capability: string }[], qualifications: [] as string[],
    requestKeys: [] as string[], findings: [] as string[], assignments: [] as { orderId: string; userId: string; capability: string }[] };
  let ownsCenter = false;
  const listings: { id: string; sellerId: string }[] = [];
  let catalogRegistered = false;
  const headers = (who: Person) => ({ authorization: `Bearer ${jwt.sign({ sub: suite.id(who), sid: suite.id(`${who}-session`), role: "buyer" })}` });
  const post = (who: Person, path: string, body: object) => request.post(`/api/v1/diagnostics/${path}`).set(headers(who)).send(body);
  const get = (who: Person, path: string) => request.get(`/api/v1/diagnostics/${path}`).set(headers(who));
  const evidencePath = (o: Order) => `orders/${o.id}/identity-evidence`;
  const provenancePath = (o: Order, id?: string) => `orders/${o.id}/identity-provenance${id ? `/${id}` : ""}`;
  const comparisonPath = (b: Order, reportId: string) => `orders/${b.id}/reinspection-comparison?predecessorId=${reportId}`;
  const history = async (o: Order): Promise<Raw[]> => (await get("technician", `orders/${o.id}/identity-records`).expect(200)).body;
  const version = async (o: Order) => (await get("technician", `orders/${o.id}`).expect(200)).body.version as number;
  async function teardownOwnedFixtures() {
    if (!db) return;
    // Only request-registered keys, including an upload that wrote bytes before failing.
    // Never derive deletion authority from discovered database rows or bucket listings.
    const failures: unknown[] = [];
    try {
      // Identity DELETE guards permit only parent-order cascades. Establish all
      // ownership before touching objects or rows, including cross-order pins.
      const orders = await db.inspectionOrder.findMany({ where: { id: { in: owned.orders } } });
      expect(orders.every(order => order.centerId === centerId && order.templateVersionId === templateId
        && listings.some(listing => listing.id === order.listingId && listing.sellerId === order.commissionerId) && owned.requestKeys.includes(order.requestKey)),
      "Teardown refused: unregistered order binding").toBe(true);
      for (const [rows, ids] of [
        [await db.diagnosticContinuityProof.findMany({ where: { OR: [{ candidateOrderId: { in: owned.orders } },
          { predecessorOrderId: { in: owned.orders } }, { predecessorReportId: { in: owned.reports } },
          { issuerId: { in: owned.users } }, { linkingTechnicianId: { in: owned.users } },
          { issuerSessionId: { in: owned.sessions } }] }, select: { id: true } }), owned.proofs],
        [await db.diagnosticReportRecord.findMany({ where: { OR: [{ orderId: { in: owned.orders } },
          { predecessorId: { in: owned.reports } }, { identityRecordId: { in: owned.raw } },
          { identityEvidenceId: { in: owned.evidence } }, { continuityProofId: { in: owned.proofs } }, { templateVersionId: templateId ?? "unissued-template" }] }, select: { id: true } }), owned.reports],
        [await db.diagnosticPdfArtifact.findMany({ where: { reportId: { in: owned.reports } }, select: { id: true } }), owned.pdfs],
        [await db.diagnosticIdentityEvidence.findMany({ where: { OR: [{ orderId: { in: owned.orders } },
          { identityRecordId: { in: owned.raw } }, { supersedesId: { in: owned.evidence } }] }, select: { id: true } }), owned.evidence],
        [await db.diagnosticIdentityProvenance.findMany({ where: { orderId: { in: owned.orders } }, select: { id: true } }), owned.provenance],
        [await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: owned.orders } }, select: { id: true } }), owned.raw],
      ] as const) expect(rows.every(row => ids.includes(row.id)), "Teardown refused: unregistered cascade descendant").toBe(true);
      const reports = await db.diagnosticReportRecord.findMany({ where: { id: { in: owned.reports } } });
      for (const report of reports) {
        const state = report.state as { findings?: { id: string }[] };
        expect(owned.orders.includes(report.orderId) && report.templateVersionId === templateId
          && Array.isArray(state.findings) && state.findings.every(finding => owned.findings.includes(finding.id)),
        "Teardown refused: unregistered report/finding binding").toBe(true);
      }
      const provenance = await db.diagnosticIdentityProvenance.findMany({ where: { id: { in: owned.provenance } } });
      expect(provenance.every(row => owned.orders.includes(row.orderId) && (row.objectKey === null || owned.keys.has(row.objectKey))),
        "Teardown refused: unregistered provenance object").toBe(true);
      const pdfs = await db.diagnosticPdfArtifact.findMany({ where: { id: { in: owned.pdfs } } });
      expect(pdfs.every(row => owned.reports.includes(row.reportId) && owned.keys.has(row.objectKey)
        && row.objectKey === `diagnostic-pdf/${row.reportId}/${row.id}.pdf`),
        "Teardown refused: unregistered PDF object").toBe(true);
      const audits = await db.diagnosticAudit.findMany({ where: { OR: [{ centerId },
        { orderId: { in: owned.orders } }, { actorId: { in: owned.users } }] } });
      expect(audits.every(row => {
        const details = row.details as { templateVersionId?: string; reportId?: string };
        return ownsCenter && row.centerId === centerId && row.actorId !== null && owned.users.includes(row.actorId)
          && (row.orderId !== null ? owned.orders.includes(row.orderId)
            : row.action === "TEMPLATE_PUBLISHED" && details.templateVersionId === templateId)
          && (details.reportId === undefined || owned.reports.includes(details.reportId));
      }), "Teardown refused: unregistered audit binding").toBe(true);
      expect(await db.diagnosticEvidence.count({ where: { reportId: { in: owned.reports } } }),
        "Teardown refused: unregistered report evidence").toBe(0);
      const unknownAssignments = await db.diagnosticOrderAssignment.count({ where: {
        orderId: { in: owned.orders }, NOT: { OR: owned.assignments } } });
      expect(unknownAssignments, "Teardown refused: unregistered assignment").toBe(0);
      if (ownsCenter) {
        expect(await db.inspectionOrder.count({ where: { OR: [{ centerId }, { templateVersionId: templateId ?? "unissued-template" }], id: { notIn: owned.orders } } }),
          "Teardown refused: unregistered center order").toBe(0);
        expect(await db.diagnosticTemplateVersion.count({ where: { centerId, id: { not: templateId ?? "unissued-template" } } }),
          "Teardown refused: unregistered center template").toBe(0);
        expect(await db.diagnosticCenterAssignment.count({ where: { centerId, id: { notIn: owned.qualifications } } }),
          "Teardown refused: unregistered center qualification").toBe(0);
      }
      // User SET NULL relations matter as well as CASCADE relations. Compare
      // every relation count with only the explicitly registered children.
      const sessions = await db.session.findMany({ where: { id: { in: owned.sessions } }, include: { _count: true } });
      expect(sessions.every(session => owned.users.includes(session.userId)
        && Object.values(session._count).every(count => count === 0)),
      "Teardown refused: unregistered Session descendant").toBe(true);
      const users = await db.user.findMany({ where: { id: { in: owned.users } },
        include: { _count: true, totpEnrollment: true, notificationPreferences: true } });
      for (const user of users) {
        const registered = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { _count: { select: {
          sessions: { where: { id: { in: owned.sessions } } },
          listings: { where: { OR: listings } },
          staffGrants: { where: { OR: owned.grants } },
          diagnosticCenterAssignments: { where: { id: { in: owned.qualifications }, centerId } },
          diagnosticCommissions: { where: { id: { in: owned.orders } } },
          diagnosticOrderAssignments: { where: { OR: owned.assignments } },
          publishedDiagnosticTemplates: { where: { id: templateId ?? "unissued-template" } },
          diagnosticAuditEntries: { where: { centerId, OR: [{ orderId: { in: owned.orders } },
            { orderId: null, action: "TEMPLATE_PUBLISHED", details: { path: ["templateVersionId"], equals: templateId ?? "unissued-template" } }] } },
          diagnosticIdentityRecords: { where: { id: { in: owned.raw } } },
          diagnosticIdentityEvidence: { where: { id: { in: owned.evidence } } },
          diagnosticIdentityProvenance: { where: { id: { in: owned.provenance } } },
        } } } });
        const allowed: Record<string, number> = registered._count;
        expect(user.totpEnrollment === null && user.notificationPreferences === null
          && Object.entries(user._count).every(([relation, count]) => count === (allowed[relation] ?? 0)),
        "Teardown refused: unregistered user descendant").toBe(true);
      }
      const listingRows = await db.listing.findMany({ where: { id: { in: listings.map(row => row.id) } }, include: { _count: true } });
      for (const listing of listingRows) {
        expect(listings.some(row => row.id === listing.id && row.sellerId === listing.sellerId)
          && listing.businessId === null && listing.brandId === suite.catalog.brandId
          && listing.modelId === suite.catalog.modelId && listing.cityId === suite.catalog.cityId,
        "Teardown refused: unregistered Listing binding").toBe(true);
        const known = await db.inspectionOrder.count({ where: { listingId: listing.id, id: { in: owned.orders } } });
        expect(Object.entries(listing._count).every(([relation, count]) => count === (relation === "diagnosticOrders" ? known : 0)),
          "Teardown refused: unregistered Listing descendant or SET NULL target").toBe(true);
      }
      // Catalog is an attributed cross-context prerequisite. Verify exact known children,
      // then remove only these registered rows after orders and Listings have gone.
      if (catalogRegistered) {
        const c = suite.catalog;
        const [brand, model, region, city] = await Promise.all([
          db.brand.findUnique({ where: { id: c.brandId }, include: { _count: true } }),
          db.model.findUnique({ where: { id: c.modelId }, include: { _count: true } }),
          db.region.findUnique({ where: { id: c.regionId }, include: { _count: true } }),
          db.city.findUnique({ where: { id: c.cityId }, include: { _count: true } }),
        ]);
        const n = listingRows.length;
        if (brand) expect(brand._count).toEqual({ models: model ? 1 : 0, listings: n });
        if (model) { expect(model.brandId).toBe(c.brandId); expect(model._count).toEqual({ generations: 0, listings: n }); }
        if (region) expect(region._count).toEqual({ cities: city ? 1 : 0, listings: 0 });
        if (city) { expect(city.regionId).toBe(c.regionId); expect(city._count).toEqual({ dealerships: 0, listings: n }); }
      }
      for (const objectKey of owned.keys) {
        try {
          await objects.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: objectKey }));
          await expect(objects.send(new HeadObjectCommand({ Bucket: "diagnostic-test-private", Key: objectKey })))
            .rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
        } catch (error) { failures.push(new Error(`Teardown failed for registered object ${objectKey}`, { cause: error })); }
      }
      if (failures.length) throw new AggregateError(failures, "Exact object cleanup failed; database rows preserved");
      await db.diagnosticContinuityProof.deleteMany({ where: { id: { in: owned.proofs } } });
      await db.diagnosticPdfArtifact.deleteMany({ where: { id: { in: owned.pdfs } } });
      for (const id of [...owned.reports].reverse()) await db.diagnosticReportRecord.deleteMany({ where: { id } });
      if (ownsCenter) await db.diagnosticAudit.deleteMany({ where: { centerId, actorId: { in: owned.users },
        OR: [{ orderId: { in: owned.orders } }, { orderId: null }] } });
      await db.diagnosticOrderAssignment.deleteMany({ where: { OR: owned.assignments } });
      // Reports no longer pin identity rows. The guarded rows leave only through
      // these exact request-registered order parents, never by direct DELETE.
      await db.inspectionOrder.deleteMany({ where: { id: { in: owned.orders }, centerId,
        OR: listings.map(listing => ({ listingId: listing.id, commissionerId: listing.sellerId })), requestKey: { in: owned.requestKeys } } });
      if (ownsCenter) {
        await db.diagnosticTemplateVersion.deleteMany({ where: { id: templateId ?? "unissued-template" } });
        await db.diagnosticCenterAssignment.deleteMany({ where: { id: { in: owned.qualifications } } });
        await db.diagnosticCenter.delete({ where: { id: centerId } });
      }
      for (const listing of listings) await db.listing.deleteMany({ where: listing });
      if (catalogRegistered) {
        const c = suite.catalog;
        await db.city.deleteMany({ where: { id: c.cityId, regionId: c.regionId } });
        await db.region.deleteMany({ where: { id: c.regionId } });
        await db.model.deleteMany({ where: { id: c.modelId, brandId: c.brandId } });
        await db.brand.deleteMany({ where: { id: c.brandId } });
      }
      await db.session.deleteMany({ where: { id: { in: owned.sessions } } });
      await db.staffGrant.deleteMany({ where: { OR: owned.grants } });
      for (const id of owned.users) {
        const user = await db.user.findUnique({ where: { id }, include: { _count: true } });
        // User deletion cascades to many contexts. Preserve any actor with an unknown
        // descendant instead of treating a namespace or owned parent as authority.
        if (user) {
          expect(Object.values(user._count).every(count => count === 0), "Teardown refused: unregistered user descendant").toBe(true);
          await db.user.delete({ where: { id } });
        }
      }
    } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "Owned fixture teardown failed; test assertions are reported separately");
  }

  beforeAll(async () => {
    // Existing erasure/lifecycle pattern: deterministic Date, with real timers still active.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(initialTime);
    const testing = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, load: [() => ({ DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private" })] }),
      EventEmitterModule.forRoot(), bullTestRoot(), DiagnosticsModule, JwtModule.register({ global: true, secret: "synthetic-diagnostic-test" })] })
      .overrideProvider(IDENTITY_CLOCK_PORT).useValue({ now: () => now })
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => now, id: randomUUID, publicSyntheticAllowed: () => true,
        syntheticAllowed: ({ userId }: { userId: string }) => people.some(who => suite.id(who) === userId) }).compile();
    app = testing.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    db = app.get(PrismaService); jwt = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
    objects = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000", region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
    await objects.send(new HeadBucketCommand({ Bucket: "diagnostic-test-private" }));
    // Read-only collision fence. A previous attempt is preserved, never startup-cleaned.
    expect(await db.user.count({ where: { OR: [{ id: { in: people.map(who => suite.id(who)) } },
      { phone: { in: people.map(who => suite.phone(who)) } }] } })).toBe(0);
    expect(await db.session.count({ where: { id: { in: people.map(who => suite.id(`${who}-session`)) } } })).toBe(0);
    expect(await db.diagnosticCenter.count({ where: { OR: [{ id: centerId }, { code: suite.slugFor("center") }] } })).toBe(0);
    expect(await db.diagnosticCenterAssignment.count({ where: { id: { in: [
      ...people.filter(who => capability[who]).map(who => suite.id(`${who}-qualification`)), suite.id("template-qualification"),
    ] } } })).toBe(0);
    // e2eSuite.ts cross-context convention: real persisted identity Sessions, staff
    // grants/qualifications, catalog and active personal Listings are prerequisites.
    // No production authority adapter is overridden. All diagnostic state uses HTTP.
    expect(await db.listing.count({ where: { id: { in: [suite.id("listing-A"), suite.id("listing-B")] } } })).toBe(0);
    const c = suite.catalog;
    expect(await db.brand.count({ where: { OR: [{ id: c.brandId }, { slug: c.brandSlug }] } })).toBe(0);
    expect(await db.model.count({ where: { OR: [{ id: c.modelId }, { slug: c.modelSlug }] } })).toBe(0);
    expect(await db.region.count({ where: { OR: [{ id: c.regionId }, { slug: c.regionSlug }] } })).toBe(0);
    expect(await db.city.count({ where: { OR: [{ id: c.cityId }, { slug: c.citySlug }] } })).toBe(0);
    catalogRegistered = true;
    await seedSuiteCatalog(db, suite);
    for (const who of people) {
      owned.users.push(suite.id(who));
      await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), role: "buyer", phoneVerifiedAt: now } });
      owned.sessions.push(suite.id(`${who}-session`));
      await db.session.create({ data: { id: suite.id(`${who}-session`), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: future, adminTotpExpiresAt: future } });
      if (capability[who]) {
        const grant = { userId: suite.id(who), capability: capability[who]! }; owned.grants.push(grant);
        await db.staffGrant.create({ data: grant });
      }
    }
    for (const [name, seller] of [["A", "sellerA"], ["B", "sellerB"]] as const) {
      const listing = { id: suite.id(`listing-${name}`), sellerId: suite.id(seller) };
      listings.push(listing);
      await db.listing.create({ data: { ...listing, brandId: c.brandId, modelId: c.modelId, cityId: c.cityId,
        status: "active", vin: "SYN-VIN-041", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    }
    ownsCenter = true;
    await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("center"), names: localized } });
    for (const who of people) if (capability[who]) {
      const id = suite.id(`${who}-qualification`); owned.qualifications.push(id);
      await db.diagnosticCenterAssignment.create({ data: { id, centerId, userId: suite.id(who), capability: capability[who]!, qualifiedUntil: future } });
    }
    const templateGrant = { userId: suite.id("reception"), capability: "diagnostics.templates" }; owned.grants.push(templateGrant);
    await db.staffGrant.create({ data: templateGrant });
    owned.qualifications.push(suite.id("template-qualification"));
    await db.diagnosticCenterAssignment.create({ data: { id: suite.id("template-qualification"), centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: future } });
    const published = await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true });
    if (typeof published.body.id === "string") templateId = published.body.id;
    expect(published.status, JSON.stringify(published.body)).toBe(201);
  });
  afterAll(async () => {
    try { await teardownOwnedFixtures(); } finally { try { objects?.destroy(); await app?.close(); } finally { vi.useRealTimers(); } }
  });
  async function visit(observation: Observation, visitName: "A" | "B", seller: "sellerA" | "sellerB"): Promise<Order> {
    const requestKey = randomUUID(); owned.requestKeys.push(requestKey);
    const response = await post(seller, "orders", { requestKey, centerId,
      templateVersionId: templateId, audience: "listing_public", listingId: suite.id(`listing-${visitName}`), synthetic: true });
    let order = response.body;
    if (typeof order.id === "string") {
      owned.orders.push(order.id);
      owned.assignments.push({ orderId: order.id, userId: suite.id("reception"), capability: "diagnostics.reception" });
    }
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(order).toMatchObject({ version: 0, audience: "listing_public", listingId: suite.id(`listing-${visitName}`) });
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ commissionerId: suite.id(seller), listingId: suite.id(`listing-${visitName}`) });
    for (const [who, expectedVersion, nextVersion] of [["technician", 0, 1], ["reviewer", 1, 2]] as const) {
      owned.assignments.push({ orderId: order.id, userId: suite.id(who), capability: capability[who]! });
      ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion,
        userId: suite.id(who), capability: capability[who], active: true }).expect(201));
      expect(order.version).toBe(nextVersion);
    }
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: 2,
      kind: "physical", authorityReference: `Synthetic physical authorization for visit ${visitName}` }).expect(201));
    expect(order.version).toBe(3);
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: 3,
      kind: "publication", authorityReference: `Fresh synthetic publication consent from ${seller} for Listing ${visitName}` }).expect(201));
    expect(order.version).toBe(4);
    for (const [state, expectedVersion, nextVersion] of [["confirmed", 4, 5], ["arrived", 5, 6]] as const) {
      ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion, state }).expect(201));
      expect(order.version).toBe(nextVersion);
    }
    const observed = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: 6, ...observation });
    const records = await get("technician", `orders/${order.id}/identity-records`);
    if (Array.isArray(records.body)) owned.raw.push(...records.body.map((record: Raw) => record.id));
    expect(records.status, JSON.stringify(records.body)).toBe(200);
    expect(observed.status, JSON.stringify(observed.body)).toBe(201); order = observed.body;
    expect(order).toMatchObject({ version: 7, status: "arrived", physicalAuthorized: true, publicationAuthorized: true, vehicleMatched: true, observedVehicle: observation });
    return order;
  }
  function intent(o: Order, id: string, image: Image = red, classification = rights) {
    return { id, expectedOrderVersion: o.version, contentType: "image/png", sizeBytes: image.inputSize, rights: classification };
  }
  async function stage(o: Order, id: string, image: Image = red, classification = rights) {
    owned.provenance.push(id);
    owned.keys.add(key(id, image));
    const response = await post("technician", provenancePath(o), intent(o, id, image, classification)).expect(201);
    privateNoStore(response); expect(response.body).toEqual({ id, state: "staged" });
    expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } })).toMatchObject({
      orderId: o.id, state: "staged", rights: classification, rightsUntil: new Date("2026-12-01T00:00:00.000Z"),
      contentType: "image/png", declaredSizeBytes: image.inputSize, objectKey: null, sha256: null,
    });
    await expect(objects.send(new HeadObjectCommand({ Bucket: "diagnostic-test-private", Key: key(id, image) })))
      .rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  }
  const upload = (o: Order, id: string, image: Image = red) => request.put(`/api/v1/diagnostics/${provenancePath(o, id)}?expectedOrderVersion=${o.version}`)
    .set(headers("technician")).set("content-type", "application/octet-stream").set("x-evidence-type", "image/png").send(Buffer.from(image.input, "base64"));
  async function verified(o: Order, id: string, image: Image = red, classification = rights) {
    await stage(o, id, image, classification);
    const response = await upload(o, id, image).expect(200);
    privateNoStore(response); expect(response.body).toEqual({ ...metadata(id, image), state: "verified" });
    return response.body;
  }
  async function capture(o: Order, raw: Raw, p: string, image: Image, classification = rights) {
    expect(o.version).toBe(7);
    const input = { id: randomUUID(), expectedOrderVersion: 7, identityRecordId: raw.id,
      identifiers: identifiers(p, "SYN-VIN-041"), rights: classification, correction: null };
    owned.evidence.push(input.id);
    const response = await post("technician", evidencePath(o), input).expect(201); privateNoStore(response);
    expect(response.body).toEqual({ id: input.id, orderId: o.id, orderVersion: 8, identityRecordId: raw.id,
      observationHash: raw.observationHash, observation: raw.observation, identifiers: input.identifiers,
      provenance: [metadata(p, image)], rights: classification, correction: null, recordHash: expect.stringMatching(hash),
      recordedBy: suite.id("technician"), recordedAt: initialTime.toISOString() });
    o.version = 8; expect(await version(o)).toBe(8);
    return response.body;
  }
  async function release(o: Order) {
    const reportId = randomUUID(); owned.reports.push(reportId);
    const { body: draft } = await post("technician", `orders/${o.id}/reports`, { reportId, expectedOrderVersion: 8 }).expect(201);
    const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    owned.findings.push(finding.id);
    await post("technician", `reports/${draft.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${draft.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    const finalized = await post("reviewer", `reports/${draft.id}/transition`, { expectedVersion: 2, action: "finalize" });
    // Capture server-generated intents before any status assertion can interrupt ownership.
    const documents = await db.diagnosticPdfArtifact.findMany({ where: { reportId } });
    owned.pdfs.push(...documents.map(document => document.id));
    for (const document of documents) owned.keys.add(`diagnostic-pdf/${reportId}/${document.id}.pdf`);
    expect(finalized.status, JSON.stringify(finalized.body)).toBe(201);
    const documentResponse = await get("technician", `reports/${draft.id}/documents`).expect(200); privateNoStore(documentResponse);
    expect(documentResponse.body.map((document: { id: string }) => document.id).sort()).toEqual(documents.map(document => document.id).sort());
    return (await get("reviewer", `reports/${draft.id}`).expect(200)).body;
  }
  async function comparativeBytes(b: Order, reportId: string, p: string, image: Image) {
    const response = await get("reviewer", `orders/${b.id}/reinspection-comparison/provenance/${p}?predecessorId=${reportId}`).expect(200);
    privateNoStore(response);
    expect(response.headers["content-type"]).toContain("image/webp");
    const bytes = Buffer.from(response.body);
    expect(bytes.toString("base64")).toBe(image.output); expect(bytes.length).toBe(image.sizeBytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(image.sha256);
  }

  async function denied(response: Awaited<ReturnType<typeof get>>) {
    expect(response.status).toBe(403); privateNoStore(response); expect(response.body).toEqual(deniedBody);
  }

  const publicGet = (path: string) => request.get(`/api/v1/public-diagnostics/${path}`);
  it("links independently observed public visits across distinct sellers and Listings without transferring restricted authority", async () => {
    expect(suite.id("reviewer")).not.toBe(suite.id("technician"));
    expect(suite.id("sellerA")).not.toBe(suite.id("sellerB"));
    expect(suite.id("listing-A")).not.toBe(suite.id("listing-B"));
    const original: Observation = { observedAt: "2026-10-21T10:00:00.000Z", mileageKm: 123000,
      method: "vin", vin: "SYN-VIN-041", manualReference: null };
    const revisit: Observation = { ...original, observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100 };
    const a = await visit(original, "A", "sellerA"); const [ia] = await history(a);
    const pa = randomUUID(); await verified(a, pa, red); const ea = await capture(a, ia!, pa, red);
    const releasedA = await release(a);
    const beforeA = (await get("sellerA", `reports/${releasedA.id}`).expect(200)).body;
    const publicA = (await publicGet(`reports/${releasedA.id}`).expect(200)).body;
    const storedA = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: releasedA.id } });
    const artifactsA = await db.diagnosticPdfArtifact.findMany({ where: { reportId: releasedA.id }, orderBy: { id: "asc" } });
    expect(storedA).toMatchObject({ version: 3, audience: "listing_public", identityRecordId: ia!.id,
      identityRecordHash: ia!.observationHash, identityEvidenceId: ea.id, identityEvidenceHash: ea.recordHash,
      snapshotHash: expect.stringMatching(hash), finalizedAt: initialTime });
    expect(releasedA).toMatchObject({ status: "finalized", version: 3, observedAt: original.observedAt, mileageKm: 123000 });
    expect(artifactsA.map(row => row.locale).sort()).toEqual(["en", "ru", "tk"]);
    const b = await visit(revisit, "B", "sellerB"); const [ib] = await history(b);
    const pb = randomUUID(); expect(pb).not.toBe(pa);
    expect(red.sha256).not.toBe(blue.sha256);
    await verified(b, pb, blue, rightsB); const eb = await capture(b, ib!, pb, blue, rightsB);
    const rawA = await history(a); const rawB = await history(b);
    for (const [order, raw, observation] of [[a, rawA, original], [b, rawB, revisit]] as const) {
      expect(raw).toEqual([{ id: expect.stringMatching(uuid), orderId: order.id, orderVersion: 7,
        observationHash: expect.stringMatching(hash), observation, recordedBy: suite.id("technician"), recordedAt: initialTime.toISOString() }]);
      expect(await version(order)).toBe(8);
    }
    expect(ib!.id).not.toBe(ia!.id);
    const orderA = await db.inspectionOrder.findUniqueOrThrow({ where: { id: a.id } });
    const orderB = await db.inspectionOrder.findUniqueOrThrow({ where: { id: b.id } });
    for (const [order, seller, listing] of [[orderA, "sellerA", "listing-A"], [orderB, "sellerB", "listing-B"]] as const) {
      expect(order).toMatchObject({ audience: "listing_public", commissionerId: suite.id(seller), listingId: suite.id(listing),
        version: 8, associationValidatedAt: initialTime });
      expect(order.physicalAuthorization).not.toBeNull(); expect(order.publicationAuthorization).not.toBeNull();
      expect(order.listingIdentityDigest).toMatch(hash);
      expect(await db.user.findUniqueOrThrow({ where: { id: suite.id(seller) } })).toMatchObject({ deletionScheduledAt: null, suspendedAt: null });
      expect(await db.listing.findUniqueOrThrow({ where: { id: suite.id(listing) } })).toMatchObject({ sellerId: suite.id(seller), status: "active", businessId: null });
    }
    expect(orderA.publicationAuthorization).not.toEqual(orderB.publicationAuthorization);
    expect(orderA.physicalAuthorization).not.toEqual(orderB.physicalAuthorization);
    const comparison = await get("reviewer", comparisonPath(b, releasedA.id)).expect(200); privateNoStore(comparison);
    expect(comparison.body).toEqual({
      predecessor: { reportId: releasedA.id, reportVersion: 3, snapshotHash: storedA.snapshotHash,
        identityRecordId: ia!.id, identityRecordHash: ia!.observationHash,
        identity: { observation: original, evidence: ea, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } },
      candidate: { orderId: b.id, orderVersion: 8, identityRecordId: ib!.id, identityRecordHash: ib!.observationHash,
        identity: { observation: revisit, evidence: eb, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } },
    });
    await comparativeBytes(b, releasedA.id, pa, red); await comparativeBytes(b, releasedA.id, pb, blue);
    for (const [order, id, image, classification] of [[a, pa, red, rights], [b, pb, blue, rightsB]] as const) {
      expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } })).toMatchObject({ orderId: order.id,
        state: "verified", rights: classification, rightsUntil: new Date("2026-12-01T00:00:00.000Z"), objectKey: key(id, image),
        sha256: image.sha256, erasedAt: null, cleanupRequestedAt: null });
    }
    for (const who of ["sellerA", "sellerB", "outsider"] as const) {
      await denied(await get(who, comparisonPath(b, releasedA.id)));
      for (const order of [a, b]) {
        await denied(await get(who, `orders/${order.id}/identity-records`));
        await denied(await get(who, evidencePath(order)));
      }
      for (const id of [pa, pb]) await denied(await get(who, `orders/${b.id}/reinspection-comparison/provenance/${id}?predecessorId=${releasedA.id}`));
    }
    expect((await get("reviewer", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: b.id } })).toBe(0);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: releasedA.id } })).toEqual(storedA);
    expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: releasedA.id }, orderBy: { id: "asc" } })).toEqual(artifactsA);
    expect((await get("reviewer", `reports/${releasedA.id}`).expect(200)).body).toEqual(releasedA);
    const auditsBefore = await db.diagnosticAudit.findMany({ where: { centerId } });
    // SETUP GATE: exact raw7/capture8, immutable A, own B material and both byte/hash
    // downloads precede criterion RED. Current privatePair predicts 403, never accepted here.
    const rationale = "Independent public visits with consistent retained VIN and chassis stamps across different personal sellers and Listings";
    const issuance = await post("reviewer", `orders/${b.id}/continuity-proofs`, {
      predecessorId: releasedA.id, expectedPredecessorVersion: 3, expectedOrderVersion: 8,
      predecessorIdentityRecordId: ia!.id, candidateIdentityRecordId: ib!.id, linkingTechnicianId: suite.id("technician"),
      method: "comparative_attestation", rationale, provenanceRecordIds: [pa, pb],
    });
    if (typeof issuance.body.proofId === "string") owned.proofs.push(issuance.body.proofId);
    expect(issuance.status, JSON.stringify(issuance.body)).toBe(201); privateNoStore(issuance);
    expect(issuance.body).toEqual({ proofId: expect.stringMatching(uuid) });
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: b.id } })).toBe(1);
    const issuedAudits = await db.diagnosticAudit.findMany({ where: { centerId, id: { notIn: auditsBefore.map(row => row.id) } } });
    expect(issuedAudits).toHaveLength(1);
    expect(issuedAudits[0]).toMatchObject({ orderId: b.id, actorId: suite.id("reviewer"), action: "CONTINUITY_PROOF_ISSUED", details: {} });
    const issued = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: issuance.body.proofId } });
    // Existing stable facts only. Future public Listing/publisher digest layout belongs
    // to the source round; this checkpoint does not invent a caller DTO or binding shape.
    expect(issued.bindings).toMatchObject({
      predecessor: { id: a.id, audience: "listing_public", commissionerId: suite.id("sellerA"), version: 8, evidenceGeneration: 1 },
      candidate: { id: b.id, audience: "listing_public", commissionerId: suite.id("sellerB"), version: 8, evidenceGeneration: 1 },
      evidencePins: [{ orderId: a.id, id: ea.id, hash: ea.recordHash }, { orderId: b.id, id: eb.id, hash: eb.recordHash }],
      evidence: [{ id: ea.id, recordHash: ea.recordHash }, { id: eb.id, recordHash: eb.recordHash }],
      provenance: expect.arrayContaining([{ id: pa, sha256: red.sha256, epoch: expect.any(String), rightsHash: expect.stringMatching(hash) },
        { id: pb, sha256: blue.sha256, epoch: expect.any(String), rightsHash: expect.stringMatching(hash) }]),
    });
    expect(issued).toMatchObject({ predecessorReportId: releasedA.id, predecessorOrderId: a.id, candidateOrderId: b.id,
      issuerId: suite.id("reviewer"), issuerSessionId: suite.id("reviewer-session"), linkingTechnicianId: suite.id("technician"),
      issuedAt: initialTime, consumedAt: null, consumedReportId: null, invalidatedAt: null });
    const proofPath = `orders/${b.id}/continuity-proofs/${issuance.body.proofId}`;
    const proof = await get("reviewer", proofPath).expect(200); privateNoStore(proof);
    expect(proof.body).toEqual({ proofId: issuance.body.proofId, policyVersion: "ADR-0108",
      predecessor: { reportId: releasedA.id, reportVersion: 3, snapshotHash: storedA.snapshotHash,
        identityRecordId: ia!.id, identityRecordHash: ia!.observationHash },
      candidate: { orderId: b.id, orderVersion: 8, identityRecordId: ib!.id, identityRecordHash: ib!.observationHash },
      linkingTechnicianId: suite.id("technician"), method: "comparative_attestation", result: "same_vehicle", rationale,
      provenanceRecordIds: [pa, pb], issuedBy: suite.id("reviewer"), issuedAt: initialTime.toISOString() });
    const technicianProof = await get("technician", proofPath).expect(200); privateNoStore(technicianProof);
    expect(technicianProof.body).toEqual(proof.body);
    for (const who of ["sellerA", "sellerB", "outsider"] as const) await denied(await get(who, proofPath));
    expect((await get("reviewer", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);
    expect(await version(b)).toBe(8);
    const reportId = randomUUID(); owned.reports.push(reportId);
    const input = { reportId, predecessorId: releasedA.id, expectedOrderVersion: 8,
      reason: "Independent new physical visit commissioned by seller B", proofId: issuance.body.proofId };
    const created = await post("technician", `orders/${b.id}/reinspections`, input).expect(201); privateNoStore(created);
    expect(created.body).toEqual({ id: reportId, orderId: b.id, audience: "listing_public", status: "draft", version: 0,
      templateVersionId: templateId, template: definition, observedAt: revisit.observedAt, mileageKm: 123100, findings: [],
      authorId: suite.id("technician"), reviewerId: null, successorOf: releasedA.id, correctionReason: input.reason,
      returnReason: null, finalizedAt: null, withdrawnAt: null, withdrawalReason: null, synthetic: true,
      supersededBy: null, lineageKind: "reinspection" });
    expect((await get("technician", `orders/${b.id}/reports`).expect(200)).body).toEqual([created.body]);
    expect((await get("technician", `reports/${reportId}/documents`).expect(200)).body).toEqual([]);
    expect(await db.diagnosticEvidence.count({ where: { reportId } })).toBe(0);
    expect(await db.diagnosticPdfArtifact.count({ where: { reportId } })).toBe(0);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({
      identityRecordId: ib!.id, identityRecordHash: ib!.observationHash, identityEvidenceId: eb.id, identityEvidenceHash: eb.recordHash });
    const consumed = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: issuance.body.proofId } });
    expect(consumed).toMatchObject({ consumedReportId: reportId, consumedAt: initialTime });
    const auditsAfter = await db.diagnosticAudit.findMany({ where: { centerId }, orderBy: { id: "asc" } });
    const newAudits = auditsAfter.filter(row => !auditsBefore.some(before => before.id === row.id));
    expect(newAudits.map(row => row.action).sort()).toEqual(["CONTINUITY_PROOF_CONSUMED", "CONTINUITY_PROOF_ISSUED", "REPORT_REINSPECTION_CREATED"]);
    expect(newAudits.every(row => row.orderId === b.id)).toBe(true);
    expect(newAudits.filter(row => row.action !== "CONTINUITY_PROOF_ISSUED").every(row => row.actorId === suite.id("technician"))).toBe(true);
    const retry = await post("technician", `orders/${b.id}/reinspections`, input).expect(201); privateNoStore(retry);
    expect(retry.body).toEqual(created.body);
    // Changed persisted binding conflicts even when reportId names the existing draft.
    await post("technician", `orders/${b.id}/reinspections`, { ...input, proofId: randomUUID() }).expect(409);
    await post("technician", `orders/${b.id}/reinspections`, { ...input, reason: "Changed binding" }).expect(409);
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: issuance.body.proofId } })).toEqual(consumed);
    expect(await db.diagnosticAudit.findMany({ where: { centerId }, orderBy: { id: "asc" } })).toEqual(auditsAfter);
    expect((await get("reviewer", proofPath).expect(200)).body).toEqual(proof.body);
    expect((await get("sellerA", `reports/${releasedA.id}`).expect(200)).body).toEqual(beforeA);
    expect((await publicGet(`reports/${releasedA.id}`).expect(200)).body).toEqual(publicA);
    await publicGet(`reports/${reportId}`).expect(404);
    await denied(await get("sellerA", `reports/${reportId}`));
    await denied(await get("sellerA", `reports/${reportId}/documents`));
    await denied(await get("sellerB", `reports/${reportId}`));
    await denied(await get("sellerB", `reports/${reportId}/documents`));
    await publicGet(`reports/${reportId}/documents`).expect(404);
    // Neither the link nor public lineage grants identity material or copies A's objects.
    await denied(await get("sellerB", `reports/${releasedA.id}`));
    await denied(await get("sellerB", `reports/${releasedA.id}/documents`));
    await denied(await get("sellerB", `reports/${releasedA.id}/documents/en`));
    await denied(await get("sellerB", provenancePath(a, pa)));
    await publicGet(`reports/${reportId}/evidence/${pa}`).expect(404);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: releasedA.id } })).toEqual(storedA);
    expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: releasedA.id }, orderBy: { id: "asc" } })).toEqual(artifactsA);
    const findingB = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: "Independent B physical inspection finding",
      evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    owned.findings.push(findingB.id);
    await post("technician", `reports/${reportId}/findings`, { expectedVersion: 0, finding: findingB }).expect(201);
    await post("technician", `reports/${reportId}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("technician", `reports/${reportId}/transition`, { expectedVersion: 2, action: "finalize" }).expect(403);
    const finalized = await post("reviewer", `reports/${reportId}/transition`, { expectedVersion: 2, action: "finalize" });
    const documentsB = await db.diagnosticPdfArtifact.findMany({ where: { reportId } });
    owned.pdfs.push(...documentsB.map(row => row.id));
    for (const row of documentsB) owned.keys.add(`diagnostic-pdf/${reportId}/${row.id}.pdf`);
    expect(finalized.status, JSON.stringify(finalized.body)).toBe(201);
    expect(documentsB).toHaveLength(3);
    expect(documentsB.every(row => row.reportId === reportId && !artifactsA.some(aPdf => aPdf.id === row.id))).toBe(true);
    expect((await publicGet(`listings/${suite.id("listing-B")}`).expect(200)).body).toEqual({ listingId: suite.id("listing-B"),
      reportId, observedAt: revisit.observedAt, mileageKm: 123100, synthetic: true });
    expect((await publicGet(`reports/${reportId}`).expect(200)).body).toMatchObject({ findings: [findingB], successorOf: releasedA.id,
      observedAt: revisit.observedAt, mileageKm: 123100, status: "finalized", version: 3 });
    expect((await publicGet(`listings/${suite.id("listing-A")}`).expect(200)).body.reportId).toBe(releasedA.id);
    const publicDocumentsB = await publicGet(`reports/${reportId}/documents`).expect(200);
    expect(publicDocumentsB.body.map((row: { id: string }) => row.id).sort()).toEqual(documentsB.map(row => row.id).sort());
    await publicGet(`reports/${reportId}/evidence/${pa}`).expect(404);
    await denied(await get("sellerB", evidencePath(a)));
    await denied(await get("sellerB", proofPath));
    await post("reviewer", `reports/${reportId}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Synthetic B publication withdrawn" }).expect(201);
    await publicGet(`listings/${suite.id("listing-B")}`).expect(404);
    expect((await publicGet(`listings?ids=${suite.id("listing-B")}`).expect(200)).body).toEqual([]);
    await publicGet(`reports/${reportId}`).expect(404);
    expect((await get("sellerB", `reports/${reportId}`).expect(200)).body.status).toBe("withdrawn");
    expect((await get("sellerA", `reports/${releasedA.id}`).expect(200)).body.supersededBy).toBeNull();
    expect((await publicGet(`listings/${suite.id("listing-A")}`).expect(200)).body.reportId).toBe(releasedA.id);
    // LA is unchanged. Its public report/PDF eligibility is governed independently by LA;
    // no assertion here requires A to remain available after a future LA authority change.
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: releasedA.id } })).toEqual(storedA);
    expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: releasedA.id }, orderBy: { id: "asc" } })).toEqual(artifactsA);
    expect(await history(a)).toEqual(rawA); expect(await history(b)).toEqual(rawB);
    expect((await get("technician", evidencePath(a)).expect(200)).body).toEqual([ea]);
    expect((await get("technician", evidencePath(b)).expect(200)).body).toEqual([eb]);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: a.id } })).toEqual(orderA);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: b.id } })).toEqual(orderB);
  });

  /** Fresh visits use the original ordinary HTTP setup helpers. P1 retains every original
   * assertion; its evidence-free B finding uses Normal under the existing evidence rule. */
  async function freshPublicPair() {
    const observation: Observation = { observedAt: "2026-10-20T12:00:00.000Z", mileageKm: 124000, method: "vin", vin: "SYN-VIN-041", manualReference: null };
    const a = await visit(observation, "A", "sellerA");
    const [ia] = await history(a); const pa = randomUUID();
    await verified(a, pa, red); const ea = await capture(a, ia!, pa, red);
    const released = await release(a);
    const b = await visit({ ...observation, observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 124100 }, "B", "sellerB");
    const [ib] = await history(b); const pb = randomUUID();
    await verified(b, pb, blue, rightsB); const eb = await capture(b, ib!, pb, blue, rightsB);
    return { a,b,ia: ia!,ib: ib!,pa,pb,ea,eb,released };
  }
  async function issuePublic(p: Awaited<ReturnType<typeof freshPublicPair>>, expectedPredecessorVersion = 3) {
    const response = await post("reviewer", `orders/${p.b.id}/continuity-proofs`, { predecessorId: p.released.id, expectedPredecessorVersion,
      expectedOrderVersion: p.b.version, predecessorIdentityRecordId: p.ia.id, candidateIdentityRecordId: p.ib.id,
      linkingTechnicianId: suite.id("technician"), method: "comparative_attestation", rationale: "Independently retained synthetic VIN and chassis material",
      provenanceRecordIds: [p.pa,p.pb] });
    if (typeof response.body.proofId === "string") owned.proofs.push(response.body.proofId);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.proofId as string;
  }
  function publicLink(p: Awaited<ReturnType<typeof freshPublicPair>>, proofId: string) {
    const reportId = randomUUID(); owned.reports.push(reportId);
    return { reportId, predecessorId: p.released.id, expectedOrderVersion: p.b.version, proofId, reason: "Fresh independently authorized public visit" };
  }
  it("binds actual public identities and refuses missing-proof SQL and non-atomic consumption", async () => {
    const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p,proofId);
    const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    expect(proof.bindings).toMatchObject({
      predecessor: { audience: "listing_public", commissionerId: suite.id("sellerA"), listingBinding: { id: suite.id("listing-A"), sellerId: suite.id("sellerA"), businessId: null,
        identity: { vin: "SYN-VIN-041", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId }, identityDigest: expect.stringMatching(hash) } },
      candidate: { audience: "listing_public", commissionerId: suite.id("sellerB"), publicationAuthorizationHash: expect.stringMatching(hash),
        associationValidatedAt: initialTime.toISOString(), listingBinding: { id: suite.id("listing-B"), sellerId: suite.id("sellerB"), businessId: null,
          publisher: { userId: suite.id("sellerB"), sellerId: suite.id("sellerB"), businessId: null, membershipId: null, generation: expect.stringMatching(hash) } } },
    });
    const { proofId: _, ...missing } = input;
    await denied(await post("technician", `orders/${p.b.id}/reinspections`, missing));
    const state = { id: input.reportId, orderId: p.b.id, audience: "listing_public", status: "draft", templateVersionId: templateId,
      observedAt: p.ib.observation.observedAt, mileageKm: p.ib.observation.mileageKm, findings: [], authorId: suite.id("technician"), reviewerId: null,
      successorOf: p.released.id, correctionReason: input.reason, returnReason: null, finalizedAt: null, withdrawnAt: null, withdrawalReason: null };
    const data = { id: input.reportId, orderId: p.b.id, audience: "listing_public", templateVersionId: templateId!, predecessorId: p.released.id,
      reinspection: true, identityRecordId: p.ib.id, identityRecordHash: p.ib.observationHash, identityEvidenceId: p.eb.id, identityEvidenceHash: p.eb.recordHash, state };
    await expect(db.diagnosticReportRecord.create({ data })).rejects.toThrow(/diagnostic_reinspection_continuity/);
    // Marking a proof consumed without its report/audits must fail at commit and roll back.
    await expect(db.$transaction(async tx => {
      await tx.diagnosticContinuityProof.update({ where: { id: proofId }, data: { consumedReportId: input.reportId, consumedAt: initialTime } });
    })).rejects.toThrow(/diagnostic_public_continuity_consumption_atomic/);
    // A proof and report without the consumption/creation audits also roll back together.
    await expect(db.$transaction(async tx => {
      await tx.diagnosticContinuityProof.update({ where: { id: proofId }, data: { consumedReportId: input.reportId, consumedAt: initialTime } });
      await tx.diagnosticReportRecord.create({ data: { ...data, continuityProofId: proofId, reinspectionOrderVersion: p.b.version } });
    })).rejects.toThrow(/diagnostic_public_continuity_consumption_atomic/);
    expect(await db.diagnosticReportRecord.findUnique({ where: { id: input.reportId } })).toBeNull();
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(proof);
    await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201);
  });
  it("permanently refuses the SAME unused proof after the personal publisher is suspended then restored", async () => {
    const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p,proofId);
    try {
      await db.user.update({ where: { id: suite.id("sellerB") }, data: { suspendedAt: initialTime } });
      const invalid = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
      expect(invalid.invalidatedAt).toBeInstanceOf(Date);
      await db.user.update({ where: { id: suite.id("sellerB") }, data: { suspendedAt: null } });
      await denied(await post("technician", `orders/${p.b.id}/reinspections`, input));
      expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(invalid);
      expect(await db.diagnosticReportRecord.findUnique({ where: { id: input.reportId } })).toBeNull();
      const replacement = await issuePublic(p);
      expect(replacement).not.toBe(proofId);
      await post("technician", `orders/${p.b.id}/reinspections`, { ...input, proofId: replacement }).expect(201);
    } finally { await db.user.update({ where: { id: suite.id("sellerB") }, data: { suspendedAt: null } }); }
  });
  it("rechecks B publisher power at independent release while preserving its consumed link and ordinary draft writes", async () => {
    const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p,proofId);
    await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201);
    const consumed = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    try {
      await db.user.update({ where: { id: suite.id("sellerB") }, data: { suspendedAt: initialTime } });
      const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
      owned.findings.push(finding.id);
      await post("technician", `reports/${input.reportId}/findings`, { expectedVersion: 0, finding }).expect(201);
      await post("technician", `reports/${input.reportId}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
      await denied(await post("reviewer", `reports/${input.reportId}/transition`, { expectedVersion: 2, action: "finalize" }));
      expect((await get("reviewer", `reports/${input.reportId}`).expect(200)).body).toMatchObject({ version: 2, status: "submitted", findings: [finding] });
      expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(consumed);
      await db.user.update({ where: { id: suite.id("sellerB") }, data: { suspendedAt: null } });
      // A changes after consumption; B publication must never re-run A admission.
      await post("reviewer", `reports/${p.released.id}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Independent A history" }).expect(201);
      const finalized = await post("reviewer", `reports/${input.reportId}/transition`, { expectedVersion: 2, action: "finalize" });
      const pdfs = await db.diagnosticPdfArtifact.findMany({ where: { reportId: input.reportId } });
      owned.pdfs.push(...pdfs.map(row => row.id));
      for (const row of pdfs) owned.keys.add(`diagnostic-pdf/${input.reportId}/${row.id}.pdf`);
      expect(finalized.status, JSON.stringify(finalized.body)).toBe(201);
      expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(consumed);
    } finally { await db.user.update({ where: { id: suite.id("sellerB") }, data: { suspendedAt: null } }); }
  });
  it("admits retained withdrawn A without requiring its historical personal seller to publish B", async () => {
    const p = await freshPublicPair();
    await post("reviewer", `reports/${p.released.id}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Retained historical predecessor" }).expect(201);
    const historical = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id } });
    try {
      await db.user.update({ where: { id: suite.id("sellerA") }, data: { suspendedAt: initialTime } });
      const proofId = await issuePublic(p,4); const input = publicLink(p,proofId);
      await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201);
      expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id } })).toEqual(historical);
      expect((await get("technician", `reports/${input.reportId}`).expect(200)).body).toMatchObject({ findings: [], orderId: p.b.id, successorOf: p.released.id });
    } finally { await db.user.update({ where: { id: suite.id("sellerA") }, data: { suspendedAt: null } }); }
  });
  it("permanently invalidates the SAME business publisher proof across membership revoke and restore", async () => {
    const businessId = suite.id("public-transfer-business");
    const members = [{ id: suite.id("public-transfer-owner"), userId: suite.id("sellerA"), role: "owner" as const },
      { id: suite.id("public-transfer-sales"), userId: suite.id("sellerB"), role: "sales" as const }];
    // Other-context prerequisites use real identity/Listing rows, never a publisher Session.
    await db.dealership.create({ data: { id: businessId, slug: suite.slugFor("public-transfer-business"), name: "Synthetic public transfer business", status: "active", admissionMode: "synthetic" } });
    try {
      for (const member of members) await db.dealershipMember.create({ data: { ...member, dealershipId: businessId, status: "active" } });
      for (const name of ["A","B"]) await db.listing.update({ where: { id: suite.id(`listing-${name}`) }, data: { businessId } });
      const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p,proofId);
      const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
      expect(proof.bindings).toMatchObject({ candidate: { listingBinding: { businessId,
        publisher: { userId: suite.id("sellerB"), membershipId: members[1]!.id, businessId, generation: expect.stringMatching(hash) } } } });
      const memberBefore = await db.dealershipMember.findUniqueOrThrow({ where: { id: members[1]!.id } });
      await db.dealershipMember.update({ where: { id: memberBefore.id }, data: { status: "suspended" } });
      const invalid = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
      expect(invalid.invalidatedAt).toBeInstanceOf(Date);
      await db.dealershipMember.update({ where: { id: memberBefore.id }, data: { status: "active" } });
      expect(await db.dealershipMember.findUniqueOrThrow({ where: { id: memberBefore.id } })).toEqual(memberBefore);
      await denied(await post("technician", `orders/${p.b.id}/reinspections`, input));
      expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(invalid);
      const replacement = await issuePublic(p);
      await post("technician", `orders/${p.b.id}/reinspections`, { ...input, proofId: replacement }).expect(201);
    } finally {
      // Exact registered business fixture only. Unknown descendants refuse cleanup.
      for (const name of ["A","B"]) await db.listing.update({ where: { id: suite.id(`listing-${name}`) }, data: { businessId: null } });
      const actual = await db.dealershipMember.findMany({ where: { dealershipId: businessId } });
      expect(actual.every(row => members.some(member => member.id === row.id && member.userId === row.userId)), "Unknown business member descendant").toBe(true);
      await db.dealershipMember.deleteMany({ where: { dealershipId: businessId, id: { in: members.map(member => member.id) } } });
      const business = await db.dealership.findUniqueOrThrow({ where: { id: businessId }, include: { _count: true } });
      expect(Object.values(business._count).every(count => count === 0), "Unknown business descendant").toBe(true);
      await db.dealership.delete({ where: { id: businessId } });
    }
  });

});
