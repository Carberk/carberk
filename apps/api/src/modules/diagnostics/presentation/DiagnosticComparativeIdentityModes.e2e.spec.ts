import "reflect-metadata";
import { randomUUID } from "node:crypto";
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

const suite = defineE2eSuite("diagnostic-comparative-identity-modes");
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
type Image = typeof red;
type Observation = { observedAt: string; mileageKm: number; method: "manual" | "vin"; vin: string | null; manualReference: string | null };
type Order = { id: string; version: number };
type Raw = { id: string; orderId: string; orderVersion: number; observationHash: string; observation: Observation; recordedBy: string; recordedAt: string };
const identifiers = (provenanceId: string, method: Observation["method"]) => [
  { kind: "chassis_stamp", location: "Synthetic chassis plate", value: "SYN-CHASSIS-041", provenanceIds: [provenanceId] },
  ...(method === "vin" ? [{ kind: "vin_stamp", location: "Synthetic VIN plate", value: "SYN-VIN-041", provenanceIds: [provenanceId] }] : []),
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
// Two serial cases own separate visits and independently retained material.
describe("private mixed-method comparative diagnostic continuity", { concurrent: false }, () => {
  let app: NestFastifyApplication; let db: PrismaService; let jwt: JwtService;
  let request: ReturnType<typeof supertest>; let objects: S3Client;
  let templateId: string;
  const now = initialTime;
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
    const requestKey = randomUUID(); owned.requestKeys.push(requestKey);
    const response = await post("buyer", "orders", { requestKey, centerId,
      templateVersionId: templateId, audience: "buyer_private", synthetic: true });
    let order = response.body;
    if (typeof order.id === "string") owned.orders.push(order.id);
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
    const records = await history(order); owned.raw.push(...records.map(record => record.id));
    expect(observed.status, JSON.stringify(observed.body)).toBe(201); order = observed.body;
    expect(order).toMatchObject({ version: 6, status: "arrived", physicalAuthorized: true, observedVehicle: observation });
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
    return { id, expectedOrderVersion: o.version, identityRecordId: raw.id, identifiers: identifiers(p, raw.observation.method), rights: classification, correction: null };
  }
  async function append(o: Order, raw: Raw, input: ReturnType<typeof capture>, image: Image = red) {
    expect(o.version).toBe(6);
    owned.evidence.push(input.id);
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
    const reportId = randomUUID(); owned.reports.push(reportId);
    const { body: draft } = await post("technician", `orders/${o.id}/reports`, { reportId, expectedOrderVersion: o.version }).expect(201);
    const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    owned.findings.push(finding.id);
    await post("technician", `reports/${draft.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${draft.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    const finalized = await post("reviewer", `reports/${draft.id}/transition`, { expectedVersion: 2, action: "finalize" });
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
    expect(Buffer.from(response.body).toString("base64")).toBe(image.output);
  }

  async function denied(response: Awaited<ReturnType<typeof get>>) {
    expect(response.status).toBe(403); privateNoStore(response); expect(response.body).toEqual(deniedBody);
  }

  it.each([
    ["manual to VIN", "manual", "vin"],
    ["VIN to manual", "vin", "manual"],
  ] as const)("issues and consumes %s comparative continuity from independent retained chassis material", async (_direction, methodA, methodB) => {
    const original: Observation = { observedAt: "2026-10-21T10:00:00.000Z", mileageKm: 123000, method: methodA,
      vin: methodA === "vin" ? "SYN-VIN-041" : null,
      manualReference: methodA === "manual" ? "Synthetic physical chassis visit A; descriptive reference is not proof" : null };
    const successorObservation: Observation = { observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100, method: methodB,
      vin: methodB === "vin" ? "SYN-VIN-041" : null,
      manualReference: methodB === "manual" ? "Synthetic physical chassis visit B; descriptive reference is not proof" : null };
    const a = await visit(original, "A"); const [ia] = await history(a);
    const historyA = [{ id: expect.stringMatching(uuid), orderId: a.id, orderVersion: 6,
      observationHash: expect.stringMatching(hash), observation: original, recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" }];
    expect(await history(a)).toEqual(historyA);
    const rawA = await history(a);
    const pa = randomUUID(); await verified(a, pa, red);
    const ea = await append(a, ia!, capture(a, ia!, pa), red);
    const releasedA = await release(a);
    const beforeA = await get("buyer", `reports/${releasedA.id}`).expect(200); privateNoStore(beforeA);
    expect(beforeA.body).toMatchObject({ id: releasedA.id, version: 3, status: "finalized", supersededBy: null });
    // Immutable snapshot has no separate HTTP route. Observe it through the real adapter's stored release.
    const storedA = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: releasedA.id } });
    const artifactsA = await db.diagnosticPdfArtifact.findMany({ where: { reportId: releasedA.id }, orderBy: { id: "asc" } });
    const b = await visit(successorObservation, "B"); const [ib] = await history(b);
    expect(b.id).not.toBe(a.id); expect(ib!.id).not.toBe(ia!.id);
    expect(await history(b)).toEqual([{ id: expect.stringMatching(uuid), orderId: b.id, orderVersion: 6,
      observationHash: expect.stringMatching(hash), observation: successorObservation, recordedBy: suite.id("technician"), recordedAt: "2026-10-21T12:00:00.000Z" }]);
    const rawB = await history(b);
    const pb = randomUUID(); expect(pb).not.toBe(pa); await verified(b, pb, blue);
    const eb = await append(b, ib!, capture(b, ib!, pb), blue);
    const comparison = await get("reviewer", comparisonPath(b, releasedA.id)).expect(200); privateNoStore(comparison);
    expect(comparison.body).toEqual({
      predecessor: { reportId: releasedA.id, reportVersion: 3, snapshotHash: storedA.snapshotHash,
        identityRecordId: ia!.id, identityRecordHash: ia!.observationHash,
        identity: { observation: original, evidence: ea, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } },
      candidate: { orderId: b.id, orderVersion: 7, identityRecordId: ib!.id, identityRecordHash: ib!.observationHash,
        identity: { observation: successorObservation, evidence: eb, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } },
    });
    expect(comparison.body.predecessor.snapshotHash).toMatch(hash);
    expect(await version(a)).toBe(7); expect(await version(b)).toBe(7);
    await comparativeBytes(b, releasedA.id, pa, red); await comparativeBytes(b, releasedA.id, pb, blue);
    expect((await get("reviewer", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);
    expect((await get("buyer", `reports/${releasedA.id}`).expect(200)).body).toEqual(beforeA.body);
    expect(await history(a)).toEqual(rawA); expect(await history(b)).toEqual(rawB);
    const auditsBefore = await db.diagnosticAudit.findMany({ where: { centerId } });
    const proofsBefore = await db.diagnosticContinuityProof.count({ where: { candidateOrderId: b.id } });
    expect(proofsBefore).toBe(0);
    // SETUP GATE: every ordinary capture, release, comparison and exact-byte download above
    // must pass. Only reached issuance can establish criterion RED. Schema/setup failures cannot.
    // Current source predicts 403 at the manual-only comparative rule; expected behavior stays 201.
    const rationale = "Same stamped chassis; independently observed on both visits with mixed manual and VIN methods";
    const issuance = await post("reviewer", `orders/${b.id}/continuity-proofs`, {
      predecessorId: releasedA.id, expectedPredecessorVersion: 3, expectedOrderVersion: 7,
      predecessorIdentityRecordId: ia!.id, candidateIdentityRecordId: ib!.id, linkingTechnicianId: suite.id("technician"),
      method: "comparative_attestation", rationale, provenanceRecordIds: [pa, pb],
    });
    if (typeof issuance.body.proofId === "string") owned.proofs.push(issuance.body.proofId);
    expect(issuance.status, JSON.stringify(issuance.body)).toBe(201); privateNoStore(issuance);
    expect(issuance.body).toEqual({ proofId: expect.stringMatching(uuid) });
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: b.id } })).toBe(1);
    const issuedAudits = await db.diagnosticAudit.findMany({ where: { centerId, id: { notIn: auditsBefore.map(row => row.id) } } });
    expect(issuedAudits).toHaveLength(1);
    expect(issuedAudits[0]).toMatchObject({ orderId: b.id, actorId: suite.id("reviewer"), action: "CONTINUITY_PROOF_ISSUED" });
    const proofPath = `orders/${b.id}/continuity-proofs/${issuance.body.proofId}`;
    const proof = await get("reviewer", proofPath).expect(200); privateNoStore(proof);
    expect(proof.body).toEqual({ proofId: issuance.body.proofId, policyVersion: "ADR-0108",
      predecessor: { reportId: releasedA.id, reportVersion: 3, snapshotHash: comparison.body.predecessor.snapshotHash,
        identityRecordId: ia!.id, identityRecordHash: ia!.observationHash },
      candidate: { orderId: b.id, orderVersion: 7, identityRecordId: ib!.id, identityRecordHash: ib!.observationHash },
      linkingTechnicianId: suite.id("technician"), method: "comparative_attestation", result: "same_vehicle", rationale,
      provenanceRecordIds: [pa, pb], issuedBy: suite.id("reviewer"), issuedAt: "2026-10-21T12:00:00.000Z" });
    const technicianProof = await get("technician", proofPath).expect(200); privateNoStore(technicianProof);
    expect(technicianProof.body).toEqual(proof.body);
    for (const who of ["buyer", "outsider"] as const) {
      await denied(await get(who, proofPath));
      await denied(await get(who, comparisonPath(b, releasedA.id)));
      for (const id of [pa, pb]) await denied(await get(who, `orders/${b.id}/reinspection-comparison/provenance/${id}?predecessorId=${releasedA.id}`));
    }
    // Outsider is a real current Session with only public-reader authority. Anonymous access
    // is rejected by JWT before the diagnostic refusal contract and is not used as criterion RED.
    expect((await get("reviewer", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);
    expect(await version(b)).toBe(7);
    expect((await get("buyer", `reports/${releasedA.id}`).expect(200)).body).toEqual(beforeA.body);
    expect((await get("reviewer", `orders/${a.id}/reports`).expect(200)).body).toEqual([releasedA]);
    const reportId = randomUUID(); owned.reports.push(reportId);
    const input = { reportId, predecessorId: releasedA.id, expectedOrderVersion: 7,
      reason: "New physical visit with independently retained mixed-method identity", proofId: issuance.body.proofId };
    const created = await post("technician", `orders/${b.id}/reinspections`, input).expect(201); privateNoStore(created);
    expect(created.body).toEqual({ id: reportId, orderId: b.id, audience: "buyer_private", status: "draft", version: 0,
      templateVersionId: templateId, template: definition, observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100,
      findings: [], authorId: suite.id("technician"), reviewerId: null, successorOf: releasedA.id, correctionReason: input.reason,
      returnReason: null, finalizedAt: null, withdrawnAt: null, withdrawalReason: null, synthetic: true,
      supersededBy: null, lineageKind: "reinspection" });
    expect((await get("technician", `orders/${b.id}/reports`).expect(200)).body).toEqual([created.body]);
    expect((await get("technician", `reports/${reportId}/documents`).expect(200)).body).toEqual([]);
    expect(await db.diagnosticEvidence.count({ where: { reportId } })).toBe(0);
    expect(await db.diagnosticPdfArtifact.count({ where: { reportId } })).toBe(0);
    const consumed = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: issuance.body.proofId } });
    expect(consumed).toMatchObject({ consumedReportId: reportId, consumedAt: initialTime });
    const auditsAfterConsumption = await db.diagnosticAudit.findMany({ where: { centerId }, orderBy: { id: "asc" } });
    expect(auditsAfterConsumption.filter(row => row.orderId === b.id && row.action === "REPORT_REINSPECTION_CREATED")).toHaveLength(1);
    expect(auditsAfterConsumption.filter(row => row.orderId === b.id && row.action === "CONTINUITY_PROOF_CONSUMED")).toHaveLength(1);
    const retry = await post("technician", `orders/${b.id}/reinspections`, input).expect(201); privateNoStore(retry);
    expect(retry.body).toEqual(created.body);
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: issuance.body.proofId } })).toEqual(consumed);
    expect(await db.diagnosticAudit.findMany({ where: { centerId }, orderBy: { id: "asc" } })).toEqual(auditsAfterConsumption);
    expect((await get("technician", `orders/${b.id}/reports`).expect(200)).body).toEqual([created.body]);
    expect((await get("reviewer", proofPath).expect(200)).body).toEqual(proof.body);
    expect((await get("buyer", `reports/${releasedA.id}`).expect(200)).body).toEqual(beforeA.body);
    expect((await get("reviewer", `orders/${a.id}/reports`).expect(200)).body).toEqual([releasedA]);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: releasedA.id } })).toEqual(storedA);
    expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: releasedA.id }, orderBy: { id: "asc" } })).toEqual(artifactsA);
    expect(await history(a)).toEqual(rawA); expect(await history(b)).toEqual(rawB);
    expect(await version(a)).toBe(7); expect(await version(b)).toBe(7);
  });
});
