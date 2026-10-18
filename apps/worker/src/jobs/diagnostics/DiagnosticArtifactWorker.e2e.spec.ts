import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { CreateBucketCommand, DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { S3DiagnosticArtifactObjects } from "./S3DiagnosticArtifactObjects";
import { DiagnosticArtifactWorker, type DiagnosticArtifactObjects } from "./DiagnosticArtifactWorker";

const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
const hosted = process.env["GITHUB_ACTIONS"] === "true" && !!process.env["DATABASE_URL"] && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint);
const bucket = "diagnostic-test-private";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const localized = { tk: "Syntetik synag äçňöşüýž", ru: "Синтетический тест", en: "Synthetic test" };

describe.skipIf(!hosted)("diagnostic artifacts on disposable PostgreSQL and private storage", () => {
  const db = new PrismaService();
  const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
  const centers: string[] = [], users: string[] = [], keys: string[] = [];
  let clock = new Date("2000-01-01T00:00:00.000Z");
  const runtime = { now: () => clock, id: randomUUID, enabled: () => true };
  const fonts = async () => ({ regular: await readFile(join(__dirname, "../../../assets/fonts/NotoSans-Regular.ttf")), bold: await readFile(join(__dirname, "../../../assets/fonts/NotoSans-Bold.ttf")) });
  const storage: DiagnosticArtifactObjects = new S3DiagnosticArtifactObjects(s3, bucket);
  beforeAll(async () => {
    await db.$connect();
    try { await s3.send(new CreateBucketCommand({ Bucket: bucket })); }
    catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 409) throw error; }
  });
  afterAll(async () => {
    for (const key of keys) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    const orders = await db.inspectionOrder.findMany({ where: { centerId: { in: centers } } });
    const reports = await db.diagnosticReportRecord.findMany({ where: { orderId: { in: orders.map(row => row.id) } } });
    await db.diagnosticEvidence.deleteMany({ where: { reportId: { in: reports.map(row => row.id) } } });
    await db.diagnosticPdfArtifact.deleteMany({ where: { reportId: { in: reports.map(row => row.id) } } });
    await db.diagnosticReportRecord.deleteMany({ where: { id: { in: reports.map(row => row.id) } } });
    await db.inspectionOrder.deleteMany({ where: { id: { in: orders.map(row => row.id) } } });
    await db.diagnosticTemplateVersion.deleteMany({ where: { centerId: { in: centers } } });
    await db.diagnosticCenter.deleteMany({ where: { id: { in: centers } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect(); s3.destroy();
  });
  async function fixture() {
    const userId = randomUUID(), centerId = randomUUID(), templateId = randomUUID(), orderId = randomUUID(), reportId = randomUUID(), id = randomUUID();
    users.push(userId); centers.push(centerId);
    await db.user.create({ data: { id: userId } });
    await db.diagnosticCenter.create({ data: { id: centerId, code: centerId, names: localized } });
    const template = { title: localized, limitations: localized, syntheticNotice: localized, checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
    await db.diagnosticTemplateVersion.create({ data: { id: templateId, centerId, version: 1, definition: template } });
    await db.inspectionOrder.create({ data: { id: orderId, centerId, templateVersionId: templateId, commissionerId: userId, requestKey: randomUUID(), audience: "buyer_private", synthetic: true } });
    const report = { id: reportId, orderId, templateVersionId: templateId, audience: "buyer_private", status: "finalized", observedAt: clock.toISOString(), mileageKm: 123456, findings: [{ id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null }], authorId: userId, reviewerId: randomUUID(), successorOf: null, correctionReason: null, returnReason: null, finalizedAt: clock.toISOString(), withdrawnAt: null, withdrawalReason: null };
    const snapshot = { report, template, synthetic: true }, hash = sha(canonical(snapshot));
    await db.diagnosticReportRecord.create({ data: { id: reportId, orderId, templateVersionId: templateId, audience: "buyer_private", state: json(report), status: "finalized", snapshot: json(snapshot), snapshotHash: hash, finalizedAt: clock } });
    const key = `diagnostic-pdf/${reportId}/${id}.pdf`; keys.push(key);
    await db.diagnosticPdfArtifact.create({ data: { id, reportId, snapshotHash: hash, locale: "tk", rendererVersion: "v1", objectKey: key, createdAt: clock } });
    return { id, reportId, key };
  }
  it("claims one renderer and adopts only actual verified immutable PDF bytes", async () => {
    const row = await fixture(), worker = new DiagnosticArtifactWorker(db, storage, await fonts(), runtime);
    const outcomes = await Promise.all([worker.generate(row.id), worker.generate(row.id)]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const artifact = await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: row.id } });
    expect(artifact).toMatchObject({ state: "ready", attempts: 1 });
    if (!artifact.sha256 || !artifact.sizeBytes) throw new Error("Missing verified artifact descriptor");
    const bytes = await storage.read(row.key, artifact.sizeBytes, artifact.sha256);
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
    expect(await worker.generate(row.id)).toBe(false);
  });
  it("recovers the same bytes after a lost write reply without a second report revision", async () => {
    const row = await fixture(); let lost = true;
    const flaky = { ...storage, async put(key: string, bytes: Uint8Array, mime: "application/pdf") { await storage.put(key, bytes, mime); if (lost) { lost = false; throw new Error("Synthetic lost reply"); } } };
    const worker = new DiagnosticArtifactWorker(db, flaky, await fonts(), runtime);
    await expect(worker.generate(row.id)).rejects.toThrow("DIAGNOSTIC_ARTIFACT_RETRY");
    const failed = await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: row.id } });
    expect(failed).toMatchObject({ state: "failed", failureCode: "storage_or_render", attempts: 1 });
    expect(failed.sha256).toMatch(/^[a-f0-9]{64}$/);
    clock = new Date(clock.getTime() + 600_000);
    expect(await worker.generate(row.id)).toBe(true);
    const ready = await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: row.id } });
    expect(ready.sha256).toBe(failed.sha256); expect(ready.sizeBytes).toBe(failed.sizeBytes);
    expect(await db.diagnosticReportRecord.count({ where: { orderId: (await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: row.reportId } })).orderId } })).toBe(1);
  });
  it("fences erasure during storage and reconciles a resumed late write after cleanup", async () => {
    const row = await fixture(); let original: Uint8Array | undefined;
    const erasing = { ...storage, async put(key: string, bytes: Uint8Array, mime: "application/pdf") { original = bytes; await storage.put(key, bytes, mime); await db.diagnosticReportRecord.update({ where: { id: row.reportId }, data: { erasedAt: clock } }); } };
    const worker = new DiagnosticArtifactWorker(db, erasing, await fonts(), runtime);
    expect(await worker.generate(row.id)).toBe(false);
    const artifact = await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: row.id } });
    expect(artifact.cleanupRequestedAt).not.toBeNull(); expect(artifact.state).not.toBe("ready");
    clock = new Date(clock.getTime() + 600_000); await worker.cleanup();
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: row.key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
    if (!original) throw new Error("Missing attempted PDF bytes");
    await storage.put(row.key, original, "application/pdf");
    await worker.cleanup();
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: row.key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
    expect((await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: row.id } })).state).not.toBe("ready");
  });
});
