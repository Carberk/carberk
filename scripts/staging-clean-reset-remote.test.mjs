import assert from 'node:assert/strict';
import test from 'node:test';
import { Script, runInNewContext } from 'node:vm';

import { cleanResetProgram } from './staging-clean-reset-remote.mjs';

const candidate = 'c'.repeat(40), operationId = 'e'.repeat(32), reservationId = 'f'.repeat(32);
const identity = { projectId: '176ddec0-dd65-4087-b82c-798599fc2ebe', environmentId: '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2',
  services: { api: '6db6f1b1-5c7a-4033-88d0-53f5f315bfc0', worker: '24aa02e0-25a9-4e80-9cc2-c1795ef82091' },
  origins: { database: 'postgresql://postgres.railway.internal:5432/railway', redis: 'redis://redis.railway.internal:6379/0' } };
// Synthetic protocol context only. The resource boundary below never constructs a client or runs SQL.
const command = () => ({ operation: 'clean-reset', phase: 'redis', operationId, reservationId, candidate, identity: structuredClone(identity),
  expectedInventory: { digest: '1'.repeat(64), rowsReceiptDigest: '2'.repeat(64) },
  binding: { owner: 'operator-901', leaseCommit: 'a'.repeat(40),
    window: { operationId, candidate, closedAt: '2026-10-21T00:00:00.000Z', observedAt: '2026-10-21T00:15:00.000Z', elapsedSeconds: 900 },
    deployments: { api: [{ id: 'api-deployment', status: 'SUCCESS', sha: candidate }], worker: [{ id: 'worker-deployment', status: 'SUCCESS', sha: candidate }] } } });
function preflight(payload) {
  const ports = [], errors = [], output = [];
  const process = { exitCode: 0, env: { RAILWAY_PROJECT_ID: identity.projectId, RAILWAY_ENVIRONMENT_ID: identity.environmentId,
    RAILWAY_SERVICE_ID: identity.services.api, RAILWAY_ENVIRONMENT_NAME: 'staging', APP_ENV: 'staging', AUTOTM_COMMIT_SHA: candidate,
    DATABASE_URL: identity.origins.database, REDIS_URL: identity.origins.redis } };
  const program = cleanResetProgram(payload);
  new Script(program);
  runInNewContext(program, { URL, Buffer, process, console: { log: value => output.push(value), error: value => errors.push(value) },
    require: name => { ports.push(name); throw new Error('Offline resource boundary'); } });
  return { ports, errors, output, code: process.exitCode };
}

test('the exact Redis protocol reaches the database boundary without a fabricated receipt', () => {
  assert.deepEqual(preflight(command()), { ports: ['node:child_process'], code: 1, output: [],
    errors: ['Clean reset refused or incomplete; diagnostics suppressed'] });
});

test('malformed additive binding and digest pairs refuse before any resource boundary', () => {
  const variants = [];
  for (const key of Object.keys(command())) { const c = command(); delete c[key]; variants.push(c); }
  for (const section of ['binding', 'expectedInventory']) {
    for (const key of Object.keys(command()[section])) { const c = command(); delete c[section][key]; variants.push(c); }
    const c = command(); c[section].extra = true; variants.push(c);
  }
  for (const change of [c => { c.binding.owner = ['operator-901']; }, c => { c.binding.leaseCommit = 'A'.repeat(40); },
    c => { c.binding.window.elapsedSeconds = 899; }, c => { c.binding.window.observedAt = '2026-10-21T00:15:00Z'; },
    c => { c.binding.window.operationId = 'd'.repeat(32); }, c => { c.binding.deployments.worker[0].status = 'FAILED'; },
    c => { c.binding.deployments.worker.push(c.binding.deployments.worker[0]); }, c => { c.expectedInventory.rowsReceiptDigest = ['2'.repeat(64)]; }]) {
    const c = command(); change(c); variants.push(c);
  }
  for (const c of variants) assert.deepEqual(preflight(c), { ports: [], code: 1, output: [], errors: ['Clean reset refused: target'] });
});
