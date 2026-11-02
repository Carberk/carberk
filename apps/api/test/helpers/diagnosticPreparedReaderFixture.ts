import "reflect-metadata";

import { randomUUID } from "node:crypto";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaService } from "@auto-tm/db";
import { S3Client, CreateBucketCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import supertest from "supertest";
import { inject } from "vitest";
import { bullTestRoot } from "./bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog, type E2eSuite } from "./e2eSuite";
import { GlobalErrorFilter } from "../../src/common/error.filter";
import { JwtAuthGuard } from "../../src/common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../src/modules/identity/identity.public";
import { DiagnosticsModule } from "../../src/modules/diagnostics/diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../../src/modules/diagnostics/domain/ports/DiagnosticIntakePort";

export const preparedNow = new Date("2026-10-21T12:00:00.000Z");
export const preparedFuture = new Date("2027-01-01T00:00:00.000Z");
export const preparedRights = {
  category: "vehicle_observation",
  purpose: "Synthetic diagnostic identity comparison",
  basis: "Owned synthetic fixture only",
  provenance: "Generated chassis fixture, not a customer document",
  identifiability: "pseudonymous",
  use: ["service"],
  schedule: { kind: "until", until: "2026-12-01T00:00:00.000Z", reason: "Synthetic fixture authorization" },
  supplierRestrictions: "No export or redistribution",
  hold: null,
} as const;

export const preparedObservation = {
  observedAt: "2026-10-21T10:00:00.000Z",
  mileageKm: 123000,
  method: "manual" as const,
  vin: null,
  manualReference: "Synthetic fixture, initial transcription 041",
};

export const preparedSuccessorObservation = {
  observedAt: "2026-10-21T11:00:00.000Z",
  mileageKm: 123100,
  method: "manual" as const,
  vin: null,
  manualReference: "Synthetic fixture B, independently observed chassis 041",
};

export const preparedRed = {
  input: "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4z8AARwgWXg4ArpMP8aaUSCMAAAAASUVORK5CYII=",
  inputSize: 95,
  output: "UklGRkAAAABXRUJQVlA4IDQAAAAwAgCdASoEAAQAAMASJaACdLoB+AH4AARoAAD++iGX/3easNN39a3/9aOfron+tHP/WVgA",
  sizeBytes: 72,
  sha256: "2639253ab66f01c5c4121c41b648a4d492d71527101073024166d926a0be22c1",
} as const;

export const preparedBlue = {
  input: "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVR4nGNgYPiPhIjiAACOsw/xs6MvMwAAAABJRU5ErkJggg==",
  inputSize: 94,
  output: "UklGRj4AAABXRUJQVlA4IDIAAADwAQCdASoEAAQAAMASJaACdLoB+AAETAAA/v5mof/60c/XRP9aOf+tHP/lKotU24oAAA==",
  sizeBytes: 70,
  sha256: "b7b11262b6b5f09879357d0857c949d7713b380c8b3a4682b0421390a0c7f873",
} as const;

export type PreparedImage = {
  input: string;
  inputSize: number;
  output: string;
  sizeBytes: number;
  sha256: string;
};

export type PreparedPerson =
  | "seller"
  | "replacement"
  | "commissioner"
  | "businessOwner"
  | "reception"
  | "technician"
  | "reviewer"
  | "alternateReviewer"
  | "foreign"
  | "outsider";

export type PreparedOrder = {
  id: string;
  version: number;
  audience: "buyer_private" | "listing_public";
  listingId: string | null;
  businessId?: string | null;
};

export type PreparedContinuityPair = {
  a: PreparedOrder;
  b: PreparedOrder;
  rawA: Record<string, unknown>;
  rawB: Record<string, unknown>;
  evidenceA: Record<string, unknown>;
  evidenceB: Record<string, unknown>;
  reportA: Record<string, unknown>;
  proofId: string;
};

const capabilities: Partial<Record<PreparedPerson, string>> = {
  reception: "diagnostics.reception",
  technician: "diagnostics.technician",
  reviewer: "diagnostics.reviewer",
  alternateReviewer: "diagnostics.reviewer",
};

const people: readonly PreparedPerson[] = [
  "seller",
  "replacement",
  "commissioner",
  "businessOwner",
  "reception",
  "technician",
  "reviewer",
  "alternateReviewer",
  "foreign",
  "outsider",
];

function text() {
  return { tk: "Synag", ru: "Тест", en: "Synthetic" };
}

function definition() {
  const localized = text();
  return {
    title: localized,
    limitations: localized,
    syntheticNotice: localized,
    checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }],
    panels: [],
  };
}

export interface PreparedReaderFixture {
  readonly suite: E2eSuite;
  readonly db: PrismaService;
  readonly app: NestFastifyApplication;
  readonly jwt: JwtService;
  readonly request: ReturnType<typeof supertest>;
  readonly centerId: string;
  readonly templateId: string;
  readonly now: Date;
  readonly future: Date;
  readonly rights: typeof preparedRights;
  readonly observation: typeof preparedObservation;
  readonly successorObservation: typeof preparedSuccessorObservation;
  readonly id: (alias: string) => string;
  readonly people: readonly PreparedPerson[];
  headers(person?: PreparedPerson, sessionAlias?: string): Record<string, string>;
  get(person: PreparedPerson, path: string): supertest.Test;
  post(person: PreparedPerson, path: string, body: object): supertest.Test;
  visit(options?: {
    name?: string;
    commissioner?: PreparedPerson;
    observation?: typeof preparedObservation | typeof preparedSuccessorObservation;
    audience?: "buyer_private" | "listing_public";
    business?: boolean;
    assignReviewer?: PreparedPerson;
  }): Promise<PreparedOrder>;
  grant(order: PreparedOrder, person?: PreparedPerson, rights?: object): Promise<string>;
  observe(order: PreparedOrder, body?: object, person?: PreparedPerson): supertest.Test;
  history(order: PreparedOrder, person?: PreparedPerson): Promise<Record<string, unknown>[]>;
  stage(order: PreparedOrder, provenanceId: string, image?: PreparedImage, rights?: object): Promise<void>;
  upload(order: PreparedOrder, provenanceId: string, image?: PreparedImage): supertest.Test;
  append(order: PreparedOrder, rawId: string, provenanceId: string, image?: PreparedImage, correction?: object | null): Promise<Record<string, unknown>>;
  finalize(order: PreparedOrder, person?: PreparedPerson): Promise<Record<string, unknown>>;
  continuityPair(): Promise<PreparedContinuityPair>;
  ownershipComponent(order: PreparedOrder): Promise<Record<string, unknown>>;
  raw(order: PreparedOrder): Promise<Record<string, unknown>>;
  eraseSubject(person: PreparedPerson): Promise<void>;
  cleanup(): Promise<void>;
  close(): Promise<void>;
}

export async function openPreparedReaderFixture(label: string): Promise<PreparedReaderFixture> {
  const suite = defineE2eSuite(`issue938-prepared-reader-${label}-${process.env["VITEST_POOL_ID"] ?? "1"}`);
  const centerId = suite.id("center");
  const testing = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [() => ({ DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private" })] }),
      EventEmitterModule.forRoot(),
      bullTestRoot(),
      DiagnosticsModule,
      JwtModule.register({ global: true, secret: "issue938-prepared-reader" }),
    ],
  })
    .overrideProvider(IDENTITY_CLOCK_PORT)
    .useValue({ now: () => preparedNow })
    .overrideProvider(DIAGNOSTIC_RUNTIME)
    .useValue({
      now: () => preparedNow,
      id: randomUUID,
      publicSyntheticAllowed: () => true,
      syntheticAllowed: ({ userId }: { userId: string }) => people.some(person => suite.id(person) === userId),
    })
    .compile();

  const app = testing.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const db = app.get(PrismaService);
  const jwt = app.get(JwtService);
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt));
  app.useGlobalFilters(new GlobalErrorFilter());
  await app.listen(0, "127.0.0.1");
  await seedSuiteCatalog(db, suite);

  for (const person of people) {
    await db.user.create({ data: { id: suite.id(person), phone: suite.phone(person), phoneVerifiedAt: preparedNow, displayName: person } });
    await db.session.create({
      data: {
        id: suite.id(`${person}-session`),
        userId: suite.id(person),
        refreshTokenHash: suite.id(`${person}-refresh`),
        expiresAt: preparedFuture,
        adminTotpExpiresAt: preparedFuture,
      },
    });
    const capability = capabilities[person];
    if (capability) await db.staffGrant.create({ data: { userId: suite.id(person), capability } });
  }
  await db.staffGrant.createMany({
    data: ["staff.manage", "founder.control"].map(capability => ({ userId: suite.id("reception"), capability })),
  });
  await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("center"), names: text() } });
  for (const person of people) {
    const capability = capabilities[person];
    if (capability) {
      await db.diagnosticCenterAssignment.create({
        data: { centerId, userId: suite.id(person), capability, qualifiedUntil: preparedFuture },
      });
    }
  }
  await db.diagnosticCenterAssignment.create({
    data: { centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: preparedFuture },
  });

  const request = supertest(app.getHttpServer());
  const template = await request
    .post(`/api/v1/diagnostics/centers/${centerId}/templates`)
    .set({ authorization: `Bearer ${jwt.sign({ sub: suite.id("reception"), sid: suite.id("reception-session"), role: "buyer" })}` })
    .send({ expectedVersion: 0, definition: definition(), synthetic: true })
    .expect(201);
  await app.getHttpAdapter().getInstance().ready();

  const s3 = new S3Client({
    endpoint: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000",
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
      secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
    },
  });
  try {
    await s3.send(new CreateBucketCommand({ Bucket: "diagnostic-test-private" }));
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 409) throw error;
  }
  const objectKeys = new Set<string>();
  const post = (person: PreparedPerson, path: string, body: object) => request.post(`/api/v1/diagnostics/${path}`).set(fixture.headers(person)).send(body);
  const get = (person: PreparedPerson, path: string) => request.get(`/api/v1/diagnostics/${path}`).set(fixture.headers(person));

  const fixture: PreparedReaderFixture = {
    suite,
    db,
    app,
    jwt,
    request,
    centerId,
    templateId: template.body.id as string,
    now: preparedNow,
    future: preparedFuture,
    rights: preparedRights,
    observation: preparedObservation,
    successorObservation: preparedSuccessorObservation,
    id: alias => suite.id(alias),
    people,
    headers: (person = "reviewer", sessionAlias = `${person}-session`) => ({
      authorization: `Bearer ${jwt.sign({ sub: suite.id(person), sid: suite.id(sessionAlias), role: "buyer" })}`,
    }),
    get,
    post,
    visit: async (options = {}) => {
      const commissioner = options.commissioner ?? "commissioner";
      const audience = options.audience ?? "buyer_private";
      const orderId = randomUUID();
      let listingId: string | null = null;
      let businessId: string | null = null;
      if (options.business) {
        businessId = suite.id(`business-${orderId}`);
        await db.dealership.create({ data: { id: businessId, name: "Synthetic ownership source", slug: suite.slugFor(`business-${orderId}`), status: "active", admissionMode: "synthetic" } });
        await db.dealershipMember.createMany({ data: [
          { dealershipId: businessId, userId: suite.id("commissioner"), role: "sales", status: "active" },
          { dealershipId: businessId, userId: suite.id("seller"), role: "owner", status: "active" },
        ] });
      }
      if (audience === "listing_public") {
        listingId = randomUUID();
        await db.listing.create({
          data: {
            id: listingId,
            sellerId: suite.id(options.business ? "seller" : commissioner),
            businessId,
            brandId: suite.catalog.brandId,
            modelId: suite.catalog.modelId,
            cityId: suite.catalog.cityId,
            vin: `SYN-${orderId.slice(0, 8)}`,
            status: "active",
            priceAmount: 100000,
            priceTmt: 100000,
            priceCurrency: "TMT",
          },
        });
      }
      let order = (await post(commissioner, "orders", {
        requestKey: randomUUID(),
        centerId,
        templateVersionId: fixture.templateId,
        audience,
        ...(listingId ? { listingId } : {}),
        synthetic: true,
      }).expect(201)).body as PreparedOrder;
      const assignments: PreparedPerson[] = ["technician", options.assignReviewer ?? "reviewer"];
      for (const person of assignments) {
        order = (await post("reception", `orders/${order.id}/assignments`, {
          expectedVersion: order.version,
          userId: suite.id(person),
          capability: capabilities[person] ?? "diagnostics.reviewer",
          active: true,
        }).expect(201)).body as PreparedOrder;
      }
      order = (await post("reception", `orders/${order.id}/authorization`, {
        expectedVersion: order.version,
        kind: "physical",
        authorityReference: `Synthetic physical authorization ${options.name ?? orderId}`,
      }).expect(201)).body as PreparedOrder;
      if (audience === "listing_public") {
        order = (await post("reception", `orders/${order.id}/authorization`, {
          expectedVersion: order.version,
          kind: "publication",
          authorityReference: `Synthetic publication authorization ${options.name ?? orderId}`,
        }).expect(201)).body as PreparedOrder;
      }
      for (const state of ["confirmed", "arrived"] as const) {
        order = (await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201)).body as PreparedOrder;
      }
      order = (await post("technician", `orders/${order.id}/vehicle`, {
        expectedVersion: order.version,
        ...(options.observation ?? preparedObservation),
      }).expect(201)).body as PreparedOrder;
      return { ...order, listingId, audience, businessId } as PreparedOrder;
    },
    grant: async (order, person = "commissioner", grantRights = preparedRights) => {
      const response = await post(person, `orders/${order.id}/ownership-grant`, { rights: grantRights }).expect(201);
      return response.body.id as string;
    },
    observe: (order, body = {}, person = "technician") => post(person, `orders/${order.id}/vehicle`, {
      expectedVersion: order.version,
      ...preparedObservation,
      ...body,
    }),
    history: async (order, person = "technician") => (await get(person, `orders/${order.id}/identity-records`).expect(200)).body,
    stage: async (order, provenanceId, image: PreparedImage = preparedRed, provenanceRights = preparedRights) => {
      await post("technician", `orders/${order.id}/identity-provenance`, {
        id: provenanceId,
        expectedOrderVersion: order.version,
        contentType: "image/png",
        sizeBytes: image.inputSize,
        rights: provenanceRights,
      }).expect(201);
    },
    upload: (order, provenanceId, image: PreparedImage = preparedRed) => {
      const key = `diagnostic-evidence/${provenanceId}/${image.sha256}`;
      objectKeys.add(key);
      return request.put(`/api/v1/diagnostics/orders/${order.id}/identity-provenance/${provenanceId}?expectedOrderVersion=${order.version}`)
        .set(fixture.headers("technician"))
        .set("content-type", "application/octet-stream")
        .set("x-evidence-type", "image/png")
        .send(Buffer.from(image.input, "base64"));
    },
    append: async (order, rawId, provenanceId, _image: PreparedImage = preparedRed, correction = null) => {
      const response = await post("technician", `orders/${order.id}/identity-evidence`, {
        id: randomUUID(),
        expectedOrderVersion: order.version,
        identityRecordId: rawId,
        identifiers: [{ kind: "chassis_stamp", location: "Right frame rail", value: "SYN-CHASSIS-041", provenanceIds: [provenanceId] }],
        rights: preparedRights,
        correction,
      }).expect(201);
      order.version = Number(response.body.orderVersion ?? order.version + 1);
      return response.body as Record<string, unknown>;
    },
    finalize: async (order, person = "reviewer") => {
      const draft = (await post("technician", `orders/${order.id}/reports`, { reportId: randomUUID(), expectedOrderVersion: order.version }).expect(201)).body;
      const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
      await post("technician", `reports/${draft["id"]}/findings`, { expectedVersion: 0, finding }).expect(201);
      await post("technician", `reports/${draft["id"]}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
      await post(person, `reports/${draft["id"]}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2018 } }).expect(201);
      return (await get(person, `reports/${draft["id"]}`).expect(200)).body as Record<string, unknown>;
    },
    continuityPair: async () => {
      const a = await fixture.visit({ name: "continuity-A", observation: preparedObservation });
      const rawA = (await fixture.history(a))[0];
      if (!rawA) throw new Error("Issue938 fixture did not produce a source A identity record");
      const provenanceA = suite.id("continuity-A-provenance");
      await fixture.stage(a, provenanceA, preparedRed);
      await fixture.upload(a, provenanceA, preparedRed).expect(200);
      const evidenceA = await fixture.append(a, String(rawA["id"]), provenanceA, preparedRed);
      const reportA = await fixture.finalize(a);

      const b = await fixture.visit({ name: "continuity-B", observation: preparedSuccessorObservation });
      const rawB = (await fixture.history(b))[0];
      if (!rawB) throw new Error("Issue938 fixture did not produce a source B identity record");
      const provenanceB = suite.id("continuity-B-provenance");
      await fixture.stage(b, provenanceB, preparedBlue);
      await fixture.upload(b, provenanceB, preparedBlue).expect(200);
      const evidenceB = await fixture.append(b, String(rawB["id"]), provenanceB, preparedBlue);

      const issuance = await post("reviewer", `orders/${b.id}/continuity-proofs`, {
        predecessorId: String(reportA["id"]),
        expectedPredecessorVersion: 3,
        expectedOrderVersion: b.version,
        predecessorIdentityRecordId: String(rawA["id"]),
        candidateIdentityRecordId: String(rawB["id"]),
        linkingTechnicianId: suite.id("technician"),
        method: "comparative_attestation",
        rationale: "Same stamped chassis; independently observed on both visits",
        provenanceRecordIds: [provenanceA, provenanceB],
      }).expect(201);
      return { a, b, rawA, rawB, evidenceA, evidenceB, reportA, proofId: String(issuance.body.proofId) };
    },
    ownershipComponent: async order => (await db.diagnosticOwnershipComponent.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { orderVersion: "desc" } })) as unknown as Record<string, unknown>,
    raw: async order => (await db.diagnosticIdentityRecord.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { orderVersion: "desc" } })) as unknown as Record<string, unknown>,
    eraseSubject: async person => {
      await request.delete("/api/v1/me").set(fixture.headers(person)).expect(204);
    },
    cleanup: async () => {
      await db.diagnosticContinuityProof.deleteMany({ where: { candidateOrder: { centerId } } });
      await db.diagnosticPdfArtifact.deleteMany({ where: { report: { order: { centerId } } } });
      const reports = await db.diagnosticReportRecord.findMany({ where: { order: { centerId } }, orderBy: { createdAt: "desc" } });
      for (const report of reports) await db.diagnosticReportRecord.delete({ where: { id: report.id } });
      await db.diagnosticAudit.deleteMany({ where: { centerId } });
      await db.diagnosticOrderAssignment.deleteMany({ where: { order: { centerId } } });
      await db.inspectionOrder.deleteMany({ where: { centerId } });
      await db.diagnosticTemplateVersion.deleteMany({ where: { centerId } });
      await db.diagnosticCenterAssignment.deleteMany({ where: { centerId } });
      await db.diagnosticCenter.deleteMany({ where: { id: centerId } });
      for (const key of objectKeys) await s3.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: key }));
      s3.destroy();
      await cleanSuiteFixtures(db, suite, { userAliases: people });
    },
    close: async () => {
      await app.close();
    },
  };
  return fixture;
}

export function assertPreparedDatabases(): void {
  if (!inject("apiTestDatabases")) throw new Error("Issue938 prepared reader requires configured API PostgreSQL/Redis globalSetup");
}
