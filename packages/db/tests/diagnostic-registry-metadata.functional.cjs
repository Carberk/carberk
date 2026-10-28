// Task-owned real-PG functional regression. No timing threshold or native acceptance.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const root = process.env.R7G_REGISTRY_EVIDENCE;
if (!root) throw new Error('R7G_REGISTRY_EVIDENCE must identify the task-only fixture');
const resource = JSON.parse(fs.readFileSync(path.join(root, 'resource.private.json')));
if (resource.project !== 'candidatea-r7g-attribution' || resource.database !== 'candidatea_r7g_attribution_before') throw new Error('Exact attribution fixture required');
const mode = process.argv[2];
if (!['old', 'new'].includes(mode)) throw new Error('Expected old or new');
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const full = JSON.parse(fs.readFileSync(path.join(root, 'normalized100-command.private.json')));
const ten = { ...full, roots: full.roots.slice(0, 10), rows: full.rows.slice(0, 10) };
const receipt = { mode, assertions: [], timingAcceptance: false };
const write = () => fs.writeFileSync(path.join(root, `registry-${mode}.json`), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
async function transaction(client, work) { await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); try { await client.query("SET LOCAL statement_timeout='15s'"); return await work(); } finally { await client.query('ROLLBACK'); } }
async function stats(client) { await client.query('SELECT pg_stat_clear_snapshot()'); return Number((await client.query("SELECT coalesce(sum(calls),0)::text calls FROM pg_stat_user_functions WHERE funcid='public.diagnostic_source_registry()'::regprocedure")).rows[0].calls); }
(async () => {
  const owner = new Client({ connectionString: resource.ownerUrl });
  const worker = new Client({ connectionString: resource.workerUrl });
  try {
    await owner.connect(); await worker.connect();
    const registry = (await worker.query('SELECT public.diagnostic_source_registry() value')).rows[0].value;
    assert.equal(registry.length, 77); assert.equal(new Set(registry.map(entry => entry.table)).size, 77);
    const all = (await worker.query("SELECT entry->>'table' name,entry expected,public.diagnostic_source_meta(entry->>'table') actual FROM jsonb_array_elements(public.diagnostic_source_registry()) entry")).rows;
    for (const entry of all) assert.deepEqual(entry.actual, entry.expected);
    const nulls = (await worker.query("SELECT public.diagnostic_source_meta(NULL) n,public.diagnostic_source_meta('not_a_registered_table') u")).rows[0];
    assert.deepEqual(nulls, { n: null, u: null });
    receipt.assertions.push('all77 independent array-entry lookups equal; unknown/null SQL NULL');
    receipt.registryHash = sha(registry);
    // Separate backend flushes function counters on close. This tests the real
    // scope call, not a replacement metadata implementation or a time budget.
    const before = await stats(owner);
    const probe = new Client({ connectionString: resource.workerUrl }); await probe.connect();
    const scope = await transaction(probe, async () => (await probe.query('SELECT public.diagnostic_source_scope($1::jsonb) value', [JSON.stringify(ten)])).rows[0].value);
    await probe.end();
    const registryCalls = (await stats(owner)) - before;
    receipt.scopeRegistryCalls = registryCalls;
    const keys = await transaction(worker, async () => (await worker.query('SELECT public.diagnostic_source_lock_keys($1::jsonb,$2::jsonb) value', [JSON.stringify(scope), JSON.stringify(ten)])).rows[0].value);
    const effects = await transaction(worker, async () => (await worker.query('SELECT public.diagnostic_source_effects($1::jsonb,$2::jsonb) value', [JSON.stringify(ten), JSON.stringify(scope)])).rows[0].value);
    const output = { scope, keys, effects };
    receipt.outputHashes = Object.fromEntries(Object.entries(output).map(([key, value]) => [key, sha(canonical(value))]));
    receipt.outputCounts = { scope: scope.length, keys: keys.length, effects: effects.length };
    if (mode === 'old') fs.writeFileSync(path.join(root, 'registry-old-output.private.json'), JSON.stringify(output), { mode: 0o600 });
    else {
      const old = JSON.parse(fs.readFileSync(path.join(root, 'registry-old-output.private.json')));
      assert.deepEqual(canonical(output), canonical(old));
      receipt.assertions.push('complete successful10 scope/keys/effects equal OLD');
    }
    let refusal;
    try { await transaction(worker, () => worker.query('SELECT public.diagnostic_prepare_source($1::jsonb)::text', [JSON.stringify(full)])); }
    catch (error) { refusal = { sqlstate: error.code, message: error.message, context: error.where }; }
    assert.equal(refusal?.sqlstate, 'P0001'); assert.equal(refusal?.message, 'diagnostic_source_scope_limit');
    receipt.full100 = refusal;
    const remaining = (await owner.query('SELECT (SELECT count(*)::int FROM diagnostic_source_commands) source,(SELECT count(*)::int FROM campaign_preparations) campaign')).rows[0];
    assert.deepEqual(remaining, { source: 0, campaign: 0 }); receipt.receipts = remaining;
    receipt.assertions.push('full100 unchanged scope-limit refusal and rollback');
    // The core scope makes at most100 registry enumerations under its unchanged
    // pass cap. Metadata must not rematerialize the registry per discovered row.
    assert.ok(registryCalls <= 100, `scope rematerialized registry ${registryCalls} times, beyond its 100-pass enumeration cap`);
    receipt.assertions.push('scope registry materialization bounded by existing100-pass enumeration cap');
    receipt.verdict = 'PASS';
  } finally { await worker.end(); await owner.end(); write(); }
})().catch(error => { receipt.verdict = 'FAIL'; receipt.error = { message: error.message, code: error.code }; write(); console.error(error.message); process.exitCode = 1; });
