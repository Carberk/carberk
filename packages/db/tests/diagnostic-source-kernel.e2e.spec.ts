import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

type Row = Record<string, unknown>;
type Plan = { table: string; key: Row; verb: string; expected: unknown; next: Row | null };
const root = fileURLToPath(new URL("..", import.meta.url));

/** Real SQL only. No query interception, fake results, source-text assertions or timeout changes.
 * Authenticated caller/HTTP grant journeys remain in the subsequent caller batch. */
describe("prepared diagnostic source kernel against migrated PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  const clients: PoolClient[] = [];
  const pids = new Map<PoolClient, number>();
  let userId: string;
  let baseOrder: Row;

  async function connect() {
    const client = await pool.connect(); clients.push(client);
    pids.set(client, (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid);
    await client.query("SET statement_timeout='5s'");
    await client.query("SET lock_timeout='5s'");
    return client;
  }
  async function guards(enabled: boolean) {
    const tables = await pool.query<{ table: string }>("SELECT value->>'table' AS table FROM jsonb_array_elements(diagnostic_source_registry())");
    for (const { table } of tables.rows) for (const name of ["diagnostic_source_presence", "diagnostic_source_effective", "diagnostic_source_no_truncate"]) {
      await pool.query(`ALTER TABLE public."${table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER ${name}`);
    }
  }
  async function source(client: PoolClient, table: string, key: Row): Promise<Row> {
    const result = await client.query<{ source: Row }>("SELECT diagnostic_source_project(diagnostic_source_read($1,$2::jsonb),diagnostic_source_meta($1)->'fields') AS source", [table, JSON.stringify(key)]);
    return result.rows[0]!.source;
  }
  async function projection(client: PoolClient, table: string, row: Row): Promise<Row> {
    return (await client.query<{ source: Row }>("SELECT diagnostic_source_project($2::jsonb,diagnostic_source_meta($1)->'fields') AS source", [table, JSON.stringify(row)])).rows[0]!.source;
  }
  async function update(client: PoolClient, table: string, key: Row, change: Row): Promise<Plan> {
    const prior = await source(client, table, key);
    return { table, key, verb: "update", expected: { source: prior }, next: { ...prior, ...change } };
  }
  function command(operation: string, rows: Plan[], roots = rows.map(({ table, key }) => ({ table, key }))) {
    return { operation, roots, rows, actorUserId: null, sessionId: null, cutoff: operation.endsWith("expire") || operation === "account_purge" ? new Date().toISOString() : null, campaign: null };
  }
  async function prepare(client: PoolClient, c: unknown) {
    return (await client.query<{ id: string }>("SELECT diagnostic_prepare_source($1::jsonb) AS id", [JSON.stringify(c)])).rows[0]!.id;
  }
  async function finish(client: PoolClient, id: string) { await client.query("SELECT diagnostic_finish_source($1::uuid)", [id]); }
  async function begin(client: PoolClient) { await client.query("BEGIN"); }
  async function cloneOrder(client: PoolClient): Promise<Plan> {
    const id = randomUUID();
    return { table: "inspection_orders", key: { id }, verb: "insert", expected: "absent", next: await projection(client, "inspection_orders", { ...baseOrder, id, requestKey: randomUUID() }) };
  }
  async function insertOrder(client: PoolClient, p: Plan) {
    await client.query("INSERT INTO inspection_orders SELECT (jsonb_populate_record(NULL::inspection_orders,$1::jsonb)).*", [JSON.stringify(p.next)]);
  }
  async function newOrder(client: PoolClient) {
    const p = await cloneOrder(client); await begin(client);
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
  async function observe(client: PoolClient, oid: string, vehicle: Row, seal = true) {
    const order = await update(client, "inspection_orders", { id: oid }, { observedVehicle: vehicle });
    order.next!["version"] = Number(order.next!["version"]) + 1;
    const rawId = randomUUID();
    const raw = await projection(client, "diagnostic_identity_records", { id: rawId, orderId: oid, orderVersion: order.next!["version"], observation: vehicle,
      observationHash: "a".repeat(64), recordedById: userId, recordedAt: new Date().toISOString(), erasedAt: null });
    const component = await projection(client, "diagnostic_ownership_components", { identityRecordId: rawId, orderId: oid, orderVersion: order.next!["version"], state: "unavailable" });
    const plans: Plan[] = [order, { table: "diagnostic_identity_records", key: { id: rawId }, verb: "insert", expected: "absent", next: raw },
      { table: "diagnostic_ownership_components", key: { identityRecordId: rawId }, verb: "insert", expected: "absent", next: component }];
    await begin(client); const receipt = await prepare(client, command("observation_append", plans));
    await client.query('UPDATE inspection_orders SET "observedVehicle"=$2::jsonb,version=version+1 WHERE id=$1', [oid, JSON.stringify(vehicle)]);
    await client.query("INSERT INTO diagnostic_identity_records SELECT (jsonb_populate_record(NULL::diagnostic_identity_records,$1::jsonb)).*", [JSON.stringify(raw)]);
    await client.query("INSERT INTO diagnostic_ownership_components SELECT (jsonb_populate_record(NULL::diagnostic_ownership_components,$1::jsonb)).*", [JSON.stringify(component)]);
    if (seal) await client.query("SELECT diagnostic_seal_first_observation($1::uuid,$2,$3)", [receipt, oid, rawId]);
    return { receipt, rawId };
  }
  async function anchor(oid: string) { return (await pool.query('SELECT state,"firstRecordId",source FROM diagnostic_source_anchors WHERE "orderId"=$1', [oid])).rows[0] as Row; }

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    const url = container.getConnectionUri();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    pool = new Pool({ connectionString: url });
  });
  beforeEach(async () => {
    await guards(false);
    userId = randomUUID();
    await pool.query('INSERT INTO users(id,"updatedAt") VALUES($1,clock_timestamp())', [userId]);
    const center = randomUUID(), template = randomUUID(), oid = randomUUID();
    await pool.query('INSERT INTO diagnostic_centers(id,code,names) VALUES($1,$1,\'{}\')', [center]);
    await pool.query('INSERT INTO diagnostic_template_versions(id,"centerId",version,definition) VALUES($1,$2,1,\'{}\')', [template, center]);
    await pool.query('INSERT INTO inspection_orders(id,"centerId","templateVersionId","commissionerId","requestKey",audience,epoch,"updatedAt") VALUES($1,$2,$3,$4,$1,\'buyer_private\',$1,clock_timestamp())', [oid, center, template, userId]);
    baseOrder = (await pool.query("SELECT to_jsonb(o) AS row FROM inspection_orders o WHERE id=$1", [oid])).rows[0]!["row"] as Row;
    await guards(true);
  });
  afterEach(async () => { for (const client of clients.splice(0)) { await client.query("ROLLBACK"); client.release(); } await guards(false); });
  afterAll(async () => { await pool?.end(); await container?.stop(); });

  it("direct INSERT discards forged identity/graph/effects and direct DELETE requires actual final effects", async () => {
    const a = await connect(); const p = await update(a, "users", { id: userId }, { deletionScheduledAt: "2030-01-01T00:00:00" });
    await begin(a);
    const result = await a.query<{ id: string; backend_pid: number; effects: Plan[] }>(`INSERT INTO diagnostic_source_commands(id,backend_pid,full_transaction_id,command,scope,effects)
      VALUES($1,0,'forged',$2::jsonb,'[]','[]') RETURNING id,backend_pid,effects`, ["00000000-0000-0000-0000-000000000000", JSON.stringify(command("account_schedule", [p]))]);
    expect(result.rows[0]!.id).not.toBe("00000000-0000-0000-0000-000000000000");
    expect(result.rows[0]!.backend_pid).toBe(pids.get(a));
    expect(result.rows[0]!.effects[0]!.key).toEqual({ id: userId });
    await expect(a.query("DELETE FROM diagnostic_source_commands WHERE id=$1", [result.rows[0]!.id])).rejects.toThrow("diagnostic_source_final_effect");
    await a.query("ROLLBACK");
    expect((await pool.query('SELECT "deletionScheduledAt" FROM users WHERE id=$1', [userId])).rows[0]!["deletionScheduledAt"]).toBeNull();
  });
  it("finish deletes the live receipt so deferred completion accepts, and subsequent protected writes refuse", async () => {
    const a = await connect(); const p = await update(a, "users", { id: userId }, { deletionScheduledAt: "2030-01-01T00:00:00" });
    await begin(a); const receipt = await prepare(a, command("account_schedule", [p]));
    await a.query('UPDATE users SET "deletionScheduledAt"=\'2030-01-01\' WHERE id=$1', [userId]);
    await finish(a, receipt); await a.query("COMMIT");
    expect((await pool.query("SELECT count(*)::int AS n FROM diagnostic_source_commands")).rows[0]!["n"]).toBe(0);
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
    expect((await pool.query('SELECT "displayName" FROM users WHERE id=$1', [userId])).rows[0]!["displayName"]).toBe("ordinary");
  });
  it("an effective source change made by a BEFORE trigger is caught for a scalar statement", async () => {
    await pool.query(`CREATE FUNCTION kernel_inject_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW."deletionScheduledAt":='2030-01-01'; RETURN NEW; END $$`);
    await pool.query("CREATE TRIGGER kernel_inject_source BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION kernel_inject_source()");
    try { await expect(pool.query('UPDATE users SET "displayName"=\'ordinary\' WHERE id=$1', [userId])).rejects.toThrow("diagnostic_source_unprepared"); }
    finally { await pool.query("DROP TRIGGER kernel_inject_source ON users"); await pool.query("DROP FUNCTION kernel_inject_source()"); }
    expect((await pool.query('SELECT "displayName" FROM users WHERE id=$1', [userId])).rows[0]!["displayName"]).toBeNull();
  });
  it("reversed overlapping root input produces one physical sequence and serializes without deadlock", async () => {
    const a = await connect(), b = await connect(), observer = await connect();
    const p = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
    const roots = [{ table: "inspection_orders", key: { id: baseOrder["id"] } }, { table: "users", key: { id: userId } }];
    await begin(a); const first = await prepare(a, command("account_restore", [p], roots));
    const keysA = (await a.query("SELECT lock_keys FROM diagnostic_source_commands WHERE id=$1", [first])).rows[0]!["lock_keys"];
    await begin(b); const pending = prepare(b, command("account_restore", [p], [...roots].reverse()));
    await waitBlocked(observer, b, a); await finish(a, first); await a.query("COMMIT");
    const second = await pending;
    expect((await b.query("SELECT lock_keys FROM diagnostic_source_commands WHERE id=$1", [second])).rows[0]!["lock_keys"]).toEqual(keysA);
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
    expect((await pool.query('SELECT "deletionScheduledAt" FROM users WHERE id=$1', [userId])).rows[0]!["deletionScheduledAt"]).toBeNull();
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
});
