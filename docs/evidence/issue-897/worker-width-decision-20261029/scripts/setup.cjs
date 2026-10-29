// Stage 1: new task-only loopback PostgreSQL clone from the saved private dump + saved before.json (no retained ownership7 access),
// reconstruct all eight saved-before relations, compare to prior clone proof, then apply the actual candidate chain 162/163/164.
const L = require('./lib.cjs');
const { fs, Client, OUT, ATT, SRC, REPO, sha, read, write, qi, canonical, MAP, fQ, gQ, fingerprints } = L;
const { spawn, spawnSync } = require('child_process');
const run = (args, input) => { const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); if (r.status !== 0) throw Error('docker failed: ' + (r.stderr || '').slice(-1500)); return r.stdout; };
(async () => {
  if (fs.existsSync(OUT + '/resource.private.json')) throw Error('resource exists; inspect instead of duplicating');
  const saved = read(SRC + '/ownership-batched-native/before.json'), retained = read(ATT + '/retained-before.private.json'), oldFp = read(ATT + '/clone-fingerprints.private.json');
  const worker = read(ATT + '/ready.json').workerRole;
  const pass = require('crypto').randomUUID(), workerPass = require('crypto').randomUUID();
  const suffix = require('crypto').randomBytes(4).toString('hex'), container = 'r7g-decision-pg-' + suffix, project = 'r7g-decision-' + suffix;
  const cid = run(['run', '-d', '--name', container, '--label', 'com.docker.compose.project=' + project, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=' + pass, 'postgres:16-alpine', 'postgres', '-c', 'track_functions=all']).trim();
  const port = Number(run(['port', container, '5432/tcp']).trim().split('\n')[0].split(':').pop());
  if ([5432, 6379, 9000, 60936, 60937, 65379, 55294, 49451].includes(port)) throw Error('forbidden port ' + port);
  const db = 'r7g_decision_before', base = `postgresql://postgres:${pass}@127.0.0.1:${port}/`;
  write('resource.private.json', { project, container, containerId: cid, port, database: db, ownerUrl: base + db, workerRole: worker, workerUrl: `postgresql://${worker}:${workerPass}@127.0.0.1:${port}/${db}`, image: 'postgres:16-alpine' });
  let admin; for (let i = 0; i < 80; i++) { try { admin = new Client({ connectionString: base + 'postgres' }); await admin.connect(); break; } catch { admin = null; await new Promise(r => setTimeout(r, 250)); } }
  if (!admin) throw Error('PG not ready');
  for (const r of retained.roles) { if (r.rolname === 'postgres') continue; await admin.query(`CREATE ROLE ${qi(r.rolname)} ${r.rolsuper ? 'SUPERUSER' : 'NOSUPERUSER'} ${r.rolinherit ? 'INHERIT' : 'NOINHERIT'} ${r.rolcreaterole ? 'CREATEROLE' : 'NOCREATEROLE'} ${r.rolcreatedb ? 'CREATEDB' : 'NOCREATEDB'} ${r.rolcanlogin ? 'LOGIN' : 'NOLOGIN'} ${r.rolreplication ? 'REPLICATION' : 'NOREPLICATION'} ${r.rolbypassrls ? 'BYPASSRLS' : 'NOBYPASSRLS'}`); }
  for (const m of retained.memberships) await admin.query(`GRANT ${qi(m.role)} TO ${qi(m.member)} ${m.admin_option ? 'WITH ADMIN OPTION' : ''}`);
  await admin.query(`ALTER ROLE ${qi(worker)} PASSWORD '${workerPass}'`);
  await admin.query('CREATE DATABASE ' + qi(db)); await admin.end();
  run(['exec', '-i', container, 'pg_restore', '-U', 'postgres', '-d', db, '--no-owner', '--exit-on-error'], fs.readFileSync(ATT + '/ownership7-readonly.dump'));
  const c = new Client({ connectionString: base + db, application_name: 'r7g-decision-setup' }); await c.connect();
  const out = { container, port, database: db, workerRole: worker, dumpSha256: L.fileSha(ATT + '/ownership7-readonly.dump') };
  // 1. restored partial state must equal the saved retained export.
  const rf = (await c.query(fQ)).rows, rg = (await c.query(gQ)).rows, rinv = await L.inventory(c);
  out.restore = { functionsMatchRetained: sha(rf) === sha(retained.functions), guardsMatchRetained: sha(rg) === sha(retained.guards), dataMatchRetained: sha(rinv) === sha(retained.inventory) };
  if (!Object.values(out.restore).every(Boolean)) throw Error('restore fingerprint mismatch ' + JSON.stringify(out.restore));
  // 2. reconstruct the three altered relations from saved before, shadow fixture only.
  const pk = { grants: ['id'], components: ['identityRecordId'], orders: ['id'], raw: ['id'], reports: ['id'], anchors: ['orderId'], proofs: ['id'], requests: ['id'] };
  await c.query('SET session_replication_role=replica'); await c.query('BEGIN');
  const changedBefore = {};
  for (const k of ['grants', 'components', 'anchors']) {
    const table = MAP[k], cols = (await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.map(x => x.column_name);
    let n = 0;
    for (const row of saved[k]) {
      const sets = cols.filter(x => !pk[k].includes(x) && Object.hasOwn(row, x)), vals = sets.map(x => row[x]);
      const where = pk[k].map((x, i) => `${qi(x)}=$${sets.length + i + 1}`).join(' AND ');
      const res = await c.query(`UPDATE public.${qi(table)} SET ${sets.map((x, i) => `${qi(x)}=$${i + 1}`).join(',')} WHERE ${where}`, [...vals, ...pk[k].map(x => row[x])]);
      if (res.rowCount !== 1) throw Error('reconstruct row missing in ' + table); n++;
    }
    changedBefore[k] = n;
  }
  await c.query('COMMIT'); await c.query('SET session_replication_role=origin');
  out.reconstructedRows = changedBefore;
  // 3. all eight classes against saved before (typed normalization via jsonb_populate_record), then all original 100 command/source tuples.
  out.eightClasses = {};
  for (const [k, t] of Object.entries(MAP)) {
    const rows = (await c.query(`SELECT to_jsonb(t) row FROM public.${qi(t)} t ORDER BY to_jsonb(t)::text`)).rows.map(x => canonical(x.row));
    const exp = (await c.query(`SELECT to_jsonb(jsonb_populate_record(NULL::public.${qi(t)},value)) row FROM jsonb_array_elements($1::jsonb)`, [JSON.stringify(saved[k])])).rows.map(x => canonical(x.row));
    const o = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)); rows.sort(o); exp.sort(o);
    out.eightClasses[k] = { count: rows.length, expected: exp.length, actualHash: sha(rows), expectedHash: sha(exp), exact: sha(rows) === sha(exp) };
    if (!out.eightClasses[k].exact) throw Error('saved before mismatch ' + k);
  }
  const full = read(SRC + '/normalized100-command.private.json');
  const inputs = (await c.query("SELECT r->'key' key, r->'expected'->'source' expected, to_jsonb(g) actual FROM jsonb_array_elements($1::jsonb) r JOIN diagnostic_ownership_grants g ON g.id=r->'key'->>'id'", [JSON.stringify(full.rows)])).rows;
  out.fullInput = { sha256: L.fileSha(SRC + '/normalized100-command.private.json'), roots: full.roots.length, rows: full.rows.length, matchedGrants: inputs.length, allSourceTuplesEqual: inputs.length === 100 && inputs.every(x => sha(canonical(x.actual)) === sha(canonical(x.expected))) };
  if (!out.fullInput.allSourceTuplesEqual) throw Error('100 command/source tuple mismatch');
  // 4. compare to prior accepted clone proof (98 state).
  const fp98 = await fingerprints(c, worker);
  out.fp98 = fp98.hashes;
  out.vsPriorClone = { data: fp98.hashes.data === sha(oldFp.inventory), functions: fp98.hashes.functions === sha(oldFp.funcs), guards: fp98.hashes.guards === sha(oldFp.guards), tablePrivileges: fp98.hashes.tablePrivileges === sha(oldFp.privileges), workerFunctionPrivileges: fp98.hashes.workerFunctionPrivileges === sha(oldFp.funcPrivileges), workerTablePrivileges: fp98.hashes.workerTablePrivileges === sha(oldFp.workerTables), priorDataHash: sha(oldFp.inventory) };
  if (fp98.receipts.source || fp98.receipts.campaign) throw Error('receipts present');
  out.vsPriorCloneAllEqual = Object.entries(out.vsPriorClone).filter(([k]) => k !== 'priorDataHash').every(([, v]) => v === true);
  write('fingerprints-98.private.json', { funcs: fp98.funcs, guards: fp98.guards, inventory: fp98.inventory, funcPrivileges: fp98.funcPrivileges, workerTables: fp98.workerTables, privileges: fp98.privileges, fnAcl: fp98.fnAcl, migrations: fp98.migrations, hashes: fp98.hashes });
  await c.end();
  write('setup-stage1.json', out); console.log(JSON.stringify(out));
})().catch(e => { write('setup-error.private.json', { message: e.message, stack: e.stack }); console.error(e.stack); process.exit(1); });
