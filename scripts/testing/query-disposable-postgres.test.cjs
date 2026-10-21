const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(`${__dirname}/query-disposable-postgres.cjs`, 'utf8');
async function query(error, enabled, lifecycle = false, options = {}) {
  const stderr = [];
  const stdout = [];
  const process = { hrtime: globalThis.process.hrtime, env: { STAGING_TEST_SQL_DIAGNOSTICS: enabled,
    STAGING_TEST_PG_DIAGNOSTICS: lifecycle ? '1' : '0', STAGING_TEST_PG_ROLE: 'sql-child', STAGING_TEST_PG_ORDINAL: '7',
    STAGING_CONTROL_TEST_DATABASE_URL: 'postgresql://secret@127.0.0.1/disposable', ...options.env }, exitCode: 0 };
  class Client {
    processID = options.pid ?? 4321;
    async connect() {}
    async query(sql) {
      if (options.sql) options.sql.push(sql);
      if (error) throw error;
      return options.result ?? { rows: [{ count: 2 }] };
    }
    async end() { await options.end?.(); }
  }
  await runInNewContext(source, {
    process, URL,
    console: { error: value => stderr.push(value), log: value => stdout.push(value) },
    require: name => {
      if (name === 'node:module') return { createRequire: () => () => ({ Client, types: {} }) };
      if (name === 'node:fs') return { readFileSync: () => options.input ?? 'SELECT secret_value' };
      throw new Error('Unexpected module');
    },
  });
  return { stderr, stdout, code: process.exitCode };
}

test('default refusal withholds all database error fields', async () => {
  assert.deepEqual(await query({ code: '42601', position: '81', detail: 'secret' }), {
    stderr: ['Disposable database query refused'], stdout: [], code: 1,
  });
});

test('opt-in refusal emits only SQLSTATE and numeric positions despite sensitive error fields', async () => {
  assert.deepEqual(await query({ code: '42601', position: '00081', internalPosition: '12',
    message: 'secret query', detail: 'secret value', internalQuery: 'secret body',
    routine: 'secret_routine', connectionString: 'postgresql://secret' }, '1'), {
    stderr: ['Disposable database query refused', 'Disposable database SQL diagnostic: SQLSTATE=42601 position=81 internalPosition=12'],
    stdout: [], code: 1,
  });
});

test('opt-in refusal rejects malformed fields and leaves successful rows and status unchanged', async () => {
  for (const code of ['42601\nsecret', '42601\n', 'secret', 42601, undefined]) {
    assert.deepEqual((await query({ code, position: '81' }, '1')).stderr, ['Disposable database query refused']);
  }
  for (const position of ['81\nsecret', '81\n', '-1', '1.5', '0', '12345678901', 81, undefined]) {
    assert.deepEqual((await query({ code: '42601', position, internalPosition: position }, '1')).stderr,
      ['Disposable database query refused', 'Disposable database SQL diagnostic: SQLSTATE=42601']);
  }
  assert.deepEqual(await query(null, '1'), { stderr: [], stdout: ['2'], code: 0 });
});

test('lifecycle diagnostics emit only bounded role, ordinal, pid and timings', async () => {
  const result = await query(null, '1', true);
  assert.deepEqual(result.stdout, ['2']);
  assert.equal(result.stderr.length, 1);
  assert.match(result.stderr[0], /^Disposable PG lifecycle: role=sql-child ordinal=7 pid=4321 connectedAtMs=\d+ closedAtMs=\d+$/);
});

test('diagnostic opt-in preserves rows and waits for local close even on SQL failure', async () => {
  let closed = false;
  const result = await query({ code: '42601', message: 'secret' }, '1', true, { end: async () => { closed = true; } });
  assert.equal(closed, true);
  assert.equal(result.code, 1);
  assert.match(result.stderr[0], /^Disposable PG lifecycle:/);
  assert.deepEqual(result.stderr.slice(1), ['Disposable database query refused', 'Disposable database SQL diagnostic: SQLSTATE=42601']);
});

test('the real serialized inventory SQL is instrumented only inside the disposable query transport', async () => {
  const { cleanResetProgram } = await import('../staging-clean-reset-remote.mjs');
  const identity = { projectId: '176ddec0-dd65-4087-b82c-798599fc2ebe', environmentId: '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2',
    services: { api: '6db6f1b1-5c7a-4033-88d0-53f5f315bfc0', worker: '24aa02e0-25a9-4e80-9cc2-c1795ef82091' },
    origins: { database: 'postgresql://postgres.railway.internal:5432/railway' } };
  const candidate = 'c'.repeat(40);
  const sql = [];
  const program = cleanResetProgram({ operation: 'clean-reset', phase: 'inventoried', operationId: 'e'.repeat(32),
    reservationId: 'f'.repeat(32), candidate, identity });
  await runInNewContext(program, { URL, Buffer, process: { env: { RAILWAY_PROJECT_ID: identity.projectId,
    RAILWAY_ENVIRONMENT_ID: identity.environmentId, RAILWAY_SERVICE_ID: identity.services.api,
    RAILWAY_ENVIRONMENT_NAME: 'staging', APP_ENV: 'staging', AUTOTM_COMMIT_SHA: candidate, DATABASE_URL: identity.origins.database } },
  console: { error() {}, log() {} }, require: name => {
    assert.equal(name, 'node:child_process');
    return { spawnSync: (_command, _args, options) => { sql.push(options.input); return { status: 1 }; } };
  } });
  assert.equal(sql.length, 1);
  const injected = [];
  await query(null, '1', true, { input: sql[0], sql: injected });
  assert.equal(injected[0], sql[0].replaceAll(backendCount, expectedAggregate)
    .replace('COMMIT;', "SELECT current_setting('staging_test.backends', true) AS staging_test_backends; COMMIT;"));
  assert.equal(injected[0].split('AS staging_test_backends').length, 2);
  assert.equal(cleanResetProgram({ operation: 'clean-reset', phase: 'inventoried', operationId: 'e'.repeat(32),
    reservationId: 'f'.repeat(32), candidate, identity }), program);
});

const backendCount = "(SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend')";
test('only opted-in loopback disposable SQL records the same activity observation and strips its private result', async () => {
  const input = `BEGIN; SELECT 'clean-reset:' || jsonb_build_object('backends', ${backendCount}); COMMIT;`;
  const sql = [];
  const result = await query(null, '1', true, { input, sql, result: [
    { rows: [{ receipt: 'clean-reset:{"inventory":{"backends":1}}' }] },
    { rows: [{ staging_test_backends: '{"count":1,"pids":[1234],"rows":[{"pid":1234,"application":"known-fixture","origin":"loopback","state":"known"}]}' }] },
  ] });
  assert.deepEqual(result.stdout, ['clean-reset:{"inventory":{"backends":1}}']);
  assert.match(sql[0], /set_config\('staging_test.backends'/);
  assert.match(sql[0], /array_agg\(pid ORDER BY pid\)/);
  assert.match(sql[0], /current_setting\('staging_test.backends', true\)/);
  assert.match(result.stderr[0], /^Disposable PG activity: ordinal=7 count=1 pids=1234$/);
  for (const options of [{}, { env: { STAGING_CONTROL_TEST_DATABASE_URL: 'postgresql://secret@remote.invalid/disposable' } }]) {
    const captured = [];
    await query(null, '1', Boolean(options.env), { ...options, input, sql: captured });
    assert.equal(captured[0], input);
  }
});

test('diagnostics reject untrusted roles, ordinals, PIDs and activity rows without printing their contents', async () => {
  const result = await query(null, '1', true, { pid: 'secret', env: {
    STAGING_TEST_PG_ROLE: 'secret\n', STAGING_TEST_PG_ORDINAL: 'secret',
  }, result: { rows: [{ staging_test_backends: '{"count":1,"pids":["secret"]}' }] } });
  assert.deepEqual(result.stdout, []);
  assert.equal(result.stderr.length, 1);
  assert.match(result.stderr[0], /^Disposable PG lifecycle: role=unknown ordinal=0 pid=0 connectedAtMs=\d+ closedAtMs=\d+$/);
});

const attribution = { pid: 1234, application: 'pg-isready', origin: 'loopback', state: 'known' };
const diagnosticRow = value => ({ rows: [{ staging_test_backends: JSON.stringify(value) }] });
test('same-observation attribution emits only validated categories and preserves public results', async () => {
  for (const application of ['pg-isready', 'known-fixture', 'sql-child', 'other']) {
    for (const origin of ['loopback', 'other', 'unavailable']) {
      for (const state of ['known', 'unavailable']) {
        const result = await query(null, '1', true, { result: [
          { rows: [{ receipt: 'clean-reset:unchanged' }] },
          diagnosticRow({ count: 1, pids: [1234], rows: [{ ...attribution, application, origin, state }] }),
        ] });
        assert.deepEqual(result.stdout, ['clean-reset:unchanged']);
        assert.equal(result.stderr[0], 'Disposable PG activity: ordinal=7 count=1 pids=1234');
        assert.equal(result.stderr[1], `Disposable PG attribution: ordinal=7 rows=1234:${application}:${origin}:${state}`);
      }
    }
  }
});

test('malformed attribution never emits private values or a partial attribution', async () => {
  const invalid = [undefined, null, {}, [], Array(17).fill(attribution),
    [{ ...attribution, pid: 2147483648 }], [{ ...attribution, pid: 5678 }],
    ...['application', 'origin', 'state'].flatMap(field => ['secret', 'known\nsecret', null, 1, {}].map(value => [{ ...attribution, [field]: value }])),
    [{ ...attribution, query: 'secret' }]];
  for (const rows of invalid) {
    const result = await query(null, '1', true, { result: diagnosticRow({ count: 1, pids: [1234], rows }) });
    assert.deepEqual(result.stdout, []);
    assert.equal(result.stderr.some(line => line.startsWith('Disposable PG attribution:')), false);
    assert.equal(result.stderr.some(line => line.includes('secret')), false);
  }
});

test('attribution truncates at sixteen rows and represents an empty observation', async () => {
  for (const count of [0, 17]) {
    const pids = count === 0 ? [] : Array.from({ length: 16 }, (_, index) => index + 1);
    const result = await query(null, '1', true, { result: diagnosticRow({ count, pids,
      rows: pids.map(pid => ({ ...attribution, pid })) }) });
    assert.equal(result.stderr[1], `Disposable PG attribution: ordinal=7 rows=${pids.map(pid => `${pid}:pg-isready:loopback:known`).join('|') || 'none'}`);
  }
});

test('fixture forwards only the bounded attribution line emitted by the transport', async () => {
  const fixture = readFileSync(`${__dirname}/../../packages/db/scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts`, 'utf8');
  const expression = fixture.match(/const attribution = result\.stderr\?\.split\(\/\\r\?\\n\/\)\.find\(line => (\/.*\/)\.test\(line\)\);/);
  assert.ok(expression, 'fixture must validate attribution before forwarding');
  const pattern = runInNewContext(expression[1]);
  assert.equal(pattern.test('Disposable PG attribution: ordinal=7 rows=1234:pg-isready:loopback:known'), true);
  for (const line of ['Disposable PG attribution: ordinal=7 rows=secret',
    'Disposable PG attribution: ordinal=7 rows=1234:secret:loopback:known',
    'Disposable PG attribution: ordinal=7 rows=1234:pg-isready:loopback:known\nsecret']) assert.equal(pattern.test(line), false);
});

// Literal expected SQL at the database port, including the unchanged selection predicate.
const expectedAggregate = `(SELECT (set_config('staging_test.backends', jsonb_build_object('count', count(*),
        'pids', coalesce(to_jsonb((array_agg(pid ORDER BY pid))[1:16]), '[]'::jsonb),
        'rows', coalesce(to_jsonb((array_agg(jsonb_build_object('pid', pid,
          'application', CASE application_name WHEN 'pg_isready' THEN 'pg-isready' WHEN 'staging-test-fixture' THEN 'known-fixture' WHEN 'staging-test-sql-child' THEN 'sql-child' ELSE 'other' END,
          'origin', CASE WHEN client_addr IS NULL THEN 'unavailable' WHEN client_addr IN (inet '127.0.0.1', inet '::1') THEN 'loopback' ELSE 'other' END,
          'state', CASE WHEN state IN ('active', 'idle', 'idle in transaction', 'idle in transaction (aborted)', 'fastpath function call', 'disabled') THEN 'known' ELSE 'unavailable' END)
          ORDER BY pid))[1:16]), '[]'::jsonb))::text, true)::jsonb->>'count')::bigint FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend')`;
