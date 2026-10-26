import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from "vitest";

import { DiagnosticArtifactWorker } from "./DiagnosticArtifactWorker";
import { S3DiagnosticArtifactObjects } from "./S3DiagnosticArtifactObjects";

type Trigger = { table: string; name: string; mode: string; function: string; type: number; definition: string };
const enabled = process.env["DIAGNOSTIC_WORKER_PREPARATION_ACCEPTANCE"] === "1";
const role = `r6c_diagnostic_worker_${randomUUID().replaceAll("-", "").slice(0, 8)}`;

/** Task-owned disposable database only. Seed prerequisites before matched activation;
 * every accepted mutation in the guarded window runs through the real worker. */
describe.skipIf(!enabled)("diagnostic worker with matched source and campaign guards", () => {
  const ownerUrl = process.env["DATABASE_URL"];
  const owner = new PrismaService();
  const s3 = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "", region: "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
  let app: PrismaService | undefined;
  let triggers: Trigger[] = [];
  let roleCreated = false;
  const now = new Date("2001-01-02T00:00:00.000Z");
  const id = randomUUID(), centerId = randomUUID(), templateId = randomUUID(), orderId = randomUUID(), userId = randomUUID();
  const snapshot = () => owner.$queryRaw<Trigger[]>`SELECT c.relname AS "table",t.tgname AS name,t.tgenabled::text AS mode,
    t.tgfoid::regprocedure::text AS function,t.tgtype::int AS type,pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`;
  const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
  beforeAll(async () => {
    if (!ownerUrl || !/^postgres(?:ql)?:\/\/[^/]+@127\.0\.0\.1:\d+\//.test(ownerUrl)) throw new Error("Disposable loopback database required");
    await owner.$connect();
    await owner.user.create({ data: { id: userId } });
    await owner.diagnosticCenter.create({ data: { id: centerId, code: centerId, names: { tk: "Synthetic", ru: "Synthetic", en: "Synthetic" } } });
    await owner.diagnosticTemplateVersion.create({ data: { id: templateId, centerId, version: 1, definition: {} } });
    await owner.inspectionOrder.create({ data: { id: orderId, centerId, templateVersionId: templateId, requestKey: randomUUID(), audience: "listing_public" } });
    await owner.diagnosticIdentityProvenance.create({ data: { id, orderId, contentType: "image/png", declaredSizeBytes: 95,
      rights: { category: "vehicle_observation", purpose: "Synthetic worker preparation fixture", basis: "Task-owned disposable fixture",
        provenance: "Generated fixture only", identifiability: "pseudonymous", use: ["service"], supplierRestrictions: "No redistribution", hold: null,
        schedule: { kind: "until", until: now.toISOString(), reason: "Synthetic fixture authorization" } },
      rightsUntil: now, createdAt: new Date(now.getTime() - 1000), createdById: userId } });
    await owner.$executeRawUnsafe(`CREATE ROLE ${role} LOGIN PASSWORD 'task_owned_fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    roleCreated = true;
    await owner.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await owner.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
    await owner.$executeRawUnsafe(`GRANT INSERT,DELETE ON diagnostic_source_commands,campaign_preparations TO ${role}`);
    await owner.$executeRawUnsafe(`GRANT UPDATE,DELETE ON diagnostic_identity_provenance,diagnostic_identity_evidence,diagnostic_evidence,diagnostic_pdf_artifacts,
      diagnostic_ownership_components,diagnostic_ownership_grants,diagnostic_source_anchors,diagnostic_continuity_proofs,diagnostic_continuity_requests TO ${role}`);
    // SELECT FOR UPDATE requires UPDATE privilege even when its selected set is empty.
    await owner.$executeRawUnsafe(`GRANT UPDATE ON users,dealerships,listings,inspection_orders,diagnostic_reports,diagnostic_order_assignments TO ${role}`);
    await owner.$executeRawUnsafe(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    triggers = await snapshot();
    await writeFile("/tmp/897-r6c-trigger-snapshot.json", JSON.stringify(triggers, null, 2));
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
      await writeFile("/tmp/897-r6c-restoration.json", JSON.stringify({ exactSnapshotRestored: true,
        readiness: await owner.$queryRaw`SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign`, sourceReceipts: 0, campaignReceipts: 0 }));
    }
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
  it("retires due provenance through cleanup and finishes both receipts", async () => {
    if (!app) throw new Error("Missing restricted caller");
    const caller = app;
    onTestFailed(async () => {
      await writeFile(`/tmp/897-r6c-first-caller-failure-${role}.json`, JSON.stringify({ provenance: await caller.diagnosticIdentityProvenance.findUnique({ where: { id } }),
        receipts: await caller.$queryRaw`SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,(SELECT count(*)::int FROM campaign_preparations) AS campaign` }, null, 2), { flag: "wx" });
    });
    const worker = new DiagnosticArtifactWorker(app, new S3DiagnosticArtifactObjects(s3, "diagnostic-test-private"),
      { regular: Buffer.alloc(0), bold: Buffer.alloc(0) }, { now: () => now, id: randomUUID, enabled: () => true });
    expect(await worker.cleanup()).toBe(1);
    expect(await app.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } })).toMatchObject({ state: "removed", rights: null, erasedAt: now,
      cleanupRequestedAt: now, cleanupCompletedAt: now, cleanupAttempts: 1, cleanupLeaseUntil: null, cleanupFailureCode: null });
    expect(await app.$queryRaw`SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,(SELECT count(*)::int FROM campaign_preparations) AS campaign`).toEqual([{ source: 0, campaign: 0 }]);
  });
});
