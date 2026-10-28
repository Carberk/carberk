import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from "vitest";

import { DiagnosticArtifactWorker } from "./DiagnosticArtifactWorker";
import { S3DiagnosticArtifactObjects } from "./S3DiagnosticArtifactObjects";

/** Provision this task-owned fixture through ordinary grant/observation callers
 * before its declared rights end. Never backfill ownership, shorten immutable
 * rights, disable guards, or invent proof/anchor/receipt rows for this test.
 * The fixture producer retains its commands, exact source pin and source receipts.
 * DATABASE_URL is the restricted worker role; the owner URL is only for the
 * deliberate privilege fault and its exact restoration, never worker execution. */
interface OwnershipExpiryFixture {
  dependency: "023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab";
  ordinaryProducerEvidence: string;
  cutoff: string;
  dueGrantIds: string[];
  derivedComponentIds: string[];
  independentComponentId: string;
  nonDueGrantIds: string[];
  nonDueComponentIds: string[];
  orderIds: string[];
}
const fixturePath = process.env["DIAGNOSTIC_WORKER_OWNERSHIP_FIXTURE"];
const enabled = process.env["DIAGNOSTIC_WORKER_OWNERSHIP_ACCEPTANCE"] === "1" || process.env["DIAGNOSTIC_WORKER_PREPARATION_ACCEPTANCE"] === "1";

describe.skipIf(!enabled)("full grant queue with independently due ownership", () => {
  const db = new PrismaService();
  let owner: PrismaService | undefined;
  let fixture: OwnershipExpiryFixture;
  let role = "";
  let originalUpdatePrivilege = false;
  const evidenceDir = process.env["DIAGNOSTIC_WORKER_OWNERSHIP_EVIDENCE_DIR"] ?? `/tmp/897-r6c-ownership-${randomUUID()}`;
  const s3 = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "", region: "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
  const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
  const receipts = () => db.$queryRaw`SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,
    (SELECT count(*)::int FROM campaign_preparations) AS campaign`;
  const retained = async () => ({
    grants: await db.diagnosticOwnershipGrant.findMany({ where: { orderId: { in: fixture.orderIds } }, orderBy: { id: "asc" } }),
    components: await db.diagnosticOwnershipComponent.findMany({ where: { orderId: { in: fixture.orderIds } }, orderBy: { identityRecordId: "asc" } }),
    orders: await db.inspectionOrder.findMany({ where: { id: { in: fixture.orderIds } }, orderBy: { id: "asc" } }),
    raw: await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: fixture.orderIds } }, orderBy: { id: "asc" } }),
    reports: await db.diagnosticReportRecord.findMany({ where: { orderId: { in: fixture.orderIds } }, orderBy: { id: "asc" } }),
    anchors: await db.diagnosticSourceAnchor.findMany({ where: { orderId: { in: fixture.orderIds } }, orderBy: { orderId: "asc" } }),
    proofs: await db.diagnosticContinuityProof.findMany({ where: { OR: [{ predecessorOrderId: { in: fixture.orderIds } }, { candidateOrderId: { in: fixture.orderIds } }] }, orderBy: { id: "asc" } }),
    requests: await db.diagnosticContinuityRequest.findMany({ where: { orderId: { in: fixture.orderIds } }, orderBy: { id: "asc" } }),
  });
  beforeAll(async () => {
    const ownerUrl = process.env["DIAGNOSTIC_WORKER_FIXTURE_OWNER_URL"];
    const appUrl = process.env["DATABASE_URL"];
    if (!fixturePath || !ownerUrl || !appUrl) throw new Error("Missing ordinarily produced disposable ownership fixture");
    const appAddress = new URL(appUrl), ownerAddress = new URL(ownerUrl);
    if (appAddress.hostname !== "127.0.0.1" || appAddress.port === "5432" || appAddress.host !== ownerAddress.host ||
      appAddress.pathname !== ownerAddress.pathname || appAddress.username === ownerAddress.username) throw new Error("Separate restricted role on task-owned database required");
    fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OwnershipExpiryFixture;
    expect(fixture.dependency).toBe("023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab");
    expect(fixture.dueGrantIds).toHaveLength(100);
    expect(new Set(fixture.dueGrantIds).size).toBe(100);
    expect(fixture.derivedComponentIds.length).toBeGreaterThan(0);
    expect(fixture.nonDueGrantIds.length).toBeGreaterThan(0);
    expect(fixture.nonDueComponentIds.length).toBeGreaterThan(0);
    // A missing producer record is a setup failure, never permission to seed rows.
    expect((await readFile(fixture.ordinaryProducerEvidence)).length).toBeGreaterThan(0);
    await mkdir(evidenceDir, { recursive: true });
    process.env["DATABASE_URL"] = ownerUrl;
    try { owner = new PrismaService(); } finally { process.env["DATABASE_URL"] = appUrl; }
    await db.$connect(); await owner.$connect();
    const [actor] = await db.$queryRaw<{ role: string; safe: boolean; owns: boolean }[]>`SELECT current_user::text AS role,
      NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AS safe,
      EXISTS(SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND relnamespace='public'::regnamespace) AS owns
      FROM pg_roles WHERE rolname=current_user`;
    if (!actor?.safe || actor.owns) throw new Error("Worker role must be restricted and nonowner");
    role = actor.role;
    expect(await db.$queryRaw`SELECT (SELECT count(*)::int FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
      AND pronamespace='public'::regnamespace)+(SELECT count(*)::int FROM pg_namespace WHERE nspname='public'
      AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owned`).toEqual([{ owned: 0 }]);
    expect(await db.$queryRaw`SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign`).toEqual([{ source: true, campaign: true }]);
    expect(await receipts()).toEqual([{ source: 0, campaign: 0 }]);
    const [privilege] = await db.$queryRaw<{ allowed: boolean }[]>`SELECT has_table_privilege(current_user,'diagnostic_ownership_grants','UPDATE') AS allowed`;
    originalUpdatePrivilege = privilege?.allowed === true;
    expect(originalUpdatePrivilege).toBe(true);
    const cutoff = new Date(fixture.cutoff);
    // Request expiry commits before ownership expiry. Keep its entire global
    // selection empty so the later privilege refusal has no earlier changes.
    expect(await db.$queryRaw`SELECT q.id FROM diagnostic_continuity_requests q JOIN sessions s ON s.id=q."sessionId"
      WHERE s."expiresAt"<=${cutoff}::timestamp`).toEqual([]);
    const [clock] = await db.$queryRaw<{ allowed: boolean }[]>`SELECT ${cutoff}::timestamp<=clock_timestamp() AT TIME ZONE 'UTC' AS allowed`;
    expect(clock?.allowed).toBe(true);
    // Admit exactly the queue under test; unrelated due material invalidates setup.
    expect((await db.diagnosticOwnershipGrant.findMany({ where: { state: "available", rightsUntil: { lte: cutoff } }, orderBy: { id: "asc" } })).map(row => row.id)).toEqual([...fixture.dueGrantIds].sort());
    expect((await db.diagnosticOwnershipComponent.findMany({ where: { state: "available", rightsUntil: { lte: cutoff },
      OR: [{ grantId: null }, { grantId: { notIn: fixture.dueGrantIds } }] } })).map(row => row.identityRecordId)).toEqual([fixture.independentComponentId]);
    const baseline = await retained();
    expect(baseline.components.filter(row => row.grantId && fixture.dueGrantIds.includes(row.grantId)).map(row => row.identityRecordId).sort())
      .toEqual([...fixture.derivedComponentIds].sort());
    expect(baseline.grants.filter(row => fixture.nonDueGrantIds.includes(row.id)).map(row => row.id).sort()).toEqual([...fixture.nonDueGrantIds].sort());
    expect(baseline.components.filter(row => fixture.nonDueComponentIds.includes(row.identityRecordId)).map(row => row.identityRecordId).sort())
      .toEqual([...fixture.nonDueComponentIds].sort());
    for (const row of baseline.grants.filter(row => fixture.nonDueGrantIds.includes(row.id))) {
      expect(row.state).toBe("available");
      if (!row.rightsUntil) throw new Error("Non-due grant missing rights end");
      expect(row.rightsUntil.getTime()).toBeGreaterThan(cutoff.getTime());
    }
    for (const row of baseline.components.filter(row => fixture.nonDueComponentIds.includes(row.identityRecordId))) {
      expect(row.state).toBe("available");
      if (!row.rightsUntil) throw new Error("Non-due component missing rights end");
      expect(row.rightsUntil.getTime()).toBeGreaterThan(cutoff.getTime());
    }
    expect(baseline.proofs.length).toBeGreaterThan(0);
  });
  afterAll(async () => {
    try {
      if (owner && role && originalUpdatePrivilege) await owner.$executeRawUnsafe(`GRANT UPDATE ON diagnostic_ownership_grants TO ${quote(role)}`);
    } finally { await db.onModuleDestroy(); await owner?.onModuleDestroy(); s3.destroy(); }
    // The task fixture producer owns exact trigger restoration and row/service
    // cleanup after collecting this test's postconditions and first failure.
  });
  it("rolls back a refused full queue, then disposes every grant-derived and independent due component", async () => {
    if (!owner) throw new Error("Missing fixture owner");
    const before = await retained(), cutoff = new Date(fixture.cutoff);
    onTestFailed(async () => {
      await writeFile(`${evidenceDir}/failure-state.json`, JSON.stringify({ state: await retained(), receipts: await receipts() }, null, 2), { flag: "wx" });
    });
    await writeFile(`${evidenceDir}/before.json`, JSON.stringify(before, null, 2), { flag: "wx" });
    const worker = new DiagnosticArtifactWorker(db, new S3DiagnosticArtifactObjects(s3, "diagnostic-test-private"),
      { regular: Buffer.alloc(0), bold: Buffer.alloc(0) }, { now: () => cutoff, id: randomUUID, enabled: () => true });
    await owner.$executeRawUnsafe(`REVOKE UPDATE ON diagnostic_ownership_grants FROM ${quote(role)}`);
    try {
      expect(await db.$queryRaw`SELECT has_table_privilege(current_user,'diagnostic_ownership_grants','UPDATE') AS allowed`).toEqual([{ allowed: false }]);
      await expect(worker.cleanup()).rejects.toThrow("permission denied for table diagnostic_ownership_grants");
      expect(await retained()).toEqual(before);
      expect(await receipts()).toEqual([{ source: 0, campaign: 0 }]);
    } finally { await owner.$executeRawUnsafe(`GRANT UPDATE ON diagnostic_ownership_grants TO ${quote(role)}`); }
    try {
      expect(await worker.cleanup()).toBe(0);
      const after = await retained();
      const due = new Set(fixture.dueGrantIds), erased = new Set([...fixture.derivedComponentIds, fixture.independentComponentId]);
      const affectedOrders = new Set([...before.grants.filter(row => due.has(row.id)).map(row => row.orderId),
        ...before.components.filter(row => erased.has(row.identityRecordId)).map(row => row.orderId)]);
      const removedProofs = before.proofs.filter(row => row.predecessorOrderId !== null && affectedOrders.has(row.predecessorOrderId) ||
        row.candidateOrderId !== null && affectedOrders.has(row.candidateOrderId) || row.rightsUntil <= cutoff);
      const removedRequests = new Set(removedProofs.map(row => row.requestId));
      expect(after.grants).toEqual(before.grants.map(row => due.has(row.id) ? { ...row, state: "erased", listingId: null, identityDigest: null,
        sellerId: null, commissionerId: null, businessId: null, membershipId: null, grantorId: null, grantorMembershipId: null,
        sessionId: null, rights: null, rightsUntil: null, declaredAt: null, erasedAt: cutoff } : row));
      expect(after.components).toEqual(before.components.map(row => erased.has(row.identityRecordId) ? { ...row, state: "erased", grantId: null,
        scope: null, sourceListingId: null, identityDigest: null, sellerId: null, commissionerId: null, businessId: null, membershipId: null,
        rights: null, rightsUntil: null, declaredById: null, declaredAt: null, erasedAt: cutoff } : row));
      expect(after.orders).toEqual(before.orders); expect(after.raw).toEqual(before.raw); expect(after.reports).toEqual(before.reports);
      expect(after.anchors).toEqual(before.anchors.map(row => row.state === "erased" ||
        !(row.firstRecordId && erased.has(row.firstRecordId)) && !before.grants.some(grant => due.has(grant.id) && grant.orderId === row.orderId)
        ? row : { ...row, state: "erased", firstRecordId: null, source: null }));
      expect(after.proofs).toEqual(before.proofs.filter(row => !removedProofs.some(removed => removed.id === row.id)));
      expect(after.requests).toEqual(before.requests.filter(row => !removedRequests.has(row.id)));
      expect(await receipts()).toEqual([{ source: 0, campaign: 0 }]);
      await writeFile(`${evidenceDir}/after.json`, JSON.stringify(after, null, 2), { flag: "wx" });
    } catch (error) {
      await writeFile(`${evidenceDir}/first-failure.json`, JSON.stringify({ state: await retained(), receipts: await receipts(),
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) }, null, 2), { flag: "wx" });
      throw error;
    }
  });
});
