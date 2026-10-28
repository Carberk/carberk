// Functional, rolled-back proof of 164 on the owned 98+163 attribution clone. No timing.
const assert = require('node:assert/strict'), fs = require('fs'), crypto = require('crypto'), path = require('path');
const wt = '/Users/bagtyyar/.t3/worktrees/carberk/t3-048fe887';
const { Client } = require(require.resolve('pg', { paths: [wt + '/packages/db'] }));
const A = '/tmp/897-r7g-worker-attribution-20261029', out = path.dirname(__filename);
const r = JSON.parse(fs.readFileSync(A + '/resource.private.json'));
if (r.project !== 'candidatea-r7g-attribution' || r.database !== 'candidatea_r7g_attribution_before') throw Error('Exact owned attribution resource required');
const worker = JSON.parse(fs.readFileSync(A + '/ready.json')).workerRole;
const recorded = JSON.parse(fs.readFileSync('/tmp/897-r7g-worker-kernel-owner2-20261029/functional/registry-new.json'));
const migration = fs.readFileSync(wt + '/packages/db/prisma/migrations/20261026016400_diagnostic_source_key_predicate/migration.sql', 'utf8');
const full = JSON.parse(fs.readFileSync('/tmp/897-r6c-recovery-20261029/normalized100-command.private.json'));
const ten = { ...full, roots: full.roots.slice(0, 10), rows: full.rows.slice(0, 10) };
const sha = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const receipt = { migrationSha256: crypto.createHash('sha256').update(migration).digest('hex'), timingAcceptance: false, assertions: [] };
const step = (name, extra) => { receipt.assertions.push(name); if (extra) Object.assign(receipt, extra); console.log('PASS', name); };

function classify(messages) {
  const plans = { read: {}, lock: {}, typedNonIndexTables: {}, typedJsonFilters: 0 };
  for (const m of messages) {
    const text = /Query Text: (SELECT (?:to_jsonb\(s\)|1) FROM public\.\S+ s WHERE .*)/.exec(m)?.[1];
    if (!text) continue;
    const kind = text.endsWith('FOR UPDATE') ? 'lock' : 'read';
    const shape = text.includes('to_jsonb(s) @>') ? 'containment' : 'typed';
    const access = /Index (Only )?Scan using/.test(m) ? 'index' : /Seq Scan/.test(m) ? 'seq' : 'other';
    const k = shape + ':' + access; plans[kind][k] = (plans[kind][k] || 0) + 1;
    if (shape === 'typed' && access !== 'index') {
      const filter = /Filter: (.*)/.exec(m)?.[1] ?? '';
      if (filter.includes('to_jsonb')) plans.typedJsonFilters = (plans.typedJsonFilters || 0) + 1;
      const table = /FROM public\.(\S+) s/.exec(text)[1]; plans.typedNonIndexTables[table] = (plans.typedNonIndexTables[table] || 0) + 1; }
  }
  return plans;
}
async function txn(c, seam, work) {
  const logged = [], on = n => logged.push(n.message || '');
  c.on('notice', on);
  await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  try {
    await c.query("SET LOCAL statement_timeout='15s'");
    if (seam) await c.query(migration);
    await c.query("LOAD 'auto_explain'");
    for (const s of ['auto_explain.log_min_duration=0', 'auto_explain.log_nested_statements=on', 'auto_explain.log_analyze=off', 'client_min_messages=log']) await c.query('SET LOCAL ' + s);
    await c.query(`SET LOCAL ROLE "${worker}"`);
    return { value: await work(), plans: classify(logged) };
  } finally { await c.query('ROLLBACK'); c.off('notice', on); }
}
async function prepareTen(c, seam) {
  return txn(c, seam, async () => {
    const id = (await c.query('SELECT public.diagnostic_prepare_source($1::jsonb)::text id', [JSON.stringify(ten)])).rows[0].id;
    const source = (await c.query('SELECT command,scope,lock_keys,campaigns,effects FROM public.diagnostic_source_commands WHERE id=$1', [id])).rows;
    const campaign = (await c.query("SELECT to_jsonb(p)-'id'-'backend_pid'-'full_transaction_id' row FROM public.campaign_preparations p ORDER BY 1::text")).rows.map(x => x.row);
    return { source, campaign };
  });
}
(async () => {
  const c = new Client({ connectionString: r.ownerUrl, application_name: 'r7g-owner2-clone164-functional' });
  await c.connect();
  try {
    const t1 = await prepareTen(c, false), t2 = await prepareTen(c, true);
    assert.equal(t1.value.source.length, 1);
    assert.deepEqual(canonical(t2.value), canonical(t1.value));
    step('prepare10 receipt command/scope/lock_keys/campaigns/effects and campaign preparation equal without and with 164', {
      prepare10Hash: sha(canonical(t1.value)), scopeEntries: t1.value.source[0].scope.length, lockKeys: t1.value.source[0].lock_keys.length });
    for (const kind of ['read', 'lock']) {
      assert.ok(Object.keys(t1.plans[kind]).every(k => k === 'containment:seq'), `pre-seam ${kind} ${JSON.stringify(t1.plans[kind])}`);
      // No per-key statement keeps containment; the planner may still prefer a Seq Scan on a one-page table.
      assert.ok(Object.keys(t2.plans[kind]).every(k => k === 'typed:index' || k === 'typed:seq'), `seam ${kind} ${JSON.stringify(t2.plans[kind])}`);
      assert.ok((t1.plans[kind]['containment:seq'] || 0) > 0);
      assert.equal((t2.plans[kind]['typed:index'] || 0) + (t2.plans[kind]['typed:seq'] || 0), t1.plans[kind]['containment:seq']);
    }
    const sizes = (await c.query('SELECT relname table,relpages pages,reltuples::bigint tuples FROM pg_class WHERE relnamespace=$1::regnamespace AND relname=ANY($2) ORDER BY relname', ['public', Object.keys(t2.plans.typedNonIndexTables)])).rows;
    receipt.typedSeqScanTables = sizes.map(x => ({ ...x, statements: t2.plans.typedNonIndexTables[x.table] }));
    // Cost-based choice on small tables: the filter is plain key equality, and the index is usable when forced.
    assert.equal(t2.plans.typedJsonFilters, 0);
    const forced = await txn(c, true, async () => {
      await c.query('RESET ROLE'); await c.query('SET LOCAL enable_seqscan=off');
      const out = {};
      for (const { table } of sizes) {
        const where = (await c.query('SELECT public.diagnostic_source_key_predicate($1,$2::jsonb) p', [table, JSON.stringify({ id: 'K' })])).rows[0].p;
        const plan = (await c.query(`EXPLAIN (COSTS OFF) SELECT 1 FROM public."${table}" s WHERE ${where.replaceAll('$1', `'{"id":"K"}'::jsonb`)} FOR UPDATE`)).rows.map(x => x['QUERY PLAN']).join(' | ');
        out[table] = plan; assert.match(plan, /Index (Only )?Scan using/);
      }
      return out;
    });
    receipt.forcedIndexPlans = forced.value;
    step('EXPLAIN-only nested plans: every per-key read and FOR UPDATE leaves containment; same statement counts; typed Seq Scans only by cost choice with plain key filters and index usable when forced', { plans: { without164: t1.plans, with164: t2.plans } });
    const t3 = await txn(c, true, async () => {
      const scope = (await c.query('SELECT public.diagnostic_source_scope($1::jsonb) v', [JSON.stringify(ten)])).rows[0].v;
      const keys = (await c.query('SELECT public.diagnostic_source_lock_keys($1::jsonb,$2::jsonb) v', [JSON.stringify(scope), JSON.stringify(ten)])).rows[0].v;
      const effects = (await c.query('SELECT public.diagnostic_source_effects($1::jsonb,$2::jsonb) v', [JSON.stringify(ten), JSON.stringify(scope)])).rows[0].v;
      await c.query('SAVEPOINT full100');
      let refusal;
      try { await c.query('SELECT public.diagnostic_prepare_source($1::jsonb)::text', [JSON.stringify(full)]); }
      catch (e) { refusal = { sqlstate: e.code, message: e.message, context: e.where }; }
      await c.query('ROLLBACK TO SAVEPOINT full100');
      return { hashes: Object.fromEntries(Object.entries({ scope, keys, effects }).map(([k, v]) => [k, sha(canonical(v))])), counts: { scope: scope.length, keys: keys.length, effects: effects.length }, refusal };
    });
    assert.deepEqual(t3.value.hashes, recorded.outputHashes); assert.deepEqual(t3.value.counts, recorded.outputCounts);
    assert.deepEqual(t3.value.refusal, recorded.full100);
    step('with 164: scope/keys/effects hashes equal recorded registry163 receipt; full100 P0001 scope_limit with identical context', { outputHashes: t3.value.hashes, full100: t3.value.refusal.message });
    const remaining = (await c.query('SELECT (SELECT count(*)::int FROM diagnostic_source_commands) source,(SELECT count(*)::int FROM campaign_preparations) campaign,to_regprocedure($1) helper', ['public.diagnostic_source_key_predicate(text,jsonb)'])).rows[0];
    assert.deepEqual(remaining, { source: 0, campaign: 0, helper: null });
    step('all transactions rolled back: receipts 0/0 and no helper on the clone');
    receipt.verdict = 'PASS';
  } finally { await c.end(); }
})().catch(e => { receipt.verdict = 'FAIL'; receipt.error = { message: e.message, code: e.code }; console.error(e); process.exitCode = 1; })
  .finally(() => fs.writeFileSync(path.join(out, 'clone164.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 }));
