import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DiagnosticArtifactWorker } from "./DiagnosticArtifactWorker";
import { workerPlannedRow } from "./DiagnosticWorkerPreparation";
import { S3DiagnosticArtifactObjects } from "./S3DiagnosticArtifactObjects";

// Separate ordinary fixtures are required for these destructive scenarios. Never
// recycle ownership7 after a successful case or insert protected rows to reset it.
// Private request files contain real API bindings, never printed in evidence.
interface Request { url: string; token: string; body: unknown }
interface Fixture {
  dependency: "023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab";
  ordinaryProducerEvidence: string;
  cutoff: string;
  dueGrantIds: string[];
  independentComponentId: string;
  ownerUrl: string;
  workerUrl: string;
  multiComponentGrantId?: string;
  newerGrantId?: string;
  outsideGrantComponentId?: string;
  nonDueGrantId?: string;
  arrivalRequest?: Request;
  race?: { barrierUserId: string; request: Request; candidateOrderId: string; retryRequest?: Request };
}
const cases = ["later-failure", "shared-multiple", "oldest-capacity", "overlimit", "worker-first-second-worker", "second-worker-first-worker",
  "worker-first-capture", "capture-first-worker", "worker-first-proof-use", "proof-use-first-worker"] as const;
type Case = typeof cases[number];
const enabled = process.env["DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_ACCEPTANCE"] === "1";
const fixtureManifest = process.env["DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_MANIFEST"];
const only = process.env["DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_CASE"];
if (enabled && only && !cases.some(name => name === only)) throw new Error("Unknown ownership batch case");
const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) throw new Error("Missing exact fixture value");
  return value;
};
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const grantPatch = (now: Date) => ({ state: "erased", listingId: null, identityDigest: null, sellerId: null, commissionerId: null, businessId: null,
  membershipId: null, grantorId: null, grantorMembershipId: null, sessionId: null, rights: null, rightsUntil: null, declaredAt: null, erasedAt: now });
const componentPatch = (now: Date) => ({ state: "erased", grantId: null, scope: null, sourceListingId: null, identityDigest: null, sellerId: null,
  commissionerId: null, businessId: null, membershipId: null, rights: null, rightsUntil: null, declaredById: null, declaredAt: null, erasedAt: now });

// A manifest maps each case to a PRIVATE fixture JSON path on a distinct task DB.
// Missing prerequisites fail explicitly. Selecting one case never grants the
// harness permission to shrink/reseed the original ordinary100 fixture.
describe.skipIf(!enabled).each(cases.filter(name => !only || name === only))("ownership batch command: %s", name => {
  let fixture: Fixture, db: PrismaService, owner: PrismaService, now: Date, role: string;
  const fault = `r6c_batch_${randomUUID().replaceAll("-", "")}`;
  const root = `${process.env["DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_EVIDENCE_DIR"] ?? `/tmp/897-r6c-batch-${randomUUID()}`}/${name}`;
  const s3 = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "", region: "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
  let faultInstalled = false;
  let triggerSnapshot: unknown;
  const triggers = () => owner.$queryRaw`SELECT c.relname,t.tgname,t.tgenabled,t.tgfoid::text,pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`;
  const snapshot = async () => ({
    grants: await db.diagnosticOwnershipGrant.findMany({ orderBy: { id: "asc" } }),
    components: await db.diagnosticOwnershipComponent.findMany({ orderBy: { identityRecordId: "asc" } }),
    orders: await db.inspectionOrder.findMany({ orderBy: { id: "asc" } }),
    raw: await db.diagnosticIdentityRecord.findMany({ orderBy: { id: "asc" } }),
    reports: await db.diagnosticReportRecord.findMany({ orderBy: { id: "asc" } }),
    anchors: await db.diagnosticSourceAnchor.findMany({ orderBy: { orderId: "asc" } }),
    proofs: await db.diagnosticContinuityProof.findMany({ orderBy: { id: "asc" } }),
    requests: await db.diagnosticContinuityRequest.findMany({ orderBy: { id: "asc" } }),
  });
  type State = Awaited<ReturnType<typeof snapshot>>;
  let before: State, selected: string[], residual: string[];
  const receipts = async () => expect(await db.$queryRaw`SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,
    (SELECT count(*)::int FROM campaign_preparations) AS campaign`).toEqual([{ source: 0, campaign: 0 }]);
  const worker = () => new DiagnosticArtifactWorker(db, new S3DiagnosticArtifactObjects(s3, "diagnostic-test-private"),
    { regular: Buffer.alloc(0), bold: Buffer.alloc(0) }, { now: () => now, id: randomUUID, enabled: () => true });
  const dropFault = async () => {
    if (!faultInstalled) return;
    await owner.$executeRawUnsafe(`DROP TRIGGER ${quote(fault)} ON diagnostic_ownership_grants`);
    await owner.$executeRawUnsafe(`DROP FUNCTION public.${quote(fault)}()`);
    faultInstalled = false;
  };
  async function assertClosure(baseline: State, grants: string[], independent: string[], complete: boolean) {
    const after = await snapshot(), due = new Set(grants);
    const erased = new Set([...baseline.components.filter(row => row.grantId && due.has(row.grantId)).map(row => row.identityRecordId), ...independent]);
    const orders = new Set([...baseline.grants.filter(row => due.has(row.id)).map(row => row.orderId),
      ...baseline.components.filter(row => erased.has(row.identityRecordId)).map(row => row.orderId)]);
    const proofs = baseline.proofs.filter(row => row.predecessorOrderId && orders.has(row.predecessorOrderId) || row.candidateOrderId && orders.has(row.candidateOrderId) || complete && row.rightsUntil <= now);
    const requests = new Set(proofs.map(row => row.requestId));
    expect(after.grants).toEqual(baseline.grants.map(row => due.has(row.id) ? { ...row, ...grantPatch(now) } : row));
    expect(after.components).toEqual(baseline.components.map(row => erased.has(row.identityRecordId) ? { ...row, ...componentPatch(now) } : row));
    expect(after.orders).toEqual(baseline.orders); expect(after.raw).toEqual(baseline.raw); expect(after.reports).toEqual(baseline.reports);
    expect(after.anchors).toEqual(baseline.anchors.map(row => row.state !== "erased" && (row.firstRecordId && erased.has(row.firstRecordId) ||
      baseline.grants.some(grant => due.has(grant.id) && grant.orderId === row.orderId)) ? { ...row, state: "erased", firstRecordId: null, source: null } : row));
    expect(after.proofs).toEqual(baseline.proofs.filter(row => !proofs.some(proof => proof.id === row.id)));
    expect(after.requests).toEqual(baseline.requests.filter(row => !requests.has(row.id)));
    await receipts();
    await writeFile(`${root}/${complete ? "complete" : "partial"}.json`, JSON.stringify(after, null, 2), { flag: "wx" });
    return after;
  }
  async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean): Promise<T> {
    const deadline = Date.now() + 3000;
    for (;;) {
      const value = await read();
      if (accept(value)) return value;
      if (Date.now() >= deadline) throw new Error("Exact PostgreSQL barrier was not reached");
    }
  }
  async function request(input: Request) {
    const url = new URL(input.url);
    if (url.hostname !== "127.0.0.1") throw new Error("Task loopback API required");
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${input.token}`, "content-type": "application/json" },
      body: JSON.stringify(input.body), signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }
  beforeAll(async () => {
    if (!fixtureManifest) throw new Error("Separate ordinary fixture manifest required");
    const manifest = JSON.parse(await readFile(fixtureManifest, "utf8")) as Record<Case, string>;
    if (!manifest[name]) throw new Error(`Missing ordinary fixture for ${name}`);
    fixture = JSON.parse(await readFile(manifest[name], "utf8")) as Fixture;
    expect(fixture.dependency).toBe("023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab");
    if (name !== "overlimit") expect(fixture.dueGrantIds).toHaveLength(100);
    expect(new Set(fixture.dueGrantIds).size).toBe(fixture.dueGrantIds.length);
    const app = new URL(fixture.workerUrl), privileged = new URL(fixture.ownerUrl);
    if (app.hostname !== "127.0.0.1" || app.port !== (process.env["DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_PORT"] ?? "65379") || !/^\/r6c_batch_[a-z0-9_]+$/.test(app.pathname) ||
      app.host !== privileged.host || app.pathname !== privileged.pathname || app.username === privileged.username) throw new Error("Separate task database and restricted caller required; ownership7 stays preserved");
    const prior = process.env["DATABASE_URL"];
    try {
      process.env["DATABASE_URL"] = fixture.workerUrl; db = new PrismaService();
      process.env["DATABASE_URL"] = fixture.ownerUrl; owner = new PrismaService();
    } finally { if (prior === undefined) delete process.env["DATABASE_URL"]; else process.env["DATABASE_URL"] = prior; }
    await mkdir(root, { recursive: true });
    await db.$connect(); await owner.$connect();
    const [identity] = await db.$queryRaw<{ role: string; safe: boolean }[]>`SELECT current_user::text AS role,
      NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AND current_user=session_user
      AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS safe
      FROM pg_roles WHERE rolname=current_user`;
    if (!identity?.safe) throw new Error("Restricted nonowner session required");
    expect(await db.$queryRaw`SELECT (SELECT count(*)::int FROM pg_proc WHERE pronamespace='public'::regnamespace AND proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))+
      (SELECT count(*)::int FROM pg_namespace WHERE nspname='public' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owned`).toEqual([{ owned: 0 }]);
    role = identity.role; now = new Date(fixture.cutoff);
    triggerSnapshot = await triggers();
    expect(await db.$queryRaw`SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign`).toEqual([{ source: true, campaign: true }]);
    expect((await readFile(fixture.ordinaryProducerEvidence)).length).toBeGreaterThan(0);
    expect(await db.$queryRaw`SELECT q.id FROM diagnostic_continuity_requests q JOIN sessions s ON s.id=q."sessionId" WHERE s."expiresAt"<=${now}::timestamp`).toEqual([]);
    await receipts();
    before = await snapshot();
    selected = (await db.diagnosticOwnershipGrant.findMany({ where: { state: "available", rightsUntil: { lte: now } },
      orderBy: [{ rightsUntil: "asc" }, { id: "asc" }], take: 100 })).map(row => row.id);
    expect(selected).toEqual(fixture.dueGrantIds);
    residual = (await db.diagnosticOwnershipComponent.findMany({ where: { state: "available", rightsUntil: { lte: now },
      OR: [{ grantId: null }, { grantId: { notIn: selected } }] }, orderBy: [{ rightsUntil: "asc" }, { identityRecordId: "asc" }], take: 100 })).map(row => row.identityRecordId);
    await mkdir(root, { recursive: true });
    await writeFile(`${root}/before.json`, JSON.stringify(before, null, 2), { flag: "wx" });
    // Real full graphs/effects, not an offline lower bound or mocked planner.
    // No receipt, locks or mutations. Failure stays a recorded prerequisite RED.
    const inventories = [];
    for (let index = 0; index < selected.length && name !== "overlimit" && !name.includes("capture") && !name.includes("proof-use"); index += 10) {
      const rows = [];
      for (const id of selected.slice(index, index + 10)) rows.push(await workerPlannedRow(db, { table: "diagnostic_ownership_grants", key: { id } }, grantPatch(now)));
      const command = { operation: "ownership_expire", roots: rows.map(row => ({ table: row.table, key: row.key })), rows, cutoff: now, actorUserId: null, sessionId: null, campaign: null };
      const [inventory] = await db.$queryRaw<{ scope: number; effects: number }[]>`WITH scoped AS MATERIALIZED
        (SELECT diagnostic_source_scope(${JSON.stringify(command)}::jsonb) AS value)
        SELECT jsonb_array_length(value)::int AS scope,jsonb_array_length(diagnostic_source_effects(${JSON.stringify(command)}::jsonb,value))::int AS effects FROM scoped`;
      expect(inventory?.scope).toBeLessThanOrEqual(1000); expect(inventory?.effects).toBeLessThanOrEqual(1000);
      inventories.push({ ids: selected.slice(index, index + 10), ...inventory });
    }
    for (let index = 0; index < residual.length && name !== "overlimit" && !name.includes("capture") && !name.includes("proof-use"); index += 10) {
      const rows = [];
      for (const identityRecordId of residual.slice(index, index + 10)) rows.push(await workerPlannedRow(db,
        { table: "diagnostic_ownership_components", key: { identityRecordId } }, componentPatch(now)));
      const command = { operation: "ownership_expire", roots: rows.map(row => ({ table: row.table, key: row.key })), rows, cutoff: now, actorUserId: null, sessionId: null, campaign: null };
      const [inventory] = await db.$queryRaw<{ scope: number; effects: number }[]>`WITH scoped AS MATERIALIZED
        (SELECT diagnostic_source_scope(${JSON.stringify(command)}::jsonb) AS value)
        SELECT jsonb_array_length(value)::int AS scope,jsonb_array_length(diagnostic_source_effects(${JSON.stringify(command)}::jsonb,value))::int AS effects FROM scoped`;
      expect(inventory?.scope).toBeLessThanOrEqual(1000); expect(inventory?.effects).toBeLessThanOrEqual(1000);
      inventories.push({ ids: residual.slice(index, index + 10), ...inventory });
    }
    await writeFile(`${root}/full-group-inventories.json`, JSON.stringify(inventories, null, 2), { flag: "wx" });
    expect(await snapshot()).toEqual(before); await receipts();
  });
  afterAll(async () => {
    try {
      if (owner) {
        await dropFault();
        if (triggerSnapshot) {
          expect(await triggers()).toEqual(triggerSnapshot);
          await receipts();
          await writeFile(`${root}/restoration.json`, JSON.stringify({ exactTriggersRestored: true, sourceReceipts: 0, campaignReceipts: 0 }), { flag: "wx" });
        }
      }
    } finally { await db?.onModuleDestroy(); await owner?.onModuleDestroy(); s3.destroy(); }
  });

  it("honors the selected command and race contract without retries or widened limits", async () => {
    if (name === "overlimit") {
      expect(selected).toHaveLength(1);
      const order = required(before.grants.find(row => row.id === selected[0])).orderId;
      expect(before.raw.filter(row => row.orderId === order).length).toBeGreaterThan(1000);
      await expect(worker().cleanup()).rejects.toThrow("diagnostic_source_scope_limit");
      expect(await snapshot()).toEqual(before); await receipts();
      return;
    }
    if (name === "later-failure") {
      expect(selected).toHaveLength(100);
      const doomed = required(selected[10]);
      // BEFORE grant UPDATE runs after its components/proofs have changed. The
      // transaction must undo those mandatory effects along with its receipt.
      await owner.$executeRawUnsafe(`CREATE FUNCTION public.${quote(fault)}() RETURNS trigger LANGUAGE plpgsql AS $fault$
        BEGIN IF OLD.id=${"'" + doomed.replaceAll("'", "''") + "'"} THEN RAISE EXCEPTION 'r6c_later_group_fault'; END IF; RETURN NEW; END $fault$`);
      await owner.$executeRawUnsafe(`CREATE TRIGGER ${quote(fault)} BEFORE UPDATE ON diagnostic_ownership_grants FOR EACH ROW EXECUTE FUNCTION public.${quote(fault)}()`);
      faultInstalled = true;
      await expect(worker().cleanup()).rejects.toThrow("r6c_later_group_fault");
      await assertClosure(before, selected.slice(0, 10), [], false);
      await dropFault();
    }
    if (name === "shared-multiple") {
      const shared = before.proofs.find(proof => {
        const a = before.grants.find(row => row.orderId === proof.predecessorOrderId), b = before.grants.find(row => row.orderId === proof.candidateOrderId);
        return a && b && selected.includes(a.id) && selected.includes(b.id) && Math.floor(selected.indexOf(a.id) / 10) !== Math.floor(selected.indexOf(b.id) / 10);
      });
      expect(shared).toBeDefined();
      if (!fixture.multiComponentGrantId) throw new Error("Ordinary multiple-component fixture required");
      expect(selected).toContain(fixture.multiComponentGrantId);
      expect(before.components.filter(row => row.grantId === fixture.multiComponentGrantId).length).toBeGreaterThan(1);
      expect(before.reports.some(row => row.continuityProofId && row.reinspectionOrderVersion !== null)).toBe(true);
    }
    if (name === "oldest-capacity") {
      expect(selected).toHaveLength(100);
      if (!fixture.newerGrantId || !fixture.outsideGrantComponentId || !fixture.nonDueGrantId || !fixture.arrivalRequest) throw new Error("Literal oldest/new arrival/outside grant fixture required");
      expect(selected).not.toContain(fixture.newerGrantId);
      const newestSelected = required(before.grants.find(row => row.id === selected[99]));
      const newer = required(before.grants.find(row => row.id === fixture.newerGrantId));
      expect(required(newer.rightsUntil) > required(newestSelected.rightsUntil)).toBe(true);
      const outside = required(before.components.find(row => row.identityRecordId === fixture.outsideGrantComponentId));
      expect(outside.grantId).toBe(fixture.nonDueGrantId); expect(required(outside.rightsUntil) <= now).toBe(true);
      expect(required(required(before.grants.find(row => row.id === outside.grantId)).rightsUntil) > now).toBe(true);
      // The ordinary new arrival is issued while the frozen worker waits below.
    }
    if (name.includes("first") || name === "oldest-capacity") {
      const operations: Promise<PromiseSettledResult<unknown>[]>[] = [];
      const secondWorker = name.endsWith("second-worker") || name.startsWith("second-worker");
      const workerFirst = name.startsWith("worker-first") || name === "oldest-capacity";
      const race = fixture.race;
      if (!race) throw new Error("Real opponent and exact User barrier fixture required");
      const beforeOpponent = async () => name === "oldest-capacity" ? request(required(fixture.arrivalRequest)) : secondWorker ? worker().cleanup() : request(race.request);
      try {
        await owner.$transaction(async tx => {
          const [holder] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          if (!workerFirst && !secondWorker) {
            // Hold the accepted opponent AFTER its protected mutation, at audit
            // insertion. It entered before E and retains its real source prefix.
            expect((await tx.$queryRaw<{ before: boolean }[]>`SELECT clock_timestamp() AT TIME ZONE 'UTC'<${now}::timestamp AS before`)[0]?.before).toBe(true);
            await tx.$executeRaw`LOCK TABLE diagnostic_audits IN SHARE MODE`;
          } else await tx.$queryRaw`SELECT id FROM users WHERE id=${race.barrierUserId} FOR UPDATE`;
          operations.push(Promise.allSettled([workerFirst ? worker().cleanup() : beforeOpponent()]));
          const waiting = await until(() => owner.$queryRaw<{ pid: number }[]>`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
            AND ${required(holder).pid}::int=ANY(pg_blocking_pids(pid)) AND state='active'`, rows => rows.length === 1);
          const firstPid = required(waiting[0]).pid;
          if (!workerFirst && !secondWorker) await until(() => owner.$queryRaw<{ due: boolean }[]>`
            SELECT clock_timestamp() AT TIME ZONE 'UTC'>=${now}::timestamp AS due`, rows => rows[0]?.due === true);
          let opponentSettled = false;
          const second = Promise.allSettled([workerFirst ? beforeOpponent() : worker().cleanup()]);
          void second.then(() => { opponentSettled = true; });
          operations.push(second);
          const chain = await until(async () => ({ rows: await owner.$queryRaw<{ pid: number }[]>`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
            AND ${firstPid}::int=ANY(pg_blocking_pids(pid)) AND state='active'`, settled: opponentSettled }),
          result => result.rows.length > 0 || workerFirst && !secondWorker && result.settled);
          // Expired use may refuse before preparation. Otherwise require an
          // actual two-command lock chain, never a sleep or assumed order.
          if (chain.settled && !chain.rows.length) {
            const result = required((await second)[0]);
            if (result.status === "rejected") throw result.reason;
            expect(result.value).toMatchObject({ status: name === "oldest-capacity" ? 201 : 409 });
          }
          await writeFile(`${root}/barrier.json`, JSON.stringify({ holder: required(holder).pid, firstPid,
            secondPids: chain.rows.map(row => row.pid), role, workerFirst, opponentRefusedBeforePrefix: chain.settled && !chain.rows.length }), { flag: "wx" });
        });
      } finally { await Promise.all(operations); }
      const outcomes = (await Promise.all(operations)).map(rows => required(rows[0]));
      const workerOutcome = required(outcomes[workerFirst ? 0 : 1]);
      if (workerOutcome.status === "rejected") {
        expect(String(workerOutcome.reason)).toMatch(/DIAGNOSTIC_PREPARATION_CHANGED|diagnostic_source_(graph_changed|expected|stale)/);
        // No skip/retry inside cleanup. A separate later invocation resumes.
      } else expect(workerOutcome.value).toBe(0);
      const opponent = required(outcomes[workerFirst ? 1 : 0]);
      if (secondWorker) {
        if (opponent.status === "rejected") expect(String(opponent.reason)).toMatch(/DIAGNOSTIC_PREPARATION_CHANGED|diagnostic_source_(graph_changed|expected|stale)/);
        else expect(opponent.value).toBe(0);
      } else {
        if (opponent.status === "rejected") throw opponent.reason;
        expect(opponent.value).toMatchObject({ status: name === "oldest-capacity" || !workerFirst ? 201 : 409 });
      }
      // Preserve immutable rows even when a real opponent added its own row.
      const raced = await snapshot();
      // A stale command cannot leave half a group's grant/component effects.
      // Earlier committed groups remain valid; the faulted group stays exact.
      for (let offset = 0; offset < selected.length; offset += 10) {
        const states = selected.slice(offset, offset + 10).map(id => required(raced.grants.find(row => row.id === id)).state);
        expect(new Set(states).size).toBe(1);
      }
      for (const grant of before.grants) {
        const actual = required(raced.grants.find(row => row.id === grant.id));
        expect(actual).toEqual(actual.state === "erased" && grant.state === "available" ? { ...grant, ...grantPatch(now) } : grant);
        for (const component of before.components.filter(row => row.grantId === grant.id)) {
          const current = raced.components.find(row => row.identityRecordId === component.identityRecordId);
          expect(current).toEqual(actual.state === "erased" || residual.includes(component.identityRecordId) &&
            (workerOutcome.status === "fulfilled" || secondWorker && opponent.status === "fulfilled") ? { ...component, ...componentPatch(now) } : component);
        }
      }
      for (const raw of before.raw) expect(raced.raw.find(row => row.id === raw.id)).toEqual(raw);
      for (const report of before.reports) expect(raced.reports.find(row => row.id === report.id)).toEqual(report);
      if (name === "oldest-capacity") {
        for (const id of selected) expect(raced.grants.find(row => row.id === id)).toMatchObject({ state: "erased" });
        expect(raced.components.find(row => row.identityRecordId === fixture.independentComponentId)).toMatchObject({ state: "erased" });
        expect(raced.components.find(row => row.identityRecordId === fixture.outsideGrantComponentId)).toMatchObject({ state: "erased" });
        for (const id of [fixture.newerGrantId, fixture.nonDueGrantId]) expect(raced.grants.find(row => row.id === id)).toEqual(before.grants.find(row => row.id === id));
        const arrival = raced.grants.filter(row => !before.grants.some(old => old.id === row.id));
        expect(arrival).toHaveLength(1); expect(required(arrival[0]).state).toBe("available"); expect(required(required(arrival[0]).rightsUntil) > now).toBe(true);
        await receipts();
        return; // The next invocation may legitimately select the newer due work.
      }
      if (name === "capture-first-worker") {
        const appended = raced.raw.filter(row => !before.raw.some(old => old.id === row.id));
        expect(appended).toHaveLength(1);
        if (workerOutcome.status === "fulfilled") expect(raced.components.find(row => row.identityRecordId === required(appended[0]).id)).toMatchObject({ state: "erased" });
      }
      if (name === "proof-use-first-worker") {
        const released = raced.reports.filter(row => !before.reports.some(old => old.id === row.id));
        expect(released).toHaveLength(1);
        expect(required(released[0]).continuityProofId).not.toBeNull(); expect(required(released[0]).reinspectionOrderVersion).not.toBeNull();
        if (!race.retryRequest) throw new Error("Consumed retry request required");
        expect(await request(race.retryRequest)).toMatchObject({ status: 201 });
        expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: required(released[0]).id } })).toEqual(released[0]);
      }
      await receipts();
      if (workerOutcome.status === "fulfilled") {
        for (const id of selected) expect(raced.grants.find(row => row.id === id)).toMatchObject({ state: "erased" });
        expect(raced.components.find(row => row.identityRecordId === fixture.independentComponentId)).toMatchObject({ state: "erased" });
      }
      expect(await worker().cleanup()).toBe(0);
      const stable = await snapshot();
      for (const id of selected) expect(stable.grants.find(row => row.id === id)).toMatchObject({ state: "erased" });
      for (const id of residual) expect(stable.components.find(row => row.identityRecordId === id)).toMatchObject({ state: "erased" });
      if (name === "capture-first-worker") for (const raw of stable.raw.filter(row => !before.raw.some(old => old.id === row.id)))
        expect(stable.components.find(row => row.identityRecordId === raw.id)).toMatchObject({ state: "erased" });
      expect(stable.raw).toEqual(raced.raw); expect(stable.reports).toEqual(raced.reports);
      expect(await worker().cleanup()).toBe(0); expect(await snapshot()).toEqual(stable); await receipts();
      return;
    }
    expect(await worker().cleanup()).toBe(0);
    await assertClosure(before, selected, residual, true);
    const stable = await snapshot();
    expect(await worker().cleanup()).toBe(0); expect(await snapshot()).toEqual(stable); await receipts();
  });
});
