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
  assert.match(result.stderr[0], /^Disposable PG lifecycle: ordinal=7 pid=4321 connectedAtMs=\d+ closedAtMs=\d+$/);
});

test('diagnostic opt-in preserves rows and waits for local close even on SQL failure', async () => {
  let closed = false;
  const result = await query({ code: '42601', message: 'secret' }, '1', true, { end: async () => { closed = true; } });
  assert.equal(closed, true);
  assert.equal(result.code, 1);
  assert.match(result.stderr[0], /^Disposable PG lifecycle:/);
  assert.deepEqual(result.stderr.slice(1), ['Disposable database query refused', 'Disposable database SQL diagnostic: SQLSTATE=42601']);
});

const backendCount = "(SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend')";
test('only opted-in loopback disposable SQL records the same activity observation and strips its private result', async () => {
  const input = `BEGIN; SELECT 'clean-reset:' || jsonb_build_object('backends', ${backendCount}); COMMIT;`;
  const sql = [];
  const result = await query(null, '1', true, { input, sql, result: [
    { rows: [{ receipt: 'clean-reset:{"inventory":{"backends":1}}' }] },
    { rows: [{ staging_test_backends: '{"count":1,"pids":[1234]}' }] },
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
  assert.match(result.stderr[0], /^Disposable PG lifecycle: ordinal=0 pid=0 connectedAtMs=\d+ closedAtMs=\d+$/);
});
