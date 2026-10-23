import { createHash, randomBytes, randomUUID } from "node:crypto";

import { CreateBucketCommand, DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PurgeExpiredAccounts } from "../PurgeExpiredAccounts";

import { S3DiagnosticArtifactObjects } from "./S3DiagnosticArtifactObjects";
import { DiagnosticArtifactWorker, type DiagnosticArtifactObjects } from "./DiagnosticArtifactWorker";

const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
const hosted = process.env["GITHUB_ACTIONS"] === "true" && !!process.env["DATABASE_URL"] && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint);
const bucket = "diagnostic-test-private";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const localized = { tk: "Syntetik synag", ru: "Синтетический тест", en: "Synthetic test" };
const DAY = 86400_000;
const rightsUntil = (until: Date) => ({ category: "vehicle_observation", purpose: "Synthetic diagnostic identity comparison", basis: "Owned synthetic fixture only",
  provenance: "Generated chassis fixture, not a customer document", identifiability: "pseudonymous", use: ["service"],
  schedule: { kind: "until", until: until.toISOString(), reason: "Synthetic fixture authorization" }, supplierRestrictions: "No export or redistribution", hold: null });

/** Prepared lifecycle coverage for structured identity evidence retirement on disposable PostgreSQL
 * and private storage. Fixtures cross the persistence boundary directly under the migration's own
 * guards; capture/upload behavior has its HTTP contract. No hold, proof or real collection. */
describe.skipIf(!hosted)("structured identity evidence retirement and exact provenance cleanup", () => {
  const db = new PrismaService();
  const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
  const centers: string[] = [], users: string[] = [], keys: string[] = [];
  // A distant synthetic epoch: global maintenance below cannot reach another suite's current rows.
  let clock = new Date("2001-01-01T00:00:00.000Z");
  const far = new Date("2001-12-31T00:00:00.000Z");
  const runtime = { now: () => clock, id: randomUUID, enabled: () => true };
  const storage: DiagnosticArtifactObjects = new S3DiagnosticArtifactObjects(s3, bucket);
  const worker = (objects: DiagnosticArtifactObjects = storage) => new DiagnosticArtifactWorker(db, objects, { regular: Buffer.alloc(0), bold: Buffer.alloc(0) }, runtime);
  const head = (key: string) => s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const absent = (key: string) => expect(head(key)).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  const provenanceRow = (id: string) => db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } });
  const evidenceRow = (id: string) => db.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id } });
  const orderRow = (id: string) => db.inspectionOrder.findUniqueOrThrow({ where: { id } });
  const keyOf = (row: { objectKey: string | null }) => { if (!row.objectKey) throw new Error("Missing bound provenance key"); return row.objectKey; };
  const leaseOf = (row: { writeLeaseUntil: Date | null }) => { if (!row.writeLeaseUntil) throw new Error("Missing provenance write lease"); return row.writeLeaseUntil; };
  beforeAll(async () => {
    await db.$connect();
    try { await s3.send(new CreateBucketCommand({ Bucket: bucket })); }
    catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 409) throw error; }
  });
  afterAll(async () => {
    for (const key of keys) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    // Teardown only. Identity records, evidence and provenance cascade from these suite-owned orders.
    await db.inspectionOrder.deleteMany({ where: { centerId: { in: centers } } });
    await db.diagnosticTemplateVersion.deleteMany({ where: { centerId: { in: centers } } });
    await db.diagnosticCenter.deleteMany({ where: { id: { in: centers } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect(); s3.destroy();
  });
  async function user() {
    const id = randomUUID(); users.push(id);
    await db.user.create({ data: { id } });
    return id;
  }
  /** An arrived synthetic visit with one current raw observation at version 1. */
  async function visit(recorderId: string, commissionerId?: string) {
    const commissioner = commissionerId ?? await user(), centerId = randomUUID(), templateId = randomUUID(), orderId = randomUUID();
    centers.push(centerId);
    await db.diagnosticCenter.create({ data: { id: centerId, code: centerId, names: localized } });
    const template = { title: localized, limitations: localized, syntheticNotice: localized, checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
    await db.diagnosticTemplateVersion.create({ data: { id: templateId, centerId, version: 1, definition: template } });
    const observation = { observedAt: clock.toISOString(), mileageKm: 123456, method: "manual", vin: null, manualReference: `Synthetic retention fixture ${orderId}` };
    await db.inspectionOrder.create({ data: { id: orderId, centerId, templateVersionId: templateId, commissionerId: commissioner, requestKey: randomUUID(), audience: "buyer_private",
      synthetic: true, status: "arrived", version: 1, observedVehicle: json(observation) } });
    const raw = await db.diagnosticIdentityRecord.create({ data: { id: randomUUID(), orderId, orderVersion: 1, observation: json(observation), observationHash: sha(canonical(observation)),
      recordedById: recorderId, recordedAt: clock } });
    return { orderId, commissioner, raw };
  }
  type Visit = Awaited<ReturnType<typeof visit>>;
  /** A classified intent; optionally bound to exact bytes already written, verified or under a write lease. */
  async function provenance(visit: Visit, createdById: string, options: { until: Date; bytes?: boolean; verified?: boolean; writeLeaseUntil?: Date }) {
    const id = randomUUID();
    await db.diagnosticIdentityProvenance.create({ data: { id, orderId: visit.orderId, contentType: "image/png", declaredSizeBytes: 95, rights: json(rightsUntil(options.until)),
      rightsUntil: options.until, createdById, createdAt: clock } });
    if (!options.bytes) return provenanceRow(id);
    const bytes = randomBytes(24), hash = sha(bytes), key = `diagnostic-evidence/${id}/${hash}`;
    keys.push(key);
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: "image/webp" }));
    return db.diagnosticIdentityProvenance.update({ where: { id }, data: { objectKey: key, sha256: hash, sizeBytes: bytes.length, mime: "image/webp",
      ...(options.verified ? { state: "verified", verifiedAt: clock } : { writeLeaseUntil: options.writeLeaseUntil ?? null }) } });
  }
  async function evidence(visit: Visit, items: { id: string; sha256: string | null; mime: string | null; sizeBytes: number | null }[], until: Date, recordedById: string) {
    const order = await db.inspectionOrder.update({ where: { id: visit.orderId }, data: { version: { increment: 1 }, identityEvidenceGeneration: { increment: 1 } } });
    const id = randomUUID();
    return db.diagnosticIdentityEvidence.create({ data: { id, orderId: visit.orderId, orderVersion: order.version, identityRecordId: visit.raw.id,
      observationHash: visit.raw.observationHash, identifiers: json([{ kind: "chassis_stamp", location: "Right frame rail", value: "SYN-CHASSIS-041", provenanceIds: items.map(item => item.id) }]),
      provenance: json(items.map(item => ({ id: item.id, sha256: item.sha256, mime: item.mime, sizeBytes: item.sizeBytes }))), rights: json(rightsUntil(until)), rightsUntil: until,
      recordHash: sha(`synthetic-record-${id}`), recordedById, recordedAt: clock } });
  }

  it("erases expired-rights evidence in place, bumps its visit generation once and deletes the exact provenance object; unexpired material survives", async () => {
    const recorder = await user(); const expiry = new Date(clock.getTime() + 3600_000);
    const a = await visit(recorder), control = await visit(recorder);
    const pa = await provenance(a, recorder, { until: expiry, bytes: true, verified: true });
    const ea = await evidence(a, [pa], expiry, recorder);
    const pc = await provenance(control, recorder, { until: far, bytes: true, verified: true });
    const ec = await evidence(control, [pc], far, recorder);
    const before = { order: await orderRow(a.orderId), control: await orderRow(control.orderId) };
    clock = new Date(expiry.getTime() - 1);
    await worker().cleanup();
    expect(await evidenceRow(ea.id)).toEqual(ea); expect(await provenanceRow(pa.id)).toEqual(pa);
    expect((await head(keyOf(pa))).ContentLength).toBe(pa.sizeBytes);
    clock = expiry;
    await worker().cleanup();
    expect(await evidenceRow(ea.id)).toMatchObject({ id: ea.id, orderId: ea.orderId, orderVersion: ea.orderVersion, identityRecordId: ea.identityRecordId, supersedesId: null,
      rightsUntil: expiry, recordedAt: ea.recordedAt, observationHash: null, identifiers: null, provenance: null, rights: null, explanation: null, recordHash: null, erasedAt: expiry });
    expect((await orderRow(a.orderId)).identityEvidenceGeneration).toBe(before.order.identityEvidenceGeneration + 1);
    expect(await provenanceRow(pa.id)).toEqual({ ...pa, state: "removed", epoch: expect.any(String), rights: null, erasedAt: expiry, cleanupRequestedAt: expiry,
      cleanupCompletedAt: expiry, cleanupAttempts: 1, cleanupLeaseUntil: null, cleanupFailureCode: null });
    await absent(keyOf(pa));
    // Declared rights govern structured evidence only; the raw observation keeps its own lifecycle.
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: a.raw.id } })).toEqual(a.raw);
    expect(await evidenceRow(ec.id)).toEqual(ec); expect(await provenanceRow(pc.id)).toEqual(pc);
    expect(await orderRow(control.orderId)).toEqual(before.control);
    expect((await head(keyOf(pc))).ContentLength).toBe(pc.sizeBytes);
    await worker().cleanup();
    expect((await orderRow(a.orderId)).identityEvidenceGeneration).toBe(before.order.identityEvidenceGeneration + 1);
  });

  it("fences stale staged intents and verified unattached items only after 24 hours, retains attached and live-leased items and deletes exact keys", async () => {
    const recorder = await user(); const created = clock;
    const a = await visit(recorder);
    const intent = await provenance(a, recorder, { until: far });
    const leased = await provenance(a, recorder, { until: far, bytes: true, writeLeaseUntil: new Date(created.getTime() + DAY + 60_000) });
    const unattached = await provenance(a, recorder, { until: far, bytes: true, verified: true });
    const attached = await provenance(a, recorder, { until: far, bytes: true, verified: true });
    const ea = await evidence(a, [attached], far, recorder);
    clock = new Date(created.getTime() + DAY - 1);
    await worker().cleanup();
    for (const row of [intent, leased, unattached, attached]) expect(await provenanceRow(row.id)).toEqual(row);
    clock = new Date(created.getTime() + DAY);
    await worker().cleanup();
    expect(await provenanceRow(intent.id)).toEqual({ ...intent, state: "removed", epoch: expect.any(String), cleanupRequestedAt: clock, cleanupCompletedAt: clock, cleanupAttempts: 1 });
    expect(await provenanceRow(unattached.id)).toEqual({ ...unattached, state: "removed", epoch: expect.any(String), cleanupRequestedAt: clock, cleanupCompletedAt: clock, cleanupAttempts: 1 });
    await absent(keyOf(unattached));
    expect(await provenanceRow(attached.id)).toEqual(attached); expect(await evidenceRow(ea.id)).toEqual(ea);
    expect((await head(keyOf(attached))).ContentLength).toBe(attached.sizeBytes);
    // A live write lease keeps an abandoned-looking intent until its writer settles.
    expect(await provenanceRow(leased.id)).toEqual(leased);
    expect((await head(keyOf(leased))).ContentLength).toBe(leased.sizeBytes);
    clock = leaseOf(leased);
    await worker().cleanup();
    expect(await provenanceRow(leased.id)).toEqual({ ...leased, state: "removed", epoch: expect.any(String), cleanupRequestedAt: clock, cleanupCompletedAt: clock, cleanupAttempts: 1 });
    await absent(keyOf(leased));
    expect(await provenanceRow(attached.id)).toEqual(attached);
  });

  it("counts a storage failure, holds the retry lease, completes exact deletion on retry and keeps completed intents in rotation", async () => {
    const recorder = await user(); const a = await visit(recorder);
    const item = await provenance(a, recorder, { until: far, bytes: true, verified: true });
    let outage = true; const deletes: string[][] = [];
    const flaky: DiagnosticArtifactObjects = { put: storage.put.bind(storage), read: storage.read.bind(storage), async deleteAndVerify(keys: string[]) {
      if (keys.includes(keyOf(item))) { deletes.push(keys); if (outage) { outage = false; throw new Error("Synthetic storage outage"); } }
      await storage.deleteAndVerify(keys);
    } };
    clock = new Date(clock.getTime() + DAY);
    await expect(worker(flaky).cleanup()).rejects.toThrow("DIAGNOSTIC_CLEANUP_RETRY");
    const failed = await provenanceRow(item.id);
    expect(failed).toEqual({ ...item, state: "cleanup_pending", epoch: expect.any(String), cleanupRequestedAt: clock, cleanupCompletedAt: null,
      cleanupAttempts: 1, cleanupFailureCode: "cleanup_storage", cleanupLeaseUntil: new Date(clock.getTime() + 60_000) });
    expect((await head(keyOf(item))).ContentLength).toBe(item.sizeBytes);
    await worker(flaky).cleanup();
    expect(await provenanceRow(item.id)).toEqual(failed);
    clock = new Date(clock.getTime() + 60_000);
    await worker(flaky).cleanup();
    expect(await provenanceRow(item.id)).toEqual({ ...failed, state: "removed", epoch: expect.any(String), cleanupAttempts: 2, cleanupFailureCode: null,
      cleanupLeaseUntil: null, cleanupCompletedAt: clock });
    await absent(keyOf(item));
    // Never a prefix: every attempt names exactly this one key.
    expect(deletes).toEqual([[item.objectKey], [item.objectKey]]);
    // A paused writer that resumes after deletion is caught by the next rotation.
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: keyOf(item), Body: randomBytes(24), ContentType: "image/webp" }));
    clock = new Date(clock.getTime() + 1);
    await worker(flaky).cleanup();
    await absent(keyOf(item));
    expect(await provenanceRow(item.id)).toMatchObject({ state: "removed", cleanupAttempts: 3, cleanupFailureCode: null, cleanupCompletedAt: clock });
  });

  it("account purge erases a commissioner's evidence and provenance before intake, deletes exact objects after a held writer's lease and only detaches deleted staff elsewhere", async () => {
    const technician = await user(), staff = await user();
    const a = await visit(technician);
    const pa = await provenance(a, technician, { until: far, bytes: true, verified: true });
    const ea = await evidence(a, [pa], far, technician);
    const held = await provenance(a, technician, { until: far, bytes: true, writeLeaseUntil: new Date(clock.getTime() + 120_000) });
    const c = await visit(staff);
    const pc = await provenance(c, staff, { until: far, bytes: true, verified: true });
    const ec = await evidence(c, [pc], far, staff);
    const before = { order: await orderRow(a.orderId), control: await orderRow(c.orderId) };
    for (const id of [a.commissioner, staff]) await db.user.update({ where: { id }, data: { deletionScheduledAt: new Date(clock.getTime() - 1) } });
    // Refuse BEFORE mutation if the global due-account selection could reach a foreign account,
    // or the job's global stale code-request retention could delete a foreign row. This suite creates none.
    const due = await db.user.findMany({ where: { deletionScheduledAt: { lte: clock } }, select: { id: true }, orderBy: { id: "asc" } });
    expect(due.map(row => row.id)).toEqual([a.commissioner, staff].sort());
    expect(await db.otpRequest.count({ where: { createdAt: { lt: new Date(clock.getTime() - 30 * DAY) } } })).toBe(0);
    await expect(new PurgeExpiredAccounts(db).execute({ now: clock })).resolves.toMatchObject({ purgedCount: 2 });
    expect(await evidenceRow(ea.id)).toEqual({ ...ea, observationHash: null, identifiers: null, provenance: null, rights: null, explanation: null, recordHash: null,
      recordedById: null, erasedAt: clock });
    expect(await orderRow(a.orderId)).toMatchObject({ commissionerId: null, erasedAt: clock, identityEvidenceGeneration: before.order.identityEvidenceGeneration + 1 });
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: a.raw.id } })).toMatchObject({ observation: null, observationHash: null, erasedAt: clock });
    for (const row of [pa, held]) {
      expect(await provenanceRow(row.id)).toEqual({ ...row, state: "cleanup_pending", epoch: expect.any(String), rights: null, createdById: null,
        cleanupRequestedAt: clock, cleanupCompletedAt: null, erasedAt: clock });
      expect((await provenanceRow(row.id)).epoch).not.toBe(row.epoch);
      expect((await db.diagnosticIdentityProvenance.updateMany({ where: { id: row.id, epoch: row.epoch, cleanupRequestedAt: null }, data: { state: "verified" } })).count).toBe(0);
    }
    expect(await evidenceRow(ec.id)).toEqual({ ...ec, recordedById: null });
    expect(await provenanceRow(pc.id)).toEqual({ ...pc, createdById: null });
    expect(await orderRow(c.orderId)).toMatchObject({ commissionerId: c.commissioner, erasedAt: null, identityEvidenceGeneration: before.control.identityEvidenceGeneration });
    await worker().cleanup();
    expect(await provenanceRow(pa.id)).toMatchObject({ state: "removed", cleanupCompletedAt: clock, cleanupAttempts: 1 });
    await absent(keyOf(pa));
    // The held writer's live lease defers deletion of its exact key; bytes it wrote stay until then.
    expect(await provenanceRow(held.id)).toMatchObject({ state: "cleanup_pending", cleanupCompletedAt: null, cleanupAttempts: 0, writeLeaseUntil: held.writeLeaseUntil });
    expect((await head(keyOf(held))).ContentLength).toBe(held.sizeBytes);
    clock = leaseOf(held);
    await worker().cleanup();
    expect(await provenanceRow(held.id)).toMatchObject({ state: "removed", cleanupCompletedAt: clock, cleanupAttempts: 1 });
    await absent(keyOf(held));
    expect(await provenanceRow(pc.id)).toEqual({ ...pc, createdById: null });
    expect((await head(keyOf(pc))).ContentLength).toBe(pc.sizeBytes);
  });
});
