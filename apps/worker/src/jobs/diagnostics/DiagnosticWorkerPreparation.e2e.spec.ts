import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { CreateBucketCommand, DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { join } from "node:path";

import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from "vitest";

import { DiagnosticArtifactWorker } from "./DiagnosticArtifactWorker";
import { S3DiagnosticArtifactObjects } from "./S3DiagnosticArtifactObjects";
import { readDiagnosticPdfText } from "./testing/readDiagnosticPdfText";

type Trigger = { table: string; name: string; mode: string; function: string; type: number; definition: string };
const enabled = process.env["DIAGNOSTIC_WORKER_PREPARATION_ACCEPTANCE"] === "1";
const role = `r6c_diagnostic_worker_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
const evidenceRoot = process.env["DIAGNOSTIC_WORKER_EVIDENCE_DIR"] ?? `/tmp/897-r6c-worker150-${role}`;

/** Task-owned disposable database only. Seed prerequisites before matched activation;
 * every accepted mutation in the guarded window runs through the real worker. */
const cases = [
  { name: "due unbound", bound: false, due: true, old: false, verified: false, leased: false },
  { name: "due bound", bound: true, due: true, old: false, verified: true, leased: false },
  { name: "not due", bound: true, due: false, old: false, verified: true, leased: false },
  { name: "active write lease", bound: true, due: true, old: false, verified: false, leased: true },
  { name: "old staged", bound: false, due: false, old: true, verified: false, leased: false },
  { name: "old verified unattached", bound: true, due: false, old: true, verified: true, leased: false },
  { name: "storage retry", bound: true, due: true, old: false, verified: true, leased: false },
  { name: "evidence rights", bound: true, due: true, old: false, verified: true, leased: false },
  { name: "render tk", bound: false, due: false, old: false, verified: false, leased: false },
  { name: "render ru", bound: false, due: false, old: false, verified: false, leased: false },
  { name: "render en", bound: false, due: false, old: false, verified: false, leased: false },
  { name: "attached verified", bound: true, due: false, old: true, verified: true, leased: false },
] as const;
describe.skipIf(!enabled).each(cases)("diagnostic worker with matched guards: $name", scenario => {
  const evidenceDir = `${evidenceRoot}/${scenario.name.replaceAll(" ", "-")}`;
  const locale = scenario.name.startsWith("render ") ? scenario.name.slice(7) as "tk" | "ru" | "en" : null;
  const ownerUrl = process.env["DATABASE_URL"];
  const owner = new PrismaService();
  const s3 = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "", region: "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
  let app: PrismaService | undefined;
  let triggers: Trigger[] = [];
  let roleCreated = false;
  let objectWritten = false;
  const now = new Date("2001-01-02T00:00:00.000Z");
  let clock = now;
  const rightsUntil = scenario.due ? now : new Date(now.getTime() + 86400_000);
  const bytes = Buffer.from("Task-owned diagnostic worker storage fixture");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const bucket = "diagnostic-test-private";
  let before: Awaited<ReturnType<PrismaService["diagnosticIdentityProvenance"]["findUniqueOrThrow"]>>;
  const id = randomUUID(), centerId = randomUUID(), templateId = randomUUID(), orderId = randomUUID(), userId = randomUUID();
  const objectKey = `diagnostic-evidence/${id}/${digest}`;
  const reportId = randomUUID(), artifactId = randomUUID();
  const localized = { tk: "Syntetik synag äçňöşüýž", ru: "Синтетический тест", en: "Synthetic test" };
  const template = { title: localized, limitations: localized, syntheticNotice: localized,
    checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
  const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object"
    ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
  let released: Awaited<ReturnType<typeof seedRelease>> | undefined;
  async function seedRelease() {
    const findingId = randomUUID();
    const report = { id: reportId, orderId, templateVersionId: templateId, audience: "buyer_private", status: "finalized", observedAt: now.toISOString(), mileageKm: 123456,
      findings: [{ id: findingId, checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null }],
      authorId: userId, reviewerId: randomUUID(), successorOf: null, correctionReason: null, returnReason: null, finalizedAt: now.toISOString(), withdrawnAt: null, withdrawalReason: null };
    const snapshot = { report, template, synthetic: true }, hash = createHash("sha256").update(canonical(snapshot)).digest("hex");
    const row = await owner.diagnosticReportRecord.create({ data: { id: reportId, orderId, templateVersionId: templateId, audience: "buyer_private", state: report,
      status: "finalized", snapshot, snapshotHash: hash, finalizedAt: now } });
    await owner.diagnosticPdfArtifact.create({ data: { id: artifactId, reportId, snapshotHash: hash, locale: locale ?? "en", rendererVersion: "v1",
      objectKey: `diagnostic-pdf/${reportId}/${artifactId}.pdf`, createdAt: now } });
    return { row, findingId };
  }
  let material: Awaited<ReturnType<typeof seedMaterial>> | undefined;
  async function seedMaterial() {
    const observation = { observedAt: now.toISOString(), mileageKm: 123456, method: "manual", vin: null, manualReference: `Synthetic retention fixture ${orderId}` };
    await owner.inspectionOrder.update({ where: { id: orderId }, data: { status: "arrived", version: 1, observedVehicle: observation } });
    const raw = await owner.diagnosticIdentityRecord.create({ data: { id: randomUUID(), orderId, orderVersion: 1, observation,
      observationHash: createHash("sha256").update(JSON.stringify(observation)).digest("hex"), recordedById: userId, recordedAt: now } });
    const order = await owner.inspectionOrder.update({ where: { id: orderId }, data: { version: 2, identityEvidenceGeneration: 1 } });
    const evidence = await owner.diagnosticIdentityEvidence.create({ data: { id: randomUUID(), orderId, orderVersion: 2, identityRecordId: raw.id,
      observationHash: raw.observationHash, identifiers: [{ kind: "chassis_stamp", location: "Right frame rail", value: "SYN-CHASSIS-041", provenanceIds: [id] }],
      provenance: [{ id, sha256: digest, mime: "image/webp", sizeBytes: bytes.length }], rights: { fixture: "Task-owned retention evidence" },
      rightsUntil, recordHash: digest, recordedById: userId, recordedAt: now } });
    return { raw, order, evidence };
  }
  const snapshot = () => owner.$queryRaw<Trigger[]>`SELECT c.relname AS "table",t.tgname AS name,t.tgenabled::text AS mode,
    t.tgfoid::regprocedure::text AS function,t.tgtype::int AS type,pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`;
  const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
  beforeAll(async () => {
    if (!ownerUrl || !/^postgres(?:ql)?:\/\/[^/]+@127\.0\.0\.1:\d+\//.test(ownerUrl)) throw new Error("Disposable loopback database required");
    await mkdir(evidenceDir, { recursive: true });
    await owner.$connect();
    await owner.user.create({ data: { id: userId } });
    await owner.diagnosticCenter.create({ data: { id: centerId, code: centerId, names: { tk: "Synthetic", ru: "Synthetic", en: "Synthetic" } } });
    await owner.diagnosticTemplateVersion.create({ data: { id: templateId, centerId, version: 1, definition: template } });
    await owner.inspectionOrder.create({ data: { id: orderId, centerId, templateVersionId: templateId, requestKey: randomUUID(), audience: locale ? "buyer_private" : "listing_public", commissionerId: locale ? userId : null } });
    await owner.diagnosticIdentityProvenance.create({ data: { id, orderId, contentType: "image/png", declaredSizeBytes: 95,
      rights: { category: "vehicle_observation", purpose: "Synthetic worker preparation fixture", basis: "Task-owned disposable fixture",
        provenance: "Generated fixture only", identifiability: "pseudonymous", use: ["service"], supplierRestrictions: "No redistribution", hold: null,
        schedule: { kind: "until", until: rightsUntil.toISOString(), reason: "Synthetic fixture authorization" } },
      rightsUntil, createdAt: new Date(now.getTime() - (scenario.old ? 86400_000 : 1000)), createdById: userId } });
    if (scenario.bound || locale) {
      try { await s3.send(new CreateBucketCommand({ Bucket: bucket })); }
      catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 409) throw error; }
    }
    if (scenario.bound) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: bytes, ContentType: "image/webp" }));
      objectWritten = true;
      await owner.diagnosticIdentityProvenance.update({ where: { id }, data: { objectKey, sha256: digest, sizeBytes: bytes.length, mime: "image/webp",
        ...(scenario.verified ? { state: "verified", verifiedAt: new Date(now.getTime() - (scenario.old ? 86400_000 : 1000)) } : {}),
        ...(scenario.leased ? { writeLeaseUntil: new Date(now.getTime() + 120_000) } : {}) } });
    }
    before = await owner.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } });
    if (locale) released = await seedRelease();
    if (scenario.name === "evidence rights" || scenario.name === "attached verified") material = await seedMaterial();
    await owner.$executeRawUnsafe(`CREATE ROLE ${role} LOGIN PASSWORD 'task_owned_fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    roleCreated = true;
    await owner.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await owner.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
    await owner.$executeRawUnsafe(`GRANT INSERT,DELETE ON diagnostic_source_commands,campaign_preparations TO ${role}`);
    await owner.$executeRawUnsafe(`GRANT UPDATE,DELETE ON diagnostic_identity_provenance,diagnostic_identity_evidence,diagnostic_evidence,diagnostic_pdf_artifacts,
      diagnostic_ownership_components,diagnostic_ownership_grants,diagnostic_source_anchors,diagnostic_continuity_proofs,diagnostic_continuity_requests TO ${role}`);
    // SELECT FOR UPDATE requires UPDATE privilege even when its selected set is empty.
    await owner.$executeRawUnsafe(`GRANT UPDATE ON users,dealerships,listings,inspection_orders,diagnostic_reports,diagnostic_order_assignments,
      diagnostic_centers,diagnostic_template_versions,diagnostic_identity_records TO ${role}`);
    await owner.$executeRawUnsafe(`GRANT INSERT ON diagnostic_pdf_artifacts TO ${role}`);
    await owner.$executeRawUnsafe(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    triggers = await snapshot();
    await writeFile(`${evidenceDir}/trigger-snapshot.json`, JSON.stringify(triggers, null, 2), { flag: "wx" });
    await owner.$transaction(async tx => {
      for (const trigger of triggers.filter(t => t.name.startsWith("diagnostic_source_") || t.name.startsWith("zz_diagnostic_source_") || t.name.startsWith("zzzz_campaign_preparation"))) {
        await tx.$executeRawUnsafe(`ALTER TABLE public.${quote(trigger.table)} ENABLE TRIGGER ${quote(trigger.name)}`);
      }
      expect(await tx.$queryRaw`SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign`).toEqual([{ source: true, campaign: true }]);
    });
    const url = new URL(ownerUrl); url.username = role; url.password = "task_owned_fixture";
    process.env["DATABASE_URL"] = url.toString(); app = new PrismaService(); process.env["DATABASE_URL"] = ownerUrl;
    await app.$connect();
    expect(await app.$queryRaw`SELECT current_user::text AS actor,session_user::text AS session,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
      FROM pg_roles WHERE rolname=current_user`).toEqual([{ actor: role, session: role, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false }]);
    expect(await app.$queryRaw`SELECT count(*)::int AS owned FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)`).toEqual([{ owned: 0 }]);
    expect(await app.$queryRaw`SELECT (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))+(SELECT count(*)::int FROM pg_namespace WHERE nspname='public'
      AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owned`).toEqual([{ owned: 0 }]);
  });
  afterAll(async () => {
    await app?.onModuleDestroy();
    if (triggers.length) {
      await owner.$transaction(async tx => {
        for (const trigger of triggers) {
          const actions: Record<string, string> = { D: "DISABLE", O: "ENABLE", A: "ENABLE ALWAYS", R: "ENABLE REPLICA" };
          const action = actions[trigger.mode];
          if (!action) throw new Error("Unknown trigger mode");
          await tx.$executeRawUnsafe(`ALTER TABLE public.${quote(trigger.table)} ${action} TRIGGER ${quote(trigger.name)}`);
        }
      });
      expect(await snapshot()).toEqual(triggers);
      expect(await owner.$queryRaw`SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,(SELECT count(*)::int FROM campaign_preparations) AS campaign`).toEqual([{ source: 0, campaign: 0 }]);
      await writeFile(`${evidenceDir}/restoration.json`, JSON.stringify({ exactSnapshotRestored: true,
        readiness: await owner.$queryRaw`SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign`, sourceReceipts: 0, campaignReceipts: 0 }));
    }
    if (locale) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: `diagnostic-pdf/${reportId}/${artifactId}.pdf` }));
      await owner.diagnosticPdfArtifact.deleteMany({ where: { id: artifactId } });
      await owner.diagnosticReportRecord.deleteMany({ where: { id: reportId } });
    }
    if (objectWritten) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    await owner.inspectionOrder.deleteMany({ where: { id: orderId } });
    await owner.diagnosticTemplateVersion.deleteMany({ where: { id: templateId } });
    await owner.diagnosticCenter.deleteMany({ where: { id: centerId } });
    await owner.user.deleteMany({ where: { id: userId } });
    if (roleCreated) {
      await owner.$executeRawUnsafe(`DROP OWNED BY ${role}`);
      await owner.$executeRawUnsafe(`DROP ROLE ${role}`);
    }
    await owner.onModuleDestroy();
    s3.destroy();
  });
  it("preserves eligibility and exact storage outcomes while finishing both receipts", async () => {
    if (!app) throw new Error("Missing restricted caller");
    const caller = app;
    onTestFailed(async () => {
      await writeFile(`${evidenceDir}/first-caller-failure-${role}.json`, JSON.stringify({ provenance: await caller.diagnosticIdentityProvenance.findUnique({ where: { id } }),
        receipts: await caller.$queryRaw`SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,(SELECT count(*)::int FROM campaign_preparations) AS campaign` }, null, 2), { flag: "wx" });
    });
    const runtime = { now: () => clock, id: randomUUID, enabled: () => true };
    const fonts = locale ? { regular: await readFile(join(__dirname, "../../../assets/fonts/NotoSans-Regular.ttf")),
      bold: await readFile(join(__dirname, "../../../assets/fonts/NotoSans-Bold.ttf")) } : { regular: Buffer.alloc(0), bold: Buffer.alloc(0) };
    const worker = new DiagnosticArtifactWorker(app, new S3DiagnosticArtifactObjects(s3, bucket), fonts, runtime);
    if (locale && released) {
      expect((await Promise.all([worker.generate(artifactId), worker.generate(artifactId)])).filter(Boolean)).toHaveLength(1);
      const artifact = await app.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: artifactId } });
      expect(artifact).toMatchObject({ state: "ready", attempts: 1, locale, verifiedAt: now });
      if (!artifact.sizeBytes || !artifact.sha256) throw new Error("Missing actual PDF descriptor");
      const pdf = await new S3DiagnosticArtifactObjects(s3, bucket).read(artifact.objectKey, artifact.sizeBytes, artifact.sha256);
      expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
      const text = await readDiagnosticPdfText(pdf);
      for (const expected of [reportId, released.findingId, "123456 km", now.toISOString()]) expect(text).toContain(expected);
      expect(await worker.generate(artifactId)).toBe(false);
      expect(await app.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } })).toEqual(released.row);
    }
    if (scenario.name === "storage retry") {
      // A real MinIO authentication refusal exercises the durable failure path.
      // No local storage collaborator or database response is mocked.
      const denied = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "", region: "us-east-1", forcePathStyle: true,
        credentials: { accessKeyId: "task-owned-denied", secretAccessKey: "task-owned-denied" } });
      try {
        const failedWorker = new DiagnosticArtifactWorker(app, new S3DiagnosticArtifactObjects(denied, bucket),
          { regular: Buffer.alloc(0), bold: Buffer.alloc(0) }, runtime);
        await expect(failedWorker.cleanup()).rejects.toThrow("DIAGNOSTIC_CLEANUP_RETRY");
      } finally { denied.destroy(); }
      const failed = await app.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } });
      expect(failed).toMatchObject({ state: "cleanup_pending", rights: null, erasedAt: now, objectKey, sha256: digest,
        cleanupRequestedAt: now, cleanupCompletedAt: null, cleanupAttempts: 1, cleanupFailureCode: "cleanup_storage",
        cleanupLeaseUntil: new Date(now.getTime() + 60_000) });
      expect((await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }))).ContentLength).toBe(bytes.length);
      expect(await worker.cleanup()).toBe(0);
      expect(await app.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } })).toEqual(failed);
      expect(await app.$queryRaw`SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,(SELECT count(*)::int FROM campaign_preparations) AS campaign`).toEqual([{ source: 0, campaign: 0 }]);
      clock = new Date(now.getTime() + 60_000);
    }
    const eligible = (scenario.due || scenario.old) && scenario.name !== "attached verified";
    expect(await worker.cleanup()).toBe(eligible && !scenario.leased ? 1 : 0);
    const after = await app.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } });
    if (!eligible) expect(after).toEqual(before);
    else if (scenario.leased) expect(after).toMatchObject({ state: "cleanup_pending", rights: null, erasedAt: now,
      cleanupRequestedAt: now, cleanupCompletedAt: null, cleanupAttempts: 0, writeLeaseUntil: before.writeLeaseUntil });
    else expect(after).toMatchObject({ state: "removed", rights: scenario.due ? null : before.rights, erasedAt: scenario.due ? now : null,
      cleanupRequestedAt: now, cleanupCompletedAt: clock, cleanupAttempts: scenario.name === "storage retry" ? 2 : 1, cleanupLeaseUntil: null, cleanupFailureCode: null });
    if (scenario.bound) {
      const head = s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
      if (eligible && !scenario.leased) await expect(head).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
      else expect((await head).ContentLength).toBe(bytes.length);
    }
    if (material) {
      expect(await app.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: material.raw.id } })).toEqual(material.raw);
      const order = await app.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } });
      const evidence = await app.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: material.evidence.id } });
      if (scenario.due) {
        expect(order).toEqual({ ...material.order, identityEvidenceGeneration: 2 });
        expect(evidence).toEqual({ ...material.evidence, observationHash: null, identifiers: null, provenance: null, rights: null,
          explanation: null, recordHash: null, erasedAt: now });
      } else {
        expect(order).toEqual(material.order);
        expect(evidence).toEqual(material.evidence);
      }
    }
    expect(await app.$queryRaw`SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,(SELECT count(*)::int FROM campaign_preparations) AS campaign`).toEqual([{ source: 0, campaign: 0 }]);
  });
});
