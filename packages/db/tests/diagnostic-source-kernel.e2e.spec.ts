import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import {
  assertDiagnosticSourceCommand, sealDiagnosticFirstObservation, withDiagnosticSourceCommand,
  type DiagnosticSourceCommand, type DiagnosticSourceOperation, type PreparedDiagnosticSource,
} from "../src/index";

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected SQL fixture row");
  return value;
}

type Row = Record<string, unknown>;
type Plan = { table: string; key: Row; verb: string; expected: unknown; next: Row | null };
const root = fileURLToPath(new URL("..", import.meta.url));

/** Real SQL only. No query interception, fake results, source-text assertions or timeout changes.
 * Authenticated caller/HTTP grant journeys remain in the subsequent caller batch. */
describe("prepared diagnostic source kernel against migrated PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let prisma: PrismaClient;
  const clients: PoolClient[] = [];
  const pids = new Map<PoolClient, number>();
  let userId: string;
  let baseOrder: Row;
  let listingId: string;
  let sessionId: string;
  let brandId: string;
  let modelId: string;

  async function connect() {
    const client = await pool.connect(); clients.push(client);
    pids.set(client, present((await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]).pid);
    await client.query("SET statement_timeout='5s'");
    await client.query("SET lock_timeout='5s'");
    return client;
  }
  async function guards(enabled: boolean) {
    const triggers = await pool.query<{ table: string; name: string }>(
      "SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname='diagnostic_source_no_truncate')",
    );
    for (const { table, name } of triggers.rows) {
      await pool.query(`ALTER TABLE public."${table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER "${name}"`);
    }
  }

  async function source(client: PoolClient, table: string, key: Row): Promise<Row> {
    const result = await client.query<{ source: Row }>("SELECT diagnostic_source_project(diagnostic_source_read($1,$2::jsonb),diagnostic_source_meta($1)->'fields') AS source", [table, JSON.stringify(key)]);
    return present(result.rows[0]).source;
  }
  async function projection(client: PoolClient, table: string, row: Row): Promise<Row> {
    return present((await client.query<{ source: Row }>("SELECT diagnostic_source_project($2::jsonb,diagnostic_source_meta($1)->'fields') AS source", [table, JSON.stringify(row)])).rows[0]).source;
  }
  async function update(client: PoolClient, table: string, key: Row, change: Row): Promise<Plan> {
    const prior = await source(client, table, key);
    return { table, key, verb: "update", expected: { source: prior }, next: { ...prior, ...change } };
  }
  function command(operation: string, rows: Plan[], roots = rows.map(({ table, key }) => ({ table, key }))) {
    return { operation, roots, rows, actorUserId: null, sessionId: null, cutoff: operation.endsWith("expire") || operation === "account_purge" ? new Date().toISOString() : null, campaign: null };
  }
  async function prepare(client: PoolClient, c: unknown) {
    return present((await client.query<{ id: string }>("SELECT diagnostic_prepare_source($1::jsonb) AS id", [JSON.stringify(c)])).rows[0]).id;
  }
  async function finish(client: PoolClient, id: string) { await client.query("SELECT diagnostic_finish_source($1::uuid)", [id]); }
  async function begin(client: PoolClient) { await client.query("BEGIN"); }
  async function cloneOrder(client: PoolClient, change: Row = {}): Promise<Plan> {
    const id = randomUUID();
    return { table: "inspection_orders", key: { id }, verb: "insert", expected: "absent", next: await projection(client, "inspection_orders", { ...baseOrder, ...change, id, requestKey: randomUUID() }) };
  }
  async function insertOrder(client: PoolClient, p: Plan) {
    await client.query("INSERT INTO inspection_orders SELECT (jsonb_populate_record(NULL::inspection_orders,$1::jsonb)).*", [JSON.stringify(p.next)]);
  }
  async function newOrder(client: PoolClient, change: Row = {}) {
    const p = await cloneOrder(client, change); await begin(client);
    const receipt = await prepare(client, command("order_create", [p]));
    await insertOrder(client, p); await finish(client, receipt); await client.query("COMMIT");
    return p.key["id"] as string;
  }
  async function waitBlocked(observer: PoolClient, waiter: PoolClient, blocker: PoolClient) {
    const waiterPid = pids.get(waiter), blockerPid = pids.get(blocker);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await observer.query<{ waiting: boolean }>("SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS waiting", [waiterPid, blockerPid]);
      if (result.rows[0]?.waiting === true) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error("expected PostgreSQL lock barrier was not reached within 5s");
  }
  async function observationPlans(client: PoolClient, oid: string, vehicle: Row, grant: Row | null = null) {
    const order = await update(client, "inspection_orders", { id: oid }, { observedVehicle: vehicle });
    present(order.next)["version"] = Number(present(order.next)["version"]) + 1;
    const rawId = randomUUID();
    const raw = await projection(client, "diagnostic_identity_records", { id: rawId, orderId: oid, orderVersion: present(order.next)["version"], observation: vehicle,
      observationHash: "a".repeat(64), recordedById: userId, recordedAt: new Date().toISOString(), erasedAt: null });
    const component = await projection(client, "diagnostic_ownership_components", { identityRecordId: rawId, orderId: oid, orderVersion: present(order.next)["version"], state: grant ? "available" : "unavailable",
      ...(grant ? { grantId: grant["id"], scope: "diagnostic_ownership_continuity", sourceListingId: grant["listingId"], identityDigest: grant["identityDigest"],
        sellerId: grant["sellerId"], commissionerId: grant["commissionerId"], businessId: grant["businessId"], membershipId: grant["membershipId"],
        rights: grant["rights"], rightsUntil: grant["rightsUntil"], declaredById: userId, declaredAt: raw["recordedAt"] } : {}) });
    const plans: Plan[] = [order, { table: "diagnostic_identity_records", key: { id: rawId }, verb: "insert", expected: "absent", next: raw },
      { table: "diagnostic_ownership_components", key: { identityRecordId: rawId }, verb: "insert", expected: "absent", next: component }];
    return { plans, raw, component, rawId };
  }
  async function observe(client: PoolClient, oid: string, vehicle: Row, seal = true, grant: Row | null = null) {
    const { plans, raw, component, rawId } = await observationPlans(client, oid, vehicle, grant);
    await begin(client); const receipt = await prepare(client, command("observation_append", plans));
    await client.query('UPDATE inspection_orders SET "observedVehicle"=$2::jsonb,version=version+1 WHERE id=$1', [oid, JSON.stringify(vehicle)]);
    await client.query("INSERT INTO diagnostic_identity_records SELECT (jsonb_populate_record(NULL::diagnostic_identity_records,$1::jsonb)).*", [JSON.stringify(raw)]);
    await client.query("INSERT INTO diagnostic_ownership_components SELECT (jsonb_populate_record(NULL::diagnostic_ownership_components,$1::jsonb)).*", [JSON.stringify(component)]);
    if (seal) await client.query("SELECT diagnostic_seal_first_observation($1::uuid,$2,$3)", [receipt, oid, rawId]);
    return { receipt, rawId };
  }
  async function anchor(oid: string) { return (await pool.query('SELECT state,"firstRecordId",source FROM diagnostic_source_anchors WHERE "orderId"=$1', [oid])).rows[0] as Row; }

  async function ownershipGrant(client: PoolClient, oid: string) {
    const until = new Date(Date.now() + 600_000).toISOString();
    const rights = { category: "vehicle_observation", purpose: "continuity", basis: "SQL scenario declaration", provenance: "SQL fixture seller Session",
      identifiability: "personal", use: ["service"], schedule: { kind: "until", until, reason: "bounded SQL fixture" }, supplierRestrictions: "", hold: null };
    const grant = await projection(client, "diagnostic_ownership_grants", { id: randomUUID(), orderId: oid, state: "available", listingId,
      identityDigest: createHash("sha256").update(JSON.stringify([listingId, userId, null, "AAA", brandId, modelId, null])).digest("hex"),
      sellerId: userId, commissionerId: userId, grantorId: userId, sessionId, rights, rightsUntil: until.replace("Z", ""), declaredAt: new Date().toISOString().replace("Z", "") });
    const p: Plan = { table: "diagnostic_ownership_grants", key: { id: grant["id"] }, verb: "insert", expected: "absent", next: grant };
    await begin(client); const receipt = await prepare(client, command("ownership_grant", [p]));
    await client.query("INSERT INTO diagnostic_ownership_grants SELECT (jsonb_populate_record(NULL::diagnostic_ownership_grants,$1::jsonb)).*", [JSON.stringify(grant)]);
    await finish(client, receipt); await client.query("COMMIT");
    return grant;
  }

  function sourceCommand(operation: DiagnosticSourceOperation, rows: Plan[]): DiagnosticSourceCommand {
    return { ...command(operation, rows), cutoff: null } as DiagnosticSourceCommand;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    const url = container.getConnectionUri();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });
  beforeEach(async () => {
    await guards(false);
    userId = randomUUID();
    await pool.query('INSERT INTO users(id,email,"emailVerifiedAt","updatedAt") VALUES($1,$2,clock_timestamp(),clock_timestamp())', [userId, `${userId}@kernel.invalid`]);
    sessionId = randomUUID();
    await pool.query(`INSERT INTO sessions(id,"userId","refreshTokenHash","expiresAt") VALUES($1,$2,$1,clock_timestamp()+interval '1 hour')`, [sessionId, userId]);
    brandId = randomUUID(); modelId = randomUUID(); listingId = randomUUID();
    const region = randomUUID(), city = randomUUID();
    for (const [table, id] of [["brands", brandId], ["regions", region]]) {
      await pool.query(`INSERT INTO ${table}(id,slug,"nameRu","nameTk","nameEn","updatedAt") VALUES($1,$1,'kernel','kernel','kernel',clock_timestamp())`, [id]);
    }
    await pool.query(`INSERT INTO models(id,"brandId",slug,"nameRu","nameTk","nameEn","updatedAt") VALUES($1,$2,$1,'kernel','kernel','kernel',clock_timestamp())`, [modelId, brandId]);
    await pool.query(`INSERT INTO cities(id,"regionId",slug,"nameRu","nameTk","nameEn","updatedAt") VALUES($1,$2,$1,'kernel','kernel','kernel',clock_timestamp())`, [city, region]);
    await pool.query(`INSERT INTO listings(id,"sellerId","brandId","modelId","cityId","priceAmount",vin,"updatedAt") VALUES($1,$2,$3,$4,$5,1,'AAA',clock_timestamp())`, [listingId, userId, brandId, modelId, city]);
    const center = randomUUID(), template = randomUUID(), oid = randomUUID();
    await pool.query('INSERT INTO diagnostic_centers(id,code,names) VALUES($1,$1,\'{}\')', [center]);
    await pool.query('INSERT INTO diagnostic_template_versions(id,"centerId",version,definition) VALUES($1,$2,1,\'{}\')', [template, center]);
    await pool.query('INSERT INTO inspection_orders(id,"centerId","templateVersionId","commissionerId","requestKey",audience,epoch,"updatedAt") VALUES($1,$2,$3,$4,$1,\'buyer_private\',$1,clock_timestamp())', [oid, center, template, userId]);
    baseOrder = present((await pool.query("SELECT to_jsonb(o) AS row FROM inspection_orders o WHERE id=$1", [oid])).rows[0])["row"] as Row;
    await guards(true);
  });
  afterEach(async () => { for (const client of clients.splice(0)) { await client.query("ROLLBACK"); client.release(); } await guards(false); });
  afterAll(async () => { await prisma?.$disconnect(); await pool?.end(); await container?.stop(); });

  it("direct INSERT discards forged identity/graph/effects and direct DELETE requires actual final effects", async () => {
    const a = await connect(); const p = await update(a, "users", { id: userId }, { deletionScheduledAt: "2030-01-01T00:00:00" });
    await begin(a);
    const result = await a.query<{ id: string; backend_pid: number; effects: Plan[] }>(`INSERT INTO diagnostic_source_commands(id,backend_pid,full_transaction_id,command,scope,effects)
      VALUES($1,0,'forged',$2::jsonb,'[]','[]') RETURNING id,backend_pid,effects`, ["00000000-0000-0000-0000-000000000000", JSON.stringify(command("account_schedule", [p]))]);
    expect(present(result.rows[0]).id).not.toBe("00000000-0000-0000-0000-000000000000");
    expect(present(result.rows[0]).backend_pid).toBe(pids.get(a));
    expect(present(present(result.rows[0]).effects[0]).key).toEqual({ id: userId });
    await expect(a.query("DELETE FROM diagnostic_source_commands WHERE id=$1", [present(result.rows[0]).id])).rejects.toThrow("diagnostic_source_final_effect");
    await a.query("ROLLBACK");
    expect(present((await pool.query('SELECT "deletionScheduledAt" FROM users WHERE id=$1', [userId])).rows[0])["deletionScheduledAt"]).toBeNull();
  });
  it("finish deletes the live receipt so deferred completion accepts, and subsequent protected writes refuse", async () => {
    const a = await connect(); const p = await update(a, "users", { id: userId }, { deletionScheduledAt: "2030-01-01T00:00:00" });
    await begin(a); const receipt = await prepare(a, command("account_schedule", [p]));
    await a.query('UPDATE users SET "deletionScheduledAt"=\'2030-01-01\' WHERE id=$1', [userId]);
    await finish(a, receipt); await a.query("COMMIT");
    expect(present((await pool.query("SELECT count(*)::int AS n FROM diagnostic_source_commands")).rows[0])["n"]).toBe(0);
    await expect(a.query('UPDATE users SET "deletionScheduledAt"=NULL WHERE id=$1', [userId])).rejects.toThrow("diagnostic_source_unprepared");
  });
  it("unclosed receipt fails at COMMIT using final live state", async () => {
    const a = await connect(); const p = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
    await begin(a); await prepare(a, command("account_restore", [p]));
    await expect(a.query("COMMIT")).rejects.toThrow("diagnostic_source_unfinished");
  });
  it("foreign backend, forged GUC, unknown fields, receipt UPDATE and TRUNCATE cannot authorize writes", async () => {
    const a = await connect(), b = await connect(); const p = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
    await begin(a); const receipt = await prepare(a, command("account_restore", [p]));
    await expect(b.query("SELECT diagnostic_assert_source($1,'account_restore')", [receipt])).rejects.toThrow("diagnostic_source_receipt");
    await b.query("SELECT set_config('carberk.source_receipt',$1,false)", [receipt]);
    await expect(b.query('UPDATE users SET "deletionScheduledAt"=NULL WHERE id=$1', [userId])).rejects.toThrow("diagnostic_source_unprepared");
    await expect(b.query("SELECT diagnostic_prepare_source($1::jsonb)", [JSON.stringify({ ...command("account_restore", [p]), locks: [] })])).rejects.toThrow("diagnostic_source_command");
    await expect(b.query("UPDATE diagnostic_source_commands SET effects='[]'")).rejects.toThrow("diagnostic_source_immutable");
    await expect(b.query("TRUNCATE diagnostic_source_commands")).rejects.toThrow("diagnostic_source_immutable");
    await finish(a, receipt); await a.query("COMMIT");
  });
  it.each(["users", "inspection_orders", "diagnostic_template_versions", "diagnostic_centers"])("pre-held %s row lock refuses preparation before source writes", async table => {
    const a = await connect(); const p = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
    await begin(a); await a.query(`SELECT 1 FROM public.${table} FOR UPDATE`);
    await expect(prepare(a, command("account_restore", [p]))).rejects.toThrow("diagnostic_source_preheld_lock");
  });
  it("unprepared bulk source UPDATE refuses before scanning, scalar UPDATE remains ordinary", async () => {
    await expect(pool.query('UPDATE users SET "deletionScheduledAt"=NULL WHERE false')).rejects.toThrow("diagnostic_source_unprepared");
    await pool.query('UPDATE users SET "displayName"=\'ordinary\' WHERE id=$1', [userId]);
    expect(present((await pool.query('SELECT "displayName" FROM users WHERE id=$1', [userId])).rows[0])["displayName"]).toBe("ordinary");
  });
  it("an effective source change made by a BEFORE trigger is caught for a scalar statement", async () => {
    await pool.query(`CREATE FUNCTION kernel_inject_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW."deletionScheduledAt":='2030-01-01'; RETURN NEW; END $$`);
    await pool.query("CREATE TRIGGER kernel_inject_source BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION kernel_inject_source()");
    try { await expect(pool.query('UPDATE users SET "displayName"=\'ordinary\' WHERE id=$1', [userId])).rejects.toThrow("diagnostic_source_unprepared"); }
    finally { await pool.query("DROP TRIGGER kernel_inject_source ON users"); await pool.query("DROP FUNCTION kernel_inject_source()"); }
    expect(present((await pool.query('SELECT "displayName" FROM users WHERE id=$1', [userId])).rows[0])["displayName"]).toBeNull();
  });
  it("reversed overlapping root input produces one physical sequence and serializes without deadlock", async () => {
    const a = await connect(), b = await connect(), observer = await connect();
    const p = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
    const roots = [{ table: "inspection_orders", key: { id: baseOrder["id"] } }, { table: "users", key: { id: userId } }];
    await begin(a); const first = await prepare(a, command("account_restore", [p], roots));
    const keysA = present((await a.query("SELECT lock_keys FROM diagnostic_source_commands WHERE id=$1", [first])).rows[0])["lock_keys"];
    await begin(b); const pending = prepare(b, command("account_restore", [p], [...roots].reverse()));
    await waitBlocked(observer, b, a); await finish(a, first); await a.query("COMMIT");
    const second = await pending;
    expect(present((await b.query("SELECT lock_keys FROM diagnostic_source_commands WHERE id=$1", [second])).rows[0])["lock_keys"]).toEqual(keysA);
    await finish(b, second); await b.query("COMMIT");
  });
  it("an order inserted after discovery is found by actual post-lock database rediscovery", async () => {
    const a = await connect(), b = await connect(), observer = await connect();
    const p = await cloneOrder(b); const user = await update(a, "users", { id: userId }, { deletionScheduledAt: "2030-01-01T00:00:00" });
    await begin(b); const receiptB = await prepare(b, command("order_create", [p]));
    await begin(a); const pending = prepare(a, command("account_schedule", [user]));
    // Attach a rejection observer immediately so the barrier cannot leak an unhandled rejection.
    const outcome = pending.then(() => "unexpected success", error => (error as Error).message);
    await waitBlocked(observer, a, b); await insertOrder(b, p); await finish(b, receiptB); await b.query("COMMIT");
    expect(await outcome).toContain("diagnostic_source_graph_changed"); await a.query("ROLLBACK");
    expect(present((await pool.query('SELECT "deletionScheduledAt" FROM users WHERE id=$1', [userId])).rows[0])["deletionScheduledAt"]).toBeNull();
  });
  it("no-grant first capture is unavailable, later same-identity captures never repin, and rollback leaves no claim", async () => {
    const a = await connect(); const oid = await newOrder(a);
    const vehicle = { method: "vin", vin: "AAA", observedAt: "2026-10-23T12:00:00.000Z", mileageKm: 100 };
    const rolled = await observe(a, oid, vehicle); await a.query("ROLLBACK");
    expect((await anchor(oid))["firstRecordId"]).toBeNull();
    const first = await observe(a, oid, vehicle); await finish(a, first.receipt); await a.query("COMMIT");
    expect(await anchor(oid)).toMatchObject({ state: "unavailable", firstRecordId: first.rawId });
    expect(first.rawId).not.toBe(rolled.rawId);
    const later = await observe(a, oid, { ...vehicle, mileageKm: 101 }); await finish(a, later.receipt); await a.query("COMMIT");
    expect(await anchor(oid)).toMatchObject({ state: "unavailable", firstRecordId: first.rawId });
  });
  it("a missing finish-time first seal fails atomically, legacy shells cannot be backfilled", async () => {
    const a = await connect(); const oid = await newOrder(a);
    const observation = await observe(a, oid, { method: "vin", vin: "AAA" }, false);
    await expect(finish(a, observation.receipt)).rejects.toThrow("diagnostic_source_unsealed_anchor"); await a.query("ROLLBACK");
    expect((await anchor(oid))["firstRecordId"]).toBeNull();
    await expect(pool.query('INSERT INTO diagnostic_source_anchors("orderId",state,source,"createdTransaction") VALUES($1,\'pending\',\'{}\',\'forged\')', [baseOrder["id"]])).rejects.toThrow("diagnostic_source_anchor_receipt");
  });
  it("order commissioner ABA before capture is sticky, including restore to the exact original values", async () => {
    const a = await connect(); const oid = await newOrder(a);
    for (const commissionerId of [null, userId]) {
      const p = await update(a, "inspection_orders", { id: oid }, { commissionerId }); await begin(a);
      const receipt = await prepare(a, command("order_change", [p]));
      await a.query('UPDATE inspection_orders SET "commissionerId"=$2 WHERE id=$1', [oid, commissionerId]);
      await finish(a, receipt); await a.query("COMMIT");
    }
    expect(await anchor(oid)).toMatchObject({ state: "changed", firstRecordId: null });
    const observation = await observe(a, oid, { method: "vin", vin: "AAA" }); await finish(a, observation.receipt); await a.query("COMMIT");
    expect(await anchor(oid)).toMatchObject({ state: "changed", firstRecordId: observation.rawId });
  });
  it("fresh persisted seller grants allow BOTH first captures, and date/mileage changes preserve the immutable slots", async () => {
    const a = await connect();
    for (let visit = 0; visit < 2; visit++) {
      const oid = await newOrder(a, { audience: "listing_public", listingId });
      const grant = await ownershipGrant(a, oid);
      const vehicle = { method: "vin", vin: "AAA", observedAt: "2026-10-23T12:00:00.000Z", mileageKm: 100 };
      const first = await observe(a, oid, vehicle, true, grant); await finish(a, first.receipt); await a.query("COMMIT");
      expect(await anchor(oid)).toMatchObject({ state: "unchanged", firstRecordId: first.rawId });
      const later = await observe(a, oid, { ...vehicle, observedAt: "2026-10-23T12:01:00.000Z", mileageKm: 101 }, true, grant);
      await finish(a, later.receipt); await a.query("COMMIT");
      expect(await anchor(oid)).toMatchObject({ state: "unchanged", firstRecordId: first.rawId });
    }
  });
  it("Listing VIN ABA before first capture is sticky despite restored values and a compatible persisted grant", async () => {
    const a = await connect(); const oid = await newOrder(a, { audience: "listing_public", listingId });
    const grant = await ownershipGrant(a, oid);
    for (const vin of ["BBB", "AAA"]) {
      const p = await update(a, "listings", { id: listingId }, { vin }); await begin(a);
      const receipt = await prepare(a, command("listing_change", [p]));
      await a.query("UPDATE listings SET vin=$2 WHERE id=$1", [listingId, vin]); await finish(a, receipt); await a.query("COMMIT");
    }
    const first = await observe(a, oid, { method: "vin", vin: "AAA" }, true, grant); await finish(a, first.receipt); await a.query("COMMIT");
    expect(await anchor(oid)).toMatchObject({ state: "changed", firstRecordId: first.rawId });
  });
  it("eligibility suspend/restore does not invent ownership history", async () => {
    const a = await connect(); const oid = await newOrder(a, { audience: "listing_public", listingId });
    const grant = await ownershipGrant(a, oid);
    const first = await observe(a, oid, { method: "vin", vin: "AAA" }, true, grant); await finish(a, first.receipt); await a.query("COMMIT");
    for (const deletionScheduledAt of ["2030-01-01T00:00:00", null]) {
      const p = await update(a, "users", { id: userId }, { deletionScheduledAt }); await begin(a);
      const receipt = await prepare(a, command(deletionScheduledAt ? "account_schedule" : "account_restore", [p]));
      await a.query('UPDATE users SET "deletionScheduledAt"=$2::timestamp WHERE id=$1', [userId, deletionScheduledAt]);
      await finish(a, receipt); await a.query("COMMIT");
    }
    expect(await anchor(oid)).toMatchObject({ state: "unchanged", firstRecordId: first.rawId });
  });
  it("distinct resource hashes collide within one class, serialize, and never widen row coverage", async () => {
    const a = await connect(), b = await connect(), observer = await connect();
    const collision = present((await pool.query<{ ids: string[] }>(`
      SELECT array_agg(id ORDER BY id) AS ids FROM (
        SELECT 'kernel-collision-'||n AS id,
          hashtext(jsonb_build_array('pk',jsonb_build_object('id','kernel-collision-'||n))::text) AS key
        FROM generate_series(1,300000) n
      ) slots GROUP BY key HAVING count(*)>1 ORDER BY key LIMIT 1
    `)).rows[0]).ids;
    const firstId = present(collision[0]), secondId = present(collision[1]);
    expect(firstId).not.toBe(secondId);
    await pool.query('INSERT INTO users(id,"updatedAt") VALUES($1,clock_timestamp()),($2,clock_timestamp())', [firstId, secondId]);
    const firstPlan = await update(a, "users", { id: firstId }, { deletionScheduledAt: null });
    const secondPlan = await update(b, "users", { id: secondId }, { deletionScheduledAt: null });
    await begin(a); const first = await prepare(a, command("account_restore", [firstPlan]));
    const firstKeys = present((await a.query("SELECT lock_keys FROM diagnostic_source_commands WHERE id=$1", [first])).rows[0])["lock_keys"];
    await begin(b); const pending = prepare(b, command("account_restore", [secondPlan]));
    await waitBlocked(observer, b, a); await finish(a, first); await a.query("COMMIT");
    const second = await pending;
    expect(present((await b.query("SELECT lock_keys FROM diagnostic_source_commands WHERE id=$1", [second])).rows[0])["lock_keys"]).toEqual(firstKeys);
    await expect(b.query('UPDATE users SET "deletionScheduledAt"=NULL WHERE id=$1', [firstId])).rejects.toThrow("diagnostic_source_uncovered_effect");
  });
  it("component erasure clears the first anchor and grant payload without altering raw date/mileage", async () => {
    const a = await connect(); const oid = await newOrder(a, { audience: "listing_public", listingId });
    const grant = await ownershipGrant(a, oid);
    const first = await observe(a, oid, { method: "vin", vin: "AAA", observedAt: "2026-10-23T12:00:00.000Z", mileageKm: 100 }, true, grant);
    await finish(a, first.receipt); await a.query("COMMIT");
    const rawBefore = await source(a, "diagnostic_identity_records", { id: first.rawId });
    const erasedAt = new Date().toISOString().replace("Z", "");
    const component = await update(a, "diagnostic_ownership_components", { identityRecordId: first.rawId }, { state: "erased", grantId: null, scope: null,
      sourceListingId: null, identityDigest: null, sellerId: null, commissionerId: null, businessId: null, membershipId: null, rights: null,
      rightsUntil: null, declaredById: null, declaredAt: null, erasedAt });
    const erasedGrant = await update(a, "diagnostic_ownership_grants", { id: grant["id"] }, { state: "erased", listingId: null, identityDigest: null,
      sellerId: null, commissionerId: null, businessId: null, membershipId: null, grantorId: null, grantorMembershipId: null, sessionId: null,
      rights: null, rightsUntil: null, declaredAt: null, erasedAt });
    await begin(a); const receipt = await prepare(a, command("ownership_revoke", [component, erasedGrant]));
    await a.query("SELECT diagnostic_dispose_ownership_scope(NULL,$1::timestamp,$2)", [erasedAt, grant["id"]]);
    await finish(a, receipt); await a.query("COMMIT");
    expect(await anchor(oid)).toEqual({ state: "erased", firstRecordId: null, source: null });
    expect(await source(a, "diagnostic_identity_records", { id: first.rawId })).toEqual(rawBefore);
    expect((await source(a, "diagnostic_ownership_grants", { id: grant["id"] }))["rights"]).toBeNull();
  });

  it("the exported transaction interface commits the declared source effect and closes its receipt", async () => {
    const a = await connect();
    const plan = await update(a, "users", { id: userId }, { deletionScheduledAt: "2030-01-01T00:00:00" });
    const result = await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("account_schedule", [plan]), async receipt => {
      await assertDiagnosticSourceCommand(tx, receipt, "account_schedule");
      await tx.user.update({ where: { id: userId }, data: { deletionScheduledAt: new Date("2030-01-01T00:00:00Z") } });
      return "scheduled";
    }));
    expect(result).toBe("scheduled");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletionScheduledAt?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("the exported interface rolls back callback failures and omitted mandatory effects", async () => {
    const a = await connect();
    const plan = await update(a, "users", { id: userId }, { deletionScheduledAt: "2030-01-01T00:00:00" });
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("account_schedule", [plan]), async receipt => {
      await assertDiagnosticSourceCommand(tx, receipt, "account_schedule");
      await tx.user.update({ where: { id: userId }, data: { deletionScheduledAt: new Date("2030-01-01T00:00:00Z") } });
      throw new Error("caller aborted");
    }))).rejects.toThrow("caller aborted");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletionScheduledAt).toBeNull();
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("account_schedule", [plan]), async () => "omitted")))
      .rejects.toThrow("diagnostic_source_final_effect");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletionScheduledAt).toBeNull();
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("exported receipt assertions reject another operation, a finished transaction, and nested preparation", async () => {
    const a = await connect(); const plan = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
    let saved: PreparedDiagnosticSource | undefined;
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("account_restore", [plan]), async receipt => {
      saved = receipt;
      await assertDiagnosticSourceCommand(tx, receipt, "account_restore");
    }));
    await expect(prisma.$transaction(tx => assertDiagnosticSourceCommand(tx, present(saved), "account_restore")))
      .rejects.toThrow("diagnostic_source_receipt");
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("account_restore", [plan]),
      receipt => assertDiagnosticSourceCommand(tx, receipt, "account_schedule"))))
      .rejects.toThrow("diagnostic_source_receipt");
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("account_restore", [plan]),
      () => withDiagnosticSourceCommand(tx, sourceCommand("account_restore", [plan]), async () => "nested"))))
      .rejects.toThrow("diagnostic_source_nested");
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("the exported first-observation seal claims BOTH granted visits without repinning", async () => {
    const a = await connect();
    for (let visit = 0; visit < 2; visit++) {
      const oid = await newOrder(a, { audience: "listing_public", listingId });
      const grant = await ownershipGrant(a, oid);
      const vehicle = { method: "vin", vin: "AAA", observedAt: "2026-10-23T12:00:00.000Z", mileageKm: 100 };
      const { plans, raw, component, rawId } = await observationPlans(a, oid, vehicle, grant);
      await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("observation_append", plans), async receipt => {
        await assertDiagnosticSourceCommand(tx, receipt, "observation_append");
        await tx.inspectionOrder.update({ where: { id: oid }, data: { observedVehicle: vehicle, version: { increment: 1 } } });
        await tx.$executeRaw`INSERT INTO diagnostic_identity_records SELECT (jsonb_populate_record(NULL::diagnostic_identity_records,${JSON.stringify(raw)}::jsonb)).*`;
        await tx.$executeRaw`INSERT INTO diagnostic_ownership_components SELECT (jsonb_populate_record(NULL::diagnostic_ownership_components,${JSON.stringify(component)}::jsonb)).*`;
        await sealDiagnosticFirstObservation(tx, receipt, oid, rawId);
      }));
      expect(await anchor(oid)).toMatchObject({ state: "unchanged", firstRecordId: rawId });
      const later = await observe(a, oid, { ...vehicle, mileageKm: 101 }, true, grant);
      await finish(a, later.receipt); await a.query("COMMIT");
      expect(await anchor(oid)).toMatchObject({ state: "unchanged", firstRecordId: rawId });
    }
  });

  it("ordinary Session creation works while its authority changes require a source command", async () => {
    const id = randomUUID();
    await prisma.session.create({ data: { id, userId, refreshTokenHash: id, expiresAt: new Date(Date.now() + 600_000) } });
    expect((await prisma.session.findUniqueOrThrow({ where: { id } })).userId).toBe(userId);
    await expect(prisma.session.update({ where: { id }, data: { expiresAt: new Date() } })).rejects.toThrow("diagnostic_source_unprepared");
  });

  it("ordinary Listing counters and derived price updates need no ownership receipt", async () => {
    await prisma.listing.update({ where: { id: listingId }, data: { viewCount: { increment: 1 }, favoriteCount: { increment: 1 }, priceAmount: 2 } });
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).toMatchObject({ viewCount: 1, favoriteCount: 1, priceAmount: 2 });
  });

  it("equal projected target writes still require exact row coverage", async () => {
    const a = await connect(); const plan = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
    const foreign = randomUUID();
    await pool.query('INSERT INTO users(id,"updatedAt") VALUES($1,clock_timestamp())', [foreign]);
    await begin(a); await prepare(a, command("account_restore", [plan]));
    await expect(a.query('UPDATE users SET "deletionScheduledAt"=NULL WHERE id=$1', [foreign])).rejects.toThrow("diagnostic_source_uncovered_effect");
  });

  it("effective primary-key changes introduced by a scalar BEFORE trigger refuse", async () => {
    await pool.query(`CREATE FUNCTION kernel_move_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.id:='moved-'||OLD.id; RETURN NEW; END $$`);
    await pool.query("CREATE TRIGGER kernel_move_source BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION kernel_move_source()");
    try { await expect(prisma.user.update({ where: { id: userId }, data: { displayName: "ordinary" } })).rejects.toThrow("diagnostic_source_unprepared"); }
    finally { await pool.query("DROP TRIGGER kernel_move_source ON users"); await pool.query("DROP FUNCTION kernel_move_source()"); }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).displayName).toBeNull();
  });

});
