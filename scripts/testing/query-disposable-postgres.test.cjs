const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(`${__dirname}/query-disposable-postgres.cjs`, 'utf8');
async function query(error, enabled) {
  const stderr = [];
  const stdout = [];
  const process = { env: { STAGING_TEST_SQL_DIAGNOSTICS: enabled }, exitCode: 0 };
  class Client {
    async connect() {}
    async query() {
      if (error) throw error;
      return { rows: [{ count: 2 }] };
    }
    async end() {}
  }
  await runInNewContext(source, {
    process,
    console: { error: value => stderr.push(value), log: value => stdout.push(value) },
    require: name => {
      if (name === 'node:module') return { createRequire: () => () => ({ Client, types: {} }) };
      if (name === 'node:fs') return { readFileSync: () => 'SELECT secret_value' };
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
