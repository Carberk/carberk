import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client, Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrations = `${root}prisma/migrations`;
const seam = "20261026016400_diagnostic_source_key_predicate";
const sha256 = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
type Entry = { table: string; pk: string[]; fields: string[] };
type Fn = { name: string; definition: string; owner: string; acl: string | null; prosrc: string; volatile: string; secdef: boolean; config: string[] | null };
const containment = "to_jsonb(s) @> $1";
// The only text each seam site changes; every other byte of the three bodies is preserved.
const sites: Record<string, [string, string]> = {
  "diagnostic_source_read(text,jsonb)": [
    "format('SELECT to_jsonb(s) FROM public.%I s WHERE to_jsonb(s) @> $1',t)",
    "format('SELECT to_jsonb(s) FROM public.%I s WHERE ',t)||public.diagnostic_source_key_predicate(t,k)"],
  "diagnostic_source_insert_receipt()": [
    "format('SELECT 1 FROM public.%I s WHERE to_jsonb(s) @> $1 FOR UPDATE',t)",
    "format('SELECT 1 FROM public.%I s WHERE ',t)||public.diagnostic_source_key_predicate(t,k)||' FOR UPDATE'"],
  "campaign_preparation_scope(jsonb)": [
    "format('SELECT to_jsonb(s) FROM public.%I s WHERE to_jsonb(s) @> $1',t) INTO old_row",
    "format('SELECT to_jsonb(s) FROM public.%I s WHERE ',t)||public.diagnostic_source_key_predicate(t,e->'key') INTO old_row"],
};
function present<T>(value: T | undefined): T { if (value === undefined) throw new Error("missing real SQL result"); return value; }
const ident = (name: string) => /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replaceAll("\"", "\"\"")}"`;
// Ad hoc test statements bind $1 as jsonb, as the functions' EXECUTE ... USING does.
const bound = (where: string) => where.replaceAll("$1", "$1::jsonb");
const literal = (text: string) => `'${text.replaceAll("'", "''")}'`;
const typed = (pk: string[]) => [...pk].sort().map(c => `s.${ident(c)}=$1->>'${c.replaceAll("'", "''")}'`).join(" AND ");

/** Real-PostgreSQL oracle for the per-key source predicate. No timing assertion. */
describe("diagnostic source key predicate on the full migrated chain", () => {
  let container: StartedPostgreSqlContainer, admin: Pool, pre: Pool, post: Pool, url: (db: string) => string;
  let registry: Entry[];

  async function surface(pool: Pool | PoolClient) {
    const functions = (await pool.query<Fn>(`SELECT p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition,p.proowner::regrole::text owner,
      p.proacl::text acl,p.prosrc,p.provolatile::text volatile,p.prosecdef secdef,p.proconfig config
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY 1`)).rows;
    const guards = (await pool.query(`SELECT c.relname,t.tgname,t.tgenabled::text enabled,t.tgfoid::regprocedure::text function,pg_get_triggerdef(t.oid) definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
    return { functions, guards };
  }
  // Same digest as the recorded full-chain registry163 harness (owner omitted).
  const harnessFunctionHash = (functions: Fn[]) => sha256(functions.map(f => ({ name: f.name, definition: f.definition, acl: f.acl })));
  // Drops NOT NULL from every non-key column of a test-owned copy (registry fields omit some columns).
  async function relax(pool: Pool | PoolClient, copy: string, pk: string[]) {
    const columns = (await pool.query<{ name: string }>("SELECT attname::text name FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped AND attnotnull", [copy])).rows;
    for (const { name } of columns.filter(c => !pk.includes(c.name))) await pool.query(`ALTER TABLE ${copy} ALTER COLUMN ${ident(name)} DROP NOT NULL`);
  }
  async function predicate(pool: Pool | PoolClient, table: string | null, key: unknown) {
    return present((await pool.query<{ p: string }>("SELECT public.diagnostic_source_key_predicate($1,$2::jsonb) p", [table, key === undefined ? null : JSON.stringify(key)])).rows[0]).p;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    url = db => { const u = new URL(container.getConnectionUri()); u.pathname = `/${db}`; return u.toString(); };
    admin = new Pool({ connectionString: url("postgres") });
    await admin.query("CREATE DATABASE key_predicate_pre"); await admin.query("CREATE DATABASE key_predicate_post");
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: root, env: { ...process.env, DATABASE_URL: url("key_predicate_post") }, stdio: "pipe" });
    pre = new Pool({ connectionString: url("key_predicate_pre") }); post = new Pool({ connectionString: url("key_predicate_post") });
    // The chain before this seam, applied byte-for-byte from the immutable historical files.
    for (const name of readdirSync(migrations).filter(n => n !== "migration_lock.toml" && n !== seam).sort())
      await pre.query(readFileSync(`${migrations}/${name}/migration.sql`, "utf8"));
    registry = present((await post.query<{ v: Entry[] }>("SELECT public.diagnostic_source_registry() v")).rows[0]).v;
  });
  afterAll(async () => { await pre?.end(); await post?.end(); await admin?.end(); await container?.stop(); });

  it("the pre-seam chain is the recorded registry163 full-chain surface", async () => {
    const before = await surface(pre);
    expect(harnessFunctionHash(before.functions)).toBe("a6c66ee722f0f0c3bdc5272b17ece2479358eacb1d3e935679cd2411a0320e89");
    expect(sha256(before.guards)).toBe("b2be78df47e043f8268184b21eecce1fde636646c82931d688aa7d36bfa5aaff");
    expect(registry).toHaveLength(77);
    expect(sha256(registry)).toBe("6d7b15db175c3d3e7779a053e8d459f81cc07c163373600ba42e0e91c3a094be");
  });

  it("changes only the helper and the three per-key statement texts; attributes, registry and guards are unchanged", async () => {
    const before = await surface(pre), after = await surface(post);
    const b = new Map(before.functions.map(f => [f.name, f])), a = new Map(after.functions.map(f => [f.name, f]));
    expect([...a.keys()].filter(k => !b.has(k))).toEqual(["diagnostic_source_key_predicate(text,jsonb)"]);
    expect([...b.keys()].filter(k => !a.has(k))).toEqual([]);
    expect([...a.keys()].filter(k => b.has(k) && sha256(a.get(k)) !== sha256(b.get(k))).sort()).toEqual(Object.keys(sites).sort());
    for (const [name, [from, to]] of Object.entries(sites)) {
      const old = present(b.get(name)), now = present(a.get(name));
      expect(old.prosrc.split(from)).toHaveLength(2);
      expect(now.prosrc).toBe(old.prosrc.replace(from, to));
      expect({ ...now, prosrc: "", definition: "" }).toEqual({ ...old, prosrc: "", definition: "" });
    }
    const helper = present(a.get("diagnostic_source_key_predicate(text,jsonb)"));
    expect({ volatile: helper.volatile, secdef: helper.secdef, config: helper.config, acl: helper.acl })
      .toEqual({ volatile: "i", secdef: false, config: ["search_path=pg_catalog, public"], acl: null });
    expect(sha256(after.guards)).toBe(sha256(before.guards));
    for (const sql of ["SELECT public.diagnostic_source_registry() v", "SELECT public.diagnostic_source_registry_map() v"])
      expect((await post.query(sql)).rows).toEqual((await pre.query(sql)).rows);
  });

  it("emits typed primary-key equality only for the exact registry key with string values", async () => {
    const typedTables = [];
    for (const e of registry) {
      const exact = Object.fromEntries(e.pk.map(c => [c, "K"]));
      expect(await predicate(post, e.table, exact)).toBe(typed(e.pk));
      typedTables.push(e.table);
      const other = present(e.fields.find(f => !e.pk.includes(f)));
      for (const key of [
        { ...exact, [other]: "K" }, { ...exact, [other]: null }, Object.fromEntries(e.pk.slice(1).map(c => [c, "K"])),
        { ...exact, [present(e.pk[0])]: null }, { ...exact, [present(e.pk[0])]: 7 }, { ...exact, [present(e.pk[0])]: true },
        { ...exact, [present(e.pk[0])]: { v: "K" } }, { ...exact, [present(e.pk[0])]: ["K"] }, { [other]: "K" }, {}, ["K"], "K", null,
      ]) expect(await predicate(post, e.table, key)).toBe(containment);
    }
    expect(typedTables).toHaveLength(77);
    for (const [table, key] of [[null, { id: "K" }], ["not_a_registered_table", { id: "K" }], ["users", undefined]] as const)
      expect(await predicate(post, table, key)).toBe(containment);
  });

  it("selects and FOR UPDATE-locks exactly the containment rows for all77 tables and adversarial keys", async () => {
    const client = await post.connect();
    try {
      let compared = 0;
      for (const [index, e] of registry.entries()) {
        await client.query("BEGIN");
        try {
          const copy = `pg_temp.oracle_${index}`;
          // Same columns, types, order and collations; only NOT NULL relaxed so key rows need no other values.
          await client.query(`CREATE TEMP TABLE oracle_${index} (LIKE public.${ident(e.table)}) ON COMMIT DROP`);
          await relax(client, copy, e.pk);
          // Case, padding, numeric text, NFC/NFD and no-break space stay distinct under exact equality.
          const values = ["K", "k", "K ", " K", "123", "K\u00e9", "Ke\u0301", "K\u00a0"];
          const rows = e.pk.length === 1 ? values.map(v => [v]) : values.flatMap(v => [[v, "L"], ["L", v]]);
          for (const row of rows) await client.query(`INSERT INTO ${copy}(${e.pk.map(ident).join(",")}) VALUES (${row.map((_, i) => `$${i + 1}`).join(",")})`, row);
          const other = present(e.fields.find(f => !e.pk.includes(f)));
          const keys: unknown[] = [];
          for (const v of [...values, "Z", "", "K\\", "K'", "%", "K%"]) {
            const exact = e.pk.length === 1 ? { [present(e.pk[0])]: v } : { [present(e.pk[0])]: v, [present(e.pk[1])]: "L" };
            keys.push(exact, { ...exact, [other]: null }, { ...exact, [other]: v }, { [present(e.pk[0])]: v });
          }
          keys.push({ [present(e.pk[0])]: 123 }, { [present(e.pk[0])]: null }, { [present(e.pk[0])]: ["K"] }, { [other]: null }, {}, ["K"], "K", null);
          for (const key of keys) {
            const text = key === null ? null : JSON.stringify(key);
            const chosen = await predicate(client, e.table, key);
            for (const lock of ["", " FOR UPDATE"]) {
              const run = async (where: string) => (await client.query<{ ctid: string }>(`SELECT ctid::text FROM ${copy} s WHERE ${bound(where)}${lock}`, [text])).rows.map(r => r.ctid).sort();
              expect(await run(chosen), `${e.table} ${text}${lock}`).toEqual(await run(containment));
              compared++;
            }
          }
        } finally { await client.query("ROLLBACK"); }
      }
      expect(compared).toBeGreaterThan(77 * 100);
    } finally { client.release(); }
  });

  it("rechecks a concurrently changed row exactly like containment under READ COMMITTED FOR UPDATE", async () => {
    const users = present(registry.find(e => e.table === "users"));
    const other = present(users.fields.find(f => !users.pk.includes(f)));
    await post.query("CREATE SCHEMA oracle_lock");
    try {
      await post.query("CREATE TABLE oracle_lock.users (LIKE public.users INCLUDING INDEXES)");
      await relax(post, "oracle_lock.users", users.pk);
      const typedWhere = await predicate(post, "users", { id: "K" });
      expect(typedWhere).toBe(typed(users.pk));
      const outcomes: Record<string, unknown> = {};
      for (const [name, where] of [["typed", typedWhere], ["containment", containment]] as const) {
        for (const change of ["key", "other"] as const) {
          await post.query("TRUNCATE oracle_lock.users"); await post.query("INSERT INTO oracle_lock.users(id) VALUES ('K')");
          const writer = new Client({ connectionString: url("key_predicate_post") }), locker = new Client({ connectionString: url("key_predicate_post") });
          await writer.connect(); await locker.connect();
          try {
            await writer.query("BEGIN");
            await writer.query(change === "key" ? "UPDATE oracle_lock.users SET id='K2' WHERE id='K'" : `UPDATE oracle_lock.users SET ${ident(other)}=NULL WHERE id='K'`);
            await locker.query("BEGIN ISOLATION LEVEL READ COMMITTED");
            const pid = present((await locker.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]).pid;
            const waiting = locker.query<{ id: string }>(`SELECT s.id FROM oracle_lock.users s WHERE ${bound(where)} FOR UPDATE`, [JSON.stringify({ id: "K" })]);
            for (let i = 0; i < 100; i++) {
              const state = (await post.query<{ w: string | null }>("SELECT wait_event_type w FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0];
              if (state?.w === "Lock") break;
              await new Promise(resolve => setTimeout(resolve, 20));
            }
            expect((await post.query<{ w: string | null }>("SELECT wait_event_type w FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.w).toBe("Lock");
            await writer.query("COMMIT");
            outcomes[`${name}:${change}`] = (await waiting).rows;
            await locker.query("ROLLBACK");
          } finally { await writer.end(); await locker.end(); }
        }
      }
      expect(outcomes).toEqual({ "typed:key": [], "containment:key": [], "typed:other": [{ id: "K" }], "containment:other": [{ id: "K" }] });
    } finally { await post.query("DROP SCHEMA oracle_lock CASCADE"); }
  });

  it("EXPLAIN-only: every exact key is served by its unique primary-key index; containment cannot be", async () => {
    const client = await post.connect();
    try {
      await client.query("BEGIN"); await client.query("SET LOCAL enable_seqscan=off");
      for (const [index, e] of registry.entries()) {
        const exact = Object.fromEntries(e.pk.map(c => [c, "K"]));
        const unique = (await client.query<{ name: string }>(`SELECT i.indexrelid::regclass::text name FROM pg_index i WHERE i.indrelid=to_regclass($1) AND i.indisunique AND i.indpred IS NULL
          AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a WHERE a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey))=(SELECT array_agg(c ORDER BY c) FROM unnest($2::text[]) c)`,
        [`public.${ident(e.table)}`, e.pk])).rows.map(r => r.name.replace(/^public\./, ""));
        expect(unique.length, e.table).toBeGreaterThan(0);
        for (const [label, where] of [["typed", await predicate(client, e.table, exact)], ["containment", containment]] as const) {
          await client.query(`PREPARE oracle_plan_${index}_${label}(jsonb) AS SELECT 1 FROM public.${ident(e.table)} s WHERE ${where} FOR UPDATE`);
          const plan = (await client.query<{ "QUERY PLAN": string }>(`EXPLAIN (COSTS OFF) EXECUTE oracle_plan_${index}_${label}(${literal(JSON.stringify(exact))})`)).rows.map(r => r["QUERY PLAN"]).join("\n");
          if (label === "typed") expect(plan, e.table).toMatch(new RegExp(`Index (Only )?Scan using "?(${unique.join("|")})"?`));
          else expect(plan, e.table).toMatch(/Seq Scan/);
        }
      }
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("EXPLAIN-only: the actual source read and campaign old-row statements use the primary-key index", async () => {
    const plans = async (pool: Pool) => {
      const client = await pool.connect(), logged: string[] = [];
      const listener = (message: { message?: string }) => { if (message.message) logged.push(message.message); };
      client.on("notice", listener);
      try {
        await client.query("LOAD 'auto_explain'");
        await client.query("SET auto_explain.log_min_duration=0"); await client.query("SET auto_explain.log_nested_statements=on");
        await client.query("SET auto_explain.log_analyze=off"); await client.query("SET client_min_messages=log");
        await client.query("BEGIN");
        await client.query("SELECT public.diagnostic_source_read('users',$1::jsonb)", [JSON.stringify({ id: "absent-key" })]);
        await client.query("SELECT public.campaign_preparation_scope($1::jsonb)", [JSON.stringify([{ table: "users", key: { id: "absent-key" }, verb: "insert", next: {} }])]);
        await client.query("ROLLBACK");
      } finally { client.off("notice", listener); await client.query("RESET client_min_messages"); client.release(); }
      return logged.filter(m => m.includes("FROM public.users s WHERE"));
    };
    const before = await plans(pre), after = await plans(post);
    expect(before).toHaveLength(2); expect(after).toHaveLength(2);
    for (const plan of before) expect(plan).toMatch(/Seq Scan on users s/);
    for (const plan of after) expect(plan).toMatch(/Index (Only )?Scan using users_pkey on users s/);
  });

  describe("installation refuses drift before any replacement", () => {
    const sql = () => readFileSync(`${migrations}/${seam}/migration.sql`, "utf8");
    async function refuses(prepare: (client: PoolClient) => Promise<void>, message: string) {
      const client = await pre.connect();
      try {
        await client.query("BEGIN"); await prepare(client);
        await client.query("SAVEPOINT install");
        await expect(client.query(sql())).rejects.toMatchObject({ code: "P0001", message });
        await client.query("ROLLBACK TO SAVEPOINT install");
        expect((await client.query("SELECT to_regprocedure('public.diagnostic_source_key_predicate(text,jsonb)') p")).rows[0].p).toBeNull();
      } finally { await client.query("ROLLBACK"); client.release(); }
    }
    // Applies a key-column change to the first single-key registry table that accepts it.
    async function onLeaf(client: PoolClient, change: (e: Entry) => string) {
      for (const e of registry.filter(e => e.pk.length === 1)) {
        await client.query("SAVEPOINT leaf");
        try { await client.query(change(e)); await client.query("RELEASE SAVEPOINT leaf"); return; }
        catch { await client.query("ROLLBACK TO SAVEPOINT leaf"); }
      }
      throw new Error("no registry table accepts the key-column change");
    }
    it("migration file exists at the exact unused position after registry163", () => {
      const names = readdirSync(migrations).filter(n => n !== "migration_lock.toml").sort();
      expect(existsSync(`${migrations}/${seam}/migration.sql`)).toBe(true);
      expect(names.indexOf(seam)).toBe(names.indexOf("20261026016300_diagnostic_registry_metadata_lookup") + 1);
    });
    it("a nondeterministic primary-key collation", () => refuses(async client => {
      await client.query("CREATE COLLATION public.oracle_nondeterministic (provider = icu, locale = 'und-u-ks-level2', deterministic = false)");
      await onLeaf(client, e => `ALTER TABLE public.${ident(e.table)} ALTER COLUMN ${ident(present(e.pk[0]))} TYPE text COLLATE public.oracle_nondeterministic`);
    }, "diagnostic_source_key_collation"));
    it("a non-text primary-key column", () => refuses(async client => {
      await onLeaf(client, e => `ALTER TABLE public.${ident(e.table)} ALTER COLUMN ${ident(present(e.pk[0]))} TYPE varchar(200)`);
    }, "diagnostic_source_key_predicate_drift"));
    it("a primary key without its exact unique index", () => refuses(async client => {
      await onLeaf(client, e => `ALTER TABLE public.${ident(e.table)} DROP CONSTRAINT ${ident(`${e.table}_pkey`)}`);
    }, "diagnostic_source_key_predicate_drift"));
    for (const name of Object.keys(sites)) it(`a drifted ${name} body`, () => refuses(async client => {
      const definition = present((await client.query<{ d: string }>("SELECT pg_get_functiondef($1::regprocedure) d", [`public.${name}`])).rows[0]).d;
      await client.query(definition.replace("BEGIN", "BEGIN\n -- drift"));
    }, "diagnostic_source_key_predicate_drift"));
    it("positive control installs onto the pre-seam chain with the deployed surface", async () => {
      const client = await pre.connect();
      try {
        await client.query("BEGIN"); await client.query(sql());
        const installed = await surface(client), deployed = await surface(post);
        expect(sha256(installed.functions.map(f => ({ ...f, owner: "" })))).toBe(sha256(deployed.functions.map(f => ({ ...f, owner: "" }))));
        expect(sha256(installed.guards)).toBe(sha256(deployed.guards));
      } finally { await client.query("ROLLBACK"); client.release(); }
    });
  });
});
