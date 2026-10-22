import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const holder = fileURLToPath(new URL('./testing/campaign-transaction-holder.cjs', import.meta.url));

// Replace only the external database boundary. The repository helper and IPC
// transport run unchanged in a real child process; no database is contacted.
const pgBoundary = `
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const load = Module._load;
class Client extends EventEmitter {
  async connect() {
    process.on('message', message => {
      if (!message.terminate) return;
      if (process.env.HOLDER_SCENARIO !== 'missing-57P01') {
        const error = new Error('terminating connection due to administrator command');
        error.code = process.env.HOLDER_SCENARIO === 'wrong-error' ? '08006' : '57P01';
        this.emit('error', error);
      }
      if (process.env.HOLDER_SCENARIO !== 'missing-end') this.emit('end');
    });
  }
  async query(sql) {
    return { rows: sql.includes('pg_backend_pid') ? [{ pid: 12345 }] : [] };
  }
  async end() {
    if (process.env.HOLDER_SCENARIO === 'disconnected') {
      process.disconnect();
      return;
    }
    if (process.env.HOLDER_SCENARIO === 'backpressure') {
      for (let i = 0; i < 8192; i++) process.send({ filler: i, bytes: 'x'.repeat(1024) });
    }
  }
}
Module._load = function(id) {
  return id === 'pg' ? { Client } : load.apply(this, arguments);
};
`;

async function observe(t, preload, scenario) {
  const child = fork(holder, [], {
    execArgv: ['--require', preload],
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unreachable',
      CAMPAIGN_NAMESPACE: 'cf_holder_ipc_regression',
      HOLDER_SCENARIO: scenario,
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  let fillers = 0;
  const phases = [];
  let atExit;
  child.stderr.on('data', data => { stderr += data; });
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  t.after(async () => {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
  });
  child.on('message', message => {
    if (message.holderPhase) {
      phases.push(message.holderPhase);
      // Let the real child saturate its IPC channel while the caller is busy.
      if (scenario === 'backpressure' && message.holderPhase === 'connection-ended') {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
    if (message.filler !== undefined) fillers++;
    if (message.backendPid) child.send({ terminate: true, finish: true });
  });
  child.once('exit', (code, signal) => { atExit = { code, signal, phases: [...phases] }; });
  await closed;
  assert.ok(atExit, stderr);
  assert.equal(atExit.signal, null, stderr);
  return { ...atExit, fillers, stderr };
}

test('transaction holder delivers completion through real IPC before successful exit', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'campaign-holder-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const preload = join(directory, 'pg-boundary.cjs');
  await writeFile(preload, pgBoundary);

  await t.test('completion survives backpressure', async t => {
    const result = await observe(t, preload, 'backpressure');
    assert.equal(result.code, 0, result.stderr);
    assert.ok(result.fillers > 0, 'real IPC traffic reached the caller');
    assert.ok(result.phases.includes('backend-57P01'));
    assert.ok(result.phases.includes('connection-ended'));
    assert.ok(result.phases.includes('terminated-cleanly'),
      `successful exit must include completion; observed ${result.phases.join(',')}`);
  });

  for (const scenario of ['missing-57P01', 'wrong-error', 'missing-end', 'disconnected']) {
    await t.test(`${scenario} cannot report success`, async t => {
      const result = await observe(t, preload, scenario);
      assert.equal(result.code, 1, result.stderr);
      assert.ok(!result.phases.includes('terminated-cleanly'));
    });
  }
});
