// UNTIMED dry run: full prepare_source for ranges, worker role, rollback. Not a measurement.
const L = require('./lib.cjs'); const { Client, OUT, SRC, sha, read, write } = L;
const ranges = JSON.parse(process.argv[2]);
(async () => {
  const r = read(OUT + '/resource.private.json'), full = read(SRC + '/normalized100-command.private.json'), res = [];
  for (const [a, b] of ranges) {
    const cmd = { ...full, roots: full.roots.slice(a, b), rows: full.rows.slice(a, b) };
    const c = new Client({ connectionString: r.workerUrl, application_name: 'r7g-decision-dry', query_timeout: 20000 }); await c.connect();
    const item = { range: [a, b], commandSha256: sha(cmd) };
    try { await c.query('BEGIN ISOLATION LEVEL READ COMMITTED'); await c.query("SET LOCAL statement_timeout='15s'"); await c.query("SET LOCAL lock_timeout='250ms'");
      const t = process.hrtime.bigint();
      try { const id = (await c.query('SELECT public.diagnostic_prepare_source($1::jsonb)::text v', [JSON.stringify(cmd)])).rows[0].v; item.verdict = 'PASS'; item.ms = Number(process.hrtime.bigint() - t) / 1e6;
        const row = (await c.query('SELECT jsonb_array_length(scope) scope,jsonb_array_length(lock_keys) keys,jsonb_array_length(effects) effects,jsonb_array_length(campaigns) campaigns FROM public.diagnostic_source_commands WHERE id=$1', [id])).rows[0]; item.receipt = row; }
      catch (e) { item.verdict = 'ERROR'; item.ms = Number(process.hrtime.bigint() - t) / 1e6; item.error = { sqlstate: e.code, message: e.message, where: e.where }; }
    } finally { try { await c.query('ROLLBACK'); } catch {} await c.end(); }
    res.push(item); console.log(JSON.stringify(item).slice(0, 700));
  }
  write('dry-' + Date.now() + '.json', res);
  const o = new Client({ connectionString: r.ownerUrl }); await o.connect(); console.log('receipts', JSON.stringify((await o.query(L.receiptsQ)).rows[0])); await o.end();
})().catch(e => { console.error(e.stack); process.exit(1); });
