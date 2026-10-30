// Stage 2a: post-migration fingerprints/privileges/guards/ordering. No scope or prepare calls.
const L = require('./lib.cjs');
const { fs, Client, OUT, SRC, REPO, sha, read, write, fingerprints } = L;
(async () => {
  const r = read(OUT + '/resource.private.json'), man = read(OUT + '/migration-manifest.json'), p98 = read(OUT + '/fingerprints-98.private.json');
  const c = new Client({ connectionString: r.ownerUrl, application_name: 'r7g-decision-stage2' }); await c.connect();
  const fp = await fingerprints(c, r.workerRole), out = { hashes: fp.hashes };
  const rows = fp.migrations;
  out.migrationRowsEqualManifest = rows.length === man.count && rows.every((m, i) => m.migration_name === man.migrations[i].name && m.checksum === man.migrations[i].sha256);
  out.migrationStatus = (await c.query("SELECT count(*)::int total,count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int finished FROM _prisma_migrations")).rows[0];
  const o = new Map(p98.funcs.map(f => [f.name, f.definition])), n = new Map(fp.funcs.map(f => [f.name, f.definition]));
  out.functionDiff = { added: [...n.keys()].filter(k => !o.has(k)), removed: [...o.keys()].filter(k => !n.has(k)), changed: [...n.keys()].filter(k => o.has(k) && o.get(k) !== n.get(k)) };
  const oa = new Map(p98.fnAcl.map(f => [f.function, sha(f)])), na = new Map(fp.fnAcl.map(f => [f.function, f]));
  out.aclDiff = { changedOrAdded: fp.fnAcl.filter(f => oa.get(f.function) !== sha(f)).map(f => ({ function: f.function, owner: f.owner, acl: f.acl, volatility: f.volatility, secdef: f.secdef, config: f.config })) };
  const op = new Map(p98.funcPrivileges.map(f => [f.function, f.execute]));
  out.workerFunctionPrivilegeDiff = fp.funcPrivileges.filter(f => op.get(f.function) !== f.execute).map(f => ({ function: f.function, before: op.has(f.function) ? op.get(f.function) : 'absent', execute: f.execute }));
  out.workerTablePrivilegesUnchanged = fp.hashes.workerTablePrivileges === p98.hashes.workerTablePrivileges;
  out.tablePrivilegesUnchanged = fp.hashes.tablePrivileges === p98.hashes.tablePrivileges;
  out.dataUnchangedFrom98 = fp.hashes.data === p98.hashes.data;
  out.guardsUnchangedFrom98 = fp.hashes.guards === p98.hashes.guards;
  out.workerExecutePrivilegeOnReadiness = fp.funcPrivileges.filter(f => /guards_ready|preparation_ready|prepare_source|dispose_ownership|disposal_scope|source_key_predicate|source_scope\(|source_parse|source_effects|source_lock_keys/.test(f.function)).map(f => f.function + '=' + f.execute);
  out.workerRole = (await c.query('SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1', [r.workerRole])).rows[0];
  out.workerMemberships = (await c.query("SELECT r.rolname role FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member WHERE m.rolname=$1", [r.workerRole])).rows;
  out.registryHash = sha((await c.query('SELECT public.diagnostic_source_registry() v')).rows[0].v);
  out.registryMapPresent = (await c.query("SELECT to_regprocedure('public.diagnostic_source_registry_map()') a, to_regprocedure('public.diagnostic_source_key_predicate(text,jsonb)') b")).rows[0];
  const wc = new Client({ connectionString: r.workerUrl, application_name: 'r7g-decision-worker-ready' }); await wc.connect();
  out.workerSession = (await wc.query("SELECT current_database() database,current_user principal,current_setting('transaction_isolation') isolation,current_setting('session_replication_role') replication,current_setting('track_functions') tracking,diagnostic_source_guards_ready() source,campaign_preparation_ready() campaign")).rows[0];
  await wc.end();
  out.pgVersion = (await c.query('SHOW server_version')).rows[0].server_version;
  out.settings = Object.fromEntries((await c.query("SELECT name,setting FROM pg_settings WHERE name IN ('shared_buffers','work_mem','max_connections','track_functions','jit','default_transaction_isolation','statement_timeout','lock_timeout','random_page_cost','autovacuum')")).rows.map(x => [x.name, x.setting]));
  // worker order vs saved command order, cutoff equality
  const full = read(SRC + '/normalized100-command.private.json');
  const cutoff = full.cutoff;
  const due = (await c.query(`SELECT id,"rightsUntil"::text ru FROM diagnostic_ownership_grants WHERE state='available' AND "rightsUntil"<=$1::timestamp ORDER BY "rightsUntil" ASC,id ASC LIMIT 100`, [cutoff])).rows;
  out.order = { due: due.length, distinctRightsUntil: new Set(due.map(x => x.ru)).size, workerOrderEqualsIdSorted: JSON.stringify(due.map(x => x.id)) === JSON.stringify(full.rows.map(x => x.key.id)), workerOrderEqualsCommandRows: JSON.stringify(due.map(x => x.id)) === JSON.stringify(full.roots.map(x => x.key.id)), cutoff, group2FirstId: due[10]?.id,
    pair: { candidate: due.findIndex(x => x.id.startsWith('1742ffa5')), predecessor: due.findIndex(x => x.id.startsWith('9f31c4c0')) } };
  out.receipts = fp.receipts;
  const g = (await c.query("SELECT pg_get_functiondef(p.oid) d FROM pg_proc p WHERE p.proname='diagnostic_source_scope_before_purge'")).rows[0].d;
  write('cap-guard-source.txt', g);
  write('fingerprints-101.private.json', { funcs: fp.funcs, guards: fp.guards, inventory: fp.inventory, funcPrivileges: fp.funcPrivileges, workerTables: fp.workerTables, privileges: fp.privileges, fnAcl: fp.fnAcl, migrations: fp.migrations, hashes: fp.hashes });
  write('setup-stage2.json', out); console.log(JSON.stringify(out, null, 1));
  await c.end();
})().catch(e => { console.error(e.stack); process.exit(1); });
