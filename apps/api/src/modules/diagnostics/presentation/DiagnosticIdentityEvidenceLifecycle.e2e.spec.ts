import "reflect-metadata";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { CreateBucketCommand, DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
import { cleanSuiteFixtures, defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../domain/ports/DiagnosticIntakePort";
import { DIAGNOSTIC_OBJECTS, type DiagnosticObjects } from "../domain/ports/DiagnosticObjects";

const suite = defineE2eSuite("diagnostic-identity-evidence-lifecycle");
const people = ["buyer", "other", "foreign", "late", "reception", "technician", "controlTechnician", "reviewer"] as const;
type Person = typeof people[number];
type Commissioner = "buyer" | "other" | "foreign" | "late";
type Recorder = "technician" | "controlTechnician";
const capability: Partial<Record<Person, string>> = { reception: "diagnostics.reception", technician: "diagnostics.technician",
  controlTechnician: "diagnostics.technician", reviewer: "diagnostics.reviewer" };
const centerId = suite.id("center");
const initialTime = new Date("2026-10-21T12:00:00.000Z");
// The product grace period is 30 days from DELETE /me at the fixed identity clock.
const purgeTime = new Date("2026-11-20T12:00:00.000Z");
const future = new Date("2027-01-01T00:00:00.000Z");
const localized = { tk: "Synag", ru: "Тест", en: "Synthetic" };
const rights = { category: "vehicle_observation", purpose: "Synthetic diagnostic identity comparison", basis: "Owned synthetic fixture only",
  provenance: "Generated chassis fixture, not a customer document", identifiability: "pseudonymous", use: ["service"],
  schedule: { kind: "until", until: "2026-12-01T00:00:00.000Z", reason: "Synthetic fixture authorization" },
  supplierRestrictions: "No export or redistribution", hold: null };
// The same offline Sharp 0.34.5 / libwebp 1.6.0 literals as the capture oracle; synthetic color tiles only.
const red = { input: "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4z8AARwgWXg4ArpMP8aaUSCMAAAAASUVORK5CYII=",
  inputSize: 95, output: "UklGRkAAAABXRUJQVlA4IDQAAAAwAgCdASoEAAQAAMASJaACdLoB+AH4AARoAAD++iGX/3easNN39a3/9aOfron+tHP/WVgA",
  sizeBytes: 72, sha256: "2639253ab66f01c5c4121c41b648a4d492d71527101073024166d926a0be22c1" };
const blue = { input: "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVR4nGNgYPiPhIjiAACOsw/xs6MvMwAAAABJRU5ErkJggg==",
  inputSize: 94, output: "UklGRj4AAABXRUJQVlA4IDIAAADwAQCdASoEAAQAAMASJaACdLoB+AAETAAA/v5mof/60c/XRP9aOf+tHP/lKotU24oAAA==",
  sizeBytes: 70, sha256: "b7b11262b6b5f09879357d0857c949d7713b380c8b3a4682b0421390a0c7f873" };
type Image = typeof red;
type Rights = typeof rights;
type Observation = { observedAt: string; mileageKm: number; method: "manual" | "vin"; vin: string | null; manualReference: string | null };
type Order = { id: string; version: number };
type Raw = { id: string; orderId: string; orderVersion: number; observationHash: string; observation: Observation; recordedBy: string; recordedAt: string };
type Evidence = { id: string; recordHash: string; orderVersion: number; recordedBy: string | null };
const observation = (who: Commissioner, mileageKm = 123000): Observation => ({ observedAt: "2026-10-21T10:00:00.000Z", mileageKm, method: "manual", vin: null,
  manualReference: `Synthetic ${who} lifecycle transcription ${mileageKm}` });
const explanation = "Transcribed 014 as 041; new close-up shows 014";
const identifier = (provenanceId: string, value: string) => ({ kind: "chassis_stamp", location: "Right frame rail", value, provenanceIds: [provenanceId] });
const metadata = (id: string, image: Image = red) => ({ id, sha256: image.sha256, mime: "image/webp", sizeBytes: image.sizeBytes });
const objectKey = (id: string, image: Image = red) => `diagnostic-evidence/${id}/${image.sha256}`;
const privateNoStore = (response: { headers: Record<string, string> }) => {
  expect(response.headers["cache-control"]).toContain("private");
  expect(response.headers["cache-control"]).toContain("no-store");
};
const deniedBody = { statusCode: 403, code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection request could not be completed", timestamp: expect.any(String), requestId: "unknown" };

/** Prepared lifecycle coverage only: real HTTP, PostgreSQL, the private S3 adapter and the production
 * account purge in a bounded worker subprocess. No proof issuance, consumption, transfer, real
 * collection or hold policy. Exact object deletion after settlement is the hosted worker suite's. */
describe("structured identity evidence through held uploads, rights expiry and account erasure", () => {
  let app: NestFastifyApplication; let db: PrismaService; let jwt: JwtService;
  let request: ReturnType<typeof supertest>; let objects: S3Client; let storage: DiagnosticObjects;
  let templateId: string; let now = initialTime;
  const ownedProvenance = new Set<string>();
  const headers = (who: Person) => ({ authorization: `Bearer ${jwt.sign({ sub: suite.id(who), sid: suite.id(`${who}-session`), role: "buyer" })}` });
  const post = (who: Person, path: string, body: object) => request.post(`/api/v1/diagnostics/${path}`).set(headers(who)).send(body);
  const get = (who: Person, path: string) => request.get(`/api/v1/diagnostics/${path}`).set(headers(who));
  const evidencePath = (o: Order) => `orders/${o.id}/identity-evidence`;
  const provenancePath = (o: Order, id?: string) => `orders/${o.id}/identity-provenance${id ? `/${id}` : ""}`;
  const comparisonPath = (b: Order, reportId: string) => `orders/${b.id}/reinspection-comparison?predecessorId=${reportId}`;
  const comparativeBytes = (b: Order, reportId: string, p: string) => `orders/${b.id}/reinspection-comparison/provenance/${p}?predecessorId=${reportId}`;
  const history = async (o: Order): Promise<Raw[]> => (await get("reviewer", `orders/${o.id}/identity-records`).expect(200)).body;
  const provenanceRow = (id: string) => db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } });
  const evidenceRows = (orderId: string) => db.diagnosticIdentityEvidence.findMany({ where: { orderId }, orderBy: { orderVersion: "asc" } });
  const provenanceRows = (orderId: string) => db.diagnosticIdentityProvenance.findMany({ where: { orderId }, orderBy: { id: "asc" } });
  const head = (key: string) => objects.send(new HeadObjectCommand({ Bucket: "diagnostic-test-private", Key: key }));
  async function cleanup() {
    if (!db) return;
    // Exact owned keys only. Never list/delete a shared bucket or another suite's prefix.
    for (const id of ownedProvenance) for (const image of [red, blue]) {
      await objects.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: objectKey(id, image) }));
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
    // Teardown only. Identity records, evidence and provenance cascade from these suite-owned orders.
    await db.inspectionOrder.deleteMany({ where: { centerId } });
    await db.diagnosticTemplateVersion.deleteMany({ where: { centerId } });
    await db.diagnosticCenterAssignment.deleteMany({ where: { centerId } });
    await db.diagnosticCenter.deleteMany({ where: { id: centerId } });
    await cleanSuiteFixtures(db, suite, { userAliases: people });
  }
  beforeAll(async () => {
    // DELETE /me injects SystemClockAdapter directly, beyond the identity port override.
    // Match the account-erasure oracle: fake Date only and keep real timers active.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(initialTime);
    const testing = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, load: [() => ({ DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private" })] }),
      EventEmitterModule.forRoot(), bullTestRoot(), DiagnosticsModule, JwtModule.register({ global: true, secret: "synthetic-diagnostic-lifecycle-test" })] })
      .overrideProvider(IDENTITY_CLOCK_PORT).useValue({ now: () => now })
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => now, id: randomUUID, publicSyntheticAllowed: () => false,
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
      await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), role: "buyer", phoneVerifiedAt: now } });
      await db.session.create({ data: { id: suite.id(`${who}-session`), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: future, adminTotpExpiresAt: future } });
      if (capability[who]) await db.staffGrant.create({ data: { userId: suite.id(who), capability: capability[who]! } });
    }
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

  async function visit(commissioner: Commissioner, recorder: Recorder = "technician"): Promise<Order> {
    let { body: order } = await post(commissioner, "orders", { requestKey: randomUUID(), centerId, templateVersionId: templateId, audience: "buyer_private", synthetic: true }).expect(201);
    for (const who of [recorder, "reviewer"] as const) {
      ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version, userId: suite.id(who), capability: capability[who], active: true }).expect(201));
    }
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind: "physical", authorityReference: "Synthetic physical authorization" }).expect(201));
    for (const state of ["confirmed", "arrived"]) ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state }).expect(201));
    ({ body: order } = await post(recorder, `orders/${order.id}/vehicle`, { expectedVersion: order.version, ...observation(commissioner) }).expect(201));
    return order;
  }
  async function stage(o: Order, id: string, recorder: Recorder = "technician", image: Image = red, classification: Rights = rights) {
    ownedProvenance.add(id);
    const response = await post(recorder, provenancePath(o), { id, expectedOrderVersion: o.version, contentType: "image/png", sizeBytes: image.inputSize, rights: classification }).expect(201);
    privateNoStore(response); expect(response.body).toEqual({ id, state: "staged" });
  }
  const upload = (o: Order, id: string, recorder: Recorder = "technician", image: Image = red) => request.put(`/api/v1/diagnostics/${provenancePath(o, id)}?expectedOrderVersion=${o.version}`)
    .set(headers(recorder)).set("content-type", "application/octet-stream").set("x-evidence-type", "image/png").send(Buffer.from(image.input, "base64"));
  async function verified(o: Order, id: string, recorder: Recorder = "technician", image: Image = red) {
    await stage(o, id, recorder, image);
    const response = await upload(o, id, recorder, image).expect(200);
    privateNoStore(response); expect(response.body).toEqual({ ...metadata(id, image), state: "verified" });
  }
  async function append(o: Order, raw: Raw, p: string, value: string, recorder: Recorder = "technician", image: Image = red,
    correction: { supersedesId: string; explanation: string } | null = null): Promise<Evidence> {
    const input = { id: randomUUID(), expectedOrderVersion: o.version, identityRecordId: raw.id, identifiers: [identifier(p, value)], rights, correction };
    const response = await post(recorder, evidencePath(o), input).expect(201);
    privateNoStore(response);
    expect(response.body).toEqual({ id: input.id, orderId: o.id, orderVersion: o.version + 1, identityRecordId: raw.id,
      observationHash: raw.observationHash, observation: raw.observation, identifiers: input.identifiers, provenance: [metadata(p, image)], rights, correction,
      recordHash: expect.stringMatching(/^[a-f0-9]{64}$/), recordedBy: suite.id(recorder), recordedAt: now.toISOString() });
    o.version += 1;
    return response.body;
  }
  async function release(o: Order) {
    const { body: draft } = await post("technician", `orders/${o.id}/reports`, { reportId: randomUUID(), expectedOrderVersion: o.version }).expect(201);
    const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    await post("technician", `reports/${draft.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${draft.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("reviewer", `reports/${draft.id}/transition`, { expectedVersion: 2, action: "finalize" }).expect(201);
    return (await get("reviewer", `reports/${draft.id}`).expect(200)).body as { id: string; version: number };
  }
  async function bytes(who: Person, path: string, image: Image = red) {
    const response = await get(who, path).expect(200);
    privateNoStore(response); expect(response.headers["content-type"]).toContain("image/webp");
    expect(Buffer.from(response.body).toString("base64")).toBe(image.output);
  }
  async function denied(who: Person, path: string) {
    const response = await get(who, path).expect(403);
    privateNoStore(response); expect(response.body).toEqual(deniedBody);
    for (const secret of [red.output, blue.output, red.sha256, blue.sha256]) expect(response.text).not.toContain(secret);
  }
  async function error(response: PromiseLike<supertest.Response>, status: number, code: string) {
    const result = await response;
    expect(result.status).toBe(status); privateNoStore(result);
    expect(result.body).toEqual({ statusCode: status, code, message: "Inspection request could not be completed", timestamp: expect.any(String), requestId: "unknown" });
  }
  /** Holds one real storage write after its bytes land, before the upload's late verify. */
  async function heldWrite(pending: () => Promise<supertest.Response>, duringHold: () => Promise<void>) {
    let entered!: () => void; let resume!: () => void; let reached = false;
    const enteredWrite = new Promise<void>(resolve => { entered = () => { reached = true; resolve(); }; });
    const releaseWrite = new Promise<void>(resolve => { resume = resolve; });
    const put = storage.put.bind(storage);
    const held = vi.spyOn(storage, "put").mockImplementationOnce(async (...args) => { await put(...args); entered(); await releaseWrite; });
    const response = pending();
    try {
      let timer: ReturnType<typeof setTimeout> | undefined; let early: supertest.Response | undefined;
      // No derived promise may reject after the barrier: record an early completion instead.
      const settled = response.then(result => { early = result; }, () => undefined);
      try {
        await Promise.race([enteredWrite, settled, new Promise<void>(resolve => { timer = setTimeout(resolve, 10_000); })]);
      } finally { clearTimeout(timer); }
      if (!reached) throw new Error(early ? `Upload completed before storage barrier: HTTP ${early.status}` : "Storage write barrier not reached");
      await duringHold();
    } finally { resume(); held.mockRestore(); }
    return response;
  }
  async function deleteAndPurge(who: Commissioner | "technician", orderId: string) {
    await request.delete("/api/v1/me").set(headers(who)).expect(204, "");
    const scheduled = await db.user.findUniqueOrThrow({ where: { id: suite.id(who) } });
    expect(scheduled.deletionScheduledAt).toEqual(purgeTime);
    expect(await db.session.count({ where: { userId: suite.id(who) } })).toBe(0);
    expect((await get(who, `orders/${orderId}`).expect(403)).body).toEqual(deniedBody);
    // The identity-erasure harness: one bounded Node/tsx subprocess runs the production job on
    // this worker's database. It refuses BEFORE mutation if its global due-account selection or
    // OTP retention could touch a foreign namespace.
    const workerRoot = resolve(__dirname, "../../../../../worker");
    const script = `
      require('reflect-metadata'); require('tsx/cjs');
      const { PrismaService } = require('@auto-tm/db');
      const { PurgeExpiredAccounts } = require('./src/jobs/PurgeExpiredAccounts.ts');
      async function main() {
        const db = new PrismaService();
        try {
          const now = new Date(${JSON.stringify(purgeTime.toISOString())});
          const target = ${JSON.stringify(suite.id(who))};
          const due = await db.user.findMany({ where: { deletionScheduledAt: { lte: now } }, select: { id: true } });
          if (due.length !== 1 || due[0].id !== target) throw new Error('Identity erasure isolation refused: foreign or missing due account');
          const stale = await db.otpRequest.findMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 86400000) } },
            select: { userId: true, destination: true } });
          if (stale.some(row => !(row.userId === target || row.userId === null && row.destination === ${JSON.stringify(suite.phone(who))}))) throw new Error('Identity erasure isolation refused: foreign expired OTP rows');
          const result = await new PurgeExpiredAccounts(db).execute({ now });
          if (result.purgedCount !== 1) throw new Error('Expected exactly one product-scheduled account purge');
        } finally { await db.$disconnect(); }
      }
      void main().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    await promisify(execFile)(process.execPath, ["-e", script], {
      cwd: workerRoot, env: { ...process.env, TSX_TSCONFIG_PATH: resolve(workerRoot, "tsconfig.json") }, timeout: 30000, killSignal: "SIGKILL",
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: suite.id(who) }, select: { phone: true, deletionScheduledAt: true } }))
      .toEqual({ phone: null, deletionScheduledAt: null });
  }

  it("refuses a concurrent upload with BUSY while a live write lease is held, then verifies exactly once", async () => {
    const a = await visit("other"); const p = suite.id("busy-p"); await stage(a, p);
    const response = await heldWrite(() => upload(a, p).then(result => result), async () => {
      // The exact descriptor and bounded write lease were committed before any byte was written.
      expect(await provenanceRow(p)).toMatchObject({ state: "staged", objectKey: objectKey(p), sha256: red.sha256, sizeBytes: red.sizeBytes, mime: "image/webp",
        writeLeaseUntil: new Date(initialTime.getTime() + 120_000), verifiedAt: null, cleanupRequestedAt: null, erasedAt: null });
      await error(upload(a, p), 400, "DIAGNOSTIC_EVIDENCE_BUSY");
      // Different sanitized bytes still conflict with the committed descriptor.
      await error(request.put(`/api/v1/diagnostics/${provenancePath(a, p)}?expectedOrderVersion=${a.version}`).set(headers("technician"))
        .set("content-type", "application/octet-stream").set("x-evidence-type", "image/png")
        .send(Buffer.concat([Buffer.from(blue.input, "base64"), Buffer.from([0])])), 409, "DIAGNOSTIC_EVIDENCE_CONFLICT");
      await denied("technician", provenancePath(a, p));
    });
    expect(response.status).toBe(200); privateNoStore(response);
    expect(response.body).toEqual({ ...metadata(p), state: "verified" });
    expect(await provenanceRow(p)).toMatchObject({ state: "verified", objectKey: objectKey(p), writeLeaseUntil: null, verifiedAt: initialTime, cleanupRequestedAt: null });
    expect((await upload(a, p).expect(200)).body).toEqual(response.body);
    await bytes("technician", provenancePath(a, p));
    expect((await get("technician", `orders/${a.id}`).expect(200)).body.version).toBe(a.version);
  });

  it("fences the late verify of a held write when declared rights expire and queues its exact object for cleanup", async () => {
    const a = await visit("other"); const [raw] = await history(a); const p = suite.id("expiring-p");
    // The write lease (12:02) outlives these rights (12:01), so only the rights boundary fences.
    const shortRights = { ...rights, schedule: { ...rights.schedule, until: "2026-10-21T12:01:00.000Z" } };
    await stage(a, p, "technician", red, shortRights);
    let intent: Awaited<ReturnType<typeof provenanceRow>> | undefined;
    try {
      const response = await heldWrite(() => upload(a, p).then(result => result), async () => {
        intent = await provenanceRow(p);
        now = new Date("2026-10-21T12:01:00.000Z");
      });
      await error(Promise.resolve(response), 403, "DIAGNOSTIC_NO_ACCESS");
      for (const secret of [red.output, red.sha256, objectKey(p)]) expect(response.text).not.toContain(secret);
      const fenced = await provenanceRow(p);
      // Only the failed writer's own epoch moves the intent to cleanup; rights stay for the worker's expiry erasure.
      expect(fenced).toEqual({ ...intent!, state: "cleanup_pending", cleanupRequestedAt: now });
      expect(fenced).toMatchObject({ objectKey: objectKey(p), writeLeaseUntil: new Date(initialTime.getTime() + 120_000), verifiedAt: null });
      // The written bytes remain until the lease settles and the worker deletes this exact key.
      expect((await head(objectKey(p))).ContentLength).toBe(red.sizeBytes);
      await denied("technician", provenancePath(a, p));
    } finally { now = initialTime; }
    // The cleanup fence is durable and independent of the clock that triggered it.
    await denied("technician", provenancePath(a, p));
    await error(upload(a, p), 403, "DIAGNOSTIC_NO_ACCESS");
    await error(post("technician", evidencePath(a), { id: randomUUID(), expectedOrderVersion: a.version, identityRecordId: raw!.id,
      identifiers: [identifier(p, "SYN-CHASSIS-041")], rights, correction: null }), 403, "DIAGNOSTIC_NO_ACCESS");
    expect((await get("technician", evidencePath(a)).expect(200)).body).toEqual([]);
    expect((await get("technician", `orders/${a.id}`).expect(200)).body.version).toBe(a.version);
  });

  it("fences the late verify of a held write when the commissioner's account is erased and keeps the lease for exact cleanup", async () => {
    const a = await visit("late"); const p = suite.id("erased-held-p"); await stage(a, p);
    const before = await db.inspectionOrder.findUniqueOrThrow({ where: { id: a.id } });
    let intent: Awaited<ReturnType<typeof provenanceRow>> | undefined; let purged: typeof intent;
    const response = await heldWrite(() => upload(a, p).then(result => result), async () => {
      intent = await provenanceRow(p);
      await deleteAndPurge("late", a.id);
      purged = await provenanceRow(p);
    });
    expect(purged).toEqual({ ...intent!, state: "cleanup_pending", epoch: expect.any(String), rights: null, createdById: null,
      cleanupRequestedAt: purgeTime, cleanupCompletedAt: null, erasedAt: purgeTime });
    expect(purged!.epoch).not.toBe(intent!.epoch);
    expect(purged).toMatchObject({ objectKey: objectKey(p), writeLeaseUntil: intent!.writeLeaseUntil, verifiedAt: null });
    await error(Promise.resolve(response), 403, "DIAGNOSTIC_NO_ACCESS");
    for (const secret of [red.output, red.sha256, objectKey(p)]) expect(response.text).not.toContain(secret);
    // The resumed writer's fenced epoch changes nothing the purge wrote.
    expect(await provenanceRow(p)).toEqual(purged);
    expect((await db.diagnosticIdentityProvenance.updateMany({ where: { id: p, epoch: intent!.epoch, cleanupRequestedAt: null }, data: { state: "verified" } })).count).toBe(0);
    expect((await head(objectKey(p))).ContentLength).toBe(red.sizeBytes);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ commissionerId: null, erasedAt: purgeTime,
      identityEvidenceGeneration: before.identityEvidenceGeneration + 1 });
    for (const who of ["technician", "reviewer"] as const) await denied(who, provenancePath(a, p));
  });

  // Last: it deletes the shared technician account the earlier cases depend on.
  it("erases a commissioner's evidence, corrections, report pins and provenance; detaches deleted staff only; foreign visits survive", async () => {
    const a = await visit("buyer"); const [i0] = await history(a);
    const p0 = suite.id("erased-p0"); await verified(a, p0);
    const e0 = await append(a, i0!, p0, "SYN-CHASSIS-041");
    const erasedReport = await release(a);
    a.version = (await post("technician", `orders/${a.id}/vehicle`, { expectedVersion: a.version, ...observation("buyer", 123001) }).expect(201)).body.version;
    const i1 = (await history(a))[1]!;
    const p1 = suite.id("erased-p1"); await verified(a, p1, "technician", blue);
    const e1 = await append(a, i1, p1, "SYN-CHASSIS-014", "technician", blue, { supersedesId: e0.id, explanation });
    const r = await visit("other"); const [ir] = await history(r);
    const pr = suite.id("retained-pr"); await verified(r, pr);
    const er = await append(r, ir!, pr, "SYN-CHASSIS-777");
    const retainedReport = await release(r);
    const f = await visit("foreign", "controlTechnician"); const [iF] = await history(f);
    const pf = suite.id("foreign-pf"); await verified(f, pf, "controlTechnician", blue);
    const ef = await append(f, iF!, pf, "SYN-CHASSIS-999", "controlTechnician", blue);
    const candidate = { orderId: f.id, orderVersion: f.version, identityRecordId: iF!.id, identityRecordHash: iF!.observationHash,
      identity: { observation: observation("foreign"), evidence: ef, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } };
    const erasedPair = await get("reviewer", comparisonPath(f, erasedReport.id)).expect(200);
    expect(erasedPair.body).toEqual({ predecessor: { reportId: erasedReport.id, reportVersion: 3, snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      identityRecordId: i0!.id, identityRecordHash: i0!.observationHash,
      identity: { observation: observation("buyer"), evidence: e0, corrections: [e1], evidenceGeneration: 2, correctionHeadHash: e1.recordHash } }, candidate });
    const survivingPair = (await get("reviewer", comparisonPath(f, retainedReport.id)).expect(200)).body;
    expect(survivingPair).toEqual({ predecessor: { reportId: retainedReport.id, reportVersion: 3, snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      identityRecordId: ir!.id, identityRecordHash: ir!.observationHash,
      identity: { observation: observation("other"), evidence: er, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } }, candidate });
    await bytes("reviewer", comparativeBytes(f, erasedReport.id, p0));
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: erasedReport.id }, select: { identityEvidenceId: true, identityEvidenceHash: true } }))
      .toEqual({ identityEvidenceId: e0.id, identityEvidenceHash: e0.recordHash });
    const erasedEvidence = await evidenceRows(a.id); const erasedProvenance = await provenanceRows(a.id);
    expect(erasedEvidence.map(row => row.id)).toEqual([e0.id, e1.id]);
    const retained = { evidence: await evidenceRows(r.id), provenance: await provenanceRows(r.id), order: await db.inspectionOrder.findUniqueOrThrow({ where: { id: r.id } }) };
    const foreign = { evidence: await evidenceRows(f.id), provenance: await provenanceRows(f.id), order: await db.inspectionOrder.findUniqueOrThrow({ where: { id: f.id } }) };
    async function foreignUnchanged() {
      expect(await evidenceRows(f.id)).toEqual(foreign.evidence); expect(await provenanceRows(f.id)).toEqual(foreign.provenance);
      expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: f.id } })).toEqual(foreign.order);
      expect((await get("controlTechnician", evidencePath(f)).expect(200)).body).toEqual([ef]);
      await bytes("controlTechnician", provenancePath(f, pf), blue);
      expect((await head(objectKey(pf, blue))).ContentLength).toBe(blue.sizeBytes);
    }

    await deleteAndPurge("buyer", a.id);
    // No authorized HTTP interface exposes erased pins or content; inspect only their clearing here.
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: erasedReport.id },
      select: { identityRecordId: true, identityRecordHash: true, identityEvidenceId: true, identityEvidenceHash: true, erasedAt: true } }))
      .toEqual({ identityRecordId: null, identityRecordHash: null, identityEvidenceId: null, identityEvidenceHash: null, erasedAt: purgeTime });
    expect(await evidenceRows(a.id)).toEqual(erasedEvidence.map(row => ({ ...row, observationHash: null, identifiers: null, provenance: null, rights: null,
      explanation: null, recordHash: null, recordedById: null, erasedAt: purgeTime })));
    const fenced = await provenanceRows(a.id);
    expect(fenced).toEqual(erasedProvenance.map(row => ({ ...row, state: "cleanup_pending", epoch: expect.any(String), rights: null, createdById: null,
      cleanupRequestedAt: purgeTime, cleanupCompletedAt: null, erasedAt: purgeTime })));
    // Exact keys stay queued for worker deletion; a writer holding the old epoch cannot restore access.
    expect(fenced.map(row => row.objectKey)).toEqual(erasedProvenance.map(row => row.objectKey));
    expect(new Set(fenced.map(row => row.objectKey))).toEqual(new Set([objectKey(p0), objectKey(p1, blue)]));
    for (const [index, row] of fenced.entries()) {
      expect(row.epoch).not.toBe(erasedProvenance[index]!.epoch);
      expect((await db.diagnosticIdentityProvenance.updateMany({ where: { id: row.id, epoch: erasedProvenance[index]!.epoch, cleanupRequestedAt: null }, data: { state: "verified" } })).count).toBe(0);
    }
    expect((await head(objectKey(p0))).ContentLength).toBe(red.sizeBytes);
    expect((await head(objectKey(p1, blue))).ContentLength).toBe(blue.sizeBytes);
    expect((await db.inspectionOrder.findUniqueOrThrow({ where: { id: a.id } })).identityEvidenceGeneration).toBe(3);
    for (const path of [comparisonPath(f, erasedReport.id), comparativeBytes(f, erasedReport.id, p0), comparativeBytes(f, erasedReport.id, p1),
      evidencePath(a), provenancePath(a, p0), provenancePath(a, p1)]) await denied("reviewer", path);
    expect(await evidenceRows(r.id)).toEqual(retained.evidence); expect(await provenanceRows(r.id)).toEqual(retained.provenance);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: r.id } })).toEqual(retained.order);
    expect((await get("reviewer", comparisonPath(f, retainedReport.id)).expect(200)).body).toEqual(survivingPair);
    await foreignUnchanged();

    await deleteAndPurge("technician", r.id);
    // Attribution detaches in place; content, hashes, rights, objects and generation are retained.
    expect(await evidenceRows(r.id)).toEqual(retained.evidence.map(row => ({ ...row, recordedById: null })));
    expect(await provenanceRows(r.id)).toEqual(retained.provenance.map(row => ({ ...row, createdById: null })));
    expect((await db.inspectionOrder.findUniqueOrThrow({ where: { id: r.id } })).identityEvidenceGeneration).toBe(retained.order.identityEvidenceGeneration);
    const detached = { ...er, recordedBy: null };
    expect((await get("reviewer", evidencePath(r)).expect(200)).body).toEqual([detached]);
    const afterDetach = await get("reviewer", comparisonPath(f, retainedReport.id)).expect(200); privateNoStore(afterDetach);
    expect(afterDetach.body).toEqual({ ...survivingPair, predecessor: { ...survivingPair.predecessor, reportVersion: 4,
      identity: { ...survivingPair.predecessor.identity, evidence: detached } } });
    expect(afterDetach.body.predecessor.identity.evidence.recordHash).toBe(er.recordHash);
    expect(JSON.stringify(afterDetach.body)).not.toContain(suite.id("technician"));
    await bytes("reviewer", comparativeBytes(f, retainedReport.id, pr));
    await bytes("reviewer", provenancePath(r, pr));
    expect((await head(objectKey(pr))).ContentLength).toBe(red.sizeBytes);
    for (const path of [evidencePath(r), provenancePath(r, pr), comparisonPath(f, retainedReport.id)]) {
      expect((await get("technician", path).expect(403)).body).toEqual(deniedBody);
    }
    await foreignUnchanged();
  });
});
