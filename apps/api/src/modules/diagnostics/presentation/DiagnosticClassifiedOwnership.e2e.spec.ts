import "reflect-metadata";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaService, type Prisma } from "@auto-tm/db";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { workerDatabaseName, workerUrls } from "../../../../test/helpers/testDatabases";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../domain/ports/DiagnosticIntakePort";
import { diagnosticObservationHash } from "../infrastructure/PrismaDiagnosticIntake";

const suite = defineE2eSuite("diagnostic-classified-forward-ownership");
const people = ["seller", "replacement", "commissioner", "reception", "technician", "reviewer", "replacementReviewer", "unrelated", "graphSeller"] as const;
type Person = typeof people[number];
const centerId = suite.id("center");
const now = new Date("2026-10-23T00:00:00.000Z"), end = new Date("2027-01-01T00:00:00.000Z");
const localized = { tk: "Syntetik", ru: "Синтетический", en: "Synthetic" };
const observed = { observedAt: "2026-10-22T12:00:00.000Z", mileageKm: 123000, method: "vin" as const, vin: "SYN-OWNERSHIP", manualReference: null };
const rights = { category: "vehicle_observation", purpose: "SYNTHETIC restricted ownership continuity comparison",
  basis: "SYNTHETIC source permission covers historical seller, commissioner and Business member linkage until this authorized end",
  provenance: "SYNTHETIC generated Listing and server-resolved seller/commissioner/member subjects at first observation",
  identifiability: "personal", use: ["service"], schedule: { kind: "until", until: end.toISOString(), reason: "SYNTHETIC source permission ends" },
  supplierRestrictions: "SYNTHETIC service only; earlier subject erasure terminates permission", hold: null };
const envelope = { ownershipClassification: { rights } };
type Order = { id: string; version: number };
// Runs only in the configured disposable API SQL/Redis lane. Never run locally or on staging.
// Every diagnostic observation is HTTP-produced. Direct writes below are explicit SQL
// integrity attacks or cross-context source fixtures, never implicit ownership backfill.
describe("classified forward ownership on real HTTP and disposable PostgreSQL", { concurrent: false }, () => {
  let s3: S3Client;
  const keys = new Set<string>();
  let app: NestFastifyApplication, db: PrismaService, jwt: JwtService, request: ReturnType<typeof supertest>, templateId: string;
  const orders: string[] = [], listings: string[] = [], businesses: string[] = [];
  const headers = (who: Person) => ({ authorization: `Bearer ${jwt.sign({ sub: suite.id(who), sid: suite.id(`${who}-session`), role: "buyer" })}` });
  const post = (who: Person, path: string, body: object) => request.post(`/api/v1/diagnostics/${path}`).set(headers(who)).send(body);
  const raw = (orderId: string) => db.diagnosticIdentityRecord.findFirstOrThrow({ where: { orderId }, orderBy: { orderVersion: "desc" } });
  const component = (orderId: string) => db.diagnosticOwnershipComponent.findFirstOrThrow({ where: { orderId }, orderBy: { orderVersion: "desc" } });
  beforeAll(async () => {
    const testing = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, load: [() => ({ DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private" })] }), EventEmitterModule.forRoot(), bullTestRoot(), DiagnosticsModule,
      JwtModule.register({ global: true, secret: "synthetic-ownership-test" })] })
      .overrideProvider(IDENTITY_CLOCK_PORT).useValue({ now: () => now })
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => now, id: randomUUID, publicSyntheticAllowed: () => true,
        syntheticAllowed: ({ userId }: { userId: string }) => people.some(who => suite.id(who) === userId) }).compile();
    app = testing.createNestApplication<NestFastifyApplication>(new FastifyAdapter()); db = app.get(PrismaService); jwt = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
    expect(await db.user.count({ where: { id: { in: people.map(who => suite.id(who)) } } }), "Preserve a colliding previous attempt").toBe(0);
    s3 = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000", region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
    await seedSuiteCatalog(db, suite);
    for (const who of people) {
      await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), phoneVerifiedAt: now } });
      await db.session.create({ data: { id: suite.id(`${who}-session`), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: end, adminTotpExpiresAt: end } });
    }
    await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("center"), names: localized } });
    for (const [who, capability] of [["reception", "diagnostics.reception"], ["reception", "diagnostics.templates"], ["technician", "diagnostics.technician"], ["reviewer", "diagnostics.reviewer"], ["replacementReviewer", "diagnostics.reviewer"]] as const) {
      await db.staffGrant.create({ data: { userId: suite.id(who), capability } });
      await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id(who), capability, qualifiedUntil: end } });
    }
    const definition = { title: localized, limitations: localized, syntheticNotice: localized,
      checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
    templateId = (await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true }).expect(201)).body.id;
  });
  afterAll(async () => {
    try {
      if (!db) return;
      for (const key of keys) await s3.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: key }));
      await db.diagnosticContinuityProof.deleteMany({ where: { candidateOrderId: { in: orders } } });
      await db.diagnosticPdfArtifact.deleteMany({ where: { report: { orderId: { in: orders } } } });
      await db.diagnosticAudit.deleteMany({ where: { centerId } });
      await db.diagnosticReportRecord.deleteMany({ where: { orderId: { in: orders } } });
      await db.inspectionOrder.deleteMany({ where: { id: { in: orders } } });
      await db.diagnosticTemplateVersion.deleteMany({ where: { id: templateId } });
      await db.diagnosticCenterAssignment.deleteMany({ where: { centerId } });
      await db.diagnosticCenter.deleteMany({ where: { id: centerId } });
      await db.listing.deleteMany({ where: { id: { in: listings } } });
      await db.dealershipMember.deleteMany({ where: { dealershipId: { in: businesses } } });
      await db.dealership.deleteMany({ where: { id: { in: businesses } } });
      await cleanSuiteFixtures(db, suite, { userAliases: [...people] });
    } finally { s3?.destroy(); await app?.close(); }
  });
  async function visit(business = false, sourceSeller: "seller" | "replacement" = "seller", commissioner: "commissioner" | "unrelated" = "commissioner"): Promise<Order> {
    const listingId = randomUUID(); listings.push(listingId);
    let businessId: string | null = null;
    if (business) {
      businessId = randomUUID(); businesses.push(businessId);
      await db.dealershipMember.deleteMany({ where: { userId: suite.id("commissioner") } });
      await db.dealership.create({ data: { id: businessId, name: "SYNTHETIC ownership source", slug: `synthetic-${businessId}`, status: "active", admissionMode: "synthetic" } });
      await db.dealershipMember.create({ data: { dealershipId: businessId, userId: suite.id("commissioner"), role: "sales", status: "active" } });
    }
    await db.listing.create({ data: { id: listingId, sellerId: suite.id(business ? sourceSeller : commissioner), businessId,
      brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, vin: observed.vin,
      status: "active", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    let order = (await post(commissioner, "orders", { requestKey: randomUUID(), centerId, templateVersionId: templateId,
      audience: "listing_public", listingId, synthetic: true }).expect(201)).body as Order;
    orders.push(order.id);
    order = (await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version, userId: suite.id("technician"), capability: "diagnostics.technician", active: true }).expect(201)).body;
    // Only qualified staff receive assignments; the other principals remain ordinary source fixtures.
    for (const who of ["reviewer", "replacementReviewer"] as const) order = (await post("reception", `orders/${order.id}/assignments`, {
      expectedVersion: order.version, userId: suite.id(who), capability: "diagnostics.reviewer", active: true }).expect(201)).body;
    for (const kind of ["physical", "publication"]) order = (await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind, authorityReference: `SYNTHETIC ${kind} permission` }).expect(201)).body;
    for (const state of ["confirmed", "arrived"]) order = (await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201)).body;
    return order;
  }
  const observe = (order: Order, extra: object = {}) => post("technician", `orders/${order.id}/vehicle`, { expectedVersion: order.version, ...observed, ...extra });
  it("refuses unauthenticated and unassigned classified observations without writes", async () => {
    const order = await visit();
    const before = await db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } });
    const audits = await db.diagnosticAudit.count({ where: { orderId: order.id } });
    const body = { expectedVersion: order.version, ...observed, ...envelope };
    await request.post(`/api/v1/diagnostics/orders/${order.id}/vehicle`).send(body).expect(401);
    await post("commissioner", `orders/${order.id}/vehicle`, body).expect(403);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } })).toEqual(before);
    expect(await db.diagnosticIdentityRecord.count({ where: { orderId: order.id } })).toBe(0);
    expect(await db.diagnosticOwnershipComponent.count({ where: { orderId: order.id } })).toBe(0);
    expect(await db.diagnosticAudit.count({ where: { orderId: order.id } })).toBe(audits);
  });
  it.each([false, true])("retains only server-resolved classified source facts; Business=%s", async business => {
    const order = await visit(business), response = await observe(order, envelope).expect(201);
    expect(response.body.observedVehicle).toEqual(observed);
    const c = await component(order.id), r = await raw(order.id);
    expect(c).toMatchObject({ state: "available", identityRecordId: r.id, orderVersion: response.body.version,
      sellerId: suite.id(business ? "seller" : "commissioner"), commissionerId: suite.id("commissioner"), rights });
    expect(!!c.businessId).toBe(business); expect(!!c.membershipId).toBe(business);
    expect(r.observationHash).toBe(diagnosticObservationHash(order.id, response.body.version, observed));
    expect(JSON.stringify(response.body)).not.toContain("ownershipClassification");
    await observe(response.body, envelope).expect(201);
    expect(await db.diagnosticOwnershipComponent.findUniqueOrThrow({ where: { identityRecordId: r.id } })).toEqual(c);
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: r.id } })).toEqual(r);
    expect(await component(order.id)).toMatchObject({ state: "available", rights });
  });
  it("does not repair an earlier unavailable anchor with later classification", async () => {
    const order = await visit(), first = await observe(order).expect(201);
    expect(await component(order.id)).toMatchObject({ state: "unavailable", sellerId: null, rights: null });
    await observe(first.body, envelope).expect(201);
    expect(await component(order.id)).toMatchObject({ state: "unavailable", identityDigest: null, rights: null });
  });
  it.each([
    { ownershipClassification: null }, { ownershipClassification: { rights, sellerId: suite.id("replacement") } },
    { ownershipClassification: { rights: { ...rights, extra: true } } },
    { ownershipClassification: { rights: { ...rights, schedule: { ...rights.schedule, until: now.toISOString() } } } },
  ])("refuses malformed/expired envelopes atomically: %j", async extra => {
    const order = await visit(), before = await db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } });
    const audits = await db.diagnosticAudit.count({ where: { orderId: order.id } });
    await observe(order, extra).expect(400);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } })).toEqual(before);
    expect(await db.diagnosticIdentityRecord.count({ where: { orderId: order.id } })).toBe(0);
    expect(await db.diagnosticAudit.count({ where: { orderId: order.id } })).toBe(audits);
  });
  it.each(["missing", "suspended"])("records an ordinary observation with %s source membership without inventing a personal tuple", async state => {
    const order = await visit(true);
    if (state === "missing") await db.dealershipMember.delete({ where: { userId: suite.id("commissioner") } });
    else await db.dealershipMember.update({ where: { userId: suite.id("commissioner") }, data: { status: "suspended" } });
    await observe(order, envelope).expect(201);
    expect(await component(order.id)).toMatchObject({ state: "unavailable", businessId: null, membershipId: null, sellerId: null, rights: null });
  });
  it("fences rights synchronously at the exact end before disposal, then erases idempotently without changing raw or report pins", async () => {
    const order = await visit(); await observe(order, envelope).expect(201);
    const before = await raw(order.id), latest = await db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } });
    const reportId = randomUUID();
    await post("technician", `orders/${order.id}/reports`, { reportId, expectedOrderVersion: latest.version }).expect(201);
    const report = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } });
    expect(await db.$queryRaw`SELECT * FROM diagnostic_live_ownership_component(${before.id},${new Date(end.getTime() - 1)}::timestamp)`).toHaveLength(1);
    expect(await db.$queryRaw`SELECT * FROM diagnostic_live_ownership_component(${before.id},${end}::timestamp)`).toHaveLength(0);
    await worker("expire", end);
    await worker("expire", end);
    expect(await component(order.id)).toMatchObject({ state: "erased", sellerId: null, commissionerId: null, identityDigest: null, rights: null, declaredById: null, sourceListingId: null });
    expect(await raw(order.id)).toEqual(before);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } })).toEqual(report);
    await expect(db.diagnosticOwnershipComponent.update({ where: { identityRecordId: before.id }, data: { state: "available", rights } })).rejects.toThrow();
  });
  it("finds the historical seller after source replacement and preserves commissioner C's raw and pinned report", async () => {
    const order = await visit(true); await observe(order, envelope).expect(201);
    const c = await component(order.id), before = await raw(order.id);
    await db.listing.update({ where: { id: c.sourceListingId! }, data: { sellerId: suite.id("replacement") } });
    await db.$queryRaw`SELECT diagnostic_dispose_ownership(${suite.id("seller")}::text,${now}::timestamp)`;
    expect(await component(order.id)).toMatchObject({ state: "erased", sellerId: null, membershipId: null, rights: null, identityDigest: null });
    expect(await raw(order.id)).toEqual(before);
    expect((await db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } })).commissionerId).toBe(suite.id("commissioner"));
  });
  it.each([false, true])("rejects rights rewrite, tuple NULLs, forged source, raw/order/version mismatch and later classification through SQL; Business=%s", async business => {
    const order = await visit(business); await observe(order, envelope).expect(201);
    const c = await component(order.id);
    for (const data of [{ rights: { ...rights, basis: "forged" } }, { rightsUntil: new Date("2028-01-01T00:00:00Z") },
      { sourceListingId: null }, { sellerId: null }, { commissionerId: null }, { identityDigest: "0".repeat(64) },
      { sellerId: suite.id("replacement") }, { membershipId: randomUUID() }, { orderId: randomUUID() }, { orderVersion: c.orderVersion + 1 }]) {
      await expect(db.diagnosticOwnershipComponent.update({ where: { identityRecordId: c.identityRecordId }, data })).rejects.toThrow();
      expect(await component(order.id)).toEqual(c);
    }
    for (const forged of [
      { sellerId: suite.id("replacement") }, { sellerId: null }, { commissionerId: null }, { sourceListingId: null },
      { identityDigest: "0".repeat(64) }, { membershipId: randomUUID() }, { identityRecordId: randomUUID() },
      { orderVersion: -1 }, { rights: { ...rights, extra: "forged" } },
      ...(business ? [{ businessId: null, membershipId: null }] : []),
    ]) {
      await expect(db.$transaction(async tx => {
        const next = await tx.inspectionOrder.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
        const rawId = randomUUID();
        await tx.diagnosticIdentityRecord.create({ data: { id: rawId, orderId: order.id, orderVersion: next.version,
          observation: observed, observationHash: diagnosticObservationHash(order.id, next.version, observed), recordedById: suite.id("technician"), recordedAt: now } });
        await tx.diagnosticOwnershipComponent.create({ data: { ...c, identityRecordId: rawId, orderVersion: next.version,
          rights: rights as Prisma.InputJsonValue, ...forged } });
        throw new Error("forged ownership INSERT unexpectedly accepted");
      })).rejects.toThrow(/diagnostic_ownership/);
      expect(await component(order.id)).toEqual(c);
    }
    // A no-op UPDATE changes xmin. It must not turn a committed raw without
    // classification into a fresh capture transaction or permit later backfill.
    const missingRaw = await db.$transaction(async tx => {
      const next = await tx.inspectionOrder.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
      return tx.diagnosticIdentityRecord.create({ data: { id: randomUUID(), orderId: order.id, orderVersion: next.version,
        observation: observed, observationHash: diagnosticObservationHash(order.id, next.version, observed), recordedById: suite.id("technician"), recordedAt: now } });
    });
    await expect(db.$transaction(async tx => {
      await tx.diagnosticIdentityRecord.update({ where: { id: missingRaw.id }, data: { recordedAt: missingRaw.recordedAt } });
      await tx.diagnosticOwnershipComponent.create({ data: { ...c, identityRecordId: missingRaw.id, orderVersion: missingRaw.orderVersion,
        rights: rights as Prisma.InputJsonValue } });
      throw new Error("later classification unexpectedly accepted");
    })).rejects.toThrow(/diagnostic_ownership/);
    await expect(db.diagnosticIdentityRecord.update({ where: { id: missingRaw.id }, data: { ownershipCaptureTransaction: "forged" } })).rejects.toThrow(/diagnostic_ownership/);
    const unclassified = await visit(); await observe(unclassified).expect(201);
    const missing = await component(unclassified.id);
    await expect(db.diagnosticOwnershipComponent.update({ where: { identityRecordId: missing.identityRecordId }, data: {
      ...c, identityRecordId: missing.identityRecordId, orderId: unclassified.id, orderVersion: missing.orderVersion,
      rights: c.rights as Prisma.InputJsonValue,
    } })).rejects.toThrow();
  });
  // Same configured worker transport as the existing public-transfer lifecycle suite.
  // Exact injected worker DB, hosted loopback services and sole due-account fences
  // are checked before any maintenance. No local services are started by this spec.
  async function worker(action: "expire" | "purge", clock: Date, subject?: Person,
    control?: { signal: AbortSignal; onReady(): void; start: Promise<void> }) {
    const databases = inject("apiTestDatabases");
    if (!databases) throw new Error("Ownership lifecycle requires injected disposable databases");
    const pool = Number(process.env["VITEST_POOL_ID"]), expected = workerUrls(databases, pool).databaseUrl;
    const name = workerDatabaseName(databases.prefix, pool), root = resolve(__dirname, "../../../../../worker");
    const script = `
      require('reflect-metadata'); require('tsx/cjs');
      const assert = require('node:assert/strict');
      const { PrismaService } = require('@auto-tm/db');
      const { randomUUID } = require('node:crypto');
      async function main() {
        assert.equal(process.env.GITHUB_ACTIONS,'true');
        assert.equal(process.env.DATABASE_URL,${JSON.stringify(expected)});
        const url = new URL(process.env.DATABASE_URL);
        assert.match(url.hostname,/^(localhost|127[.]0[.]0[.]1)$/);
        assert.equal(decodeURIComponent(url.pathname.slice(1)),${JSON.stringify(name)});
        const db = new PrismaService(); const now = new Date(${JSON.stringify(clock.toISOString())});
        try {
          if (${JSON.stringify(action)} === 'purge') {
            const target = ${JSON.stringify(subject ? suite.id(subject) : null)};
            assert.deepEqual(await db.user.findMany({where:{deletionScheduledAt:{lte:now}},select:{id:true}}),[{id:target}]);
            assert.equal(await db.otpRequest.count({where:{createdAt:{lt:new Date(now.getTime()-30*86400000)}}}),0);
            const { PurgeExpiredAccounts } = require('./src/jobs/PurgeExpiredAccounts.ts');
            assert.deepEqual(await new PurgeExpiredAccounts(db).execute({now}),{purgedCount:1});
          } else {
            const { readFile } = require('node:fs/promises');
            const { S3Client } = require('@aws-sdk/client-s3');
            const { DiagnosticArtifactWorker } = require('./src/jobs/diagnostics/DiagnosticArtifactWorker.ts');
            const { S3DiagnosticArtifactObjects } = require('./src/jobs/diagnostics/S3DiagnosticArtifactObjects.ts');
            const s3 = new S3Client({endpoint:process.env.MINIO_ENDPOINT,region:'us-east-1',forcePathStyle:true,
              credentials:{accessKeyId:process.env.MINIO_ACCESS_KEY||'minioadmin',secretAccessKey:process.env.MINIO_SECRET_KEY||'minioadmin'}});
            try {
              const regular = await readFile('./src/assets/fonts/NotoSans-Regular.ttf');
              const bold = await readFile('./src/assets/fonts/NotoSans-Bold.ttf');
              if (${!!control}) {
                process.stdout.write('OWNERSHIP_WORKER_READY\\n');
                await new Promise(resolve => process.stdin.once('data', resolve));
                process.stdin.pause();
                const [clock] = await db.$queryRawUnsafe("SELECT clock_timestamp() AT TIME ZONE 'UTC' AS value");
                now.setTime(clock.value.getTime());
              }
              await new DiagnosticArtifactWorker(db,new S3DiagnosticArtifactObjects(s3,'diagnostic-test-private'),{regular,bold},
                {now:()=>now,id:randomUUID,enabled:()=>true}).cleanup();
            } finally { s3.destroy(); }
          }
        } finally { await db.$disconnect(); }
      }
      void main().catch(error=>{console.error(error);process.exitCode=1;});
    `;
    const execution = promisify(execFile)(process.execPath,["-e",script],{cwd:root,env:{...process.env,TSX_TSCONFIG_PATH:resolve(root,"tsconfig.json")},timeout:60000,killSignal:"SIGKILL", signal: control?.signal});
    if (control) {
      let output = "";
      execution.child.stdout?.on("data", chunk => {
        output += String(chunk);
        if (output.includes("OWNERSHIP_WORKER_READY\n")) control.onReady();
      });
      // Cancellation may close stdin between readiness and release; execution still
      // reports the child failure. Never leave an unhandled stream error behind.
      execution.child.stdin?.on("error", () => undefined);
      void control.start.then(() => execution.child.stdin?.end("run\n"));
    }
    await execution;
  }
  async function structured(order: Order) {
    const provenanceId = randomUUID();
    const input = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4z8AARwgWXg4ArpMP8aaUSCMAAAAASUVORK5CYII=", "base64");
    const expectedHash = "2639253ab66f01c5c4121c41b648a4d492d71527101073024166d926a0be22c1";
    keys.add(`diagnostic-evidence/${provenanceId}/${expectedHash}`);
    await post("technician", `orders/${order.id}/identity-provenance`, { id: provenanceId, expectedOrderVersion: order.version,
      contentType: "image/png", sizeBytes: input.length, rights }).expect(201);
    await request.put(`/api/v1/diagnostics/orders/${order.id}/identity-provenance/${provenanceId}?expectedOrderVersion=${order.version}`)
      .set(headers("technician")).set("content-type", "application/octet-stream").set("x-evidence-type", "image/png").send(input).expect(200);
    const r = await raw(order.id);
    const captured = await post("technician", `orders/${order.id}/identity-evidence`, { id: randomUUID(), expectedOrderVersion: order.version,
      identityRecordId: r.id, rights, correction: null, identifiers: [
        { kind: "vin_stamp", location: "SYNTHETIC VIN stamp", value: observed.vin, provenanceIds: [provenanceId] },
        { kind: "chassis_stamp", location: "SYNTHETIC chassis", value: "SYN-OWNERSHIP-CHASSIS", provenanceIds: [provenanceId] },
      ] }).expect(201);
    order.version = captured.body.orderVersion;
    return { r, provenanceId };
  }
  async function release(reportId: string, reviewer: "reviewer" | "replacementReviewer" = "reviewer") {
    await post("technician", `reports/${reportId}/findings`, { expectedVersion: 0, finding: { id: randomUUID(), checkId: "brakes", assessment: "normal",
      explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null } }).expect(201);
    await post("technician", `reports/${reportId}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    const response = await post(reviewer, `reports/${reportId}/transition`, { expectedVersion: 2, action: "finalize" });
    for (const artifact of await db.diagnosticPdfArtifact.findMany({ where: { reportId } })) keys.add(artifact.objectKey);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
  }
  async function consumed(sourceSeller: "seller" | "replacement" = "seller", business = true) {
    const a = await visit(business, sourceSeller); a.version = (await observe(a, envelope).expect(201)).body.version;
    const ia = await structured(a), reportA = randomUUID();
    await post("technician", `orders/${a.id}/reports`, { reportId: reportA, expectedOrderVersion: a.version }).expect(201);
    await release(reportA);
    const b = await visit(); b.version = (await observe(b, envelope).expect(201)).body.version;
    const ib = await structured(b);
    const issued = await post("reviewer", `orders/${b.id}/continuity-proofs`, { predecessorId: reportA, expectedPredecessorVersion: 3,
      expectedOrderVersion: b.version, predecessorIdentityRecordId: ia.r.id, candidateIdentityRecordId: ib.r.id,
      linkingTechnicianId: suite.id("technician"), method: "comparative_attestation", rationale: "SYNTHETIC independent source-specific identity comparison",
      provenanceRecordIds: [ia.provenanceId, ib.provenanceId] }).expect(201);
    const input = { reportId: randomUUID(), predecessorId: reportA, expectedOrderVersion: b.version, proofId: issued.body.proofId,
      reason: "SYNTHETIC independent B physical visit" };
    await post("technician", `orders/${b.id}/reinspections`, input).expect(201);
    return { a, b, input, reportA };
  }
  it("erases replaced member linkage while retaining commissioner C's vehicle observation", async () => {
    const order = await visit(true); await observe(order, envelope).expect(201);
    const c = await component(order.id), r = await raw(order.id);
    await db.dealershipMember.delete({ where: { userId: suite.id("commissioner") } });
    const replacement = await db.dealershipMember.create({ data: { dealershipId: c.businessId!, userId: suite.id("commissioner"), role: "sales", status: "active" } });
    expect(replacement.id).not.toBe(c.membershipId);
    expect((await component(order.id)).membershipId).toBe(c.membershipId);
    await db.$queryRaw`SELECT diagnostic_dispose_ownership(${suite.id("seller")}::text,${now}::timestamp)`;
    expect(await component(order.id)).toMatchObject({ state: "erased", membershipId: null, businessId: null });
    expect(await raw(order.id)).toEqual(r);
  });
  // Poll actual PostgreSQL state with a wall deadline; a delay is never race proof.
  async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean, label: string, budget = 3000): Promise<T> {
    const deadline = Date.now() + budget;
    for (;;) {
      const value = await read();
      if (accept(value)) return value;
      if (Date.now() >= deadline) throw new Error(`${label}: ${JSON.stringify(value)}`);
    }
  }
  const targets = async (cutoff: Date) => (await db.$queryRaw<{ value: { c: string[]; u: string[]; b: string[]; l: string[]; o: string[]; r: string[]; p: string[] } }[]>`
    SELECT diagnostic_ownership_disposal_targets(NULL::text,${cutoff}::timestamp) AS value`)[0]!.value;
  const dbTime = async () => (await db.$queryRaw<{ value: Date }[]>`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS value`)[0]!.value;

  it.each([false, true])("expires a capture committed after E inside the unchanged locked graph; Business=%s", async business => {
    if (!business) await db.dealershipMember.deleteMany({ where: { userId: suite.id("commissioner") } });
    const pair = await consumed("seller", business);
    const c = await visit(false, "seller", "unrelated");
    c.version = (await observe(c, envelope).expect(201)).body.version;
    const cReport = randomUUID();
    await post("technician", `orders/${c.id}/reports`, { reportId: cReport, expectedOrderVersion: c.version }).expect(201);
    const cBefore = { raw: await raw(c.id), component: await component(c.id), report: await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: cReport } }) };
    const rawBefore = await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: [pair.a.id, pair.b.id] } }, orderBy: { id: "asc" } });
    const reportsBefore = await db.diagnosticReportRecord.findMany({ where: { id: { in: [pair.reportA, pair.input.reportId] } }, orderBy: { id: "asc" } });
    const proofBefore = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: pair.input.proofId } });
    expect(proofBefore).toMatchObject({ consumedReportId: pair.input.reportId });
    // Preload the real worker before opening the short capture transaction. Only
    // the transport is gated; cleanup itself and every product boundary are real.
    let markReady!: () => void, runWorker!: () => void;
    const ready = new Promise<void>(resolve => { markReady = resolve; });
    const start = new Promise<void>(resolve => { runWorker = resolve; });
    const abort = new AbortController();
    // Choose E after worker readiness. After release the worker obtains its own
    // current cutoff from PostgreSQL, which the test has already observed past E.
    const operation = worker("expire", now, undefined, { signal: abort.signal, onReady: markReady, start });
    const workerResult = Promise.allSettled([operation]);
    let captureResult: Promise<PromiseSettledResult<supertest.Response>[]> | undefined;
    let capturePid: number | undefined;
    let businessProbe: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await Promise.race([ready, operation.then(() => { throw new Error("Worker exited before readiness"); })]);
      const expiry = new Date((await dbTime()).getTime() + 2000);
      expect(proofBefore.rightsUntil > expiry, "ownership disposal must delete a proof that is not itself expired").toBe(true);
      const short = { ownershipClassification: { rights: { ...rights, schedule: { ...rights.schedule, until: expiry.toISOString() } } } };
      const current = await db.inspectionOrder.findUniqueOrThrow({ where: { id: pair.a.id } });
      pair.a.version = (await observe({ id: pair.a.id, version: current.version }, short).expect(201)).body.version;
      const first = await component(pair.a.id), firstRaw = await raw(pair.a.id);
      expect(first.state).toBe("available");
      const discovered = await targets(expiry);
      expect(discovered.c).toContain(first.identityRecordId);
      expect(discovered.u).toContain(suite.id("commissioner"));
      expect(discovered.b.includes(first.businessId!)).toBe(business);
      await db.$transaction(async tx => {
        const [holder] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        // Audit is after the real raw/component INSERT. Its lock wait proves append
        // completed while keeping capture's User/Business/Listing/order prefix held.
        await tx.$executeRaw`LOCK TABLE diagnostic_audits IN SHARE MODE`;
        captureResult = Promise.allSettled([observe(pair.a, short).timeout({ deadline: 6000 }).expect(201)]);
        const waiters = await until(() => db.$queryRaw<{ pid: number; before_end: boolean }[]>`
          SELECT pid, clock_timestamp() < ${expiry}::timestamp AS before_end FROM pg_stat_activity
          WHERE datname=current_database() AND ${holder!.pid}::int=ANY(pg_blocking_pids(pid))
          AND query LIKE '%diagnostic_audits%'`, rows => rows.length === 1, "capture never reached post-append audit");
        capturePid = waiters[0]!.pid;
        expect(waiters[0]!.before_end, "append must reach barrier before actual E").toBe(true);
        expect(await targets(expiry)).toEqual(discovered);
        if (business) {
          businessProbe = Promise.allSettled([db.$queryRaw`SELECT id FROM dealerships WHERE id=${first.businessId} FOR UPDATE`]);
          await until(() => db.$queryRaw<{ pid: number }[]>`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
            AND ${capturePid}::int=ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT id FROM dealerships%'`,
          rows => rows.length === 1, "capture never held the Business prefix");
        }
        await until(dbTime, time => time >= expiry, "database clock never crossed E");
        runWorker();
        await until(() => db.$queryRaw<{ pid: number; relation: string }[]>`
          SELECT activity.pid, locks.relation::regclass::text AS relation FROM pg_stat_activity activity
          JOIN pg_locks locks ON locks.pid=activity.pid AND locks.locktype='relation' AND locks.granted
          WHERE activity.datname=current_database() AND ${capturePid}::int=ANY(pg_blocking_pids(activity.pid))
          AND activity.query LIKE '%diagnostic_dispose_ownership%' AND locks.relation='users'::regclass`,
        rows => rows.length > 0, "worker never waited on capture's User prefix");
      }, { timeout: 12000 });
      const captured = (await captureResult!)[0]!;
      if (captured.status === "rejected") throw captured.reason;
      expect((await dbTime()) >= expiry).toBe(true);
      const second = await raw(pair.a.id);
      expect(second.id).not.toBe(first.identityRecordId);
      expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: firstRaw.id } })).toEqual(firstRaw);
      const result = (await workerResult)[0]!;
      if (result.status === "rejected") throw result.reason;
      const erased = await db.diagnosticOwnershipComponent.findMany({ where: { identityRecordId: { in: [first.identityRecordId, second.id] } } });
      expect(erased).toHaveLength(2);
      for (const item of erased) expect(item).toMatchObject({ state: "erased", scope: null, sourceListingId: null, identityDigest: null,
        sellerId: null, commissionerId: null, businessId: null, membershipId: null, rights: null, rightsUntil: null, declaredById: null, declaredAt: null });
      expect(await db.diagnosticContinuityProof.findUnique({ where: { id: pair.input.proofId } })).toBeNull();
      const snapshot = await db.diagnosticOwnershipComponent.findMany({ where: { orderId: pair.a.id }, orderBy: { orderVersion: "asc" } });
      await worker("expire", expiry);
      expect(await db.diagnosticOwnershipComponent.findMany({ where: { orderId: pair.a.id }, orderBy: { orderVersion: "asc" } })).toEqual(snapshot);
      expect(await db.diagnosticIdentityRecord.findMany({ where: { id: { in: rawBefore.map(row => row.id) } }, orderBy: { id: "asc" } })).toEqual(rawBefore);
      expect(await db.diagnosticReportRecord.findMany({ where: { id: { in: reportsBefore.map(row => row.id) } }, orderBy: { id: "asc" } })).toEqual(reportsBefore);
      expect({ raw: await raw(c.id), component: await component(c.id), report: await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: cReport } }) }).toEqual(cBefore);
      await post("technician", `orders/${pair.b.id}/reinspections`, pair.input).expect(201);
      await post("technician", `orders/${pair.b.id}/reinspections`, { ...pair.input, proofId: randomUUID() }).expect(409);
    } finally {
      // The holder transaction has already committed/rolled back on every path.
      // Cancel any blocked server command, terminate the child and drain both.
      runWorker();
      try {
        if (capturePid) await db.$queryRaw`SELECT pg_cancel_backend(${capturePid}::int) WHERE EXISTS
          (SELECT 1 FROM pg_stat_activity WHERE pid=${capturePid}::int AND state='active' AND query LIKE '%diagnostic_audits%')`;
      } finally {
        abort.abort();
        await Promise.all([captureResult, workerResult, businessProbe]);
      }
    }
  });

  it("refuses graph expansion after discovery without erasing ownership payloads", async () => {
    const order = await visit(); await observe(order, envelope).expect(201);
    const before = await component(order.id);
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await db.$transaction(async tx => {
        const [holder] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        await tx.$queryRaw`SELECT id FROM users WHERE id=${suite.id("commissioner")} FOR UPDATE`;
        pending = Promise.allSettled([db.$queryRaw`SELECT diagnostic_dispose_ownership(${suite.id("commissioner")}::text,${now}::timestamp)`]);
        await until(() => db.$queryRaw<{ pid: number }[]>`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
          AND ${holder!.pid}::int=ANY(pg_blocking_pids(pid)) AND query LIKE '%diagnostic_dispose_ownership%'`, rows => rows.length === 1, "disposal never reached User barrier");
        await tx.listing.update({ where: { id: before.sourceListingId! }, data: { sellerId: suite.id("graphSeller") } });
      });
      const result = (await pending!)[0]!;
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(String(result.reason)).toContain("diagnostic_ownership_disposal_targets_changed");
      expect(await component(order.id)).toEqual(before);
    } finally { await pending; }
  });

  it("purges the historical seller and consumed payload while B keeps exact retry, ordinary writes and independent release", async () => {
    const pair = await consumed(), before = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: pair.input.reportId } });
    const rawA = await raw(pair.a.id), rawB = await raw(pair.b.id), originalA = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: pair.reportA } });
    const c = await component(pair.a.id);
    await db.listing.update({ where: { id: c.sourceListingId! }, data: { sellerId: suite.id("replacement") } });
    await db.user.update({ where: { id: suite.id("seller") }, data: { deletionScheduledAt: now } });
    await worker("purge", now, "seller");
    expect(await db.diagnosticContinuityProof.findUnique({ where: { id: pair.input.proofId } })).toBeNull();
    expect(await component(pair.a.id)).toMatchObject({ state: "erased", identityDigest: null, rights: null });
    expect(await raw(pair.a.id)).toEqual(rawA); expect(await raw(pair.b.id)).toEqual(rawB);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: pair.reportA } })).toEqual(originalA);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: pair.input.reportId } })).toEqual(before);
    await post("technician", `orders/${pair.b.id}/reinspections`, pair.input).expect(201);
    await post("technician", `orders/${pair.b.id}/reinspections`, { ...pair.input, proofId: randomUUID() }).expect(409);
    await release(pair.input.reportId);
    await request.get(`/api/v1/public-diagnostics/reports/${pair.input.reportId}`).expect(200);
  });
  let recorderOrderId: string;
  it("purges the issuer after consumption without blocking B's current technician or replacement independent reviewer", async () => {
    const pair = await consumed("replacement"), before = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: pair.input.reportId } });
    recorderOrderId = pair.b.id;
    await db.user.update({ where: { id: suite.id("reviewer") }, data: { deletionScheduledAt: now } });
    await worker("purge", now, "reviewer");
    expect(await db.diagnosticContinuityProof.findUnique({ where: { id: pair.input.proofId } })).toBeNull();
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: pair.input.reportId } })).toEqual(before);
    await post("technician", `orders/${pair.b.id}/reinspections`, pair.input).expect(201);
    await release(pair.input.reportId, "replacementReviewer");
  });
  it("detaches erased recorder/declarer attribution without destroying another commissioner's evidence", async () => {
    const order = { id: recorderOrderId };
    const r = await raw(order.id), c = await component(order.id);
    await db.user.update({ where: { id: suite.id("technician") }, data: { deletionScheduledAt: now } });
    await worker("purge", now, "technician");
    expect(await raw(order.id)).toEqual({ ...r, recordedById: null });
    expect(await component(order.id)).toEqual({ ...c, declaredById: null });
  });

});
