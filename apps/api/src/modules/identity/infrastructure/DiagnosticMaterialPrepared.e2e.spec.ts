import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ConfigService } from "@nestjs/config";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { PrismaService, Prisma, withDiagnosticSourceCommand } from "@auto-tm/db";
import { Pool } from "pg";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { S3DiagnosticObjects } from "../../diagnostics/infrastructure/S3DiagnosticObjects";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { workerUrls } from "../../../../test/helpers/testDatabases";
import { CheckBusinessAuthority } from "../application/CheckBusinessAuthority";
import { CheckStaffAuthority } from "../application/CheckStaffAuthority";
import { PrismaBusinessAuthority } from "./PrismaBusinessAuthority";
import { PrismaPublisherBindings } from "./PrismaPublisherBindings";
import { DiagnosticPublicBindings } from "../../diagnostics/infrastructure/DiagnosticPublicBindings";
import { PrismaStaffAuthority } from "./PrismaStaffAuthority";
import { DiagnosticAuthority } from "../../diagnostics/infrastructure/DiagnosticAuthority";
import { CampaignDiagnosticAdmission } from "../../diagnostics/infrastructure/campaignDiagnosticAdmission";
import { DiagnosticReportAccess } from "../../diagnostics/infrastructure/DiagnosticReportAccess";
import { PrismaDiagnosticIdentityEvidence } from "../../diagnostics/infrastructure/PrismaDiagnosticIdentityEvidence";
import { PrismaDiagnosticEvidence } from "../../diagnostics/infrastructure/PrismaDiagnosticEvidence";
import { PrismaDiagnosticIntake, diagnosticObservationHash } from "../../diagnostics/infrastructure/PrismaDiagnosticIntake";
import { diagnosticPlannedRow } from "../../diagnostics/infrastructure/DiagnosticPreparedIntake";
import type { DiagnosticObjects } from "../../diagnostics/domain/ports/DiagnosticObjects";
import type { DiagnosticIdentityEvidencePort } from "../../diagnostics/domain/ports/DiagnosticIdentityEvidencePort";
import type { DiagnosticEvidencePort } from "../../diagnostics/domain/ports/DiagnosticEvidencePort";

/** Disposable R4 runtime fixture, executed only under parent candidate authority.
 * Actual stage/upload/append/read/abandon entrypoints own their own prefixes.
 * Assignment opposition uses unchanged production intake. Test-owned receipts
 * remain only in explicit fault transitions. Storage uses the unchanged production MinIO adapter with explicit fault hooks.
 * All database constraints, guards and waits are real. */
const suite = defineE2eSuite("diagnostic-material-r4");
const runId = randomUUID();
const text = { en: "Synthetic", ru: "Synthetic", tk: "Synthetic" };
describe("real prepared diagnostic material adapters", () => {
  let db: PrismaService, pool: Pool, intake: PrismaDiagnosticIntake, authority: DiagnosticAuthority, identity: DiagnosticIdentityEvidencePort, evidence: DiagnosticEvidencePort;
  let sequence = 0, orderId: string, rawId: string, reportId: string, centerId: string;
  let clock: Date, putFailure: boolean, afterPut: (() => Promise<void>) | undefined, afterRead: (() => Promise<void>) | undefined;
  const stored = new Map<string, Uint8Array>();
  const objectKeys = new Set<string>();
  let bytes: Uint8Array, storage: S3DiagnosticObjects, s3: S3Client;
  let guardState: { table: string; name: string; enabled: string }[] = [];
  const runtimeRole = `r4_${randomUUID().replaceAll("-", "")}`;
  let roleCreated = false, completedReads = 0;
  const id = (name: string) => suite.id(`${runId}-${sequence}-${name}`);
  const subject = () => ({ userId: id("technician"), sessionId: id("session") });
  const rights = (): D.DiagnosticIdentityRights => ({ category: "vehicle_observation", purpose: "Restricted visit comparison", basis: "Synthetic fixture declaration", provenance: "Synthetic fixture only",
    identifiability: "personal", use: ["service"], schedule: { kind: "until", until: new Date(clock.getTime() + 3600_000).toISOString(), reason: "Declared synthetic end" }, supplierRestrictions: "Comparison only", hold: null });
  const stage = (name = "provenance", version = 1) => ({ id: id(name), expectedOrderVersion: version, contentType: "image/png" as const, sizeBytes: bytes.length, rights: rights() });
  const capture = (p: string, name = "capture", version = 1): D.DiagnosticIdentityEvidenceCapture => ({ id: id(name), identityRecordId: rawId, expectedOrderVersion: version, rights: rights(), correction: null,
    identifiers: [{ kind: "manufacturer_plate", location: "engine bay", value: "Synthetic plate", provenanceIds: [p] }] });
  const guardQuery = `SELECT c.relname AS table,t.tgname AS name,t.tgenabled::text AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate') ORDER BY c.relname,t.tgname`;
  async function guards(enabled?: boolean) {
    for (const row of guardState) {
      const action = enabled === undefined ? ({ D: "DISABLE", O: "ENABLE", A: "ENABLE ALWAYS", R: "ENABLE REPLICA" }[row.enabled]) : enabled ? "ENABLE" : "DISABLE";
      if (!action) throw new Error("r4_unknown_guard_mode");
      await pool.query(`ALTER TABLE public."${row.table.replaceAll('"', '""')}" ${action} TRIGGER "${row.name.replaceAll('"', '""')}"`);
    }
  }
  const objects: DiagnosticObjects = {
    sanitize: (input, mime) => storage.sanitize(input, mime),
    put: async (key, input, mime) => { await storage.put(key, input, mime); objectKeys.add(key); stored.set(key, input); if (afterPut) await afterPut(); if (putFailure) throw new Error("r4_lost_put_reply"); },
    read: async (key, size, hash) => { if (afterRead) await afterRead(); const content = await storage.read(key, size, hash); completedReads++; return content; },
    remove: async key => { await storage.remove(key); stored.delete(key); },
  };
  beforeAll(async () => {
    const configured = inject("apiTestDatabases");
    const adminUrl = process.env["DATABASE_URL"];
    if (!configured || !adminUrl) throw new Error("r4_configured_disposable_database_required");
    const expected = workerUrls(configured, Number(process.env["VITEST_POOL_ID"])).databaseUrl;
    if (adminUrl !== expected) throw new Error("r4_worker_database_mismatch");
    pool = new Pool({ connectionString: adminUrl });
    expect((await pool.query<{ name: string }>("SELECT current_database() AS name")).rows).toEqual([{ name: new URL(expected).pathname.slice(1) }]);
    guardState = (await pool.query<(typeof guardState)[number]>(guardQuery)).rows;
    expect(guardState.length).toBeGreaterThan(0);
    const password = randomUUID();
    await pool.query(`CREATE ROLE "${runtimeRole}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    roleCreated = true;
    await pool.query(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
    // The invoker-security discovery function reads every registry relation,
    // even when its scoped inventory is empty. Grant that exact registry read
    // surface, plus its receipt tables, rather than all public tables.
    const registry = (await pool.query<{ table: string }>("SELECT value->>'table' AS table FROM jsonb_array_elements(diagnostic_source_registry())")).rows.map(row => row.table);
    const readable = [...new Set([...registry, "diagnostic_source_commands", "campaign_preparations"])];
    for (const table of readable) {
      if (!/^[a-z_]+$/.test(table)) throw new Error("r4_invalid_registry_table");
      await pool.query(`GRANT SELECT ON public."${table}" TO "${runtimeRole}"`);
    }
    // Explicit fixture/source mutations and SELECT FOR UPDATE authority locks.
    const writable = ["users", "sessions", "staff_grants", "audit_logs", "diagnostic_centers", "diagnostic_center_assignments",
      "diagnostic_template_versions", "inspection_orders", "diagnostic_order_assignments", "diagnostic_identity_records",
      "diagnostic_reports", "diagnostic_identity_provenance", "diagnostic_identity_evidence", "diagnostic_evidence", "diagnostic_audits",
      "diagnostic_source_anchors", "diagnostic_source_commands", "campaign_preparations"];
    // Staff/source integrity triggers invalidate retained proofs, including an
    // empty relation. That UPDATE is a real required trigger effect.
    await pool.query(`GRANT UPDATE ON public.diagnostic_continuity_proofs TO "${runtimeRole}"`);
    for (const table of writable) await pool.query(`GRANT INSERT,UPDATE,DELETE ON public."${table}" TO "${runtimeRole}"`);
    const runtimeUrl = new URL(adminUrl); runtimeUrl.username = runtimeRole; runtimeUrl.password = password;
    process.env["DATABASE_URL"] = runtimeUrl.toString();
    try { db = new PrismaService(); } finally { process.env["DATABASE_URL"] = adminUrl; }
    const [role] = await db.$queryRaw<{ superuser: boolean; owns: boolean }[]>`SELECT r.rolsuper AS superuser,pg_has_role(current_user,c.relowner,'USAGE') AS owns FROM pg_roles r JOIN pg_class c ON c.oid='public.diagnostic_identity_provenance'::regclass WHERE r.rolname=current_user`;
    expect(role).toEqual({ superuser: false, owns: false });
    console.info("r4_runtime_role", role, "matched_guards", guardState.length);
    const config = new ConfigService({ DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private" });
    storage = new S3DiagnosticObjects(config);
    s3 = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"]!, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
    try { await s3.send(new CreateBucketCommand({ Bucket: "diagnostic-test-private" })); }
    catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 409) throw error; }
    bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    const runtime = { now: () => new Date(clock), id: randomUUID, syntheticAllowed: () => true };
    const business = new CheckBusinessAuthority(new PrismaBusinessAuthority(db), runtime);
    authority = new DiagnosticAuthority(new CheckStaffAuthority(new PrismaStaffAuthority(db), runtime), business, runtime, new CampaignDiagnosticAdmission(new ConfigService()));
    intake = new PrismaDiagnosticIntake(db, authority, business, new DiagnosticPublicBindings(new PrismaPublisherBindings()), runtime);
    identity = new PrismaDiagnosticIdentityEvidence(db, authority, objects, runtime);
    evidence = new PrismaDiagnosticEvidence(db, new DiagnosticReportAccess(authority, runtime), objects, runtime);
  });
  beforeEach(async () => {
    await guards(false); sequence++; clock = new Date(); putFailure = false; afterPut = undefined; afterRead = undefined; stored.clear();
    centerId = id("center"); orderId = id("order"); rawId = id("raw"); reportId = id("report");
    const templateId = id("template"), userId = subject().userId;
    await db.user.create({ data: { id: userId } });
    await db.session.create({ data: { id: subject().sessionId, userId, refreshTokenHash: id("refresh"), expiresAt: new Date(clock.getTime() + 86400_000), adminTotpExpiresAt: new Date(clock.getTime() + 86400_000) } });
    await db.staffGrant.create({ data: { userId, capability: "diagnostics.technician" } });
    await db.diagnosticCenter.create({ data: { id: centerId, code: centerId, names: text } });
    await db.diagnosticCenterAssignment.create({ data: { id: id("qualification"), centerId, userId, capability: "diagnostics.technician", qualifiedUntil: new Date(clock.getTime() + 86400_000) } });
    await db.staffGrant.create({ data: { userId, capability: "diagnostics.reception" } });
    await db.diagnosticCenterAssignment.create({ data: { id: id("reception-qualification"), centerId, userId, capability: "diagnostics.reception", qualifiedUntil: new Date(clock.getTime() + 86400_000) } });
    await db.diagnosticTemplateVersion.create({ data: { id: templateId, centerId, version: 1, definition: { title: text, limitations: text, syntheticNotice: text, checks: [], panels: [] }, synthetic: true } });
    const observation = { method: "manual" as const, vin: null, manualReference: "Synthetic plate", mileageKm: 100, observedAt: clock.toISOString() };
    await db.inspectionOrder.create({ data: { id: orderId, centerId, templateVersionId: templateId, commissionerId: userId, requestKey: id("request"), audience: "buyer_private", status: "arrived", version: 1,
      physicalAuthorization: { authorityReference: "Synthetic physical permission", recordedBy: userId, recordedAt: clock.toISOString() }, observedVehicle: observation, synthetic: true } });
    await db.diagnosticOrderAssignment.create({ data: { id: id("assignment"), orderId, userId, capability: "diagnostics.technician" } });
    await db.diagnosticOrderAssignment.create({ data: { id: id("reception-assignment"), orderId, userId, capability: "diagnostics.reception" } });
    await db.diagnosticIdentityRecord.create({ data: { id: rawId, orderId, orderVersion: 1, observation, observationHash: diagnosticObservationHash(orderId, 1, observation), recordedAt: clock, recordedById: userId } });
    const selected = await db.diagnosticIdentityRecord.findFirstOrThrow({ where: { orderId, erasedAt: null }, orderBy: [{ orderVersion: "desc" }, { id: "desc" }] });
    await db.diagnosticReportRecord.create({ data: { id: reportId, orderId, identityRecordId: selected.id, identityRecordHash: selected.observationHash, templateVersionId: templateId, audience: "buyer_private", state: { id: reportId, orderId, templateVersionId: templateId, audience: "buyer_private", status: "draft", authorId: userId, findings: [] } } });
    await guards(true);
    expect((await db.$queryRaw<{ ready: boolean }[]>`SELECT diagnostic_source_guards_ready() AS ready`)[0]?.ready).toBe(true);
    expect((await pool.query<{ tgenabled: string }>("SELECT tgenabled FROM pg_trigger WHERE tgrelid='diagnostic_reports'::regclass AND tgname='diagnostic_report_identity_pin'")).rows).toEqual([{ tgenabled: "O" }]);
  });
  afterAll(async () => {
    // This disposable worker database is owned by the configured E2E runner.
    // No broad user/foreign cleanup or operator reset is performed here.
    if (pool) {
      await guards();
      expect((await pool.query(guardQuery)).rows).toEqual(guardState);

    }
    if (storage) { for (const key of objectKeys) await storage.remove(key); storage.onModuleDestroy(); }
    s3?.destroy();
    await db?.onModuleDestroy();
    if (pool) {
      if (roleCreated) { await pool.query(`DROP OWNED BY "${runtimeRole}"`); await pool.query(`DROP ROLE "${runtimeRole}"`); }
      await pool.end();
    }
  });
  async function verified(name = "provenance", version = 1) {
    const input = stage(name, version); await identity.stage(subject(), orderId, input);
    await identity.upload(subject(), orderId, input.id, { expectedOrderVersion: version, mime: input.contentType, bytes });
    return input.id;
  }
  async function material(next: Record<string, unknown>, provenanceId: string) {
    await db.$transaction(async tx => {
      const root = { table: "diagnostic_identity_provenance" as const, key: { id: provenanceId } };
      const row = await diagnosticPlannedRow(tx, root, next);
      await withDiagnosticSourceCommand(tx, { operation: "identity_material_change", roots: [root], rows: [row], actorUserId: null, sessionId: null, cutoff: null, campaign: null }, async () => {
        await tx.diagnosticIdentityProvenance.update({ where: { id: provenanceId }, data: { ...next, ...(next["rights"] === null ? { rights: Prisma.DbNull } : {}) } });
      });
    });
  }
  it("actual stage/upload/append/correct/retry preserve raw and report pins with guards active", async () => {
    const raw = await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } });
    const report = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } });
    expect(report).toMatchObject({ identityRecordId: raw.id, identityRecordHash: raw.observationHash });
    const p = await verified(), input = capture(p), first = await identity.append(subject(), orderId, input);
    expect(await identity.append(subject(), orderId, input)).toEqual(first);
    const p2 = await verified("fresh", 2), correction = { ...capture(p2, "correction", 2), correction: { supersedesId: first.id, explanation: "Fresh support" } };
    const second = await identity.append(subject(), orderId, correction);
    expect(await identity.list(subject(), orderId)).toEqual([first, second]);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ version: 3, identityEvidenceGeneration: 2 });
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } })).toEqual(raw);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } })).toEqual(report);
  });
  it.each(["stale", "wrong-raw", "wrong-order"] as const)("actual append refuses %s atomically", async defect => {
    const p = await verified(), input = capture(p);
    if (defect === "stale") input.expectedOrderVersion = 0;
    if (defect === "wrong-raw") input.identityRecordId = id("missing-raw");
    const before = await db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } });
    await expect(identity.append(subject(), defect === "wrong-order" ? id("foreign-order") : orderId, input)).rejects.toThrow();
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } })).toEqual(before);
    expect(await db.diagnosticIdentityEvidence.count({ where: { orderId } })).toBe(0);
    expect(await db.diagnosticAudit.count({ where: { orderId } })).toBe(0);
  });
  it("a rollback sentinel after actual evidence INSERT restores the complete append", async () => {
    const p = await verified(), before = await db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } });
    const provenance = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: p } });
    const raw = await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } });
    const report = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } });
    await pool.query(`CREATE FUNCTION diagnostic_r4_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'r4_rollback'; END $$;
      CREATE TRIGGER diagnostic_r4_rollback AFTER INSERT ON diagnostic_identity_evidence FOR EACH ROW EXECUTE FUNCTION diagnostic_r4_rollback()`);
    try { await expect(identity.append(subject(), orderId, capture(p))).rejects.toThrow("r4_rollback"); }
    finally { await pool.query("DROP TRIGGER diagnostic_r4_rollback ON diagnostic_identity_evidence; DROP FUNCTION diagnostic_r4_rollback()"); }
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } })).toEqual(before);
    expect(await db.diagnosticIdentityEvidence.count({ where: { orderId } })).toBe(0);
    expect(await db.diagnosticAudit.count({ where: { orderId } })).toBe(0);
    expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: p } })).toEqual(provenance);
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } })).toEqual(raw);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } })).toEqual(report);
  });
  it.each(["revoke", "expiry", "disposal", "epoch", "storage"] as const)("actual adoption cannot revive material after %s between phases", async defect => {
    if (defect === "expiry") clock = new Date(Date.now() - 2 * 3600_000);
    const input = stage(); await identity.stage(subject(), orderId, input);
    putFailure = defect === "storage";
    afterPut = async () => {
      if (defect === "revoke") await db.$transaction(async tx => {
        const root = { table: "staff_grants" as const, key: { userId: subject().userId, capability: "diagnostics.technician" } };
        const row = await diagnosticPlannedRow(tx, root, { revokedAt: clock });
        await withDiagnosticSourceCommand(tx, { operation: "staff_eligibility", roots: [root], rows: [row], actorUserId: null, sessionId: null, cutoff: null, campaign: null }, async () => {
          await tx.staffGrant.update({ where: { userId_capability: root.key }, data: { revokedAt: clock } });
        });
      });
      if (defect === "expiry") clock = new Date(input.rights.schedule.until);
      if (defect === "disposal") await material({ state: "cleanup_pending", erasedAt: clock, cleanupRequestedAt: clock, rights: null, epoch: randomUUID() }, input.id);
      if (defect === "epoch") await material({ epoch: id("replacement-epoch") }, input.id);
    };
    const uploaded = outcome(identity.upload(subject(), orderId, input.id, { expectedOrderVersion: 1, mime: input.contentType, bytes }));
    console.info("r4_adoption_outcome", defect, await uploaded);
    await expect(uploaded.then(result => { if (!result.ok) throw result.error; return result.value; })).rejects.toThrow();
    const row = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: input.id } });
    expect(row.state).toBe(defect === "epoch" ? "staged" : "cleanup_pending");
    expect(row.verifiedAt).toBeNull();
    expect(stored.has(row.objectKey!)).toBe(true);
    if (defect === "epoch") expect(row).toMatchObject({ epoch: id("replacement-epoch"), cleanupRequestedAt: null });
  });
  it("cleanup preserves a production renewal committed between its initial and planning reads", async () => {
    clock = new Date(Date.now() - 2 * 3600_000);
    const input = stage(); await identity.stage(subject(), orderId, input);
    let release: () => void = () => undefined, entered: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { entered = resolve; });
    let initialEpoch: string | undefined;
    let renewal: ReturnType<typeof outcome<D.DiagnosticIdentityProvenance>> | undefined;
    let replacement: Awaited<ReturnType<typeof db.diagnosticIdentityProvenance.findUniqueOrThrow>> | undefined;
    let beforeCleanupPlan: (() => Promise<void>) | undefined = async () => {
      // The first cleanup SELECT already saw E1. No preparation or authority
      // locks are held yet. Let a real upload commit E2's new intent, then hold
      // its storage completion while cleanup plans against the new tuple.
      putFailure = false;
      afterPut = async () => {
        replacement = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: input.id } });
        entered(); await gate;
      };
      renewal = outcome(identity.upload(subject(), orderId, input.id, { expectedOrderVersion: 1, mime: input.contentType, bytes }));
      // Also surface a prerequisite refusal instead of waiting on a missing put.
      await Promise.race([ready, renewal.then(result => { if (!result.ok) throw result.error; throw new Error("r4_renewal_did_not_pause"); })]);
    };
    // Instrument only the database query boundary. Every query and prepared
    // command still executes against PostgreSQL through the original transaction.
    const instrumented = new Proxy(db, { get(target, property) {
      if (property !== "$transaction") return Reflect.get(target, property);
      return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => db.$transaction(tx => work(new Proxy(tx, { get(client, method) {
        if (method !== "$queryRaw") return Reflect.get(client, method);
        return async (parts: TemplateStringsArray, ...values: unknown[]) => {
          if (parts.join("").includes("diagnostic_source_project") && JSON.parse(String(values.at(-1))).state === "cleanup_pending" && beforeCleanupPlan) {
            const pause = beforeCleanupPlan; beforeCleanupPlan = undefined; await pause();
          }
          return client.$queryRaw(parts, ...values);
        };
      } })));
    } });
    const failing = new PrismaDiagnosticIdentityEvidence(instrumented, authority, objects, { now: () => new Date(clock), id: randomUUID, syntheticAllowed: () => true });
    putFailure = true;
    afterPut = async () => {
      initialEpoch = (await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: input.id } })).epoch;
      clock = new Date(clock.getTime() + 120_001); afterPut = undefined;
    };
    try {
      await expect(failing.upload(subject(), orderId, input.id, { expectedOrderVersion: 1, mime: input.contentType, bytes })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
      expect(initialEpoch).toBeDefined();
      expect(replacement).toBeDefined();
      expect(replacement!.epoch).not.toBe(initialEpoch);
      expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: input.id } })).toEqual(replacement);
      expect(replacement).toMatchObject({ state: "staged", cleanupRequestedAt: null });
      expect(stored.has(replacement!.objectKey!)).toBe(true);
      expect(await db.diagnosticAudit.count({ where: { orderId } })).toBe(0);
    } finally { release(); await renewal; }
    expect((await renewal!)?.ok).toBe(true);
    expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: input.id } })).toMatchObject({ epoch: replacement!.epoch, state: "verified", cleanupRequestedAt: null });
  });
  it("ordinary finding evidence and provenance oppose the same object id in both directions", async () => {
    const input = stage(); await identity.stage(subject(), orderId, input);
    const finding = { reportId, evidenceId: input.id, findingId: id("finding"), expectedVersion: 0, mime: "image/png", bytes };
    await expect(evidence.upload(subject(), finding)).rejects.toThrow();
    expect(await db.diagnosticEvidence.findUnique({ where: { id: input.id } })).toBeNull();
    const other = { ...finding, evidenceId: id("finding-evidence") };
    await evidence.upload(subject(), other);
    await expect(identity.stage(subject(), orderId, { ...stage(), id: other.evidenceId })).rejects.toThrow();
    expect(await db.diagnosticEvidence.findUniqueOrThrow({ where: { id: other.evidenceId } })).toMatchObject({ state: "verified" });
    await evidence.abandon(subject(), reportId, other.evidenceId);
    expect(await db.diagnosticEvidence.findUniqueOrThrow({ where: { id: other.evidenceId } })).toMatchObject({ state: "cleanup_pending", cleanupRequestedAt: expect.any(Date) });
  });
  it("finding storage failure retains an exact cleanup descriptor with no identity mutation", async () => {
    putFailure = true;
    const evidenceId = id("finding-evidence");
    await expect(evidence.upload(subject(), { reportId, evidenceId, findingId: id("finding"), expectedVersion: 0, mime: "image/png", bytes })).rejects.toThrow("r4_lost_put_reply");
    const row = await db.diagnosticEvidence.findUniqueOrThrow({ where: { id: evidenceId } });
    expect(row).toMatchObject({ state: "cleanup_pending", cleanupRequestedAt: expect.any(Date), epoch: expect.any(String), objectKey: expect.any(String) });
    expect(stored.has(row.objectKey)).toBe(true);
    expect(await db.diagnosticIdentityEvidence.count({ where: { orderId } })).toBe(0);
  });
  it("delivery rechecks material after the asynchronous read", async () => {
    const p = await verified(), readsBefore = completedReads;
    afterRead = () => { expect(completedReads).toBe(readsBefore + 1); return material({ epoch: id("replacement-epoch") }, p); };
    await expect(identity.read(subject(), orderId, p)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
  });
  async function blockedBy(pid: number, query: string) {
    // Keep two observed waits inside Prisma's unchanged transaction timeout.
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      const result = await pool.query<{ blocked: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid)) AND query LIKE $2) AS blocked", [pid, query]);
      if (result.rows[0]?.blocked) return;
    }
    throw new Error("r4_expected_observed_wait");
  }
  const outcome = <T>(work: Promise<T>) => work.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
  const orderChange = () => intake.assign(subject(), orderId, { expectedVersion: 1, userId: subject().userId, capability: "diagnostics.technician", active: true });
  it.each(["source", "material"] as const)("actual intake assignment and staging serialize with %s first", async first => {
    const input = stage(), before = await db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } });
    const assignments = await db.diagnosticOrderAssignment.findMany({ where: { orderId }, orderBy: { id: "asc" } });
    const raw = await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } });
    const report = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } });
    const gate = await pool.connect();
    let source: ReturnType<typeof outcome<Awaited<ReturnType<typeof orderChange>>>> | undefined;
    let staging: ReturnType<typeof outcome<Awaited<ReturnType<typeof identity.stage>>>> | undefined;
    const table = first === "source" ? "inspection_orders" : "diagnostic_identity_provenance";
    const event = first === "source" ? "UPDATE" : "INSERT";
    const key = first === "source" ? "id" : "orderId";
    const query = first === "source" ? "%UPDATE%inspection_orders%" : "%INSERT%diagnostic_identity_provenance%";
    await gate.query("SELECT pg_advisory_lock(18974,hashtext($1))", [orderId]);
    const gatePid = (await gate.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    await pool.query(`CREATE FUNCTION diagnostic_r4_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(18974,hashtext(NEW."${key}")); RETURN NEW; END $$;
      CREATE TRIGGER diagnostic_r4_gate BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION diagnostic_r4_gate()`);
    try {
      if (first === "source") source = outcome(orderChange());
      else staging = outcome(identity.stage(subject(), orderId, input));
      await blockedBy(gatePid, query);
      const held = await pool.query<{ pid: number }>("SELECT pid FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid)) AND query LIKE $2", [gatePid, query]);
      const holderPid = held.rows[0]!.pid;
      if (first === "source") staging = outcome(identity.stage(subject(), orderId, input));
      else source = outcome(orderChange());
      await blockedBy(holderPid, "%diagnostic_prepare_source%");
    } finally {
      await gate.query("SELECT pg_advisory_unlock(18974,hashtext($1))", [orderId]); gate.release();
      // Release deliberately, then drain both real outer calls even if a barrier failed.
      console.info("r4_assignment_outcomes", first, await Promise.all([source, staging]));
      await pool.query(`DROP TRIGGER diagnostic_r4_gate ON ${table}; DROP FUNCTION diagnostic_r4_gate()`);
    }
    const changed = await source!, staged = await staging!;
    if (first === "source") {
      expect(changed.ok).toBe(true);
      expect(staged.ok).toBe(false);
      if (!staged.ok) expect(() => { throw staged.error; }).toThrow("DIAGNOSTIC_STALE_VERSION");
      expect(await db.diagnosticIdentityProvenance.findUnique({ where: { id: input.id } })).toBeNull();
      expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } })).toEqual({ ...before, version: 2, updatedAt: clock });
      const audits = await db.diagnosticAudit.findMany({ where: { orderId } });
      expect(audits).toEqual([{ id: expect.any(String), centerId, orderId, actorId: subject().userId, action: "ORDER_ASSIGNMENT_CHANGED",
        details: { targetUserId: subject().userId, capability: "diagnostics.technician", active: true }, createdAt: clock }]);
    } else {
      expect(staged).toEqual({ ok: true, value: { id: input.id, state: "staged" } });
      expect(changed.ok).toBe(false);
      // The real caller planned before staging committed a new retained edge.
      // Current kernel rediscovery refuses it without scope extension or retry.
      if (!changed.ok) expect(() => { throw changed.error; }).toThrow("diagnostic_source_graph_changed");
      expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: input.id } })).toMatchObject({ orderId, state: "staged", cleanupRequestedAt: null });
      expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } })).toEqual(before);
      expect(await db.diagnosticAudit.findMany({ where: { orderId } })).toEqual([]);
    }
    expect(await db.diagnosticOrderAssignment.findMany({ where: { orderId }, orderBy: { id: "asc" } })).toEqual(assignments);
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } })).toEqual(raw);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } })).toEqual(report);
    expect(await db.diagnosticIdentityEvidence.count({ where: { orderId } })).toBe(0);
  });

  it("R4 remaining foreign retained raw is refused without effects", async () => {
    const p = await verified();
    await guards(false);
    const own = await db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } });
    const raw = await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } });
    const foreignOrder = id("foreign-retained-order"), foreignRaw = id("foreign-retained-raw");
    await db.inspectionOrder.create({ data: { ...own, id: foreignOrder, requestKey: id("foreign-request"), physicalAuthorization: own.physicalAuthorization as Prisma.InputJsonValue, observedVehicle: own.observedVehicle as Prisma.InputJsonValue, publicationAuthorization: Prisma.DbNull } });
    await db.diagnosticIdentityRecord.create({ data: { ...raw, id: foreignRaw, orderId: foreignOrder, observation: raw.observation as Prisma.InputJsonValue,
      observationHash: diagnosticObservationHash(foreignOrder, 1, raw.observation as Omit<D.DiagnosticObservedVehicle, "expectedVersion">) } });
    await guards(true);
    const before = await db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } });
    const foreign = await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: foreignRaw } });
    await expect(identity.append(subject(), orderId, { ...capture(p), identityRecordId: foreignRaw })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } })).toEqual(before);
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: foreignRaw } })).toEqual(foreign);
    expect(await db.diagnosticIdentityEvidence.count({ where: { orderId } })).toBe(0);
    expect(await db.diagnosticAudit.count({ where: { orderId } })).toBe(0);
  });
  it.each(["permission", "rights", "erasure"] as const)("R4 remaining delivery refuses post-read %s", async defect => {
    if (defect === "rights") clock = new Date(Date.now() - 2 * 3600_000);
    const p = await verified();
    const raw = await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } });
    const report = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } });
    const readsBefore = completedReads;
    afterRead = async () => {
      expect(completedReads).toBe(readsBefore + 1);
      afterRead = undefined;
      if (defect === "permission") {
        await db.$transaction(async tx => {
          const root = { table: "staff_grants" as const, key: { userId: subject().userId, capability: "diagnostics.technician" } };
          const row = await diagnosticPlannedRow(tx, root, { revokedAt: clock });
          await withDiagnosticSourceCommand(tx, { operation: "staff_eligibility", roots: [root], rows: [row], actorUserId: null, sessionId: null, cutoff: null, campaign: null },
            () => tx.staffGrant.update({ where: { userId_capability: root.key }, data: { revokedAt: clock } }));
        });
        // The same subject has reception authority too. Revoke that real grant
        // with the same production preparation contract before post-read checks.
        await db.$transaction(async tx => {
          const root = { table: "staff_grants" as const, key: { userId: subject().userId, capability: "diagnostics.reception" } };
          const row = await diagnosticPlannedRow(tx, root, { revokedAt: clock });
          await withDiagnosticSourceCommand(tx, { operation: "staff_eligibility", roots: [root], rows: [row], actorUserId: null, sessionId: null, cutoff: null, campaign: null },
            () => tx.staffGrant.update({ where: { userId_capability: root.key }, data: { revokedAt: clock } }));
        });
      } else if (defect === "rights") clock = new Date(rights().schedule.until);
      else await material({ state: "cleanup_pending", rights: null, createdById: null, erasedAt: clock, cleanupRequestedAt: clock, epoch: randomUUID() }, p);
    };
    await expect(identity.read(subject(), orderId, p)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } })).toEqual(raw);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } })).toEqual(report);
    expect(await db.diagnosticAudit.count({ where: { orderId } })).toBe(0);
  });
  it.each(["size", "hash"] as const)("R4 remaining real storage refuses wrong %s", async defect => {
    const p = await verified();
    const row = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: p } });
    const clean = await storage.sanitize(bytes, "image/png");
    const before = await storage.read(row.objectKey!, row.sizeBytes!, row.sha256!);
    expect(before).toEqual(clean.bytes);
    await expect(storage.read(row.objectKey!, defect === "size" ? row.sizeBytes! + 1 : row.sizeBytes!, defect === "hash" ? "0".repeat(64) : row.sha256!)).rejects.toThrow("REPORT_EVIDENCE_INVALID");
    expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: p } })).toEqual(row);
    expect(await storage.read(row.objectKey!, row.sizeBytes!, row.sha256!)).toEqual(before);
  });
  it("R4 remaining restricted role cannot write material without a receipt", async () => {
    const p = await verified();
    const before = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: p } });
    await expect(db.diagnosticIdentityProvenance.update({ where: { id: p }, data: { epoch: randomUUID() } })).rejects.toThrow("diagnostic_source_unprepared");
    expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: p } })).toEqual(before);
  });
  it.each(["identity", "finding"] as const)("R4 remaining object collision races with %s first", async first => {
    const input = stage();
    const gate = await pool.connect();
    const table = first === "identity" ? "diagnostic_identity_provenance" : "diagnostic_evidence";
    const gatePid = (await gate.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    await gate.query("SELECT pg_advisory_lock(18975,hashtext($1))", [input.id]);
    await pool.query(`CREATE FUNCTION diagnostic_r4_collision_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(18975,hashtext(NEW.id)); RETURN NEW; END $$;
      CREATE TRIGGER diagnostic_r4_collision_gate BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION diagnostic_r4_collision_gate()`);
    const staging = () => identity.stage(subject(), orderId, input);
    const finding = () => evidence.upload(subject(), { reportId, evidenceId: input.id, findingId: id("finding"), expectedVersion: 0, mime: "image/png", bytes });
    let owner: ReturnType<typeof outcome<unknown>> | undefined, rival: ReturnType<typeof outcome<unknown>> | undefined;
    try {
      owner = outcome<unknown>(first === "identity" ? staging() : finding());
      await blockedBy(gatePid, `%INSERT%${table}%`);
      const held = await pool.query<{ pid: number }>("SELECT pid FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid)) AND query LIKE $2", [gatePid, `%INSERT%${table}%`]);
      rival = outcome<unknown>(first === "identity" ? finding() : staging());
      await blockedBy(held.rows[0]!.pid, "%diagnostic_prepare_source%");
    } finally {
      await gate.query("SELECT pg_advisory_unlock(18975,hashtext($1))", [input.id]); gate.release();
      console.info("r4_collision_outcomes", first, await Promise.all([owner, rival]));
      await pool.query(`DROP TRIGGER diagnostic_r4_collision_gate ON ${table}; DROP FUNCTION diagnostic_r4_collision_gate()`);
    }
    expect((await owner!)?.ok).toBe(true);
    const loser = await rival!;
    expect(loser?.ok).toBe(false);
    if (loser && !loser.ok) expect(() => { throw loser.error; }).toThrow("diagnostic_source_graph_changed");
    const provenance = await db.diagnosticIdentityProvenance.findUnique({ where: { id: input.id } });
    const ordinary = await db.diagnosticEvidence.findUnique({ where: { id: input.id } });
    if (first === "identity") {
      expect(provenance).toMatchObject({ orderId, state: "staged", cleanupRequestedAt: null });
      expect(ordinary).toBeNull();
    } else {
      expect(provenance).toBeNull();
      expect(ordinary).toMatchObject({ reportId, state: "verified", cleanupRequestedAt: null });
      expect(await storage.read(ordinary!.objectKey, ordinary!.sizeBytes!, ordinary!.sha256!)).toEqual((await storage.sanitize(bytes, "image/png")).bytes);
    }
    expect(await db.diagnosticIdentityEvidence.count({ where: { orderId } })).toBe(0);
    expect(await db.diagnosticAudit.count({ where: { orderId } })).toBe(0);
  });
  it("R4 remaining actual purge fences retained material and raw/report pins atomically", async () => {
    const p = await verified();
    await identity.append(subject(), orderId, capture(p));
    // Scheduling is a fixture precondition, not the purge opponent.
    await guards(false);
    await db.user.update({ where: { id: subject().userId }, data: { deletionScheduledAt: clock } });
    await guards(true);
    const workerPath = resolve(__dirname, "../../../../../worker/dist/jobs/PurgeExpiredAccounts.js");
    const { PurgeExpiredAccounts } = createRequire(__filename)(workerPath) as { PurgeExpiredAccounts: new (db: PrismaService) => { execute(input: { now: Date }): Promise<{ purgedCount: number }> } };
    const result = await outcome(new PurgeExpiredAccounts(db).execute({ now: clock }));
    console.info("r4_actual_purge_outcome", result);
    expect(result).toEqual({ ok: true, value: { purgedCount: 1 } });
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ commissionerId: null, erasedAt: clock });
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: rawId } })).toMatchObject({ observation: null, observationHash: null, erasedAt: clock });
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({ identityRecordId: null, identityRecordHash: null, erasedAt: clock });
    expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: p } })).toMatchObject({ state: "cleanup_pending", rights: null, erasedAt: clock });
    await expect(identity.read(subject(), orderId, p)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
  });

});
