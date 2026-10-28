// Disposable full-chain proof for 163. Owns one throwaway container passed by URL.
// A: prisma migrate deploy of the whole current chain. B: raw 99 historical, snapshot, then 163.
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const wt = '/Users/bagtyyar/.t3/worktrees/carberk/t3-048fe887', pkg = wt + '/packages/db';
const { Client } = require(require.resolve('pg', { paths: [pkg] }));
const base = process.env.FULLCHAIN_URL, out = path.dirname(__filename);
if (!base || !/^postgres(ql)?:\/\/[^@]+@127\.0\.0\.1:\d+\//.test(base)) throw Error('Disposable loopback FULLCHAIN_URL required');
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const migDir = pkg + '/prisma/migrations', m163 = '20261026016300_diagnostic_registry_metadata_lookup', m162 = '20261026016200_diagnostic_maintenance_compatibility';
const all = fs.readdirSync(migDir).filter(n => n !== 'migration_lock.toml').sort();
const historical = all.filter(n => n !== m163);
const url = db => { const u = new URL(base); u.pathname = '/' + db; return u.toString(); };
const receipt = { assertions: [], timingAcceptance: false };
const step = (name, extra) => { receipt.assertions.push(name); if (extra) receipt[name] = extra; console.log('PASS', name); };
const surface = async c => ({
  functions: (await c.query("SELECT p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition,p.proowner::regrole::text owner,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY 1")).rows,
  guards: (await c.query("SELECT c.relname,t.tgname,t.tgenabled::text enabled,t.tgfoid::regprocedure::text function,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows,
  tables: (await c.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY 1,2")).rows,
});
(async () => {
  const admin = new Client({ connectionString: url('postgres') }); await admin.connect();
  await admin.query('CREATE DATABASE fullchain_deploy'); await admin.query('CREATE DATABASE fullchain_raw');
  await admin.query("CREATE ROLE fullchain_invoker LOGIN PASSWORD 'fullchain_invoker' NOSUPERUSER NOCREATEDB NOCREATEROLE");
  await admin.end();
  receipt.chain = { count: all.length, historical: historical.length, sha256: sha(all.map(n => ({ n, s: sha(fs.readFileSync(path.join(migDir, n, 'migration.sql'))) }))),
    m162: sha(fs.readFileSync(path.join(migDir, m162, 'migration.sql'))), m163: sha(fs.readFileSync(path.join(migDir, m163, 'migration.sql'))) };
  assert.equal(receipt.chain.m162, 'aebf91d78f4bd1711ac30ada3cb3b8b01da4999fcafbc963e45b839fc14ce379');
  assert.equal(receipt.chain.m163, 'e6447a2cf87af81e935805bdd3c1a1f234eb838667ef851599a0ea40d289c4e7');
  assert.equal(all.length, 100); assert.equal(all.at(-1), m163); assert.equal(all.at(-2), m162);

  // A: the real deploy path over the full current chain.
  execFileSync(pkg + '/node_modules/.bin/prisma', ['migrate', 'deploy'], { cwd: pkg, env: { ...process.env, DATABASE_URL: url('fullchain_deploy') }, stdio: 'pipe' });
  const a = new Client({ connectionString: url('fullchain_deploy') }); await a.connect();
  const applied = (await a.query('SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows;
  assert.deepEqual(applied.map(r => r.migration_name), all);
  for (const r of applied) assert.equal(r.checksum, sha(fs.readFileSync(path.join(migDir, r.migration_name, 'migration.sql'))));
  step('deploy applies 100 migrations incl. 162 then 163 with byte checksums');

  // B: raw historical 99, snapshot, then 163 only.
  const b = new Client({ connectionString: url('fullchain_raw') }); await b.connect();
  for (const n of historical) await b.query(fs.readFileSync(path.join(migDir, n, 'migration.sql'), 'utf8'));
  const before = await surface(b);
  const migration163 = fs.readFileSync(path.join(migDir, m163, 'migration.sql'), 'utf8');
  await b.query(migration163);
  const after = await surface(b);
  const byName = list => new Map(list.map(f => [f.name, f]));
  const bm = byName(before.functions), am = byName(after.functions);
  const changed = [...am.keys()].filter(k => bm.has(k) && JSON.stringify(bm.get(k)) !== JSON.stringify(am.get(k)));
  const added = [...am.keys()].filter(k => !bm.has(k)), removed = [...bm.keys()].filter(k => !am.has(k));
  assert.deepEqual({ changed, added, removed }, { changed: ['diagnostic_source_meta(text)'], added: ['diagnostic_source_registry_map()'], removed: [] });
  const mb = bm.get('diagnostic_source_meta(text)'), ma = am.get('diagnostic_source_meta(text)');
  assert.deepEqual({ owner: ma.owner, acl: ma.acl }, { owner: mb.owner, acl: mb.acl });
  assert.equal(sha(after.guards), sha(before.guards)); assert.equal(sha(after.tables), sha(before.tables));
  step('163 over full 99 incl. 162 changes only meta body and adds map; owner/ACL, all 162 wrappers, guards and columns unchanged', {
    functionsBefore: before.functions.length, functionsAfter: after.functions.length, guards: before.guards.length, guardHash: sha(after.guards),
    m162FunctionsUnchanged: [...bm.keys()].filter(k => /maintenance|diagnostic_source_(parse|scope|lock_keys|allows|account_effects|fk_effects)\(|campaign_source_mutations\(/.test(k)).length });
  const surfaceA = await surface(a);
  assert.equal(sha(surfaceA.functions.map(f => ({ ...f, owner: undefined }))), sha(after.functions.map(f => ({ ...f, owner: undefined }))));
  assert.equal(sha(surfaceA.guards), sha(after.guards));
  step('deploy surface equals raw 99+163 surface', { functionHash: sha(surfaceA.functions.map(f => ({ ...f, owner: undefined }))), guardHash: sha(surfaceA.guards) });
  const preMeta = mb.definition;

  // Metadata behavior under a non-owner invoker without table privileges.
  const inv = new Client({ connectionString: url('fullchain_deploy').replace(/\/\/[^@]+@/, '//fullchain_invoker:fullchain_invoker@') }); await inv.connect();
  const registry = (await inv.query('SELECT public.diagnostic_source_registry() v')).rows[0].v;
  assert.equal(registry.length, 77); assert.equal(new Set(registry.map(e => e.table)).size, 77);
  const rows = (await inv.query("SELECT entry->>'table' name,entry expected,public.diagnostic_source_meta(entry->>'table') actual FROM jsonb_array_elements(public.diagnostic_source_registry()) entry")).rows;
  assert.equal(rows.length, 77); for (const r of rows) assert.deepEqual(r.actual, r.expected);
  assert.deepEqual((await inv.query("SELECT public.diagnostic_source_meta(NULL) n,public.diagnostic_source_meta('not_a_registered_table') u,public.diagnostic_source_meta('') e")).rows[0], { n: null, u: null, e: null });
  assert.deepEqual((await inv.query('SELECT public.diagnostic_source_registry_map() m')).rows[0].m, Object.fromEntries(registry.map(e => [e.table, e])));
  // The pre-163 historical function is the oracle for every name, NULL and unknown.
  await a.query('BEGIN');
  try {
    await a.query(preMeta.replace(/^CREATE OR REPLACE FUNCTION public\.diagnostic_source_meta\(t text\)/, 'CREATE FUNCTION pg_temp.historical_meta(t text)'));
    const diff = (await a.query("SELECT count(*)::int d FROM (SELECT entry->>'table' n FROM jsonb_array_elements(public.diagnostic_source_registry()) entry UNION ALL SELECT NULL UNION ALL SELECT 'not_a_registered_table' UNION ALL SELECT 'Diagnostic_Reports' UNION ALL SELECT ' diagnostic_reports') x WHERE pg_temp.historical_meta(n) IS DISTINCT FROM public.diagnostic_source_meta(n)")).rows[0].d;
    assert.equal(diff, 0);
  } finally { await a.query('ROLLBACK'); }
  const attrs = (await a.query("SELECT provolatile,prosecdef,proconfig FROM pg_proc WHERE oid IN ('public.diagnostic_source_meta(text)'::regprocedure,'public.diagnostic_source_registry_map()'::regprocedure)")).rows;
  for (const x of attrs) assert.deepEqual(x, { provolatile: 'i', prosecdef: false, proconfig: ['search_path=pg_catalog, public'] });
  await inv.end();
  step('all77 entries, NULL, unknown, empty and case/space variants equal historical meta under non-owner invoker; map exact; immutable invoker search_path', { registryHash: sha(registry) });

  // Strict installation drift refusal on the full chain, before any replacement.
  const reset = async () => { await a.query(preMeta); await a.query('DROP FUNCTION public.diagnostic_source_registry_map()'); };
  const cases = [
    ['duplicate', [...registry.slice(0, 76), registry[0]]],
    ['null-name', [{ ...registry[0], table: null }, ...registry.slice(1)]],
    ['numeric-name', [{ ...registry[0], table: 7 }, ...registry.slice(1)]],
    ['missing-entry', registry.slice(1)],
    ['extra-entry', [...registry, { ...registry[0], table: 'extra_table' }]],
    ['metadata-drift', [{ ...registry[0], namespace: -1 }, ...registry.slice(1)]],
    ['reordered', [registry[1], registry[0], ...registry.slice(2)]],
    ['non-array', Object.fromEntries(registry.map(e => [e.table, e]))],
  ];
  for (const [name, entries] of cases) {
    await a.query('BEGIN');
    try {
      await reset();
      const body = 'SELECT ' + "'" + JSON.stringify(entries).replaceAll("'", "''") + "'::jsonb";
      await a.query("CREATE OR REPLACE FUNCTION public.diagnostic_source_registry() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS '" + body.replaceAll("'", "''") + "'");
      await a.query('SAVEPOINT s');
      await assert.rejects(a.query(migration163), e => e.code === 'P0001' && e.message === 'diagnostic_source_registry_metadata_drift');
      await a.query('ROLLBACK TO SAVEPOINT s');
      assert.equal((await a.query("SELECT to_regprocedure('public.diagnostic_source_registry_map()') IS NULL gone,(SELECT prosrc FROM pg_proc WHERE oid='public.diagnostic_source_meta(text)'::regprocedure) NOT LIKE '%registry_map%' historical")).rows.every(r => r.gone && r.historical), true);
    } finally { await a.query('ROLLBACK'); }
  }
  // Positive control: the same reset path reinstalls cleanly against the unchanged registry.
  await a.query('BEGIN'); try { await reset(); await a.query(migration163); } finally { await a.query('ROLLBACK'); }
  step('drift refuses before replacement: ' + cases.map(c => c[0]).join(', ') + '; unchanged registry positive control installs');
  const final = await surface(a);
  assert.equal(sha(final), sha(surfaceA));
  step('fixture surface unchanged after rolled-back negatives');
  await a.end(); await b.end();
  receipt.verdict = 'PASS';
})().catch(e => { receipt.verdict = 'FAIL'; receipt.error = { message: e.message, code: e.code }; console.error(e); process.exitCode = 1; })
  .finally(() => fs.writeFileSync(path.join(out, 'fullchain163.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 }));
