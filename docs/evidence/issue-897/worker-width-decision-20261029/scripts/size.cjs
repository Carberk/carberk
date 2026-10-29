// UNTIMED sizing: scope entry counts for command row ranges (worker role, READ COMMITTED, ROLLBACK). Not a measurement; timings are ignored.
const L = require('./lib.cjs');
const { fs, Client, OUT, SRC, sha, read, write, canonical } = L;
const ranges = JSON.parse(process.argv[2]); // [[start,end],...]
(async () => {
  const r = read(OUT + '/resource.private.json'), full = read(SRC + '/normalized100-command.private.json');
  const results = JSON.parse(fs.existsSync(OUT + '/sizing.json') ? fs.readFileSync(OUT + '/sizing.json') : '[]');
  for (const [a, b] of ranges) {
    const cmd = { ...full, roots: full.roots.slice(a, b), rows: full.rows.slice(a, b) };
    const c = new Client({ connectionString: r.workerUrl, application_name: 'r7g-decision-sizing', query_timeout: 20000 }); await c.connect();
    const item = { range: [a, b], width: b - a, commandSha256: sha(cmd) };
    try {
      await c.query('BEGIN ISOLATION LEVEL READ COMMITTED'); await c.query("SET LOCAL statement_timeout='15s'"); await c.query("SET LOCAL lock_timeout='250ms'");
      const t = process.hrtime.bigint();
      try {
        const scope = (await c.query('SELECT public.diagnostic_source_scope($1::jsonb) v', [JSON.stringify(cmd)])).rows[0].v;
        item.untimedMs = Number(process.hrtime.bigint() - t) / 1e6; item.verdict = 'PASS'; item.entries = scope.length; item.scopeHash = sha(canonical(scope));
        item.perTable = {}; for (const e of scope) item.perTable[e.table] = (item.perTable[e.table] || 0) + 1;
        const keys = (await c.query('SELECT public.diagnostic_source_lock_keys($1::jsonb,$2::jsonb) v', [JSON.stringify(scope), JSON.stringify(cmd)])).rows[0].v; item.lockKeys = keys.length;
      } catch (e) { item.untimedMs = Number(process.hrtime.bigint() - t) / 1e6; item.verdict = 'ERROR'; item.error = { sqlstate: e.code, message: e.message, where: e.where }; }
    } finally { try { await c.query('ROLLBACK'); } catch {} await c.end(); }
    results.push(item); console.log(JSON.stringify({ range: item.range, verdict: item.verdict, entries: item.entries, lockKeys: item.lockKeys, error: item.error && item.error.message, untimedMs: Math.round(item.untimedMs) }));
  }
  write('sizing.json', results);
  const o = new Client({ connectionString: r.ownerUrl }); await o.connect(); console.log('receipts', JSON.stringify((await o.query(L.receiptsQ)).rows[0]), 'clients', (await o.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [r.database])).rows[0].n); await o.end();
})().catch(e => { console.error(e.stack); process.exit(1); });
