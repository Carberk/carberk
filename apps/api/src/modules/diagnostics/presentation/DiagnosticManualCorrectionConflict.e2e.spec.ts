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
import { defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../domain/ports/DiagnosticIntakePort";

const suite = defineE2eSuite("diagnostic-manual-correction-conflict");
const people = ["buyer", "outsider", "reception", "technician", "reviewer"] as const;
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
const green = { input: "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVR4nGNg+M+AQMRxAJ6jD/Flt2QIAAAAAElFTkSuQmCC",
  inputSize: 93, output: "UklGRkAAAABXRUJQVlA4IDQAAAAQAgCdASoEAAQAAMASJaACdLoB+AH6AAPIAP7uvZ//cvafonw/7qK//lB+EYg2/+ViAAAA",
  sizeBytes: 72, sha256: "509e7da53b0521a390e0a31093afaee9e5298e1351f383c326678c5fec5c0324" };
type Image = typeof red;
type Observation = { observedAt: string; mileageKm: number; method: "manual" | "vin"; vin: string | null; manualReference: string | null };
type Order = { id: string; version: number };
type Raw = { id: string; orderId: string; orderVersion: number; observationHash: string; observation: Observation; recordedBy: string; recordedAt: string };
const identifiers = (provenanceId: string, chassis: "SYN-CHASSIS-04I" | "SYN-CHASSIS-041") => [
  { kind: "chassis_stamp", location: "Synthetic chassis plate", value: chassis as string, provenanceIds: [provenanceId] },
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
// Each serial case owns its visits, complete correction chain and private objects.
describe("private manual correction retained conflict and expired ancestor rights", { concurrent: false }, () => {
  let app: NestFastifyApplication; let db: PrismaService; let jwt: JwtService;
  let request: ReturnType<typeof supertest>; let objects: S3Client;
  let templateId: string;
  let now = initialTime;
  const owned = { orders: [] as string[], reports: [] as string[], pdfs: [] as string[],
    raw: [] as string[], evidence: [] as string[], provenance: [] as string[], proofs: [] as string[], keys: new Set<string>(), users: [] as string[],
    sessions: [] as string[], grants: [] as { userId: string; capability: string }[], qualifications: [] as string[],
    requestKeys: [] as string[], findings: [] as string[], assignments: [] as { orderId: string; userId: string; capability: string }[] };
  let ownsCenter = false;
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
        && order.commissionerId === suite.id("buyer") && owned.requestKeys.includes(order.requestKey)),
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
        commissionerId: suite.id("buyer"), requestKey: { in: owned.requestKeys } } });
      if (ownsCenter) {
        await db.diagnosticTemplateVersion.deleteMany({ where: { id: templateId ?? "unissued-template" } });
        await db.diagnosticCenterAssignment.deleteMany({ where: { id: { in: owned.qualifications } } });
        await db.diagnosticCenter.delete({ where: { id: centerId } });
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
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => now, id: randomUUID, publicSyntheticAllowed: () => false,
        syntheticAllowed: ({ userId }: { userId: string }) => people.some(who => suite.id(who) === userId) }).compile();
    app = testing.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    db = app.get(PrismaService); jwt = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
    objects = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000", region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
    await objects.send(new HeadBucketCommand({ Bucket: "diagnostic-test-private" }));
    // Read-only collision fences preserve any previous attempt before registration.
    expect(await db.user.count({ where: { OR: [{ id: { in: people.map(who => suite.id(who)) } },
      { phone: { in: people.map(who => suite.phone(who)) } }] } })).toBe(0);
    expect(await db.session.count({ where: { id: { in: people.map(who => suite.id(`${who}-session`)) } } })).toBe(0);
    expect(await db.diagnosticCenter.count({ where: { OR: [{ id: centerId }, { code: suite.slugFor("center") }] } })).toBe(0);
    expect(await db.diagnosticCenterAssignment.count({ where: { id: { in: [
      ...people.filter(who => capability[who]).map(who => suite.id(`${who}-qualification`)), suite.id("template-qualification"),
    ] } } })).toBe(0);
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
    await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("center"), names: localized } });
    ownsCenter = true;
    for (const who of people) if (capability[who]) {
      const id = suite.id(`${who}-qualification`); owned.qualifications.push(id);
      await db.diagnosticCenterAssignment.create({ data: { id, centerId, userId: suite.id(who), capability: capability[who]!, qualifiedUntil: future } });
    }
    const templateGrant = { userId: suite.id("reception"), capability: "diagnostics.templates" }; owned.grants.push(templateGrant);
    await db.staffGrant.create({ data: templateGrant });
    owned.qualifications.push(suite.id("template-qualification"));
    await db.diagnosticCenterAssignment.create({ data: { id: suite.id("template-qualification"), centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: future } });
    templateId = (await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true }).expect(201)).body.id;
  });
  afterAll(async () => {
    try { await teardownOwnedFixtures(); } finally { try { objects?.destroy(); await app?.close(); } finally { vi.useRealTimers(); } }
  });
  async function visit(observation: Observation, visitName: string): Promise<Order> {
    const requestKey = randomUUID();
    expect(await db.inspectionOrder.count({ where: { commissionerId: suite.id("buyer"), requestKey } })).toBe(0);
    owned.requestKeys.push(requestKey);
    const response = await post("buyer", "orders", { requestKey, centerId,
      templateVersionId: templateId, audience: "buyer_private", synthetic: true });
    let order = response.body;
    if (typeof order.id === "string") {
      owned.orders.push(order.id);
      owned.assignments.push({ orderId: order.id, userId: suite.id("reception"), capability: "diagnostics.reception" });
    }
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(order).toMatchObject({ version: 0, audience: "buyer_private", listingId: null });
    for (const who of ["technician", "reviewer"] as const) {
      owned.assignments.push({ orderId: order.id, userId: suite.id(who), capability: capability[who]! });
      ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version,
        userId: suite.id(who), capability: capability[who], active: true }).expect(201));
    }
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version,
      kind: "physical", authorityReference: `Synthetic physical authorization for visit ${visitName}` }).expect(201));
    for (const state of ["confirmed", "arrived"]) {
      ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201));
    }
    const observed = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: order.version, ...observation });
    expect(observed.status, JSON.stringify(observed.body)).toBe(201); order = observed.body;
    const records = await history(order);
    expect(records).toEqual([{ id: expect.stringMatching(uuid), orderId: order.id, orderVersion: 6,
      observationHash: expect.stringMatching(hash), observation, recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" }]);
    owned.raw.push(records[0]!.id);
    expect(order).toMatchObject({ version: 6, status: "arrived", physicalAuthorized: true, observedVehicle: observation });
    return order;
  }
  function intent(o: Order, id: string, image: Image = red, classification = rights) {
    return { id, expectedOrderVersion: o.version, contentType: "image/png", sizeBytes: image.inputSize, rights: classification };
  }
  async function stage(o: Order, id: string, image: Image = red, classification = rights) {
    expect(await db.diagnosticIdentityProvenance.count({ where: { OR: [{ id }, { objectKey: key(id, image) }] } })).toBe(0);
    await expect(objects.send(new HeadObjectCommand({ Bucket: "diagnostic-test-private", Key: key(id, image) })))
      .rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
    owned.provenance.push(id);
    owned.keys.add(key(id, image));
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
  function capture(o: Order, raw: Raw, p: string, chassis: "SYN-CHASSIS-04I" | "SYN-CHASSIS-041",
    correction: { supersedesId: string; explanation: string } | null = null, classification = rights) {
    return { id: randomUUID(), expectedOrderVersion: o.version, identityRecordId: raw.id,
      identifiers: identifiers(p, chassis), rights: classification, correction };
  }
  async function append(o: Order, raw: Raw, input: ReturnType<typeof capture>, image: Image = red) {
    const expectedVersion = input.correction ? 8 : 7;
    expect(o.version).toBe(input.correction ? 7 : 6);
    expect(await db.diagnosticIdentityEvidence.count({ where: { id: input.id } })).toBe(0);
    owned.evidence.push(input.id);
    const response = await post("technician", evidencePath(o), input).expect(201);
    privateNoStore(response);
    expect(response.body).toEqual({ id: input.id, orderId: o.id, orderVersion: expectedVersion, identityRecordId: raw.id,
      observationHash: raw.observationHash, observation: raw.observation, identifiers: input.identifiers,
      provenance: input.identifiers[0]!.provenanceIds.map(id => metadata(id, image)), rights: input.rights, correction: input.correction,
      recordHash: expect.stringMatching(hash), recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" });
    o.version = expectedVersion;
    expect(await version(o)).toBe(expectedVersion);
    return response.body;
  }
  async function release(o: Order) {
    const reportId = randomUUID();
    expect(await db.diagnosticReportRecord.count({ where: { id: reportId } })).toBe(0);
    expect(await db.diagnosticPdfArtifact.count({ where: { reportId } })).toBe(0);
    owned.reports.push(reportId);
    const { body: draft } = await post("technician", `orders/${o.id}/reports`, { reportId, expectedOrderVersion: o.version }).expect(201);
    const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    owned.findings.push(finding.id);
    await post("technician", `reports/${draft.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${draft.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    const finalized = await post("reviewer", `reports/${draft.id}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } });
    const documents = (await get("technician", `reports/${draft.id}/documents`).expect(200)).body as { id: string }[];
    owned.pdfs.push(...documents.map(document => document.id));
    for (const document of documents) owned.keys.add(`diagnostic-pdf/${draft.id}/${document.id}.pdf`);
    expect(finalized.status, JSON.stringify(finalized.body)).toBe(201);
    return (await get("reviewer", `reports/${draft.id}`).expect(200)).body;
  }
  async function comparativeBytes(b: Order, reportId: string, p: string, image: Image) {
    const response = await get("reviewer", `orders/${b.id}/reinspection-comparison/provenance/${p}?predecessorId=${reportId}`).expect(200);
    privateNoStore(response);
    expect(response.headers["content-type"]).toContain("image/webp");
    const bytes = Buffer.from(response.body);
    expect(bytes.toString("base64")).toBe(image.output);
    expect(bytes.byteLength).toBe(image.sizeBytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(image.sha256);
  }

  async function denied(response: Awaited<ReturnType<typeof get>>) {
    expect(response.status).toBe(403); privateNoStore(response); expect(response.body).toEqual(deniedBody);
  }

  it.each(["conflicting current chassis", "expired original rights"] as const)("refuses corrected manual continuity with %s", async reason => {
    now = initialTime; vi.setSystemTime(now);
    const expiredOriginal = reason === "expired original rights";
    const originalRights = expiredOriginal ? { ...rights, schedule: { ...rights.schedule, until: "2026-10-22T12:00:00.000Z" } } : rights;
    const original: Observation = { observedAt: "2026-10-21T10:00:00.000Z", mileageKm: 123000, method: "manual", vin: null,
      manualReference: "Synthetic visit A; reference is not proof" };
    const successorObservation: Observation = { observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100, method: "manual", vin: null,
      manualReference: "Synthetic visit B; reference is not proof" };
    const a = await visit(original, "A"); const [ia] = await history(a);
    const historyA = [{ id: expect.stringMatching(uuid), orderId: a.id, orderVersion: 6,
      observationHash: expect.stringMatching(hash), observation: original, recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" }];
    expect(await history(a)).toEqual(historyA);
    const rawA = await history(a);
    const pa = randomUUID(); await verified(a, pa, red, originalRights);
    const ea = await append(a, ia!, capture(a, ia!, pa, "SYN-CHASSIS-04I", null, originalRights), red);
    const releasedA = await release(a);
    const beforeA = await get("buyer", `reports/${releasedA.id}`).expect(200); privateNoStore(beforeA);
    expect(beforeA.body).toMatchObject({ id: releasedA.id, version: 3, status: "finalized", supersededBy: null });
    // Immutable snapshot has no separate HTTP route. Observe it through the real adapter's stored release.
    const storedA = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: releasedA.id } });
    const artifactsA = await db.diagnosticPdfArtifact.findMany({ where: { reportId: releasedA.id }, orderBy: { id: "asc" } });
    expect(storedA).toMatchObject({ version: 3, identityRecordId: ia!.id, identityRecordHash: ia!.observationHash,
      identityEvidenceId: ea.id, identityEvidenceHash: ea.recordHash, snapshotHash: expect.stringMatching(hash), finalizedAt: initialTime });
    expect(artifactsA).toHaveLength(3);
    expect(artifactsA.map(row => row.locale).sort()).toEqual(["en", "ru", "tk"]);
    for (const artifact of artifactsA) expect(artifact).toMatchObject({ reportId: releasedA.id, snapshotHash: storedA.snapshotHash, state: "pending" });
    const b = await visit(successorObservation, "B"); const [ib] = await history(b);
    expect(b.id).not.toBe(a.id); expect(ib!.id).not.toBe(ia!.id);
    expect(await history(b)).toEqual([{ id: expect.stringMatching(uuid), orderId: b.id, orderVersion: 6,
      observationHash: expect.stringMatching(hash), observation: successorObservation, recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" }]);
    const rawB = await history(b);
    const pb = randomUUID(); expect(pb).not.toBe(pa); await verified(b, pb, blue);
    const eb = await append(b, ib!, capture(b, ib!, pb, "SYN-CHASSIS-041"), blue);
    const pc = randomUUID(); expect(new Set([pa, pb, pc]).size).toBe(3);
    await verified(a, pc, green);
    const explanation = "Supported I/1 recording correction, with fresh retained physical material";
    const corrected = capture(a, ia!, pc, "SYN-CHASSIS-041", { supersedesId: ea.id, explanation });
    if (!expiredOriginal) corrected.identifiers.push({ kind: "chassis_stamp", location: "Second simultaneous physical chassis stamp",
      value: "SYN-CHASSIS-999", provenanceIds: [pc] });
    const ec = await append(a, ia!, corrected, green);
    expect(ec).toMatchObject({ identityRecordId: ia!.id, observationHash: ia!.observationHash,
      correction: { supersedesId: ea.id, explanation }, orderVersion: 8 });
    expect(ec.recordHash).not.toBe(ea.recordHash);
    const comparison = await get("reviewer", comparisonPath(b, releasedA.id)).expect(200); privateNoStore(comparison);
    expect(comparison.body).toEqual({
      predecessor: { reportId: releasedA.id, reportVersion: 3, snapshotHash: storedA.snapshotHash,
        identityRecordId: ia!.id, identityRecordHash: ia!.observationHash,
        identity: { observation: original, evidence: ea, corrections: [ec], evidenceGeneration: 2, correctionHeadHash: ec.recordHash } },
      candidate: { orderId: b.id, orderVersion: 7, identityRecordId: ib!.id, identityRecordHash: ib!.observationHash,
        identity: { observation: successorObservation, evidence: eb, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } },
    });
    expect(comparison.body.predecessor.snapshotHash).toMatch(hash);
    expect(await version(a)).toBe(8); expect(await version(b)).toBe(7);
    await comparativeBytes(b, releasedA.id, pa, red); await comparativeBytes(b, releasedA.id, pc, green); await comparativeBytes(b, releasedA.id, pb, blue);
    expect((await get("reviewer", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);
    expect((await get("buyer", `reports/${releasedA.id}`).expect(200)).body).toEqual(beforeA.body);
    expect(await history(a)).toEqual(rawA); expect(await history(b)).toEqual(rawB);
    const auditsBefore = await db.diagnosticAudit.findMany({ where: { centerId }, orderBy: { id: "asc" } });
    const proofsBefore = await db.diagnosticContinuityProof.count({ where: { candidateOrderId: b.id } });
    expect(proofsBefore).toBe(0);
    // Reached refusal only counts after retained raw/evidence, release, full comparison,
    // all three exact sanitized downloads and current independent authority are established.
    expect(suite.id("reviewer")).not.toBe(suite.id("technician"));
    for (const who of ["reviewer", "technician"] as const) {
      const user = await db.user.findUniqueOrThrow({ where: { id: suite.id(who) } });
      expect(user).toMatchObject({ suspendedAt: null, deletionScheduledAt: null });
      const session = await db.session.findUniqueOrThrow({ where: { id: suite.id(`${who}-session`) } });
      expect(session).toMatchObject({ userId: suite.id(who), expiresAt: future, adminTotpExpiresAt: future });
      expect(await db.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId: suite.id(who), capability: capability[who]! } } }))
        .toMatchObject({ userId: suite.id(who), capability: capability[who], revokedAt: null });
      expect(await db.diagnosticCenterAssignment.findUniqueOrThrow({ where: { id: suite.id(`${who}-qualification`) } }))
        .toMatchObject({ centerId, userId: suite.id(who), capability: capability[who], revokedAt: null, qualifiedUntil: future });
      for (const order of [a, b]) {
        expect(await db.diagnosticOrderAssignment.findUniqueOrThrow({ where: {
          orderId_userId_capability: { orderId: order.id, userId: suite.id(who), capability: capability[who]! },
        } })).toMatchObject({ orderId: order.id, userId: suite.id(who), capability: capability[who], revokedAt: null });
      }
    }
    expect(ec.identifiers).toEqual(expiredOriginal ? identifiers(pc, "SYN-CHASSIS-041") : [
      ...identifiers(pc, "SYN-CHASSIS-041"), { kind: "chassis_stamp", location: "Second simultaneous physical chassis stamp", value: "SYN-CHASSIS-999", provenanceIds: [pc] },
    ]);
    expect((await get("technician", evidencePath(a)).expect(200)).body).toEqual([ea, ec]);
    // The original chain is fully readable before its rights expire. Only A's original
    // evidence and object rights end; EC, B and all staff authority remain current.
    if (expiredOriginal) { now = new Date("2026-10-22T12:00:00.000Z"); vi.setSystemTime(now); }
    const rawRowsBefore = await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: [a.id, b.id] } }, orderBy: { id: "asc" } });
    const evidenceBefore = await db.diagnosticIdentityEvidence.findMany({ where: { orderId: { in: [a.id, b.id] } }, orderBy: { id: "asc" } });
    const provenanceBefore = await db.diagnosticIdentityProvenance.findMany({ where: { orderId: { in: [a.id, b.id] } }, orderBy: { id: "asc" } });
    const ordersBefore = await db.inspectionOrder.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: "asc" } });
    const rationale = "Same-vehicle attestation cannot override conflicting current chassis claims or expired original rights";
    const issuance = await post("reviewer", `orders/${b.id}/continuity-proofs`, {
      predecessorId: releasedA.id, expectedPredecessorVersion: 3, expectedOrderVersion: 7,
      predecessorIdentityRecordId: ia!.id, candidateIdentityRecordId: ib!.id, linkingTechnicianId: suite.id("technician"),
      method: "comparative_attestation", rationale, provenanceRecordIds: [pa, pc, pb],
    });
    // Register only the result of our issuance request if a regression creates a proof.
    if (typeof issuance.body.proofId === "string") owned.proofs.push(issuance.body.proofId);
    await denied(issuance);
    for (const secret of [a.id, b.id, releasedA.id, ia!.id, ib!.id, ia!.observationHash, ib!.observationHash,
      storedA.snapshotHash!, ea.id, ec.id, eb.id, ea.recordHash, ec.recordHash, eb.recordHash, pa, pc, pb,
      "SYN-CHASSIS-04I", "SYN-CHASSIS-041", "SYN-CHASSIS-999", rationale, explanation,
      key(pa, red), key(pc, green), key(pb, blue), red.sha256, green.sha256, blue.sha256]) expect(issuance.text).not.toContain(secret);
    expect(await db.diagnosticContinuityProof.count({ where: { OR: [{ candidateOrderId: b.id }, { predecessorReportId: releasedA.id }] } })).toBe(0);
    expect(await db.diagnosticReportRecord.count({ where: { OR: [{ orderId: b.id }, { predecessorId: releasedA.id }] } })).toBe(0);
    expect(await db.diagnosticAudit.findMany({ where: { centerId }, orderBy: { id: "asc" } })).toEqual(auditsBefore);
    expect(await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: [a.id, b.id] } }, orderBy: { id: "asc" } })).toEqual(rawRowsBefore);
    expect(await db.diagnosticIdentityEvidence.findMany({ where: { orderId: { in: [a.id, b.id] } }, orderBy: { id: "asc" } })).toEqual(evidenceBefore);
    expect(await db.diagnosticIdentityProvenance.findMany({ where: { orderId: { in: [a.id, b.id] } }, orderBy: { id: "asc" } })).toEqual(provenanceBefore);
    expect(await db.inspectionOrder.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: "asc" } })).toEqual(ordersBefore);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: releasedA.id } })).toEqual(storedA);
    expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: releasedA.id }, orderBy: { id: "asc" } })).toEqual(artifactsA);
    expect((await get("reviewer", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);
    expect((await get("buyer", `reports/${releasedA.id}`).expect(200)).body).toEqual(beforeA.body);
    expect((await get("reviewer", `orders/${a.id}/reports`).expect(200)).body).toEqual([releasedA]);
    if (expiredOriginal) {
      await denied(await get("reviewer", comparisonPath(b, releasedA.id)));
      for (const p of [pa, pc, pb]) await denied(await get("reviewer", `orders/${b.id}/reinspection-comparison/provenance/${p}?predecessorId=${releasedA.id}`));
      expect((await get("technician", evidencePath(a)).expect(200)).body).toEqual([]);
      await denied(await get("technician", provenancePath(a, pa)));
    } else {
      const afterComparison = await get("reviewer", comparisonPath(b, releasedA.id)).expect(200); privateNoStore(afterComparison);
      expect(afterComparison.body).toEqual(comparison.body);
      expect((await get("technician", evidencePath(a)).expect(200)).body).toEqual([ea, ec]);
      await comparativeBytes(b, releasedA.id, pa, red); await comparativeBytes(b, releasedA.id, pc, green); await comparativeBytes(b, releasedA.id, pb, blue);
    }
    expect((await get("technician", evidencePath(b)).expect(200)).body).toEqual([eb]);
    expect(await history(a)).toEqual(rawA); expect(await history(b)).toEqual(rawB);
    expect(await version(a)).toBe(8); expect(await version(b)).toBe(7);
  });
});
