import { spawnSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const root = fileURLToPath(new URL("../../..", import.meta.url));
const localRequire = createRequire(import.meta.url);

// Hosted-only S2A proof (#901). The remote clean-reset program runs against a migrated
// disposable PostgreSQL database through the same psql substitute as the reserved
// fixture lane. Every expectation is an independent literal or a direct pg read, never
// a mocked SQL outcome. Redis, objects, reseed and reopen are out of scope.
const candidate = "c".repeat(40);
const operationId = "e".repeat(32);
const reservationId = "f".repeat(32);
const identity = { projectId: "test-project", environmentId: "test-staging", services: { api: "test-api", worker: "test-worker" },
  origins: { database: "postgresql://postgres.railway.internal:5432/railway" } };
const containerEnv = (): Record<string, string | undefined> => ({ RAILWAY_PROJECT_ID: "test-project", RAILWAY_ENVIRONMENT_ID: "test-staging",
  RAILWAY_SERVICE_ID: "test-api", RAILWAY_ENVIRONMENT_NAME: "staging", APP_ENV: "staging", AUTOTM_COMMIT_SHA: candidate,
  DATABASE_URL: "postgresql://u:secret@postgres.railway.internal:5432/railway" });
const inventoried = (): Record<string, unknown> => ({ operation: "clean-reset", phase: "inventoried", operationId, reservationId, candidate,
  identity: structuredClone(identity) });
const rows = (expectedInventory: unknown): Record<string, unknown> => ({ ...inventoried(), phase: "rows", expectedInventory });
const hex64 = /^[a-f0-9]{64}$/;
const monotonicMs = () => Number(process.hrtime.bigint() / 1000000n);
const cfNamespace = `cf_${"9".repeat(32)}`;

// Independently written retained set: reference catalog, protected state, migration history.
const retained = ["public._prisma_migrations", "public.body_types", "public.brands", "public.cities", "public.colors", "public.drive_types",
  "public.engine_types", "public.exchange_rates", "public.generations", "public.measurement_state", "public.models", "public.regions", "public.transmissions"];
const migrations = readdirSync(join(packageRoot, "prisma", "migrations"))
  .filter(name => statSync(join(packageRoot, "prisma", "migrations", name)).isDirectory()).sort();

type SqlSubprocess = { status: number | null; signal: NodeJS.Signals | null; error: string | undefined; markers: number; sqlDiagnostic: string | undefined };
type Outcome = { code: number; failure: string; receipt?: Record<string, unknown>; queries: number; subprocesses?: SqlSubprocess[] };
type Digest = { schema: string; retained: string; disposable: string };
const blindDigest: Digest = { schema: "0".repeat(64), retained: "0".repeat(64), disposable: "0".repeat(64) };
const digestShape = { schema: expect.stringMatching(hex64), retained: expect.stringMatching(hex64), disposable: expect.stringMatching(hex64) };
const bound = { operation: "clean-reset", operationId, reservationId, candidate, environmentId: identity.environmentId };

describe("staging clean-reset remote operation on disposable application schema", () => {
  let postgres: StartedPostgreSqlContainer;
  let databaseUrl: string;
  let database: string;
  let admin: Pool;
  let childOrdinal = 0;
  let settledAt = 0;
  let lastFixtureClose = "none";
  let cleanResetProgram: (payload: unknown) => string;

  // Short-lived target connections, so the operation's own activity guard sees only itself.
  async function query<T extends Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
    const client = new Client({ connectionString: databaseUrl, application_name: "staging-test-fixture" });
    await client.connect();
    const connectedAt = monotonicMs();
    // pg exposes BackendKeyData at runtime; @types/pg omits processID.
    const runtimePid = (client as Client & { processID?: unknown }).processID;
    const pid = typeof runtimePid === "number" && Number.isInteger(runtimePid) && runtimePid > 0 && runtimePid <= 2147483647 ? runtimePid : 0;
    try { return (await client.query(sql, values)).rows as T[]; } finally {
      await client.end();
      // Keep only the latest close, emitted beside the next operation, rather than logging every snapshot query.
      lastFixtureClose = `pid=${pid} connectedAtMs=${connectedAt} closedAtMs=${monotonicMs()}`;
    }
  }
  // Observed from the maintenance database: wait until no client backend remains on the target.
  async function settle(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const found = (await admin.query(`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND backend_type='client backend'`, [database])).rows[0];
      if (found?.count === 0) { settledAt = monotonicMs(); return; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Disposable target database did not settle");
  }
  async function tables(): Promise<string[]> {
    return (await query<{ name: string }>(`SELECT 'public.'||tablename AS name FROM pg_tables WHERE schemaname='public'`)).map(row => row.name).sort();
  }
  // Content of every user table plus public definitions and namespaces, read directly from PostgreSQL.
  async function snapshot(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    // Every user-schema table, so a refusal cannot touch an operator receipt either.
    const every = (await query<{ name: string }>(`SELECT format('%I.%I', schemaname, tablename) AS name FROM pg_tables
      WHERE schemaname NOT LIKE 'pg\\_%' AND schemaname<>'information_schema'`)).map(row => row.name).sort();
    for (const name of every) {
      const row = (await query<{ hash: string }>(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text, ',' ORDER BY to_jsonb(t)::text), '')) AS hash FROM ${name} t`))[0];
      result[name] = row?.hash ?? "";
    }
    // Definitions, not names only: a redefined trigger or an added FK changes this entry.
    result["public-catalog"] = (await query<{ hash: string }>(`SELECT md5(coalesce(string_agg(x, ',' ORDER BY x), '')) AS hash FROM (
      SELECT 't:'||pg_get_triggerdef(t.oid) AS x FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace
      UNION ALL SELECT 'c:'||conrelid::regclass||':'||conname||':'||pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='f'
      UNION ALL SELECT 'a:'||attrelid::regclass||':'||attname||':'||format_type(atttypid, atttypmod) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
        WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped) s`))[0]?.hash ?? "";
    result["namespaces"] = JSON.stringify(await namespaces());
    return result;
  }
  async function namespaces(): Promise<string[]> {
    return (await query<{ name: string }>(`SELECT nspname AS name FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname<>'information_schema'`))
      .map(row => row.name).sort();
  }
  async function files(): Promise<unknown[]> {
    return query(`SELECT relname, relfilenode FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY relname`);
  }
  async function count(table: string): Promise<number> {
    return (await query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`))[0]?.count ?? -1;
  }

  function execute(payload: unknown, env = containerEnv()): Outcome {
    let receipt: Record<string, unknown> | undefined; let code = 0; let failure = ""; let queries = 0;
    const subprocesses: SqlSubprocess[] = [];
    const process = { execPath: globalThis.process.execPath, env, exitCode: 0 };
    let program: string;
    try { program = cleanResetProgram(payload); } catch (error) { return { code: 1, failure: error instanceof Error ? error.message : String(error), queries }; }
    runInNewContext(program, { URL, process, require: (name: string) => name === "node:child_process" ? {
      spawnSync: (command: string, _args: string[], options: { input: string }) => {
        if (command !== "psql") return { status: 1, stdout: "", stderr: "", error: new Error("Unsupported remote subprocess") };
        queries++;
        const ordinal = ++childOrdinal;
        const startedAt = monotonicMs();
        const result = spawnSync(globalThis.process.execPath, [`${root}/scripts/testing/query-disposable-postgres.cjs`], {
          input: options.input, encoding: "utf8", timeout: 30000,
          env: { ...globalThis.process.env, STAGING_CONTROL_TEST_DATABASE_URL: databaseUrl, STAGING_TEST_DB_PACKAGE: `${packageRoot}/package.json`, STAGING_TEST_SQL_DIAGNOSTICS: "1",
            STAGING_TEST_PG_DIAGNOSTICS: "1", STAGING_TEST_PG_ROLE: "sql-child", STAGING_TEST_PG_ORDINAL: String(ordinal) },
        });
        // Reuse the loopback-only transport's validated categories. Never forward raw stderr.
        const lifecycle = result.stderr?.split(/\r?\n/).find(line => /^Disposable PG lifecycle: role=sql-child ordinal=(?:0|[1-9][0-9]{0,5}) pid=(?:0|[1-9][0-9]{0,9}) connectedAtMs=\d{1,16} closedAtMs=\d{1,16}$/.test(line));
        if (lifecycle) console.error(lifecycle);
        const activity = result.stderr?.split(/\r?\n/).find(line => /^Disposable PG activity: ordinal=(?:0|[1-9][0-9]{0,5}) count=(?:0|[1-9][0-9]{0,9}) pids=(?:none|[1-9][0-9]{0,9}(?:,[1-9][0-9]{0,9}){0,15})$/.test(line));
        if (activity) console.error(activity);
        const attribution = result.stderr?.split(/\r?\n/).find(line => /^Disposable PG attribution: ordinal=(?:0|[1-9][0-9]{0,5}) rows=(?:none|[1-9][0-9]{0,9}:(?:pg-isready|known-fixture|sql-child|other):(?:loopback|other|unavailable):(?:known|unavailable)(?:\|[1-9][0-9]{0,9}:(?:pg-isready|known-fixture|sql-child|other):(?:loopback|other|unavailable):(?:known|unavailable)){0,15})$/.test(line));
        if (attribution) console.error(attribution);
        console.error(`Disposable reset DB boundary: child=${ordinal} settledAtMs=${settledAt} startedAtMs=${startedAt} exitedAtMs=${monotonicMs()} lastFixtureClose=${lastFixtureClose}`);
        // Retain status and bounded SQLSTATE metadata only, never SQL, rows, stderr or error messages.
        const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
        subprocesses.push({ status: result.status, signal: result.signal,
          error: result.error ? errorCode && ["ETIMEDOUT", "ENOBUFS", "ENOENT", "EACCES", "EINTR", "EINVAL"].includes(errorCode) ? errorCode : "other" : undefined,
          markers: result.stdout?.split("\n").filter(line => line.startsWith("clean-reset:")).length ?? 0,
          sqlDiagnostic: result.stderr?.slice(0, 8192).split(/\r?\n/).find(line => /^Disposable database SQL diagnostic: SQLSTATE=[A-Z0-9]{5}(?: position=[0-9]{1,10})?(?: internalPosition=[0-9]{1,10})?$/.test(line)) });
        return result;
      },
    } : localRequire(name), console: {
      log: (value: string) => { receipt = JSON.parse(value) as Record<string, unknown>; },
      error: (...values: unknown[]) => { code = 1; failure = values.map(String).join(" "); },
    } });
    return { code: code || process.exitCode, failure, receipt, queries, subprocesses };
  }
  async function run(payload: unknown, env = containerEnv()): Promise<Outcome> { await settle(); return execute(payload, env); }

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:16-alpine").start();
    databaseUrl = postgres.getConnectionUri();
    database = postgres.getDatabase();
    const maintenance = new URL(databaseUrl); maintenance.pathname = "/postgres";
    admin = new Pool({ connectionString: maintenance.toString(), max: 1 });
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], { cwd: packageRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
    ({ cleanResetProgram } = await import(pathToFileURL(`${root}/scripts/staging-clean-reset-remote.mjs`).href) as { cleanResetProgram: (payload: unknown) => string });
    // Retained reference rows with an intentional logo key and rate edit, protected measurement state,
    // and disposable application rows that reference them.
    await query(`INSERT INTO brands(id,slug,"nameRu","nameTk","nameEn","logoKey","updatedAt") VALUES('reset-brand','reset-brand','Brand','Brand','Brand','brands/reset-brand/admin-upload-7/logo-60.png',now());
      INSERT INTO models(id,"brandId",slug,"nameRu","nameTk","nameEn","updatedAt") VALUES('reset-model','reset-brand','reset-model','Model','Model','Model',now());
      INSERT INTO generations(id,"modelId","nameRu","nameTk","nameEn","yearStart","updatedAt") VALUES('reset-generation','reset-model','Gen','Gen','Gen',2018,now());
      INSERT INTO regions(id,slug,"nameRu","nameTk","nameEn","updatedAt") VALUES('reset-region','reset-region','Region','Region','Region',now());
      INSERT INTO cities(id,"regionId",slug,"nameRu","nameTk","nameEn","updatedAt") VALUES('reset-city','reset-region','reset-city','City','City','City',now());
      INSERT INTO colors(id,"nameRu","nameTk","nameEn",hex,"updatedAt") VALUES('reset-color','Color','Color','Color','#123456',now());
      INSERT INTO exchange_rates(id,"fromCurrency","toCurrency",rate,"setByUserId","updatedAt") VALUES('reset-rate','USD','TMT',19.25,'reset-seller','2026-10-01T00:00:00Z');
      INSERT INTO measurement_state(key,epoch) VALUES('global','epoch-reset-7');
      INSERT INTO users(id,"displayName","updatedAt") VALUES('reset-seller','Disposable seller',now()),('reset-buyer','Disposable buyer',now());
      INSERT INTO sessions(id,"userId","refreshTokenHash","expiresAt") VALUES('reset-session','reset-buyer','reset-hash',now()+interval '1 hour');
      INSERT INTO listings(id,"sellerId",status,"brandId","modelId","generationId","colorId","cityId",year,"priceAmount","priceTmt","updatedAt",damaged)
        VALUES('reset-listing','reset-seller','active','reset-brand','reset-model','reset-generation','reset-color','reset-city',2020,100,100,now(),false);
      INSERT INTO favorites(id,"userId","listingId") VALUES('reset-favorite','reset-buyer','reset-listing');
      INSERT INTO audit_logs(id,"actorId",action,"targetType","targetId") VALUES('reset-audit','reset-seller','LISTING_PUBLISHED','Listing','reset-listing');`);
  }, 120000);
  afterAll(async () => { await admin?.end(); await postgres?.stop(); });

  it("wrong or missing target identity and caller-claimed state refuse before any application read", async () => {
    const before = await snapshot();
    const cases: [string, Record<string, unknown>, Record<string, string | undefined>][] = [];
    const env = (change: Record<string, string | undefined>) => ({ ...containerEnv(), ...change });
    for (const [label, change] of [
      ["project", { RAILWAY_PROJECT_ID: "other-project" }], ["environment", { RAILWAY_ENVIRONMENT_ID: "other-staging" }],
      ["worker service", { RAILWAY_SERVICE_ID: "test-worker" }], ["environment name", { RAILWAY_ENVIRONMENT_NAME: "production" }],
      ["missing environment name", { RAILWAY_ENVIRONMENT_NAME: undefined }], ["production app", { APP_ENV: "production" }],
      ["candidate", { AUTOTM_COMMIT_SHA: "b".repeat(40) }], ["database host", { DATABASE_URL: "postgresql://u:secret@other.railway.internal:5432/railway" }],
    ] as const) cases.push([label, inventoried(), env(change)]);
    const payload = (label: string, change: (value: Record<string, unknown>) => void, base = inventoried()) => { change(base); cases.push([label, base, containerEnv()]); };
    payload("caller quiescence", value => { value["quiesced"] = true; });
    payload("caller workers stopped", value => { value["workersStopped"] = true; });
    payload("caller completion", value => { value["completed"] = true; });
    payload("inventory claim on observation", value => { value["expectedInventory"] = blindDigest; });
    payload("rows without observation", value => { delete value["expectedInventory"]; }, rows(blindDigest));
    payload("other operation", value => { value["operation"] = "reset"; });
    payload("unknown phase", value => { value["phase"] = "cf-detached"; });
    payload("operation id", value => { value["operationId"] = "not-hex"; });
    payload("missing reservation", value => { delete value["reservationId"]; });
    payload("missing database origin", value => { (value["identity"] as { origins: Record<string, unknown> }).origins = {}; });
    payload("missing worker", value => { delete (value["identity"] as { services: Record<string, unknown> }).services["worker"]; });
    // Strict strings, analogous to S1: no number or one-element array may coerce into an identity.
    payload("numeric operation id", value => { value["operationId"] = 1; });
    payload("numeric reservation id", value => { value["reservationId"] = 2; });
    payload("array operation id", value => { value["operationId"] = [operationId]; });
    payload("array reservation id", value => { value["reservationId"] = [reservationId]; });
    payload("array candidate", value => { value["candidate"] = [candidate]; });
    payload("array phase", value => { value["phase"] = ["inventoried"]; });
    payload("array project", value => { (value["identity"] as Record<string, unknown>)["projectId"] = [identity.projectId]; });
    payload("two-part digest", value => { value["expectedInventory"] = { retained: "0".repeat(64), disposable: "0".repeat(64) }; }, rows(blindDigest));
    payload("numeric digest part", value => { value["expectedInventory"] = { ...blindDigest, schema: 0 }; }, rows(blindDigest));
    for (const [label, input, environment] of cases) {
      const outcome = await run(input, environment);
      expect({ label, code: outcome.code, failure: outcome.failure, queries: outcome.queries, receipt: outcome.receipt })
        .toEqual({ label, code: 1, failure: "Clean reset refused: target", queries: 0, receipt: undefined });
    }
    expect(await snapshot()).toEqual(before);
  });

  it("an existing cf namespace obstructing DELETE is refused at inventory; its control disposition stays separate S2 work", async () => {
    await query(`CREATE SCHEMA "${cfNamespace}";
      CREATE FUNCTION "${cfNamespace}".guard() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'Disposed campaign cannot be resurrected'; END $f$;
      CREATE TRIGGER "${cfNamespace}_auth" AFTER DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION "${cfNamespace}".guard();`);
    try {
      // Fixture validity: the retained row trigger really blocks a plain delete.
      await expect(query(`DELETE FROM users WHERE id='reset-buyer'`)).rejects.toThrow("Disposed campaign cannot be resurrected");
      const before = await snapshot();
      const outcome = await run(inventoried());
      expect([outcome.code, outcome.failure, outcome.receipt]).toEqual([1, `Clean reset refused: cf namespace ${cfNamespace} requires separate control disposition`, undefined]);
      const blind = await run(rows(blindDigest));
      expect([blind.code, blind.failure]).toEqual([1, `Clean reset refused: cf namespace ${cfNamespace} requires separate control disposition`]);
      expect(await snapshot()).toEqual(before);
      expect(await count("users")).toBe(2);
    } finally { await query(`DROP SCHEMA "${cfNamespace}" CASCADE`); }
  });

  it("unknown schema, table, trigger, retained reference into deleted data and protected content refuse atomically", async () => {
    const faults: [string, string, string][] = [
      ["CREATE SCHEMA rogue_schema", "DROP SCHEMA rogue_schema", "Clean reset refused: Unknown schema rogue_schema"],
      ["CREATE TABLE public.rogue_table(id text PRIMARY KEY)", "DROP TABLE public.rogue_table", "Clean reset refused: Unknown live table public.rogue_table"],
      [`CREATE FUNCTION public.rogue_guard() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NULL; END $f$;
        CREATE TRIGGER rogue_trigger AFTER DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION public.rogue_guard()`,
      "DROP TRIGGER rogue_trigger ON public.users; DROP FUNCTION public.rogue_guard()", "Clean reset refused: Unknown trigger rogue_trigger on public.users"],
      [`ALTER TABLE public.brands ADD COLUMN "rogueUserId" text CONSTRAINT brands_rogue_user_fkey REFERENCES public.users(id)`,
        `ALTER TABLE public.brands DROP COLUMN "rogueUserId"`, "Clean reset refused: Retained table references deleted table: public.brands -> public.users"],
      [`INSERT INTO blog_posts(id,slug,locale,title,body,"authorId","updatedAt") VALUES('reset-post','reset-post','ru','Post','Body','reset-seller',now())`,
        `DELETE FROM blog_posts WHERE id='reset-post'`, "Clean reset refused: Refused non-empty refuse-if-nonempty table public.blog_posts"],
      [`INSERT INTO diagnostic_centers(id,code,names,"operationalApproval") VALUES('reset-center','reset-center','{}','{"approvedBy":"founder"}')`,
        `DELETE FROM diagnostic_centers WHERE id='reset-center'`, "Clean reset refused: Approved diagnostic center present in public.diagnostic_centers"],
    ];
    for (const [arrange, restore, refusal] of faults) {
      await query(arrange);
      try {
        const before = await snapshot();
        const outcome = await run(inventoried());
        expect({ refusal, code: outcome.code, failure: outcome.failure, receipt: outcome.receipt }).toEqual({ refusal, code: 1, failure: refusal, receipt: undefined });
        const blind = await run(rows(blindDigest));
        expect({ refusal, code: blind.code, failure: blind.failure }).toEqual({ refusal, code: 1, failure: refusal });
        expect(await snapshot()).toEqual(before);
      } finally { await query(restore); }
    }
    expect(await count("users")).toBe(2);
  });

  it("another backend on the database refuses observation and deletion", async () => {
    const before = await snapshot();
    await settle();
    const other = new Client({ connectionString: databaseUrl });
    await other.connect();
    try {
      const observed = execute(inventoried());
      expect([observed.code, observed.failure, observed.receipt]).toEqual([1, "Clean reset refused: other database backends present", undefined]);
      const deleted = execute(rows(blindDigest));
      expect([deleted.code, deleted.failure]).toEqual([1, "Clean reset refused: other database backends present"]);
    } finally { await other.end(); }
    expect(await snapshot()).toEqual(before);
  });

  it("a stale observation refuses deletion: a later row, an added FK between known tables or a redefined known trigger", async () => {
    const trigger = (await query<{ def: string; fn: string }>(`SELECT pg_get_triggerdef(t.oid) AS def, t.tgfoid::regprocedure::text AS fn FROM pg_trigger t
      WHERE t.tgrelid='public.users'::regclass AND t.tgname='business_enquiry_user_revocation'`))[0];
    expect(trigger?.def).toMatch(/^CREATE TRIGGER business_enquiry_user_revocation /);
    const changes: [string, string, string, keyof Digest][] = [
      ["row", `INSERT INTO users(id,"displayName","updatedAt") VALUES('reset-late','Arrived after observation',now())`, `DELETE FROM users WHERE id='reset-late'`, "disposable"],
      ["foreign key", `ALTER TABLE public.favorites ADD CONSTRAINT favorites_rogue_user_fkey FOREIGN KEY ("userId") REFERENCES public.users(id)`,
        `ALTER TABLE public.favorites DROP CONSTRAINT favorites_rogue_user_fkey`, "schema"],
      ["trigger", `DROP TRIGGER business_enquiry_user_revocation ON public.users;
        CREATE TRIGGER business_enquiry_user_revocation AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION ${trigger?.fn ?? "missing()"}`,
      `DROP TRIGGER business_enquiry_user_revocation ON public.users; ${trigger?.def ?? ""}`, "schema"],
    ];
    for (const [label, arrange, restore, part] of changes) {
      const observed = await run(inventoried());
      expect({ label, code: observed.code, failure: observed.failure }).toEqual({ label, code: 0, failure: "" });
      const digest = observed.receipt?.["digest"] as Digest;
      expect(digest).toEqual(digestShape);
      await query(arrange);
      try {
        // The change is known to the planner, so a fresh observation still succeeds; only its digest part moves.
        const fresh = await run(inventoried());
        expect({ label, code: fresh.code, moved: (fresh.receipt?.["digest"] as Digest | undefined)?.[part] !== digest[part] }).toEqual({ label, code: 0, moved: true });
        const before = await snapshot();
        const outcome = await run(rows(digest));
        expect({ label, code: outcome.code, failure: outcome.failure, receipt: outcome.receipt })
          .toEqual({ label, code: 1, failure: "Clean reset refused: Inventory changed since observation", receipt: undefined });
        expect(await snapshot()).toEqual(before);
      } finally { await query(restore); }
    }
    expect(await query(`SELECT "displayName" FROM users ORDER BY id`)).toEqual([{ displayName: "Disposable buyer" }, { displayName: "Disposable seller" }]);
  });

  it("deletes only the explicit disposable public tables in one transaction and binds completion to the exact operation", async () => {
    const live = await tables();
    expect(live).toEqual(expect.arrayContaining(retained));
    const namespacesBefore = await namespaces();
    const observed = await run(inventoried());
    expect([observed.code, observed.failure]).toEqual([0, ""]);
    const receipt = observed.receipt ?? {};
    expect(Object.keys(receipt).sort()).toEqual(["candidate", "digest", "environmentId", "operation", "operationId", "phase", "plan", "reservationId", "rows", "state"]);
    expect(receipt).toEqual(expect.objectContaining({ ...bound, phase: "inventoried", state: "observed", digest: digestShape }));
    expect(receipt["plan"]).toEqual({ mode: "RESTRICT", retain: retained, truncate: live.filter(name => !retained.includes(name)) });
    expect(receipt["rows"]).toEqual(expect.objectContaining({ "public.users": 2, "public.sessions": 1, "public.listings": 1, "public.favorites": 1,
      "public.audit_logs": 1, "public.brands": 1, "public.exchange_rates": 1, "public.measurement_state": 1, "public._prisma_migrations": migrations.length }));
    const before = receipt["digest"] as Digest;
    const kept = (all: Record<string, string>) => Object.fromEntries(Object.entries(all).filter(([name]) => retained.includes(name) || name === "public-catalog"));
    const retainedBefore = kept(await snapshot());

    const completed = await run(rows(before));
    expect([completed.code, completed.failure]).toEqual([0, ""]);
    expect(completed.receipt).toEqual({ ...bound, phase: "rows", state: "completed",
      digest: { schema: before.schema, retained: before.retained, disposable: expect.stringMatching(hex64) } });
    const after = completed.receipt?.["digest"] as Digest;
    expect(after.disposable).not.toBe(before.disposable);

    for (const name of live.filter(table => !retained.includes(table))) expect({ name, rows: await count(name) }).toEqual({ name, rows: 0 });
    expect(kept(await snapshot())).toEqual(retainedBefore);
    // At most one operator receipt namespace may appear; no namespace disappears and no cf namespace is created.
    const namespacesAfter = await namespaces();
    const added = namespacesAfter.filter(name => !namespacesBefore.includes(name));
    expect({ kept: namespacesBefore.every(name => namespacesAfter.includes(name)), added: added.length <= 1, cf: added.filter(name => name === "public" || name.startsWith("cf_")) })
      .toEqual({ kept: true, added: true, cf: [] });
    expect(await query(`SELECT id,slug,"logoKey" FROM brands`)).toEqual([{ id: "reset-brand", slug: "reset-brand", logoKey: "brands/reset-brand/admin-upload-7/logo-60.png" }]);
    expect(await query(`SELECT id,rate,"setByUserId","updatedAt"::text AS "updatedAt" FROM exchange_rates`))
      .toEqual([{ id: "reset-rate", rate: 19.25, setByUserId: "reset-seller", updatedAt: "2026-10-01 00:00:00" }]);
    expect(await query(`SELECT key,epoch FROM measurement_state`)).toEqual([{ key: "global", epoch: "epoch-reset-7" }]);
    expect(await query(`SELECT id FROM generations UNION ALL SELECT id FROM models UNION ALL SELECT id FROM cities UNION ALL SELECT id FROM colors ORDER BY 1`))
      .toEqual([{ id: "reset-city" }, { id: "reset-color" }, { id: "reset-generation" }, { id: "reset-model" }]);
    expect((await query<{ name: string }>(`SELECT migration_name AS name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`))
      .map(row => row.name).sort()).toEqual(migrations);

    // Empty disposable contents alone never certify completion. Another operation, reservation,
    // candidate or environment holding the original observation refuses and changes nothing,
    // including any operator receipt.
    const current = await snapshot(); const stored = await files();
    const otherCandidate = "d".repeat(40);
    const mismatches: [string, Record<string, unknown>, Record<string, string | undefined>][] = [
      ["operation", { ...rows(before), operationId: "a".repeat(32) }, containerEnv()],
      ["reservation", { ...rows(before), reservationId: "b".repeat(32) }, containerEnv()],
      ["candidate", { ...rows(before), candidate: otherCandidate }, { ...containerEnv(), AUTOTM_COMMIT_SHA: otherCandidate }],
      ["environment", { ...rows(before), identity: { ...structuredClone(identity), environmentId: "other-staging" } }, { ...containerEnv(), RAILWAY_ENVIRONMENT_ID: "other-staging" }],
    ];
    const refusals = ["Clean reset refused: Inventory changed since observation", "Clean reset refused: Clean-reset operation identity changed"];
    for (const [label, input, environment] of mismatches) {
      const outcome = await run(input, environment);
      // The remote program sanitizes failure; Vitest emits this context only when the original assertion fails.
      expect({ label, code: outcome.code, receipt: outcome.receipt, refused: refusals.includes(outcome.failure) },
        JSON.stringify({ label, failure: outcome.failure, queries: outcome.queries, subprocesses: outcome.subprocesses }))
        .toEqual({ label, code: 1, receipt: undefined, refused: true });
      expect(await files()).toEqual(stored);
      expect(await snapshot()).toEqual(current);
    }

    // The first response is treated as lost. A restarted process with the exact operation
    // and the same prior observation observes its own durable completion and repeats nothing.
    const replay = await run(rows(before));
    expect([replay.code, replay.failure]).toEqual([0, ""]);
    expect(replay.receipt).toEqual({ ...bound, phase: "rows", state: "observed", digest: after });
    expect(await files()).toEqual(stored);
    expect(await snapshot()).toEqual(current);
    const reobserved = await run(inventoried());
    expect([reobserved.code, reobserved.receipt?.["state"], reobserved.receipt?.["digest"]]).toEqual([0, "observed", after]);
    expect(reobserved.receipt).toEqual(expect.objectContaining(bound));
  });
});
