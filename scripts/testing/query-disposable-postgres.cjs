// Test-only psql boundary substitute. Credentials arrive only in the child environment.
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const localRequire = createRequire(process.env.STAGING_TEST_DB_PACKAGE);
const { Client, types } = localRequire('pg');
// Diagnostics are opt-in and restricted to the local disposable transport. This never
// changes the serialized production program or a remote database's SQL.
const diagnosticEnabled = process.env.STAGING_TEST_PG_DIAGNOSTICS === '1' && (() => {
  try { return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.STAGING_CONTROL_TEST_DATABASE_URL).hostname); }
  catch { return false; }
})();
const ordinal = /^(?:0|[1-9][0-9]{0,5})$/.test(process.env.STAGING_TEST_PG_ORDINAL || '') ? Number(process.env.STAGING_TEST_PG_ORDINAL) : 0;
const role = process.env.STAGING_TEST_PG_ROLE === 'sql-child' ? 'sql-child' : 'unknown';
const monotonic = () => Number(process.hrtime.bigint() / 1000000n);
const pid = value => Number.isInteger(value) && value > 0 && value <= 2147483647;
(async () => {
  const client = new Client({ connectionString: process.env.STAGING_CONTROL_TEST_DATABASE_URL,
    ...(diagnosticEnabled ? { application_name: 'staging-test-sql-child' } : {}),
    types: { getTypeParser(oid, format) {
      if ((format === undefined || format === 'text') && (oid === 114 || oid === 3802)) return value => value;
      return types.getTypeParser(oid, format);
    } },
  });
  await client.connect();
  const connectedAt = diagnosticEnabled ? monotonic() : 0;
  try {
    let sql = readFileSync(0, 'utf8');
    const activity = "FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'";
    const count = `(SELECT count(*) ${activity})`;
    if (diagnosticEnabled && sql.includes(count)) {
      // TEST-ONLY perturbation: record count and bounded PIDs from the SAME aggregate
      // feeding the guard. Classification adds SQL work and can perturb timing.
      // A transaction-local GUC carries it to a private result before COMMIT. No extra target connection, snapshot clear, wait or retry is introduced.
      if (sql.split('COMMIT;').length !== 2) throw new Error('Unsupported disposable diagnostic transaction');
      sql = sql.replaceAll(count, `(SELECT (set_config('staging_test.backends', jsonb_build_object('count', count(*),
        'pids', coalesce(to_jsonb((array_agg(pid ORDER BY pid))[1:16]), '[]'::jsonb),
        'rows', coalesce(to_jsonb((array_agg(jsonb_build_object('pid', pid,
          'application', CASE application_name WHEN 'pg_isready' THEN 'pg-isready' WHEN 'staging-test-fixture' THEN 'known-fixture' WHEN 'staging-test-sql-child' THEN 'sql-child' ELSE 'other' END,
          'origin', CASE WHEN client_addr IS NULL THEN 'unavailable' WHEN client_addr IN (inet '127.0.0.1', inet '::1') THEN 'loopback' ELSE 'other' END,
          'state', CASE WHEN state IN ('active', 'idle', 'idle in transaction', 'idle in transaction (aborted)', 'fastpath function call', 'disabled') THEN 'known' ELSE 'unavailable' END)
          ORDER BY pid))[1:16]), '[]'::jsonb))::text, true)::jsonb->>'count')::bigint ${activity})`)
        .replace('COMMIT;', "SELECT current_setting('staging_test.backends', true) AS staging_test_backends; COMMIT;");
    }
    const result = await client.query(sql);
    const results = Array.isArray(result) ? result : [result];
    for (const item of results) for (const row of item.rows) {
      if (diagnosticEnabled && Object.keys(row).length === 1 && Object.hasOwn(row, 'staging_test_backends')) {
        try {
          const value = JSON.parse(row.staging_test_backends);
          if (Number.isInteger(value.count) && value.count >= 0 && value.count <= 2147483647 &&
              Array.isArray(value.pids) && value.pids.length === Math.min(value.count, 16) && value.pids.every(pid)) {
            console.error(`Disposable PG activity: ordinal=${ordinal} count=${value.count} pids=${value.pids.join(',') || 'none'}`);
            if (Array.isArray(value.rows) && value.rows.length === value.pids.length && value.rows.every((row, index) =>
              row && Object.keys(row).sort().join(',') === 'application,origin,pid,state' && row.pid === value.pids[index] &&
              ['pg-isready', 'known-fixture', 'sql-child', 'other'].includes(row.application) &&
              ['loopback', 'other', 'unavailable'].includes(row.origin) && ['known', 'unavailable'].includes(row.state))) {
              console.error(`Disposable PG attribution: ordinal=${ordinal} rows=${value.rows.map(row => `${row.pid}:${row.application}:${row.origin}:${row.state}`).join('|') || 'none'}`);
            }
          }
        } catch { /* Never forward diagnostic rows or parse errors. */ }
      } else console.log(Object.values(row).join('|'));
    }
  } finally {
    await client.end();
    if (diagnosticEnabled) console.error(`Disposable PG lifecycle: role=${role} ordinal=${ordinal} pid=${pid(client.processID) ? client.processID : 0} connectedAtMs=${connectedAt} closedAtMs=${monotonic()}`);
  }
})().catch(error => {
  console.error('Disposable database query refused');
  if (process.env.STAGING_TEST_SQL_DIAGNOSTICS === '1' &&
      typeof error?.code === 'string' && error.code.length === 5 && /^[A-Z0-9]{5}$/.test(error.code)) {
    let diagnostic = `Disposable database SQL diagnostic: SQLSTATE=${error.code}`;
    for (const field of ['position', 'internalPosition']) {
      const value = error[field];
      if (typeof value === 'string' && value.length <= 10 && !/[^0-9]/.test(value) && Number(value) > 0) {
        diagnostic += ` ${field}=${Number(value)}`;
      }
    }
    console.error(diagnostic);
  }
  process.exitCode = 1;
});
