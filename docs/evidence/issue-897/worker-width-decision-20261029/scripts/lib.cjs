// Shared helpers for the r7g decision diagnostics. Task-only; never touches retained ownership7.
const fs = require('fs'), crypto = require('crypto');
const PG = '/Users/bagtyyar/.t3/worktrees/carberk/t3-630f4e85/node_modules/pg';
const { Client } = require(PG);
const OUT = '/tmp/897-r7g-decision-20261029', ATT = '/tmp/897-r7g-worker-attribution-20261029', SRC = '/tmp/897-r6c-recovery-20261029';
const REPO = '/Users/bagtyyar/.t3/worktrees/carberk/t3-71b04cd7';
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const fileSha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read = p => JSON.parse(fs.readFileSync(p));
const write = (n, x) => fs.writeFileSync(OUT + '/' + n, typeof x === 'string' ? x : JSON.stringify(x, null, 2) + '\n', { mode: 0o600 });
const qi = x => '"' + x.replaceAll('"', '""') + '"';
const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
const MAP = { grants: 'diagnostic_ownership_grants', components: 'diagnostic_ownership_components', orders: 'inspection_orders', raw: 'diagnostic_identity_records', reports: 'diagnostic_reports', anchors: 'diagnostic_source_anchors', proofs: 'diagnostic_continuity_proofs', requests: 'diagnostic_continuity_requests' };
const fQ = "SELECT p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.oid::regprocedure::text";
const gQ = "SELECT c.relname,t.tgname,t.tgenabled::text enabled,t.tgfoid::regprocedure::text function,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname";
const receiptsQ = 'SELECT (SELECT count(*)::int FROM diagnostic_source_commands) source,(SELECT count(*)::int FROM campaign_preparations) campaign';
async function inventory(c) {
  const ts = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows, r = {};
  for (const { tablename: t } of ts) { const rows = (await c.query(`SELECT to_jsonb(t) row FROM public.${qi(t)} t ORDER BY to_jsonb(t)::text`)).rows.map(x => x.row); r[t] = { count: rows.length, sha256: sha(rows) }; }
  return r;
}
async function fingerprints(c, worker) {
  const funcs = (await c.query(fQ)).rows, guards = (await c.query(gQ)).rows;
  const migrations = (await c.query('SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name')).rows;
  const inv = await inventory(c);
  const surfaceQ = "SELECT p.oid::regprocedure::text function,has_function_privilege($1,p.oid,'EXECUTE') execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.oid::regprocedure::text";
  const funcPrivileges = (await c.query(surfaceQ, [worker])).rows;
  const workerTables = (await c.query("SELECT tablename,has_table_privilege($1,quote_ident(schemaname)||'.'||quote_ident(tablename),'SELECT') sel,has_table_privilege($1,quote_ident(schemaname)||'.'||quote_ident(tablename),'INSERT') ins,has_table_privilege($1,quote_ident(schemaname)||'.'||quote_ident(tablename),'UPDATE') upd,has_table_privilege($1,quote_ident(schemaname)||'.'||quote_ident(tablename),'DELETE') del FROM pg_tables WHERE schemaname='public' ORDER BY tablename", [worker])).rows;
  const privileges = (await c.query("SELECT table_schema,table_name,grantee,privilege_type,is_grantable FROM information_schema.table_privileges WHERE table_schema='public' ORDER BY table_name,grantee,privilege_type")).rows;
  const fnAcl = (await c.query("SELECT p.oid::regprocedure::text function,pg_get_userbyid(p.proowner) owner,p.proacl::text acl,p.provolatile::text volatility,p.prosecdef secdef,p.proconfig::text config FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.oid::regprocedure::text")).rows;
  const receipts = (await c.query(receiptsQ)).rows[0];
  return { funcs, guards, migrations, inventory: inv, funcPrivileges, workerTables, privileges, fnAcl, receipts,
    hashes: { functions: sha(funcs), functionCount: funcs.length, guards: sha(guards), guardCount: guards.length, migrations: sha(migrations), migrationCount: migrations.length, data: sha(inv),
      workerFunctionPrivileges: sha(funcPrivileges), workerTablePrivileges: sha(workerTables), tablePrivileges: sha(privileges), functionAcl: sha(fnAcl) } };
}
module.exports = { fs, crypto, Client, OUT, ATT, SRC, REPO, sha, fileSha, read, write, qi, canonical, MAP, fQ, gQ, receiptsQ, inventory, fingerprints };
