// Finite decision comparison: prepare_source for widths 10 (group 2, rows 10..20), 20 (rows 0..20), 40 (rows 0..40), three interleaved rounds.
// Worker principal, READ COMMITTED, 15s statement / 20s client / 250ms lock, ROLLBACK each phase. Diagnostic only, never acceptance.
const L = require('./lib.cjs');
const { fs, Client, OUT, SRC, sha, read, write, canonical } = L;
const { spawnSync } = require('child_process');
if (process.argv[2] !== '--measure' || process.env.R7G_DECISION_MEASURE_START !== '1') throw Error('explicit START required');
const sh = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return (r.stdout || '').trim(); };
const BUSY = /vitest|prisma |prisma\.|tsc( |$)|esbuild|pg_restore|pg_dump|playwright|xcodebuild|gradle|jest|expo (start|run)|next (build|dev)/i;
const host = () => {
  const ps = sh('ps', ['-axo', 'pid,pcpu,pmem,command']).split('\n').slice(1).map(l => l.trim()).filter(Boolean);
  const top = ps.map(l => { const m = /^(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.*)$/.exec(l); return m && { pid: +m[1], cpu: +m[2], mem: +m[3], cmd: m[4].slice(0, 90) }; }).filter(Boolean).sort((a, b) => b.cpu - a.cpu).slice(0, 6);
  const busy = ps.filter(l => BUSY.test(l) && !/measure\.cjs|ps -axo|grep/.test(l)).map(l => l.slice(0, 160));
  return { at: new Date().toISOString(), load: sh('sysctl', ['-n', 'vm.loadavg']), top, busy };
};
(async () => {
  const r = read(OUT + '/resource.private.json'), full = read(SRC + '/normalized100-command.private.json'), base = read(OUT + '/fingerprints-101.private.json').hashes;
  const pre = host();
  if (pre.busy.length) { write('measure-refused-busy.json', pre); console.log('READY: competing process present, not measuring', JSON.stringify(pre.busy)); process.exit(3); }
  const widths = [{ name: 'w10_group2', range: [10, 20] }, { name: 'w20_prefix', range: [0, 20] }, { name: 'w40_prefix', range: [0, 40] }];
  const cmds = Object.fromEntries(widths.map(w => [w.name, { ...full, roots: full.roots.slice(...w.range), rows: full.rows.slice(...w.range) }]));
  const result = { status: 'RUNNING', resource: { container: r.container, port: r.port, database: r.database, worker: r.workerRole }, limits: { statementMs: 15000, clientMs: 20000, lockMs: 250, isolation: 'READ COMMITTED', rounds: 3 }, inputSha256: L.fileSha(SRC + '/normalized100-command.private.json'),
    commands: Object.fromEntries(widths.map(w => [w.name, { range: w.range, roots: cmds[w.name].roots.length, sha256: sha(cmds[w.name]) }])), preflight: pre, runs: [] };
  const owner = new Client({ connectionString: r.ownerUrl, application_name: 'r7g-decision-observer' }); await owner.connect();
  const stats = async () => { await owner.query('SELECT pg_stat_clear_snapshot()'); return (await owner.query("SELECT funcid::regprocedure::text function,calls::text,total_time,self_time FROM pg_stat_user_functions ORDER BY 1")).rows; };
  const delta = (b, a) => { const m = new Map(b.map(x => [x.function, x])); return a.map(x => { const p = m.get(x.function) || { calls: '0', total_time: 0, self_time: 0 }; return { function: x.function, calls: Number(x.calls) - Number(p.calls), totalMs: +(x.total_time - p.total_time).toFixed(3), selfMs: +(x.self_time - p.self_time).toFixed(3) }; }).filter(x => x.calls || x.totalMs || x.selfMs).sort((x, y) => y.selfMs - x.selfMs); };
  const initial = (await owner.query(L.receiptsQ)).rows[0]; if (initial.source || initial.campaign) throw Error('initial receipts present');
  if ((await owner.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [r.database])).rows[0].n) throw Error('unexpected clone sessions');
  try {
    for (let round = 1; round <= 3; round++) for (const w of widths) {
      const hostBefore = host(); const dockerBefore = sh('docker', ['stats', '--no-stream', '--format', '{{.CPUPerc}} {{.MemUsage}}', r.container]);
      const before = await stats();
      const client = new Client({ connectionString: r.workerUrl, application_name: `r7g-decision-${w.name}-${round}`, query_timeout: 20000, connectionTimeoutMillis: 3000 });
      const item = { round, name: w.name, width: cmds[w.name].roots.length, start: new Date().toISOString() }; const txStart = process.hrtime.bigint();
      try {
        await client.connect(); await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); await client.query("SET LOCAL statement_timeout='15s'"); await client.query("SET LOCAL lock_timeout='250ms'");
        const id = (await client.query("SELECT pg_backend_pid() pid,current_user principal,current_setting('session_replication_role') replication,current_setting('track_functions') tracking,current_setting('transaction_isolation') isolation")).rows[0]; item.identity = id;
        if (id.replication !== 'origin' || id.tracking !== 'all' || id.isolation !== 'read committed') throw Error('unexpected session config');
        const t = process.hrtime.bigint();
        try {
          const rid = (await client.query('SELECT public.diagnostic_prepare_source($1::jsonb)::text AS value', [JSON.stringify(cmds[w.name])])).rows[0].value;
          item.elapsedMs = Number(process.hrtime.bigint() - t) / 1e6; item.verdict = 'PASS';
          const row = (await client.query('SELECT command,scope,lock_keys,campaigns,effects FROM public.diagnostic_source_commands WHERE id=$1', [rid])).rows[0];
          item.receipt = { scope: row.scope.length, keys: row.lock_keys.length, effects: row.effects.length, campaigns: row.campaigns.length, scopeHash: sha(canonical(row.scope)), keysHash: sha(canonical(row.lock_keys)), effectsHash: sha(canonical(row.effects)) };
        } catch (e) { item.elapsedMs = Number(process.hrtime.bigint() - t) / 1e6; item.verdict = 'ERROR'; item.error = { sqlstate: e.code || null, message: e.message, where: e.where || null }; }
      } catch (e) { item.verdict = 'SETUP_ERROR'; item.error = { sqlstate: e.code || null, message: e.message }; }
      finally { try { await client.query('ROLLBACK'); } catch {} try { await client.end(); } catch {} }
      item.transactionMs = Number(process.hrtime.bigint() - txStart) / 1e6;
      await new Promise(res => setTimeout(res, 200));
      item.functions = delta(before, await stats()); item.hostBefore = hostBefore; item.dockerBefore = dockerBefore; item.hostAfter = host(); item.dockerAfter = sh('docker', ['stats', '--no-stream', '--format', '{{.CPUPerc}} {{.MemUsage}}', r.container]); item.end = new Date().toISOString();
      result.runs.push(item); write('measurement-progress.private.json', result);
      console.log(JSON.stringify({ round, name: w.name, verdict: item.verdict, elapsedMs: item.elapsedMs && Math.round(item.elapsedMs), busyBefore: hostBefore.busy.length, busyAfter: item.hostAfter.busy.length, error: item.error && item.error.message }));
      if (item.verdict !== 'PASS') throw Error('stop on non-PASS: ' + w.name + ' ' + JSON.stringify(item.error));
    }
    result.status = 'FINISHED';
  } catch (e) { result.status = 'STOPPED'; result.driverError = e.message; }
  finally {
    result.finalReceipts = (await owner.query(L.receiptsQ)).rows[0]; result.remainingClients = (await owner.query('SELECT pid,application_name,state FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [r.database])).rows;
    await owner.end(); result.end = new Date().toISOString(); result.hostEnd = host(); write('measurement-decision.json', result);
    console.log(JSON.stringify({ status: result.status, runs: result.runs.length, receipts: result.finalReceipts, remainingClients: result.remainingClients, driverError: result.driverError })); if (result.status !== 'FINISHED') process.exitCode = 1;
  }
})();
