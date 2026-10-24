import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import {
  assertDiagnosticSourceCommand, sealDiagnosticFirstObservation, withDiagnosticSourceCommand,
  type Prisma, type DiagnosticSourceCommand, type DiagnosticSourceOperation, type PreparedDiagnosticSource,
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
  let observationHash: (orderId: string, version: number, vehicle: Row) => string;

  async function connect() {
    const client = await pool.connect(); clients.push(client);
    pids.set(client, present((await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]).pid);
    await client.query("SET statement_timeout='5s'");
    await client.query("SET lock_timeout='5s'");
    return client;
  }
  async function guards(enabled: boolean) {
    const triggers = await pool.query<{ table: string; name: string }>(
      "SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname='diagnostic_source_no_truncate' OR t.tgname LIKE 'zzzz_campaign_preparation%')",
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
      observationHash: observationHash(oid, Number(present(order.next)["version"]), vehicle), recordedById: userId, recordedAt: new Date().toISOString(), erasedAt: null });
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

  async function grantFixture(client: PoolClient, oid: string, until = new Date(Date.now() + 600_000).toISOString(), actingUser = userId, actingSession = sessionId) {
    const rights = D.DiagnosticIdentityRightsSchema.parse({ category: "vehicle_observation", purpose: "continuity", basis: "Explicit synthetic seller declaration", provenance: "SQL fixture seller Session",
      identifiability: "personal", use: ["service"], schedule: { kind: "until", until, reason: "bounded SQL fixture" }, supplierRestrictions: "", hold: null });
    // Load the actual authenticated seller/current OWNER implementation. The DB
    // package does not acquire a production dependency on the API package.
    const path = fileURLToPath(new URL("../../../apps/api/src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrants.ts", import.meta.url));
    const { DiagnosticOwnershipGrants: grants } = await import(/* @vite-ignore */ path) as {
      DiagnosticOwnershipGrants: {
        source(tx: Prisma.TransactionClient, order: Prisma.InspectionOrderGetPayload<object>): Promise<Row>;
        actor(tx: Prisma.TransactionClient, id: string): Promise<{ membership: { id: string } | null }>;
        create(tx: Prisma.TransactionClient, order: Prisma.InspectionOrderGetPayload<object>, subject: { userId: string; sessionId: string }, input: D.DiagnosticOwnershipGrant, now: Date, id: string): Promise<{ id: string }>;
      };
    };
    const order = await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: oid } });
    const actualSource = await grants.source(prisma, order), actor = await grants.actor(prisma, actingUser);
    const now = new Date();
    const grant = await projection(client, "diagnostic_ownership_grants", { id: randomUUID(), orderId: oid, state: "available", ...actualSource,
      grantorId: actingUser, grantorMembershipId: actualSource["businessId"] ? actor.membership?.id : null, sessionId: actingSession,
      rights, rightsUntil: until.replace("Z", ""), declaredAt: now.toISOString().replace("Z", "") });
    const p: Plan = { table: "diagnostic_ownership_grants", key: { id: grant["id"] }, verb: "insert", expected: "absent", next: grant };
    const c = { ...sourceCommand("ownership_grant", [p]), actorUserId: actingUser, sessionId: actingSession };
    const create = async (tx: Prisma.TransactionClient, receipt: PreparedDiagnosticSource) => {
      await assertDiagnosticSourceCommand(tx, receipt, "ownership_grant");
      const current = await tx.inspectionOrder.findUniqueOrThrow({ where: { id: oid } });
      await grants.create(tx, current, { userId: actingUser, sessionId: actingSession }, { rights }, now, String(grant["id"]));
    };
    return { c, create, grant };
  }
  async function ownershipGrant(client: PoolClient, oid: string, until?: string, actingUser = userId, actingSession = sessionId) {
    const fixture = await grantFixture(client, oid, until, actingUser, actingSession);
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, fixture.c, receipt => fixture.create(tx, receipt)));
    expect(await source(client, "diagnostic_ownership_grants", { id: fixture.grant["id"] })).toEqual(fixture.grant);
    return fixture.grant;
  }

  function sourceCommand(operation: DiagnosticSourceOperation, rows: Plan[]): DiagnosticSourceCommand {
    return { ...command(operation, rows), cutoff: null } as unknown as DiagnosticSourceCommand;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    const url = container.getConnectionUri();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    const path = fileURLToPath(new URL("../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts", import.meta.url));
    observationHash = (await import(/* @vite-ignore */ path) as { diagnosticObservationHash: typeof observationHash }).diagnosticObservationHash;
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
  it.each(["users", "dealerships", "listings", "inspection_orders", "diagnostic_template_versions", "diagnostic_centers", "media_uploads", "video_upload_sessions", "measurement_state", "service_conversations", "totp_enrollments"])("a pre-held %s locking statement refuses preparation before source writes", async table => {
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
  it("BOTH unavailable first captures reject late genuine grants and later observations never repin",async()=>{
    const a=await connect();
    for(let visit=0;visit<2;visit++){
      const oid=await newOrder(a,{audience:"listing_public",listingId});
      const vehicle={method:"vin",vin:"AAA",mileageKm:100,observedAt:"2026-10-23T12:00:00Z"};
      const first=await observe(a,oid,vehicle);await finish(a,first.receipt);await a.query("COMMIT");
      const original=await prisma.diagnosticIdentityRecord.findUniqueOrThrow({where:{id:first.rawId}});
      const orderBefore = await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: oid } });
      await expect(ownershipGrant(a,oid)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
      expect(await prisma.diagnosticOwnershipGrant.count({ where: { orderId: oid } })).toBe(0);
      expect(await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: oid } })).toEqual(orderBefore);
      // Bypass no owner: direct prepared INSERT must also meet the original SQL guard.
      const refused = await grantFixture(a,oid);
      await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx,refused.c,async () => {
        await tx.$executeRaw`INSERT INTO diagnostic_ownership_grants SELECT (jsonb_populate_record(NULL::diagnostic_ownership_grants,${JSON.stringify(refused.grant)}::jsonb)).*`;
      }))).rejects.toThrow("diagnostic_ownership_grant_source");
      const later=await observe(a,oid,{...vehicle,mileageKm:101,observedAt:"2026-10-23T12:01:00Z"});
      await finish(a,later.receipt);await a.query("COMMIT");
      expect(await anchor(oid)).toMatchObject({state:"unavailable",firstRecordId:first.rawId});
      expect(await prisma.diagnosticOwnershipComponent.findUniqueOrThrow({where:{identityRecordId:later.rawId}})).toMatchObject({state:"unavailable",grantId:null});
      expect(await prisma.diagnosticOwnershipComponent.findUniqueOrThrow({where:{identityRecordId:first.rawId}})).toMatchObject({state:"unavailable",grantId:null});
      expect(await prisma.diagnosticIdentityRecord.findUniqueOrThrow({where:{id:first.rawId}})).toEqual(original);
    }
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
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
    const collision = present((await a.query<{ ids: string[] }>(`
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
    const firstKeys = present((await a.query("SELECT lock_keys FROM diagnostic_source_commands WHERE id=$1", [first])).rows[0])["lock_keys"] as { namespace: number; key: number }[];
    expect(new Set(firstKeys.map(key => `${key.namespace}:${key.key}`)).size).toBe(firstKeys.length);
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
    const erasedGrant = await update(a, "diagnostic_ownership_grants", { id: grant["id"] }, { state: "erased", listingId: null, identityDigest: null,
      sellerId: null, commissionerId: null, businessId: null, membershipId: null, grantorId: null, grantorMembershipId: null, sessionId: null,
      rights: null, rightsUntil: null, declaredAt: null, erasedAt });
    await begin(a); const receipt = await prepare(a, command("ownership_revoke", [erasedGrant]));
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
      const { plans, raw, rawId } = await observationPlans(a, oid, vehicle, grant);
      present(present(plans[0]).next)["updatedAt"] = "2026-10-24T00:00:00";
      await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("observation_append", plans), async receipt => {
        await assertDiagnosticSourceCommand(tx, receipt, "observation_append");
        await tx.inspectionOrder.update({ where: { id: oid }, data: { observedVehicle: vehicle, version: { increment: 1 }, updatedAt: new Date("2026-10-24T00:00:00Z") } });
        await tx.diagnosticIdentityRecord.create({ data: { id: rawId, orderId: oid, orderVersion: Number(raw["orderVersion"]),
          observation: vehicle as Prisma.InputJsonObject, observationHash: String(raw["observationHash"]), recordedById: userId,
          recordedAt: new Date(String(raw["recordedAt"])) } });
        await tx.diagnosticOwnershipComponent.create({ data: { identityRecordId: rawId, orderId: oid, orderVersion: Number(raw["orderVersion"]),
          state: "available", grantId: String(grant["id"]), scope: "diagnostic_ownership_continuity", sourceListingId: listingId,
          identityDigest: String(grant["identityDigest"]), sellerId: userId, commissionerId: userId, rights: grant["rights"] as Prisma.InputJsonObject,
          rightsUntil: new Date(String(grant["rightsUntil"])+"Z"), declaredById: userId, declaredAt: new Date(String(raw["recordedAt"])) } });
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

  it("normalized VIN formatting preserves identity while raw source writes remain covered", async () => {
    const a = await connect(); const oid = await newOrder(a, { audience: "listing_public", listingId });
    const grant = await ownershipGrant(a, oid);
    const first = await observe(a, oid, { method: "vin", vin: "AAA" }, true, grant);
    await finish(a, first.receipt); await a.query("COMMIT");
    for (const vin of [" aaa ", "AAA"]) {
      const plan = await update(a, "listings", { id: listingId }, { vin });
      await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("listing_change", [plan]), async receipt => {
        await assertDiagnosticSourceCommand(tx, receipt, "listing_change");
        await tx.listing.update({ where: { id: listingId }, data: { vin } });
      }));
    }
    expect(await anchor(oid)).toMatchObject({ state: "unchanged", firstRecordId: first.rawId });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).vin).toBe("AAA");
  });

  it.each([0, 1])("observed identity ABA on visit %s stays changed and preserves the other first slot", async changedVisit => {
    const a = await connect(); const visits: { oid: string; grant: Row; rawId: string }[] = [];
    for (let visit = 0; visit < 2; visit++) {
      const oid = await newOrder(a, { audience: "listing_public", listingId }); const grant = await ownershipGrant(a, oid);
      const first = await observe(a, oid, { method: "vin", vin: "AAA" }, true, grant);
      await finish(a, first.receipt); await a.query("COMMIT"); visits.push({ oid, grant, rawId: first.rawId });
    }
    const changed = present(visits[changedVisit]);
    for (const vin of ["BBB", "AAA"]) {
      const later = await observe(a, changed.oid, { method: "vin", vin }, true, changed.grant);
      await finish(a, later.receipt); await a.query("COMMIT");
    }
    const other = present(visits[1-changedVisit]);
    expect(await anchor(changed.oid)).toMatchObject({ state: "changed", firstRecordId: changed.rawId });
    expect(await anchor(other.oid)).toMatchObject({ state: "unchanged", firstRecordId: other.rawId });
  });

  it("identity provenance leases stay ordinary while material transitions remain guarded", async () => {
    const a = await connect(); const id = randomUUID();
    const next = await projection(a, "diagnostic_identity_provenance", { id, orderId: baseOrder["id"], contentType: "image/jpeg", declaredSizeBytes: 1,
      rightsUntil: "2030-01-01T00:00:00", state: "staged", epoch: randomUUID(), cleanupAttempts: 0, createdAt: "2026-10-24T00:00:00" });
    const plan: Plan = { table: "diagnostic_identity_provenance", key: { id }, verb: "insert", expected: "absent", next };
    await begin(a); const receipt = await prepare(a, command("identity_material_change", [plan]));
    await a.query("INSERT INTO diagnostic_identity_provenance SELECT (jsonb_populate_record(NULL::diagnostic_identity_provenance,$1::jsonb)).*", [JSON.stringify(next)]);
    await finish(a, receipt); await a.query("COMMIT");
    await begin(a);
    await a.query(`UPDATE diagnostic_identity_provenance SET "writeLeaseUntil"=clock_timestamp()+interval '1 minute',"cleanupAttempts"=1 WHERE id=$1`, [id]);
    const locks = await a.query("SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND relation='diagnostic_continuity_proofs'::regclass AND mode='RowExclusiveLock'");
    expect(locks.rowCount).toBe(0); await a.query("COMMIT");
    expect((await source(a, "diagnostic_identity_provenance", { id }))["cleanupAttempts"]).toBe(1);
    await expect(a.query("UPDATE diagnostic_identity_provenance SET state='verified' WHERE id=$1", [id])).rejects.toThrow("diagnostic_source_unprepared");
  });

  it.each([false, true])("a new OWNER edge after discovery aborts the opposing absent-member command, reversed=%s", async reverse => {
    const a = await connect(), b = await connect(), observer = await connect();
    const business = randomUUID(), foreign = randomUUID();
    await pool.query(`INSERT INTO dealerships(id,slug,name,status,"updatedAt") VALUES($1,$1,'kernel','active',clock_timestamp())`, [business]);
    await pool.query('INSERT INTO users(id,"updatedAt") VALUES($1,clock_timestamp())', [foreign]);
    const subjects = reverse ? [foreign, userId] : [userId, foreign];
    const plans: Plan[] = subjects.map(uid => {
      const id = randomUUID(); return { table: "dealership_members", key: { id }, verb: "insert", expected: "absent",
        next: { id, userId: uid, dealershipId: business, role: "owner", status: "active" } };
    });
    const firstPlan = present(plans[0]), secondPlan = present(plans[1]);
    await begin(a); const first = await prepare(a, command("member_create", [firstPlan]));
    await begin(b); const pending = prepare(b, command("member_create", [secondPlan]));
    const outcome = pending.then(() => "unexpected success", error => (error as Error).message);
    await waitBlocked(observer, b, a);
    await a.query(`INSERT INTO dealership_members(id,"userId","dealershipId",role) VALUES($1,$2,$3,'owner')`, [firstPlan.key["id"], present(firstPlan.next)["userId"], business]);
    await finish(a, first); await a.query("COMMIT");
    expect(await outcome).toContain("diagnostic_source_graph_changed"); await b.query("ROLLBACK");
    expect((await pool.query('SELECT id FROM dealership_members WHERE "dealershipId"=$1', [business])).rows).toEqual([{ id: firstPlan.key["id"] }]);
  });

  it("same resource hashes in disjoint source classes and campaign key space cannot alias", async () => {
    const a = await connect(), b = await connect();
    const plan = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
    await begin(a); const receipt = await prepare(a, command("account_restore", [plan], [
      { table: "users", key: { id: userId } }, { table: "listings", key: { id: userId } },
    ]));
    const physical = present((await a.query<{ key: number }>("SELECT hashtext(jsonb_build_array('pk',jsonb_build_object('id',$1::text))::text) AS key", [userId])).rows[0]).key;
    const keys = present((await a.query<{ keys: { namespace: number; key: number }[] }>("SELECT lock_keys AS keys FROM diagnostic_source_commands WHERE id=$1", [receipt])).rows[0]).keys;
    expect(keys).toEqual(expect.arrayContaining([{ namespace: 897100, key: physical }, { namespace: 897400, key: physical }]));
    await begin(b);
    const result = await b.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock((897100::bigint<<32)|($1::bigint & 4294967295)) AS locked", [physical]);
    expect(present(result.rows[0]).locked).toBe(true);
    await b.query("ROLLBACK"); await finish(a, receipt); await a.query("COMMIT");
  });

  it("a preheld persisted campaign namespace lock refuses source preparation", async () => {
    const a = await connect(); const ns = `cf_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`CREATE SCHEMA "${ns}"`);
    try {
      const plan = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
      await begin(a); await a.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [ns]);
      await expect(prepare(a, command("account_restore", [plan]))).rejects.toThrow("diagnostic_source_preheld_lock");
      await a.query("ROLLBACK");
    } finally { await pool.query(`DROP SCHEMA "${ns}"`); }
  });

  it("an uncovered User-to-Session FK cascade refuses atomically and preserves foreign rows", async () => {
    const a = await connect(); const foreign = randomUUID(), foreignSession = randomUUID();
    await prisma.user.create({ data: { id: foreign } });
    await prisma.session.create({ data: { id: foreignSession, userId: foreign, refreshTokenHash: foreignSession, expiresAt: new Date(Date.now()+600_000) } });
    const plan = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
    const c = sourceCommand("account_restore", [plan]);
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, c, async receipt => {
      await assertDiagnosticSourceCommand(tx, receipt, "account_restore");
      await tx.user.delete({ where: { id: foreign } });
    }))).rejects.toThrow("diagnostic_source_uncovered_effect");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: foreign } })).id).toBe(foreign);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: foreignSession } })).userId).toBe(foreign);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletionScheduledAt).toBeNull();
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).sellerId).toBe(userId);
  });

  const identityFields = ["vin", "brandId", "modelId", "year", "sellerId", "businessId", "commissionerId", "listingId", "audience", "observedVehicle"] as const;
  const abaCases = [0, 1].flatMap(visit => ["pending", "captured"].flatMap(phase => identityFields.map(field => ({ visit, phase, field }))));
  it.each(abaCases)("visit $visit $phase $field ABA remains sticky while the other visit and raw facts survive", async ({ visit, phase, field }) => {
    const a = await connect();
    const originalListing = listingId;
    const persisted = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    // Only unrelated catalogue/actor/business fixture rows are preactivation.
    const foreignUser = randomUUID(), foreignBrand = randomUUID(), foreignModel = randomUUID(), business = randomUUID();
    await prisma.user.create({ data: { id: foreignUser } });
    await prisma.brand.create({ data: { id: foreignBrand, slug: foreignBrand, nameRu: "alternate", nameTk: "alternate", nameEn: "alternate" } });
    await prisma.model.create({ data: { id: foreignModel, brandId: foreignBrand, slug: foreignModel, nameRu: "alternate", nameTk: "alternate", nameEn: "alternate" } });
    await prisma.dealership.create({ data: { id: business, slug: business, name: "Synthetic alternate", status: "active" } });
    const visits: { id: string; listing: string; raw: string | null; grant: Row | null }[] = [];
    for (let index = 0; index < 2; index++) {
      listingId = randomUUID();
      const next = { ...await source(a, "listings", { id: originalListing }), id: listingId };
      const plan: Plan = { table: "listings", key: { id: listingId }, verb: "insert", expected: "absent", next };
      await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("listing_create", [plan]), async receipt => {
        await assertDiagnosticSourceCommand(tx, receipt, "listing_create");
        await tx.listing.create({ data: { id: listingId, sellerId: userId, brandId, modelId, cityId: persisted.cityId, priceAmount: 1, vin: "AAA", status: persisted.status } });
      }));
      const id = await newOrder(a, { audience: "listing_public", listingId });
      const grant = await ownershipGrant(a, id);
      let raw: string | null = null;
      if (phase === "captured") {
        const first = await observe(a, id, { method: "vin", vin: "AAA" }, true, grant);
        await finish(a, first.receipt); await a.query("COMMIT"); raw = first.rawId;
      }
      visits.push({ id, listing: listingId, raw, grant });
    }
    const changed = present(visits[visit]), other = present(visits[1-visit]);
    const beforeOther = await anchor(other.id);
    const beforeRaw = await prisma.diagnosticIdentityRecord.findMany({ where: { orderId: { in: visits.map(v => v.id) } }, orderBy: { id: "asc" } });
    const orderField = ["commissionerId", "listingId", "audience", "observedVehicle"].includes(field);
    const table = orderField ? "inspection_orders" : "listings";
    const id = orderField ? changed.id : changed.listing;
    const prior = await source(a, table, { id });
    const alternate: Row = { vin: "BBB", brandId: foreignBrand, modelId: foreignModel, year: 2025, sellerId: foreignUser, businessId: business,
      commissionerId: null, listingId: originalListing, audience: "buyer_private", observedVehicle: { method: "vin", vin: "BBB" } };
    for (const value of [alternate[field], prior[field]]) {
      const plan = await update(a, table, { id }, { [field]: value });
      await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand(orderField ? "order_change" : "listing_change", [plan]), async receipt => {
        await assertDiagnosticSourceCommand(tx, receipt, orderField ? "order_change" : "listing_change");
        // A JSON-populated column preserves the real SQL type, including NULL,
        // enum and jsonb; this is actual DML under the final enabled row guard.
        await tx.$executeRawUnsafe(`UPDATE public."${table}" SET "${field}"=(jsonb_populate_record(NULL::public."${table}",$1::jsonb))."${field}" WHERE id=$2`, JSON.stringify({ [field]: value }), id);
      }));
    }
    expect(await anchor(changed.id)).toMatchObject({ state: "changed", firstRecordId: changed.raw });
    expect(await anchor(other.id)).toEqual(beforeOther);
    expect(await prisma.diagnosticIdentityRecord.findMany({ where: { orderId: { in: visits.map(v => v.id) } }, orderBy: { id: "asc" } })).toEqual(beforeRaw);
    if (phase === "pending") {
      const first = await observe(a, changed.id, { method: "vin", vin: "AAA" }, true, changed.grant);
      await finish(a, first.receipt); await a.query("COMMIT");
      expect(await anchor(changed.id)).toMatchObject({ state: "changed", firstRecordId: first.rawId });
    }
  });

  it.each([0, 1])("membership deletion/recreation before visit %s capture never restores the pending identity", async visit => {
    const a = await connect(), business = randomUUID(), member = randomUUID();
    await prisma.dealership.create({ data: { id: business, slug: business, name: "Synthetic membership", status: "active" } });
    const next = { id: member, userId, dealershipId: business, role: "owner", status: "active" } as const;
    const insert: Plan = { table: "dealership_members", key: { id: member }, verb: "insert", expected: "absent", next };
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("member_create", [insert]), async () => {
      await tx.dealershipMember.create({ data: { id: member, userId, dealershipId: business, role: "owner" } });
    }));
    const listing = await update(a, "listings", { id: listingId }, { businessId: business });
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("listing_change", [listing]), async () => {
      await tx.listing.update({ where: { id: listingId }, data: { businessId: business } });
    }));
    const visits = [await newOrder(a, { listingId, audience: "listing_public" }), await newOrder(a, { listingId, audience: "listing_public" })];
    const id = present(visits[visit]);
    const prior = await source(a, "dealership_members", { id: member });
    const remove: Plan = { table: "dealership_members", key: { id: member }, verb: "delete", expected: { source: prior }, next: null };
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("member_remove", [remove]), async () => {
      await tx.dealershipMember.delete({ where: { id: member } });
    }));
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("member_create", [insert]), async () => {
      await tx.dealershipMember.create({ data: { id: member, userId, dealershipId: business, role: "owner" } });
    }));
    expect(await prisma.dealershipMember.findUniqueOrThrow({ where: { id: member } })).toMatchObject(next);
    expect(await anchor(id)).toMatchObject({ state: "changed", firstRecordId: null });
    for (const oid of visits) expect(await anchor(oid)).toMatchObject({ state: "changed", firstRecordId: null });
  });

  it.each(["listing", "order"])("a missing NEW %s physical key serializes opposing INSERTs and preserves the winning graph", async kind => {
    const a = await connect(), b = await connect(), observer = await connect();
    const id = randomUUID();
    const row = kind === "order" ? { ...await cloneOrder(a), key: { id } } : {
      table: "listings", key: { id }, verb: "insert", expected: "absent", next: { ...await source(a, "listings", { id: listingId }), id },
    };
    row.next = { ...present(row.next), id };
    const c = sourceCommand(kind === "order" ? "order_create" : "listing_create", [row]);
    await begin(a); const receipt = await prepare(a, c);
    await begin(b); const pending = prepare(b, c).then(() => "unexpected success", (error: Error) => error.message);
    await waitBlocked(observer, b, a);
    if (kind === "order") await insertOrder(a, row);
    else {
      const original = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
      await a.query('INSERT INTO listings(id,"sellerId","brandId","modelId","cityId","priceAmount",vin,"updatedAt") VALUES($1,$2,$3,$4,$5,1,\'AAA\',clock_timestamp())', [id, userId, brandId, modelId, original.cityId]);
    }
    await finish(a, receipt); await a.query("COMMIT");
    expect(await pending).toMatch(/diagnostic_source_(graph_changed|expected_absent)/); await b.query("ROLLBACK");
    expect(await source(a, kind === "order" ? "inspection_orders" : "listings", { id })).toEqual(row.next);
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("an overlimit closure refuses before source mutation and leaves the entire persisted graph intact", async () => {
    const a = await connect();
    // Catalogue and ordinary Session creation are genuine preactivation fixtures.
    // The tested scheduling operation runs with every source guard enabled.
    await prisma.session.createMany({ data: Array.from({ length: 1001 }, () => {
      const id = randomUUID(); return { id, userId, refreshTokenHash: id, expiresAt: new Date(Date.now()+600_000) };
    }) });
    const before = await prisma.session.findMany({ where: { userId }, orderBy: { id: "asc" } });
    const plan = await update(a, "users", { id: userId }, { deletionScheduledAt: "2030-01-01T00:00:00" });
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("account_schedule", [plan]), async () => {
      throw new Error("an overlimit command must never enter its writes");
    }))).rejects.toThrow("diagnostic_source_scope_limit");
    expect(await prisma.session.findMany({ where: { userId }, orderBy: { id: "asc" } })).toEqual(before);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletionScheduledAt).toBeNull();
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["pending", "unavailable"])("a sealed anchor cannot regress to %s through a valid unrelated receipt", async state => {
    const a = await connect(), oid = await newOrder(a, { audience: "listing_public", listingId });
    const grant = await ownershipGrant(a, oid);
    const first = await observe(a, oid, { method: "vin", vin: "AAA" }, true, grant);
    await finish(a, first.receipt); await a.query("COMMIT");
    const before = await anchor(oid);
    const plan = await update(a, "inspection_orders", { id: oid }, {});
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("order_change", [plan]), async receipt => {
      await assertDiagnosticSourceCommand(tx, receipt, "order_change");
      await tx.diagnosticSourceAnchor.update({ where: { orderId: oid }, data: { state } });
    }))).rejects.toThrow("diagnostic_source_anchor_immutable");
    expect(await anchor(oid)).toEqual(before);
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["raw", "request", "grant"].flatMap(edge => [false, true].map(writerFirst => ({ edge, writerFirst }))))("NEW $edge graph edge respects discovery/locking with writerFirst=$writerFirst", async ({ edge, writerFirst }) => {
    const a = await connect(), observer = await connect();
    const oid = await newOrder(a, { audience: "listing_public", listingId });
    const vehicle = { method: "vin", vin: "AAA", observedAt: new Date().toISOString(), mileageKm: 101, manualReference: null };
    const observation = await observationPlans(a, oid, vehicle);
    const requestId = randomUUID();
    const request = await projection(a, "diagnostic_continuity_requests", { id: requestId, createdAt: new Date(), actorId: userId, sessionId, orderId: oid, kind: "issue" });
    const grant = await grantFixture(a, oid);
    const writerCommand = edge === "grant" ? grant.c : sourceCommand(edge === "raw" ? "observation_append" : "proof_issue", edge === "raw" ? observation.plans : [
      { table: "diagnostic_continuity_requests", key: { id: requestId }, verb: "insert", expected: "absent", next: request },
    ]);
    const readerCommand = sourceCommand("account_restore", [await update(a, "users", { id: userId }, { deletionScheduledAt: null })]);
    let firstPid = 0, secondPid = 0;
    let entered: () => void = () => { throw new Error("missing prepared barrier"); };
    let release: () => void = () => { throw new Error("missing release barrier"); };
    let started: () => void = () => { throw new Error("missing second backend"); };
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const secondReady = new Promise<void>(resolve => { started = resolve; });
    async function work(tx: Prisma.TransactionClient, receipt: PreparedDiagnosticSource, writer: boolean) {
      await assertDiagnosticSourceCommand(tx, receipt, writer ? writerCommand.operation : readerCommand.operation);
      if (!writer) return;
      if (edge === "grant") {
        await grant.create(tx, receipt);
      } else if (edge === "request") {
        await tx.$executeRaw`INSERT INTO diagnostic_continuity_requests SELECT (jsonb_populate_record(NULL::diagnostic_continuity_requests,${JSON.stringify(request)}::jsonb)).*`;
      } else {
        const order = present(present(observation.plans[0]).next);
        await tx.inspectionOrder.update({ where: { id: oid }, data: { observedVehicle: vehicle, version: Number(order["version"]), updatedAt: new Date(String(order["updatedAt"])+"Z") } });
        await tx.$executeRaw`INSERT INTO diagnostic_identity_records SELECT (jsonb_populate_record(NULL::diagnostic_identity_records,${JSON.stringify(observation.raw)}::jsonb)).*`;
        await tx.$executeRaw`INSERT INTO diagnostic_ownership_components SELECT (jsonb_populate_record(NULL::diagnostic_ownership_components,${JSON.stringify(observation.component)}::jsonb)).*`;
        await sealDiagnosticFirstObservation(tx, receipt, oid, observation.rawId);
      }
    }
    const first = prisma.$transaction(async tx => {
      firstPid = present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid;
      await withDiagnosticSourceCommand(tx, writerFirst ? writerCommand : readerCommand, async receipt => {
        entered(); await hold; await work(tx, receipt, writerFirst);
      });
    });
    await ready;
    const second = prisma.$transaction(async tx => {
      secondPid = present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid;
      started();
      await withDiagnosticSourceCommand(tx, writerFirst ? readerCommand : writerCommand, receipt => work(tx, receipt, !writerFirst));
    }).then(() => null, (error: unknown) => error);
    await secondReady;
    try {
      // A fresh observer sees the actual backend wait, not a timer or a fake lock.
      const deadline = Date.now()+5000; let blocked = false;
      while (Date.now()<deadline) {
        const result = await observer.query<{ blocked: boolean }>("SELECT $2::int=ANY(pg_blocking_pids($1::int)) blocked", [secondPid, firstPid]);
        if (present(result.rows[0]).blocked) { blocked = true; break; }
      }
      expect(blocked).toBe(true);
    } finally { release(); }
    await first; const result = await second;
    if (writerFirst) { expect(result).toBeInstanceOf(Error); expect((result as Error).message).toContain("diagnostic_source_graph_changed"); }
    else expect(result).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletionScheduledAt).toBeNull();
    if (edge === "raw") {
      expect(await anchor(oid)).toMatchObject({ state: "unavailable", firstRecordId: observation.rawId });
      expect(await prisma.diagnosticIdentityRecord.findMany({ where: { orderId: oid } })).toHaveLength(1);
    } else if (edge === "grant") expect(await prisma.diagnosticOwnershipGrant.findUniqueOrThrow({ where: { id: String(grant.grant["id"]) } })).toMatchObject({ grantorId: userId, sessionId, orderId: oid });
    else expect(await prisma.diagnosticContinuityRequest.findUniqueOrThrow({ where: { id: requestId } })).toMatchObject({ actorId: userId, sessionId, orderId: oid });
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["component", "seal"] as const)("a genuine grant expiring before %s cannot leave an available first witness", async boundary => {
    const a = await connect(), observer = await connect();
    const oid = await newOrder(a, { audience: "listing_public", listingId });
    const until = new Date(Date.now()+2000).toISOString();
    const grant = await ownershipGrant(a, oid, until);
    const vehicle = { method: "vin", vin: "AAA", observedAt: new Date().toISOString(), mileageKm: 100, manualReference: null };
    const beforeOrder = await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: oid } });
    let pending: Awaited<ReturnType<typeof observe>> | null = null;
    if (boundary === "seal") pending = await observe(a, oid, vehicle, false, grant);
    const deadline = Date.now()+5000; let expired = false;
    while (Date.now()<deadline) {
      const result = await observer.query<{ expired: boolean }>("SELECT clock_timestamp()>=$1::timestamptz expired", [until]);
      if (present(result.rows[0]).expired) { expired = true; break; }
    }
    expect(expired).toBe(true);
    if (boundary === "component") {
      await expect(observe(a, oid, vehicle, true, grant)).rejects.toThrow("diagnostic_ownership_grant_binding");
      await a.query("ROLLBACK");
      expect(await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: oid } })).toEqual(beforeOrder);
      expect(await prisma.diagnosticIdentityRecord.count({ where: { orderId: oid } })).toBe(0);
      expect(await anchor(oid)).toMatchObject({ state: "pending", firstRecordId: null });
    } else {
      const captured = present(pending);
      await a.query("SELECT diagnostic_seal_first_observation($1::uuid,$2,$3)", [captured.receipt, oid, captured.rawId]);
      await finish(a, captured.receipt); await a.query("COMMIT");
      expect(await anchor(oid)).toMatchObject({ state: "unavailable", firstRecordId: captured.rawId });
      expect(await prisma.diagnosticIdentityRecord.count({ where: { orderId: oid } })).toBe(1);
    }
    const result = await observer.query<{ current: boolean }>("SELECT diagnostic_ownership_grant_current(g,clock_timestamp() AT TIME ZONE 'UTC') current FROM diagnostic_ownership_grants g WHERE id=$1", [grant["id"]]);
    expect(present(result.rows[0]).current).toBe(false);
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["foreign", "expired"])("a %s Session cannot turn a source receipt into seller permission", async kind => {
    const a = await connect(), foreign = randomUUID(), otherSession = randomUUID();
    await prisma.user.create({ data: { id: foreign, email: `${foreign}@kernel.invalid`, emailVerifiedAt: new Date() } });
    await prisma.session.create({ data: { id: otherSession, userId: kind === "foreign" ? foreign : userId, refreshTokenHash: otherSession,
      expiresAt: new Date(Date.now() + (kind === "foreign" ? 600_000 : -600_000)) } });
    const oid = await newOrder(a, { audience: "listing_public", listingId });
    const before = await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: oid } });
    await expect(ownershipGrant(a, oid, new Date(Date.now()+600_000).toISOString(), userId, otherSession)).rejects.toThrow("diagnostic_ownership_grant_source");
    expect(await prisma.diagnosticOwnershipGrant.count({ where: { orderId: oid } })).toBe(0);
    expect(await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: oid } })).toEqual(before);
    expect(await anchor(oid)).toMatchObject({ state: "pending", firstRecordId: null });
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["finish", "delete"] as const)("%s completes actual Listing cascades/SET NULL effects while foreign records survive", async mode => {
    const a = await connect(), foreign = randomUUID();
    await prisma.user.create({ data: { id: foreign } });
    const favorite = await prisma.favorite.create({ data: { userId: foreign, listingId } });
    const media = await prisma.listingMedia.create({ data: { listingId, kind: "image", key: `foreign-owned-reference/${randomUUID()}`, sortOrder: 0 } });
    const conversation = await prisma.conversation.create({ data: { listingId, buyerId: foreign, sellerId: userId } });
    const participant = await prisma.conversationParticipant.create({ data: { conversationId: conversation.id, userId: foreign } });
    const message = await prisma.message.create({ data: { conversationId: conversation.id, senderId: foreign, kind: "text", body: "Scoped cascade fixture" } });
    const support = await prisma.supportCase.create({ data: { customerId: foreign, sourceListingId: listingId } });
    const history = await prisma.vehicleHistoryRequest.create({ data: { customerId: foreign, sourceListingId: listingId, proposedVin: "FOREIGN-RETAINED" } });
    const oid = await newOrder(a, { audience: "listing_public", listingId });
    const grant = await ownershipGrant(a,oid);
    const capture = await observe(a,oid,{ method: "vin", vin: "AAA" },true,grant);
    await finish(a,capture.receipt); await a.query("COMMIT");
    const interest = await prisma.inspectionInterest.create({ data: { listingId, requesterUserId: foreign, side: "buyer" } });
    const listingData = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    const foreignListingId = randomUUID();
    const foreignListing = await prisma.$transaction(async tx => withDiagnosticSourceCommand(tx,sourceCommand("listing_create",[{
      table: "listings", key: { id: foreignListingId }, verb: "insert", expected: "absent",
      next: await projection(a,"listings",{ ...listingData,id: foreignListingId }),
    }]),() => tx.listing.create({ data: { ...listingData,id: foreignListingId,publicNumber: undefined } })));
    const foreignOrderId = await newOrder(a,{ audience: "listing_public", listingId: foreignListing.id });
    const foreignOrder = await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: foreignOrderId } });
    const foreignInterest = await prisma.inspectionInterest.create({ data: { listingId: foreignListing.id, requesterUserId: foreign, side: "buyer" } });
    const orderBefore = await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: oid } });
    const rawBefore = await prisma.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: capture.rawId } });
    const anchorBefore = await anchor(oid);
    const foreignBefore = await prisma.user.findUniqueOrThrow({ where: { id: foreign } });
    const before = await source(a, "listings", { id: listingId });
    const c = sourceCommand("listing_delete", [{ table: "listings", key: { id: listingId }, verb: "delete", expected: { source: before }, next: null }]);
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, c, async receipt => {
      await assertDiagnosticSourceCommand(tx, receipt, "listing_delete");
      await tx.listing.delete({ where: { id: listingId } });
      throw new Error("Listing cascade rollback sentinel");
    }))).rejects.toThrow("Listing cascade rollback sentinel");
    expect(await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: oid } })).toEqual(orderBefore);
    expect(await prisma.inspectionInterest.findUniqueOrThrow({ where: { id: interest.id } })).toEqual(interest);
    expect(await anchor(oid)).toEqual(anchorBefore);
    expect(await prisma.favorite.findUniqueOrThrow({ where: { id: favorite.id } })).toEqual(favorite);
    expect(await prisma.listingMedia.findUniqueOrThrow({ where: { id: media.id } })).toEqual(media);
    expect(await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).toEqual(message);
    expect(await prisma.supportCase.findUniqueOrThrow({ where: { id: support.id } })).toEqual(support);
    expect(await prisma.vehicleHistoryRequest.findUniqueOrThrow({ where: { id: history.id } })).toEqual(history);
    async function assertDeletionUnion(tx: Prisma.TransactionClient, receiptId: string) {
      const [receipt] = await tx.$queryRaw<{ scope: { table: string; key: Row }[]; effects: Row[]; lock_keys: { namespace: number; key: number }[] }[]>`SELECT scope,effects,lock_keys FROM diagnostic_source_commands WHERE id=${receiptId}::uuid`;
      expect(present(receipt).effects).toEqual(expect.arrayContaining([
        expect.objectContaining({ table: "inspection_orders", key: { id: oid }, verb: "update", derived: "purge", next: expect.objectContaining({ listingId: null }) }),
        expect.objectContaining({ table: "inspection_interests", key: { id: interest.id }, verb: "delete", expected: { source: expect.objectContaining({ id: interest.id, listing_id: listingId, requester_user_id: foreign, side: "buyer", willingness_to_pay_tmt: null }) } }),
      ]));
      // Preparation already owns dependency keys and rows, before the FK writes.
      for (const [table,key] of [["inspection_orders",{ id: oid }],["inspection_interests",{ id: interest.id }],["diagnostic_source_anchors",{ orderId: oid }]] as const) {
        expect(present(receipt).scope).toContainEqual(expect.objectContaining({ table,key }));
        const [held] = await tx.$queryRaw<{ held: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=pg_backend_pid() AND l.locktype='advisory' AND l.granted AND l.classid=(diagnostic_source_meta(${table})->>'namespace')::oid) held`;
        expect(present(held).held).toBe(true);
      }
    }
    await prisma.$transaction(async tx => {
      // Direct DELETE and exported finish use the same completion triggers. The
      // direct form is deliberately followed by no wrapper finish a second time.
      if (mode === "delete") {
        const [receipt] = await tx.$queryRaw<{ id: string }[]>`SELECT diagnostic_prepare_source(${JSON.stringify(c)}::jsonb)::text id`;
        await assertDeletionUnion(tx,present(receipt).id);
        await tx.listing.delete({ where: { id: listingId } });
        await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${present(receipt).id}::uuid`;
      } else await withDiagnosticSourceCommand(tx, c, async receipt => {
        await assertDeletionUnion(tx,receipt.receiptId);
        await tx.listing.delete({ where: { id: listingId } });
      });
    });
    expect(await prisma.listing.findUnique({ where: { id: listingId } })).toBeNull();
    expect(await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: oid } })).toEqual({ ...orderBefore,listingId: null });
    expect(await prisma.inspectionInterest.findUnique({ where: { id: interest.id } })).toBeNull();
    expect(await anchor(oid)).toEqual({ ...anchorBefore,state: "changed" });
    expect(await prisma.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: capture.rawId } })).toEqual(rawBefore);
    expect(await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: foreignOrder.id } })).toEqual(foreignOrder);
    expect(await prisma.inspectionInterest.findUniqueOrThrow({ where: { id: foreignInterest.id } })).toEqual(foreignInterest);
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: foreignListing.id } })).toEqual(foreignListing);
    expect(await prisma.favorite.findUnique({ where: { id: favorite.id } })).toBeNull();
    expect(await prisma.listingMedia.findUnique({ where: { id: media.id } })).toBeNull();
    expect(await prisma.conversation.findUnique({ where: { id: conversation.id } })).toBeNull();
    expect(await prisma.conversationParticipant.findUnique({ where: { id: participant.id } })).toBeNull();
    expect(await prisma.message.findUnique({ where: { id: message.id } })).toBeNull();
    expect(await prisma.supportCase.findUniqueOrThrow({ where: { id: support.id } })).toEqual({ ...support, sourceListingId: null });
    expect(await prisma.vehicleHistoryRequest.findUniqueOrThrow({ where: { id: history.id } })).toEqual({ ...history, sourceListingId: null });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: foreign } })).toEqual(foreignBefore);
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("a later BEFORE mutator cannot use a guard's reserved name as an exemption", async () => {
    const a = await connect();
    const [original] = (await pool.query<{ ddl: string }>("SELECT pg_get_triggerdef(oid) ddl FROM pg_trigger WHERE tgrelid='users'::regclass AND tgname='zz_diagnostic_source_target'")).rows;
    await pool.query("CREATE FUNCTION kernel_late_mutator() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.role:='admin'; RETURN NEW; END $$");
    await pool.query("DROP TRIGGER zz_diagnostic_source_target ON users");
    await pool.query("CREATE TRIGGER zz_diagnostic_source_target BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION kernel_late_mutator()");
    try {
      const plan = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
      await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("account_restore", [plan]), async () => {
        throw new Error("untrusted final mutator must refuse before writes");
      }))).rejects.toThrow("diagnostic_source_dormant");
    } finally {
      await pool.query("DROP TRIGGER zz_diagnostic_source_target ON users");
      await pool.query(present(original).ddl);
      await pool.query("DROP FUNCTION kernel_late_mutator()");
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).role).toBe("user");
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["pending", "captured"] as const)("current OWNER consent covers BOTH %s visits; eligibility restoration cannot undo member recreation", async phase => {
    const a = await connect(), business = randomUUID(), member = randomUUID();
    const outsider = randomUUID(), outsiderSession = randomUUID(), outsiderMember = randomUUID();
    await prisma.dealership.create({ data: { id: business, slug: business, name: "Explicit synthetic business", status: "active" } });
    await prisma.user.create({ data: { id: outsider, email: `${outsider}@owner.invalid`, emailVerifiedAt: new Date() } });
    await prisma.session.create({ data: { id: outsiderSession, userId: outsider, refreshTokenHash: outsiderSession, expiresAt: new Date(Date.now()+600_000) } });
    for (const [id, uid, role] of [[member, userId, "owner"], [outsiderMember, outsider, "sales"]] as const) {
      const next = { id, userId: uid, dealershipId: business, role, status: "active" };
      await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("member_create", [{ table: "dealership_members", key: { id }, verb: "insert", expected: "absent", next }]), async () => {
        await tx.dealershipMember.create({ data: { id, userId: uid, dealershipId: business, role } });
      }));
    }
    const listing = await update(a, "listings", { id: listingId }, { businessId: business });
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("listing_change", [listing]), () => tx.listing.update({ where: { id: listingId }, data: { businessId: business } })));
    const visits = [await newOrder(a, { audience: "listing_public", listingId }), await newOrder(a, { audience: "listing_public", listingId })];
    await expect(ownershipGrant(a, present(visits[0]), new Date(Date.now()+600_000).toISOString(), outsider, outsiderSession)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await prisma.diagnosticOwnershipGrant.count({ where: { orderId: { in: visits } } })).toBe(0);
    const grants: Row[] = [], rawIds: (string | null)[] = [];
    for (const oid of visits) {
      const grant = await ownershipGrant(a, oid); grants.push(grant);
      expect(grant).toMatchObject({ grantorId: userId, grantorMembershipId: member, membershipId: member, businessId: business });
      if (phase === "captured") {
        const captured = await observe(a, oid, { method: "vin", vin: "AAA" }, true, grant);
        await finish(a, captured.receipt); await a.query("COMMIT"); rawIds.push(captured.rawId);
      } else rawIds.push(null);
    }
    const beforeRaw = await prisma.diagnosticIdentityRecord.findMany({ where: { orderId: { in: visits } }, orderBy: { id: "asc" } });
    for (const status of ["suspended", "active"]) {
      const plan = await update(a, "dealership_members", { id: member }, { status });
      await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("member_eligibility", [plan]), () => tx.dealershipMember.update({ where: { id: member }, data: { status } })));
      for (let i=0; i<visits.length; i++) {
        expect(await anchor(present(visits[i]))).toMatchObject({ state: phase === "captured" ? "unchanged" : "pending", firstRecordId: rawIds[i], source: { memberId: member } });
        const [current] = (await pool.query<{ current: boolean }>("SELECT diagnostic_ownership_grant_current(g,clock_timestamp() AT TIME ZONE 'UTC') current FROM diagnostic_ownership_grants g WHERE id=$1",[present(grants[i])["id"]])).rows;
        expect(present(current).current).toBe(status === "active");
      }
    }
    for (const role of ["sales", "owner"] as const) {
      const plan = await update(a, "dealership_members", { id: member }, { role });
      await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("member_eligibility", [plan]), () => tx.dealershipMember.update({ where: { id: member }, data: { role } })));
      for (let i=0; i<visits.length; i++) expect(await anchor(present(visits[i]))).toMatchObject({ state: phase === "captured" ? "unchanged" : "pending", firstRecordId: rawIds[i], source: { memberId: member } });
      for (const grant of grants) {
        const [current] = (await pool.query<{ current: boolean }>("SELECT diagnostic_ownership_grant_current(g,clock_timestamp() AT TIME ZONE 'UTC') current FROM diagnostic_ownership_grants g WHERE id=$1",[grant["id"]])).rows;
        expect(present(current).current).toBe(role === "owner");
      }
    }
    for (let i=0; i<visits.length; i++) expect(await anchor(present(visits[i]))).toMatchObject({ state: phase === "captured" ? "unchanged" : "pending", firstRecordId: rawIds[i] });
    const prior = await source(a, "dealership_members", { id: member });
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("member_remove", [{ table: "dealership_members", key: { id: member }, verb: "delete", expected: { source: prior }, next: null }]), () => tx.dealershipMember.delete({ where: { id: member } })));
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, sourceCommand("member_create", [{ table: "dealership_members", key: { id: member }, verb: "insert", expected: "absent", next: prior }]), () => tx.dealershipMember.create({ data: { id: member, userId, dealershipId: business, role: "owner", status: "active" } })));
    for (let i=0; i<visits.length; i++) {
      const oid = present(visits[i]);
      expect(await anchor(oid)).toMatchObject({ state: "changed", firstRecordId: rawIds[i] });
      if (phase === "pending") {
        const captured = await observe(a, oid, { method: "vin", vin: "AAA" }, true, present(grants[i]));
        await finish(a, captured.receipt); await a.query("COMMIT");
        expect(await anchor(oid)).toMatchObject({ state: "changed", firstRecordId: captured.rawId });
      }
    }
    if (phase === "captured") expect(await prisma.diagnosticIdentityRecord.findMany({ where: { orderId: { in: visits } }, orderBy: { id: "asc" } })).toEqual(beforeRaw);
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("every finite table and incoming FK relation rejects preheld DML locks before preparation", async () => {
    const a = await connect();
    const plan = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
    const tables = (await a.query<{ table: string }>(`SELECT DISTINCT name AS table FROM (
      SELECT value->>'table' name FROM jsonb_array_elements(diagnostic_source_registry())
      UNION SELECT format('%I.%I',n.nspname,cl.relname) FROM pg_constraint fk
      JOIN pg_class cl ON cl.oid=fk.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
      WHERE fk.contype='f' AND fk.confrelid IN
       (SELECT to_regclass('public.'||(value->>'table')) FROM jsonb_array_elements(diagnostic_source_registry()))
    ) relations ORDER BY name`)).rows;
    expect(tables.length).toBeGreaterThanOrEqual(77);
    for (const row of tables) {
      await begin(a);
      await a.query(`LOCK TABLE ${row.table} IN ROW EXCLUSIVE MODE`);
      await expect(prepare(a, command("account_restore", [plan])), row.table).rejects.toThrow("diagnostic_source_preheld_lock");
      await a.query("ROLLBACK");
    }
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({ deletionScheduledAt: null });
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("all 77 physical classes have a total suborder and final guards never add resource locks", async () => {
    const a = await connect();
    const registry = (await a.query<{ registry: { table: string; pk: string[]; rank: number; namespace: number; suborder: number }[] }>("SELECT diagnostic_source_registry() registry")).rows[0];
    const metadata = present(registry).registry;
    expect(metadata).toHaveLength(77);
    expect(new Set(metadata.map(m => m.namespace)).size).toBe(77);
    const roots = metadata.map(m => ({ table: m.table, key: Object.fromEntries(m.pk.map(field => [field, randomUUID()])) }));
    const plan = await update(a, "users", { id: userId }, { deletionScheduledAt: null });
    const c = { ...sourceCommand("account_restore", [plan]), roots: [...roots, { table: "users", key: { id: userId } }] } as DiagnosticSourceCommand;
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, c, async receipt => {
      const [prepared] = await tx.$queryRaw<{ keys: { namespace: number; key: number }[] }[]>`SELECT lock_keys keys FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
      const keys = present(prepared).keys;
      expect(keys).toEqual([...keys].sort((left, right) => left.namespace-right.namespace || left.key-right.key));
      for (const m of metadata) {
        expect(m.suborder).toBe(m.namespace);
        expect(keys.some(k => k.namespace === m.namespace), m.table).toBe(true);
      }
      const locks = () => tx.$queryRaw`SELECT classid::text,objid::text,objsubid,mode FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted ORDER BY classid,objid,objsubid,mode`;
      const before = await locks();
      await assertDiagnosticSourceCommand(tx, receipt, "account_restore");
      await tx.user.update({ where: { id: userId }, data: { deletionScheduledAt: null } });
      expect(await locks()).toEqual(before);
    }));
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("savepoint rollback removes both an uncommitted receipt and its locks; a fresh first command may follow", async () => {
    const a = await connect();
    const c = sourceCommand("account_restore", [await update(a, "users", { id: userId }, { deletionScheduledAt: null })]);
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SAVEPOINT before_source`;
      await expect(withDiagnosticSourceCommand(tx, c, async () => { throw new Error("rollback the whole prepared claim"); })).rejects.toThrow("rollback the whole prepared claim");
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT before_source`;
      expect(await tx.diagnosticSourceCommand.count()).toBe(0);
      const [locks] = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted`;
      expect(present(locks).count).toBe(0n);
      await withDiagnosticSourceCommand(tx, c, receipt => assertDiagnosticSourceCommand(tx, receipt, "account_restore"));
    });
  });

  it.each([false, true])("grant revocation versus first capture serializes the complete retained graph, captureFirst=%s", async captureFirst => {
    const a = await connect(), observer = await connect();
    const oid = await newOrder(a, { audience: "listing_public", listingId });
    const grant = await ownershipGrant(a, oid);
    const observation = await observationPlans(a, oid, { method: "vin", vin: "AAA", observedAt: new Date().toISOString(), mileageKm: 100, manualReference: null }, grant);
    const captured = sourceCommand("observation_append", observation.plans);
    const now = new Date(), oldGrant = await source(a, "diagnostic_ownership_grants", { id: grant["id"] });
    const erased = { ...oldGrant, state: "erased", listingId: null, identityDigest: null, sellerId: null, commissionerId: null, businessId: null,
      membershipId: null, grantorId: null, grantorMembershipId: null, sessionId: null, rights: null, rightsUntil: null, declaredAt: null, erasedAt: now.toISOString() };
    const revoked = { ...sourceCommand("ownership_revoke", [{ table: "diagnostic_ownership_grants", key: { id: grant["id"] }, verb: "update", expected: { source: oldGrant }, next: erased }]), cutoff: now };
    const beforeOrder = await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: oid } });
    let firstPid = 0, secondPid = 0;
    let enter: () => void = () => { throw new Error("missing first grant barrier"); };
    let release: () => void = () => { throw new Error("missing release"); };
    let start: () => void = () => { throw new Error("missing second backend"); };
    const ready = new Promise<void>(resolve => { enter=resolve; }), hold = new Promise<void>(resolve => { release=resolve; }), secondReady = new Promise<void>(resolve => { start=resolve; });
    const first = prisma.$transaction(async tx => {
      firstPid = present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid;
      await withDiagnosticSourceCommand(tx, captureFirst ? captured : revoked, async receipt => {
        await assertDiagnosticSourceCommand(tx, receipt, captureFirst ? "observation_append" : "ownership_revoke");
        enter(); await hold;
        if (!captureFirst) await tx.$queryRaw`SELECT diagnostic_dispose_ownership_scope(NULL::text,${now}::timestamp,${String(grant["id"])}::text)`;
        else {
          await tx.$executeRaw`UPDATE inspection_orders SET "observedVehicle"=${JSON.stringify(observation.raw["observation"])}::jsonb,version=version+1 WHERE id=${oid}`;
          await tx.$executeRaw`INSERT INTO diagnostic_identity_records SELECT (jsonb_populate_record(NULL::diagnostic_identity_records,${JSON.stringify(observation.raw)}::jsonb)).*`;
          await tx.$executeRaw`INSERT INTO diagnostic_ownership_components SELECT (jsonb_populate_record(NULL::diagnostic_ownership_components,${JSON.stringify(observation.component)}::jsonb)).*`;
          await sealDiagnosticFirstObservation(tx, receipt, oid, observation.rawId);
        }
      });
    });
    await ready;
    const second = prisma.$transaction(async tx => {
      secondPid = present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid; start();
      await withDiagnosticSourceCommand(tx, captureFirst ? revoked : captured, async () => { throw new Error("stale graph reached work"); });
    }).then(() => null, (error: unknown) => error);
    await secondReady;
    try {
      const deadline = Date.now()+5000; let waiting = false;
      while (Date.now()<deadline) {
        if (present((await observer.query<{ blocked: boolean }>("SELECT $2::int=ANY(pg_blocking_pids($1::int)) blocked", [secondPid,firstPid])).rows[0]).blocked) { waiting=true; break; }
      }
      expect(waiting).toBe(true);
    } finally { release(); }
    await first; const refused = await second;
    expect(refused).toBeInstanceOf(Error);
    expect((refused as Error).message).toMatch(/diagnostic_source_(graph_changed|stale)/);
    expect(await anchor(oid)).toMatchObject({ state: captureFirst ? "unchanged" : "erased", firstRecordId: captureFirst ? observation.rawId : null });
    expect(await prisma.diagnosticIdentityRecord.count({ where: { orderId: oid } })).toBe(captureFirst ? 1 : 0);
    if (!captureFirst) {
      expect(await prisma.inspectionOrder.findUniqueOrThrow({ where: { id: oid } })).toEqual(beforeOrder);
      expect(await source(a,"diagnostic_ownership_grants",{ id: grant["id"] })).toEqual(await projection(a,"diagnostic_ownership_grants",erased));
    } else expect(await source(a,"diagnostic_ownership_grants",{ id: grant["id"] })).toEqual(oldGrant);
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["recover", "redeem"] as const)("owner %s derives the exact Business and collector-baseline effects before locks", async mode => {
    const a = await connect(), business = randomUUID(), member = randomUUID();
    await prisma.dealership.create({ data: { id: business, slug: business, name: "Synthetic recovery", status: mode === "recover" ? "active" : "recovery" } });
    await prisma.measurementState.upsert({ where: { key: "collector" }, create: { key: "collector", epoch: randomUUID() }, update: {} });
    const collector = await prisma.measurementState.findUniqueOrThrow({ where: { key: "collector" } });
    const baselineKey = `inventory_baseline:${collector.epoch}`;
    await prisma.measurementState.upsert({ where: { key: baselineKey }, create: { key: baselineKey, epoch: collector.epoch }, update: {} });
    const baseline = await prisma.measurementState.findUniqueOrThrow({ where: { key: baselineKey } });
    const priorBusiness = await prisma.dealership.findUniqueOrThrow({ where: { id: business } });
    if (mode === "recover") {
      await guards(false);
      await prisma.dealershipMember.create({ data: { id: member, userId, dealershipId: business, role: "owner", status: "suspended" } });
      await guards(true);
    }
    const next = { id: member, userId, dealershipId: business, role: "owner", status: "active" } as const;
    const row: Plan = mode === "recover" ? { table: "dealership_members", key: { id: member }, verb: "delete", expected: { source: await source(a,"dealership_members",{ id: member }) }, next: null } : {
      table: "dealership_members", key: { id: member }, verb: "insert", expected: "absent", next,
    };
    const c = sourceCommand(mode === "recover" ? "member_replace" : "member_create",[row]);
    const ownerWrites = async (tx: Prisma.TransactionClient) => {
      if (mode === "recover") await tx.dealershipMember.delete({ where: { id: member } });
      else await tx.dealershipMember.create({ data: next });
      await tx.dealership.update({ where: { id: business }, data: { status: mode === "recover" ? "recovery" : "active" } });
      await tx.measurementState.delete({ where: { key: baselineKey } });
    };
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx,c,async receipt => {
      const [row] = await tx.$queryRaw<{ scope: { table: string; key: Row }[] }[]>`SELECT scope FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
      expect(present(row).scope).toContainEqual(expect.objectContaining({ table: "measurement_state", key: { key: baselineKey } }));
      await ownerWrites(tx); throw new Error("owner transition rollback sentinel");
    }))).rejects.toThrow("owner transition rollback sentinel");
    expect(await prisma.dealership.findUniqueOrThrow({ where: { id: business } })).toEqual(priorBusiness);
    expect(await prisma.measurementState.findUniqueOrThrow({ where: { key: baselineKey } })).toEqual(baseline);
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx,c,async () => {
      if (mode === "recover") await tx.dealershipMember.delete({ where: { id: member } }); else await tx.dealershipMember.create({ data: next });
    }))).rejects.toThrow("diagnostic_source_final_effect");
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx,c,() => ownerWrites(tx)));
    expect(await prisma.measurementState.findUnique({ where: { key: baselineKey } })).toBeNull();
    expect(await prisma.measurementState.findUniqueOrThrow({ where: { key: "collector" } })).toEqual(collector);
    expect(await prisma.dealership.findUniqueOrThrow({ where: { id: business } })).toMatchObject({ status: mode === "recover" ? "recovery" : "active" });
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("every selective protected target refuses before an empty scan while dependency-only empty statements remain ordinary", async () => {
    const a = await connect();
    const { rows } = await a.query<{ specs: { table: string; update: string[]; insert: boolean }[] }>("SELECT diagnostic_source_guard_specs() specs");
    for (const spec of present(rows[0]).specs) {
      for (const field of spec.update) await expect(a.query(`UPDATE public."${spec.table}" SET "${field}"="${field}" WHERE false`), `${spec.table}.${field}`).rejects.toThrow("diagnostic_source_unprepared");
      await expect(a.query(`DELETE FROM public."${spec.table}" WHERE false`),spec.table).rejects.toThrow("diagnostic_source_unprepared");
      if (spec.insert) await expect(a.query(`INSERT INTO public."${spec.table}" SELECT * FROM public."${spec.table}" WHERE false`),spec.table).rejects.toThrow("diagnostic_source_unprepared");
    }
    await a.query('UPDATE service_messages SET body=body WHERE false');
    await a.query('UPDATE media_uploads SET "updatedAt"="updatedAt" WHERE false');
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("account scheduling/restoration completes its exact membership, inventory and measurement effects without reviving erased authority", async () => {
    const a = await connect(), business = randomUUID(), member = randomUUID(), invitation = randomUUID();
    const principal = randomUUID(), guest = randomUUID(), linked = randomUUID(), unlinked = randomUUID(), record = randomUUID();
    const collectorEpoch = randomUUID(), baselineKey = `inventory_baseline:${collectorEpoch}`;
    await guards(false);
    await prisma.dealership.create({ data: { id: business, slug: business, name: "Synthetic scheduled owner", status: "active" } });
    await prisma.dealershipMember.create({ data: { id: member, userId, dealershipId: business, role: "owner" } });
    await prisma.dealershipInvitation.create({ data: { id: invitation, dealershipId: business, recipientUserId: userId, role: "sales", tokenHash: randomUUID(), expiresAt: new Date("2030-01-01Z") } });
    await prisma.staffGrant.create({ data: { userId, capability: "support.operations" } });
    const publishedAt = new Date("2020-01-01Z");
    await prisma.listing.update({ where: { id: listingId }, data: { status: "active", publishedAt } });
    await prisma.measurementState.upsert({ where: { key: "collector" }, create: { key: "collector", epoch: collectorEpoch }, update: { epoch: collectorEpoch } });
    await prisma.measurementState.create({ data: { key: baselineKey, epoch: collectorEpoch } });
    for (const [id, uid, kind] of [[principal,userId,"account"],[guest,null,"guest"]] as const) await prisma.measurementPrincipal.create({ data: { id, userId: uid, kind, pseudonym: id, generation: id, epoch: collectorEpoch } });
    for (const [id, linkedAccountId] of [[linked,principal],[unlinked,null]] as const) await prisma.measurementVisit.create({ data: { id, principalId: guest, linkedAccountId, startedAt: publishedAt, foregroundAt: publishedAt } });
    await prisma.measurementRecord.create({ data: { id: record, principalId: guest, visitId: linked, event: {}, origin: "client", environment: "test", population: "synthetic", conversionEligible: false, occurredAt: publishedAt, receivedAt: publishedAt, expiresAt: new Date("2030-01-01Z") } });
    const before = {
      user: await prisma.user.findUniqueOrThrow({ where: { id: userId } }), listing: await prisma.listing.findUniqueOrThrow({ where: { id: listingId } }),
      member: await prisma.dealershipMember.findUniqueOrThrow({ where: { id: member } }), business: await prisma.dealership.findUniqueOrThrow({ where: { id: business } }),
      staff: await prisma.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId, capability: "support.operations" } } }),
      record: await prisma.measurementRecord.findUniqueOrThrow({ where: { id: record } }), guestVisit: await prisma.measurementVisit.findUniqueOrThrow({ where: { id: unlinked } }),
    };
    await guards(true);
    const scheduledAt = new Date("2030-01-01Z"), plan = await update(a,"users",{ id: userId },{ deletionScheduledAt: scheduledAt.toISOString() });
    const c = sourceCommand("account_schedule",[plan]);
    async function schedulingWrites(tx: Prisma.TransactionClient, omitBaseline = false, repeated = false, omitAudit: "membership" | "staff" | null = null) {
      await tx.user.update({ where: { id: userId }, data: { deletionScheduledAt: scheduledAt } });
      await tx.dealershipMember.delete({ where: { id: member } });
      await tx.dealership.update({ where: { id: business }, data: { status: "recovery" } });
      const [ids] = await tx.$queryRaw<{ member: string; staff: string }[]>`SELECT diagnostic_source_account_audit_id(${userId},'membership') member,diagnostic_source_account_audit_id(${userId},'staff') staff`;
      if (omitAudit !== "membership") await tx.auditLog.create({ data: { id: present(ids).member, actorId: userId, action: "BUSINESS_MEMBERSHIP_ENDED_FOR_DELETION", targetType: "Dealership", targetId: business, details: { role: "owner", recoveryRequired: true } } });
      if (!omitBaseline) await tx.measurementState.delete({ where: { key: baselineKey } });
      await tx.measurementInvestigationExport.deleteMany();
      if (!repeated) {
        await tx.measurementPrincipal.delete({ where: { id: principal } });
        await tx.dealershipInvitation.delete({ where: { id: invitation } });
      }
      await tx.$executeRaw`UPDATE staff_grants SET "revokedAt"=CURRENT_TIMESTAMP WHERE "userId"=${userId} AND "revokedAt" IS NULL`;
      if (omitAudit !== "staff") await tx.auditLog.create({ data: { id: present(ids).staff, actorId: userId, action: "STAFF_AUTHORITY_REVOKED_FOR_DELETION", targetType: "User", targetId: userId, details: { reason: "Account deletion scheduled", capabilities: ["support.operations"] } } });
      const [target] = await tx.$queryRaw<{ stamp: Date }[]>`SELECT diagnostic_source_staff_revocation_timestamp(transaction_timestamp()) stamp`;
      expect((await tx.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId, capability: "support.operations" } } })).revokedAt).toEqual(present(target).stamp);
      await tx.listing.update({ where: { id: listingId }, data: { status: "archived", archivedByDeletion: true } });
    }
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx,c,() => schedulingWrites(tx,true)))).rejects.toThrow("diagnostic_source_final_effect");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toEqual(before.user);
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).toEqual(before.listing);
    expect(await prisma.dealershipMember.findUniqueOrThrow({ where: { id: member } })).toEqual(before.member);
    expect(await prisma.dealership.findUniqueOrThrow({ where: { id: business } })).toEqual(before.business);
    expect(await prisma.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId, capability: "support.operations" } } })).toEqual(before.staff);
    expect(await prisma.measurementRecord.findUniqueOrThrow({ where: { id: record } })).toEqual(before.record);
    expect(await prisma.auditLog.count({ where: { actorId: userId } })).toBe(0);
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx,c,() => schedulingWrites(tx)));
    expect(await prisma.measurementRecord.findUnique({ where: { id: record } })).toBeNull();
    expect(await prisma.measurementVisit.findUnique({ where: { id: linked } })).toBeNull();
    expect(await prisma.measurementVisit.findUniqueOrThrow({ where: { id: unlinked } })).toEqual(before.guestVisit);
    expect(await prisma.dealershipMember.findUnique({ where: { id: member } })).toBeNull();
    expect(await prisma.dealershipInvitation.findUnique({ where: { id: invitation } })).toBeNull();
    const revoked = await prisma.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId, capability: "support.operations" } } });
    expect(revoked.revokedAt).not.toBeNull();
    await prisma.measurementState.create({ data: { key: baselineKey, epoch: collectorEpoch } });
    const restore = sourceCommand("account_restore",[await update(a,"users",{ id: userId },{ deletionScheduledAt: null })]);
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx,restore,async () => {
      await tx.measurementState.delete({ where: { key: baselineKey } });
      await tx.listing.update({ where: { id: listingId }, data: { status: "active", archivedByDeletion: false } });
      await tx.user.update({ where: { id: userId }, data: { deletionScheduledAt: null } });
    }));
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).toMatchObject({ status: "active", archivedByDeletion: false, publishedAt });
    expect(await prisma.dealership.findUniqueOrThrow({ where: { id: business } })).toMatchObject({ status: "recovery" });
    expect(await prisma.dealershipMember.findUnique({ where: { id: member } })).toBeNull();
    expect(await prisma.measurementPrincipal.findUnique({ where: { id: principal } })).toBeNull();
    expect(await prisma.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId, capability: "support.operations" } } })).toEqual(revoked);
    expect(await prisma.measurementVisit.findUniqueOrThrow({ where: { id: unlinked } })).toEqual(before.guestVisit);
    const firstAudits = await prisma.auditLog.findMany({ where: { actorId: userId }, orderBy: { action: "asc" } });
    expect(firstAudits.map(row => row.action)).toEqual(["BUSINESS_MEMBERSHIP_ENDED_FOR_DELETION","STAFF_AUTHORITY_REVOKED_FOR_DELETION"]);
    // A fresh, explicit source command models lawful authority reacquisition.
    // Restoration itself revived neither family. These are new member/staff
    // transitions, not ownership consent, bootstrap or production caller proof.
    const memberNext = { id: member,userId,dealershipId: business,role: "owner",status: "active" } as const;
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx,sourceCommand("member_create",[{
      table: "dealership_members",key: { id: member },verb: "insert",expected: "absent",next: memberNext,
    }]),async () => {
      await tx.dealershipMember.create({ data: memberNext });
      await tx.dealership.update({ where: { id: business },data: { status: "active" } });
    }));
    const regrantedAt = new Date();
    const regrant = await update(a,"staff_grants",{ userId,capability: "support.operations" },{ revokedAt: null,grantedAt: regrantedAt.toISOString() });
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx,sourceCommand("staff_eligibility",[regrant]),() =>
      tx.staffGrant.update({ where: { userId_capability: { userId,capability: "support.operations" } },data: { revokedAt: null,grantedAt: regrantedAt } })));
    const reacquiredMember = await prisma.dealershipMember.findUniqueOrThrow({ where: { id: member } });
    const reacquiredStaff = await prisma.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId,capability: "support.operations" } } });
    const restoredUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // Reusing the exact same schedule date must still create a second event.
    const second = sourceCommand("account_schedule",[await update(a,"users",{ id: userId },{ deletionScheduledAt: scheduledAt.toISOString() })]);
    await prisma.measurementState.create({ data: { key: baselineKey,epoch: collectorEpoch } });
    for (const family of ["membership","staff"] as const) {
      await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx,second,() => schedulingWrites(tx,false,true,family)))).rejects.toThrow("diagnostic_source_final_effect");
      expect(await prisma.auditLog.findMany({ where: { actorId: userId },orderBy: { action: "asc" } })).toEqual(firstAudits);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toEqual(restoredUser);
      expect(await prisma.dealershipMember.findUniqueOrThrow({ where: { id: member } })).toEqual(reacquiredMember);
      expect(await prisma.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId,capability: "support.operations" } } })).toEqual(reacquiredStaff);
      expect(await prisma.measurementState.findUnique({ where: { key: baselineKey } })).not.toBeNull();
    }
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx,second,() => schedulingWrites(tx,false,true)));
    const allAudits = await prisma.auditLog.findMany({ where: { actorId: userId } });
    expect(allAudits).toHaveLength(4);
    for (const first of firstAudits) {
      expect(allAudits).toContainEqual(first);
      const events = allAudits.filter(row => row.action === first.action);
      expect(events).toHaveLength(2);
      expect(new Set(events.map(row => row.id)).size).toBe(2);
      expect(events.map(row => ({ ...row,id: first.id,createdAt: first.createdAt }))).toEqual([first,first]);
    }
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({ deletionScheduledAt: scheduledAt });
    expect(await prisma.dealershipMember.findUnique({ where: { id: member } })).toBeNull();
    expect((await prisma.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId,capability: "support.operations" } } })).revokedAt).not.toBeNull();
    expect(await prisma.measurementVisit.findUniqueOrThrow({ where: { id: unlinked } })).toEqual(before.guestVisit);
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["2026-10-24T12:00:00.123400Z","2026-10-24T12:00:00.123600Z"])("staff revocation uses exact physical TIMESTAMP(3) rounding for %s",async instant => {
    const a = await connect();
    await a.query("SET TIME ZONE 'UTC'");
    const expected = instant.includes("123600") ? "2026-10-24T12:00:00.124" : "2026-10-24T12:00:00.123";
    const [rounded] = (await a.query<{ stamp: string }>("SELECT to_char(diagnostic_source_staff_revocation_timestamp($1::timestamptz),'YYYY-MM-DD\"T\"HH24:MI:SS.MS') stamp",[instant])).rows;
    expect(present(rounded).stamp).toBe(expected);
    const next = await projection(a,"staff_grants",{ userId,capability: "support.operations",grantedAt: "2026-10-24T11:00:00",revokedAt: null });
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx,sourceCommand("staff_eligibility",[{
      table: "staff_grants",key: { userId,capability: "support.operations" },verb: "insert",expected: "absent",next,
    }]),() => tx.staffGrant.create({ data: { userId,capability: "support.operations",grantedAt: new Date("2026-10-24T11:00:00Z") } })));
    const plan = await update(a,"staff_grants",{ userId,capability: "support.operations" },{ revokedAt: expected });
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx,sourceCommand("staff_eligibility",[plan]),() =>
      tx.$executeRaw`UPDATE staff_grants SET "revokedAt"=${instant}::timestamptz AT TIME ZONE 'UTC' WHERE "userId"=${userId} AND capability='support.operations'`));
    expect((await prisma.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId,capability: "support.operations" } } })).revokedAt).toEqual(new Date(expected+"Z"));
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each([false,true])("Business recovery removal versus ordinary capture with suspended grant preserves retained member/Listing references, captureFirst=%s", async captureFirst => {
    const a = await connect(), observer = await connect(), business = randomUUID(), member = randomUUID();
    await guards(false);
    await prisma.dealership.create({ data: { id: business, slug: business, name: "Synthetic recovery contention", status: "active" } });
    await prisma.dealershipMember.create({ data: { id: member, userId, dealershipId: business, role: "owner" } });
    await prisma.listing.update({ where: { id: listingId }, data: { businessId: business } });
    await guards(true);
    const oid = await newOrder(a,{ audience: "listing_public",listingId }), grant = await ownershipGrant(a,oid);
    const suspend = await update(a,"dealership_members",{ id: member },{ status: "suspended" });
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx,sourceCommand("member_eligibility",[suspend]),() => tx.dealershipMember.update({ where: { id: member },data: { status: "suspended" } })));
    const oldMember = await source(a,"dealership_members",{ id: member });
    const removal = sourceCommand("member_replace",[{ table: "dealership_members",key: { id: member },verb: "delete",expected: { source: oldMember },next: null }]);
    const observed = await observationPlans(a,oid,{ method: "vin",vin: "AAA",mileageKm: 123,observedAt: "2020-01-01T00:00:00Z" });
    const capture = sourceCommand("observation_append",observed.plans);
    const before = { listing: await prisma.listing.findUniqueOrThrow({ where: { id: listingId } }),grant: await prisma.diagnosticOwnershipGrant.findUniqueOrThrow({ where: { id: String(grant["id"]) } }) };
    let firstPid=0, secondPid=0;
    let enter: () => void = () => undefined, release: () => void = () => undefined, start: () => void = () => undefined;
    const ready = new Promise<void>(r => { enter=r; }),hold = new Promise<void>(r => { release=r; }),started = new Promise<void>(r => { start=r; });
    const first = prisma.$transaction(async tx => {
      firstPid=present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid;
      await withDiagnosticSourceCommand(tx,captureFirst ? capture : removal,async receipt => {
        enter(); await hold;
        if (captureFirst) {
          await tx.$executeRaw`UPDATE inspection_orders SET "observedVehicle"=${JSON.stringify(observed.raw["observation"])}::jsonb,version=version+1 WHERE id=${oid}`;
          await tx.$executeRaw`INSERT INTO diagnostic_identity_records SELECT (jsonb_populate_record(NULL::diagnostic_identity_records,${JSON.stringify(observed.raw)}::jsonb)).*`;
          await tx.$executeRaw`INSERT INTO diagnostic_ownership_components SELECT (jsonb_populate_record(NULL::diagnostic_ownership_components,${JSON.stringify(observed.component)}::jsonb)).*`;
          await sealDiagnosticFirstObservation(tx,receipt,oid,observed.rawId);
        } else {
          await tx.dealershipMember.delete({ where: { id: member } });
          await tx.dealership.update({ where: { id: business },data: { status: "recovery" } });
          const collector = await tx.measurementState.findUnique({ where: { key: "collector" } });
          if (collector) await tx.measurementState.deleteMany({ where: { key: `inventory_baseline:${collector.epoch}` } });
        }
      });
    });
    await ready;
    const second = prisma.$transaction(async tx => {
      secondPid=present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid; start();
      await withDiagnosticSourceCommand(tx,captureFirst ? removal : capture,async () => { throw new Error("stale recovery graph reached writes"); });
    }).then(() => null,(error: unknown) => error);
    await started;
    try {
      const end=Date.now()+5000; let waiting=false;
      while (Date.now()<end) if (present((await observer.query<{ blocked: boolean }>("SELECT $2::int=ANY(pg_blocking_pids($1::int)) blocked",[secondPid,firstPid])).rows[0]).blocked) { waiting=true; break; }
      expect(waiting).toBe(true);
    } finally { release(); }
    await first;
    const error=await second; expect(error).toBeInstanceOf(Error); expect((error as Error).message).toMatch(/diagnostic_source_(graph_changed|stale)/);
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).toEqual(before.listing);
    expect(await prisma.diagnosticOwnershipGrant.findUniqueOrThrow({ where: { id: String(grant["id"]) } })).toEqual(before.grant);
    expect(await anchor(oid)).toMatchObject({ state: captureFirst ? "unavailable" : "changed", firstRecordId: captureFirst ? observed.rawId : null });
    if (captureFirst) expect(await prisma.dealershipMember.findUniqueOrThrow({ where: { id: member } })).toMatchObject(oldMember);
    else expect(await prisma.dealershipMember.findUnique({ where: { id: member } })).toBeNull();
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });


  // Moderation is a finite User command. Sessions and their incoming effects are
  // server-derived, never caller rows. These cases use the exported module.
  async function moderationPlan(client: PoolClient, suspendedAt: Date | null) {
    const actor = randomUUID();
    await prisma.user.create({ data: { id: actor, email: `${actor}@moderation.invalid` } });
    const plan = await update(client, "users", { id: userId }, {
      suspendedAt: suspendedAt?.toISOString() ?? null,
      suspendedById: suspendedAt ? actor : null,
      suspensionReason: suspendedAt ? "Explicit moderation scenario" : null,
    });
    const c = { ...sourceCommand("user_eligibility", [plan]), actorUserId: actor };
    const write = async (tx: Prisma.TransactionClient, omitSessions = false) => {
      await tx.user.update({ where: { id: userId }, data: {
        suspendedAt, suspendedById: suspendedAt ? actor : null,
        suspensionReason: suspendedAt ? "Explicit moderation scenario" : null,
      } });
      if (suspendedAt && !omitSessions) await tx.session.deleteMany({ where: { userId } });
    };
    return { c, plan, write };
  }

  it.each(["finish", "delete"] as const)("User moderation %s requires every actual Session deletion and rolls back the whole command", async mode => {
    const a = await connect(), extra = randomUUID(), foreign = randomUUID(), foreignSession = randomUUID();
    await prisma.user.create({ data: { id: foreign, email: `${foreign}@moderation.invalid` } });
    for (const [id, uid] of [[extra, userId], [foreignSession, foreign]] as const) await prisma.session.create({ data: {
      id, userId: uid, refreshTokenHash: id, expiresAt: new Date(Date.now()+600_000),
    } });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const sessions = await prisma.session.findMany({ where: { userId }, orderBy: { id: "asc" } });
    const foreignBefore = await prisma.session.findUniqueOrThrow({ where: { id: foreignSession } });
    const suspendedAt = new Date(), m = await moderationPlan(a, suspendedAt);
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, m.c, async receipt => {
      await m.write(tx, true);
      if (mode === "delete") await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
    }))).rejects.toThrow("diagnostic_source_final_effect");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toEqual(before);
    expect(await prisma.session.findMany({ where: { userId }, orderBy: { id: "asc" } })).toEqual(sessions);
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, m.c, async () => {
      await m.write(tx); throw new Error("moderation whole transaction rollback");
    }))).rejects.toThrow("moderation whole transaction rollback");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toEqual(before);
    expect(await prisma.session.findMany({ where: { userId }, orderBy: { id: "asc" } })).toEqual(sessions);
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, m.c, async receipt => {
      await assertDiagnosticSourceCommand(tx, receipt, "user_eligibility");
      const [prepared] = await tx.$queryRaw<{ command: { rows: unknown[] }; effects: Plan[]; scope: unknown[] }[]>`SELECT command,effects,scope FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
      expect(present(prepared).command.rows).toHaveLength(1);
      expect(present(prepared).effects.filter(e => e.table === "sessions").map(e => e.key["id"]).sort()).toEqual([sessionId, extra].sort());
      expect(present(prepared).effects.filter(e => e.table === "sessions").every(e => e.verb === "delete")).toBe(true);
      expect(present(prepared).scope).toContainEqual(expect.objectContaining({ table: "sessions", key: { id: extra } }));
      await m.write(tx);
    }));
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({ suspendedAt, suspendedById: m.c.actorUserId, suspensionReason: "Explicit moderation scenario", deletionScheduledAt: null });
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect(await prisma.session.findUniqueOrThrow({ where: { id: foreignSession } })).toEqual(foreignBefore);
    const restored = await moderationPlan(a, null);
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, restored.c, async receipt => {
      const [prepared] = await tx.$queryRaw<{ effects: Plan[] }[]>`SELECT effects FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
      expect(present(prepared).effects.filter(e => e.table === "sessions")).toEqual([]);
      await restored.write(tx);
    }));
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({ suspendedAt: null, suspendedById: null, suspensionReason: null });
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["role", "deletionScheduledAt", "displayName", "wrong actor", "unchanged", "missing by", "missing reason", "extra User", "Session row", "wrong root"] as const)("moderation refuses %s intent before work", async kind => {
    const a = await connect(), m = await moderationPlan(a, new Date());
    const foreign = randomUUID();
    await prisma.user.create({ data: { id: foreign, email: `${foreign}@moderation.invalid` } });
    let rows = [m.plan], roots = m.c.roots;
    if (["role", "deletionScheduledAt", "displayName"].includes(kind)) present(m.plan.next)[kind] = kind === "role" ? "admin" : kind === "displayName" ? "unauthorized change" : new Date().toISOString();
    if (kind === "wrong actor") present(m.plan.next)["suspendedById"] = foreign;
    if (kind === "missing by") present(m.plan.next)["suspendedById"] = null;
    if (kind === "missing reason") present(m.plan.next)["suspensionReason"] = null;
    if (kind === "unchanged") m.plan.next = (m.plan.expected as { source: Row }).source;
    if (kind === "extra User") rows = [...rows, await update(a, "users", { id: foreign }, { suspendedAt: null })];
    if (kind === "Session row") rows = [...rows, { table: "sessions", key: { id: sessionId }, verb: "delete", expected: { source: await source(a, "sessions", { id: sessionId }) }, next: null }];
    if (kind === "wrong root") roots = [{ table: "users", key: { id: foreign } }];
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, { ...sourceCommand("user_eligibility", rows), actorUserId: m.c.actorUserId, roots }, async () => {
      throw new Error("invalid moderation reached work");
    }))).rejects.toThrow(kind === "Session row" ? "diagnostic_source_row" : "diagnostic_source_moderation_intent");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toEqual(before);
    expect(await prisma.session.count({ where: { userId } })).toBe(1);
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["wrong User", "wrong fields", "extra Session"] as const)("a live moderation receipt refuses an actual %s effect", async kind => {
    const a = await connect(), m = await moderationPlan(a, new Date()), foreign = randomUUID(), sid = randomUUID();
    await prisma.user.create({ data: { id: foreign, email: `${foreign}@moderation.invalid` } });
    await prisma.session.create({ data: { id: sid, userId: foreign, refreshTokenHash: sid, expiresAt: new Date(Date.now()+600_000) } });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, m.c, async () => {
      if (kind === "wrong User") await tx.user.update({ where: { id: foreign }, data: { suspendedAt: new Date() } });
      else if (kind === "wrong fields") await tx.user.update({ where: { id: userId }, data: { role: "admin" } });
      else { await m.write(tx); await tx.session.delete({ where: { id: sid } }); }
    }))).rejects.toThrow(kind === "wrong fields" ? "diagnostic_source_effect_mismatch" : "diagnostic_source_uncovered_effect");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toEqual(before);
    expect(await prisma.session.count({ where: { id: { in: [sessionId, sid] } } })).toBe(2);
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("moderation rejects naked fields, missing/foreign/finished receipts and second or late preparation", async () => {
    const a = await connect(), m = await moderationPlan(a, new Date());
    for (const data of [{ suspendedAt: new Date() }, { suspensionReason: "naked" }, { suspendedById: m.c.actorUserId }]) {
      await expect(prisma.user.update({ where: { id: userId }, data })).rejects.toThrow("diagnostic_source_unprepared");
    }
    const fake = { receiptId: randomUUID() } as PreparedDiagnosticSource;
    await expect(prisma.$transaction(tx => assertDiagnosticSourceCommand(tx, fake, "user_eligibility"))).rejects.toThrow("diagnostic_source_receipt");
    let finished = fake;
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx, m.c, async receipt => {
      finished = receipt;
      await assertDiagnosticSourceCommand(tx, receipt, "user_eligibility");
      await expect(prisma.$transaction(other => assertDiagnosticSourceCommand(other, receipt, "user_eligibility"))).rejects.toThrow("diagnostic_source_receipt");
      await m.write(tx);
    }));
    await expect(prisma.$transaction(tx => assertDiagnosticSourceCommand(tx, finished, "user_eligibility"))).rejects.toThrow("diagnostic_source_receipt");
    const restore = await moderationPlan(a, null);
    await expect(prisma.$transaction(tx => withDiagnosticSourceCommand(tx, restore.c, () =>
      withDiagnosticSourceCommand(tx, restore.c, async () => undefined)))).rejects.toThrow("diagnostic_source_nested");
    await expect(prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
      await withDiagnosticSourceCommand(tx, restore.c, () => restore.write(tx));
    })).rejects.toThrow("diagnostic_source_preheld_lock");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({ suspendedAt: expect.any(Date) });
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each([false, true])("suspension versus first capture holds the same graph before effects, captureFirst=%s", async captureFirst => {
    const a = await connect(), observer = await connect();
    const oid = await newOrder(a, { audience: "listing_public", listingId });
    const grant = await ownershipGrant(a, oid);
    const observation = await observationPlans(a, oid, { method: "vin", vin: "AAA", observedAt: new Date().toISOString(), mileageKm: 100, manualReference: null }, grant);
    const capture = sourceCommand("observation_append", observation.plans), moderation = await moderationPlan(a, new Date());
    let firstPid = 0, secondPid = 0;
    let enter: () => void = () => { throw new Error("missing moderation barrier"); };
    let release: () => void = () => { throw new Error("missing release"); };
    let start: () => void = () => { throw new Error("missing second backend"); };
    const ready = new Promise<void>(resolve => { enter=resolve; }), hold = new Promise<void>(resolve => { release=resolve; }), secondReady = new Promise<void>(resolve => { start=resolve; });
    const first = prisma.$transaction(async tx => {
      firstPid = present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid;
      await withDiagnosticSourceCommand(tx, captureFirst ? capture : moderation.c, async receipt => {
        enter(); await hold;
        if (!captureFirst) await moderation.write(tx);
        else {
          await tx.$executeRaw`UPDATE inspection_orders SET "observedVehicle"=${JSON.stringify(observation.raw["observation"])}::jsonb,version=version+1 WHERE id=${oid}`;
          await tx.$executeRaw`INSERT INTO diagnostic_identity_records SELECT (jsonb_populate_record(NULL::diagnostic_identity_records,${JSON.stringify(observation.raw)}::jsonb)).*`;
          await tx.$executeRaw`INSERT INTO diagnostic_ownership_components SELECT (jsonb_populate_record(NULL::diagnostic_ownership_components,${JSON.stringify(observation.component)}::jsonb)).*`;
          await sealDiagnosticFirstObservation(tx, receipt, oid, observation.rawId);
        }
      });
    });
    await ready;
    const second = prisma.$transaction(async tx => {
      secondPid = present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid; start();
      await withDiagnosticSourceCommand(tx, captureFirst ? moderation.c : capture, async () => { throw new Error("changed graph reached work"); });
    }).then(() => null, (error: unknown) => error);
    await secondReady;
    try {
      const deadline = Date.now()+5000; let waiting = false;
      while (Date.now()<deadline) {
        if (present((await observer.query<{ blocked: boolean }>("SELECT $2::int=ANY(pg_blocking_pids($1::int)) blocked", [secondPid,firstPid])).rows[0]).blocked) { waiting=true; break; }
      }
      expect(waiting).toBe(true);
    } finally { release(); }
    await first;
    const error = await second;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/diagnostic_source_(graph_changed|stale)/);
    expect(await anchor(oid)).toMatchObject({ state: captureFirst ? "unchanged" : "pending", firstRecordId: captureFirst ? observation.rawId : null });
    expect(await prisma.diagnosticIdentityRecord.count({ where: { orderId: oid } })).toBe(captureFirst ? 1 : 0);
    expect(await prisma.session.count({ where: { userId } })).toBe(captureFirst ? 1 : 0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({ suspendedAt: captureFirst ? null : expect.any(Date) });
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });


  it("suspension predeclares actual Session FK children while retaining foreign authority and service content", async () => {
    const a = await connect(), oid = await newOrder(a), foreign = randomUUID(), sid = randomUUID();
    await prisma.user.create({ data: { id: foreign } });
    await prisma.session.create({ data: { id: sid, userId: foreign, refreshTokenHash: sid, expiresAt: new Date(Date.now()+600_000) } });
    const support = await prisma.supportCase.create({ data: { customerId: userId } });
    const conversation = await prisma.serviceConversation.create({ data: { purpose: "support", supportCaseId: support.id } });
    const device = await prisma.fcmDevice.create({ data: { userId, token: randomUUID(), platform: "android" } });
    const subscription = await prisma.servicePushSubscription.create({ data: { sessionId, deviceId: device.id, conversationId: conversation.id, lifecycleEpoch: 0 } });
    const foreignDevice = await prisma.fcmDevice.create({ data: { userId: foreign, token: randomUUID(), platform: "android" } });
    const foreignSubscription = await prisma.servicePushSubscription.create({ data: { sessionId: sid, deviceId: foreignDevice.id, conversationId: conversation.id, lifecycleEpoch: 0 } });
    const grant = await prisma.videoGrant.create({ data: { ownerUserId: userId, ownerSessionId: sessionId, secretHash: randomUUID(), listingId, generationId: randomUUID(), purpose: "upload", expiresAt: new Date(Date.now()+600_000) } });
    const foreignGrant = await prisma.videoGrant.create({ data: { ownerUserId: foreign, ownerSessionId: sid, secretHash: randomUUID(), listingId, generationId: randomUUID(), purpose: "upload", expiresAt: new Date(Date.now()+600_000) } });
    const requestId = randomUUID(), request = await projection(a,"diagnostic_continuity_requests",{ id: requestId, actorId: userId, sessionId, orderId: oid, kind: "issue", createdAt: new Date().toISOString() });
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx,sourceCommand("proof_issue",[{
      table: "diagnostic_continuity_requests",key: { id: requestId },verb: "insert",expected: "absent",next: request,
    }]),() => tx.$executeRaw`INSERT INTO diagnostic_continuity_requests SELECT (jsonb_populate_record(NULL::diagnostic_continuity_requests,${JSON.stringify(request)}::jsonb)).*`));
    const m = await moderationPlan(a,new Date());
    await prisma.$transaction(tx => withDiagnosticSourceCommand(tx,m.c,async receipt => {
      const [prepared] = await tx.$queryRaw<{ effects: unknown[]; scope: unknown[] }[]>`SELECT effects,scope FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
      for (const [table,id] of [["sessions",sessionId],["video_grants",grant.id],["service_push_subscriptions",subscription.id],["diagnostic_continuity_requests",requestId]]) {
        expect(present(prepared).effects).toContainEqual(expect.objectContaining({ table,key: { id },verb: "delete",derived: "purge" }));
        expect(present(prepared).scope).toContainEqual(expect.objectContaining({ table,key: { id } }));
      }
      await m.write(tx);
    }));
    expect(await prisma.session.findUnique({ where: { id: sessionId } })).toBeNull();
    expect(await prisma.videoGrant.findUnique({ where: { id: grant.id } })).toBeNull();
    expect(await prisma.servicePushSubscription.findUnique({ where: { id: subscription.id } })).toBeNull();
    expect(await prisma.diagnosticContinuityRequest.findUnique({ where: { id: requestId } })).toBeNull();
    expect(await prisma.videoGrant.findUniqueOrThrow({ where: { id: foreignGrant.id } })).toEqual(foreignGrant);
    expect(await prisma.servicePushSubscription.findUniqueOrThrow({ where: { id: foreignSubscription.id } })).toEqual(foreignSubscription);
    expect(await prisma.serviceConversation.findUniqueOrThrow({ where: { id: conversation.id } })).toEqual(conversation);
    expect(await prisma.supportCase.findUniqueOrThrow({ where: { id: support.id } })).toEqual(support);
    expect(await prisma.fcmDevice.findUniqueOrThrow({ where: { id: device.id } })).toEqual(device);
    expect(await prisma.session.findUnique({ where: { id: sid } })).not.toBeNull();
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("unfinished moderation cannot commit and a finished receipt cannot authorize a later write in the same transaction", async () => {
    const a = await connect(), m = await moderationPlan(a,new Date());
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await expect(prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT diagnostic_prepare_source(${JSON.stringify(m.c)}::jsonb)`;
      await m.write(tx);
    })).rejects.toThrow("diagnostic_source_unfinished");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toEqual(before);
    expect(await prisma.session.count({ where: { userId } })).toBe(1);
    await expect(prisma.$transaction(async tx => {
      await withDiagnosticSourceCommand(tx,m.c,() => m.write(tx));
      await tx.user.update({ where: { id: userId }, data: { suspendedAt: null, suspendedById: null, suspensionReason: null } });
    })).rejects.toThrow("diagnostic_source_unprepared");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toEqual(before);
    expect(await prisma.session.count({ where: { userId } })).toBe(1);
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

});
