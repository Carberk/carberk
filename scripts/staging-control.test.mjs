import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { GitLedger } from './staging-ledger.mjs';
import { StagingControl } from './staging-control.mjs';
import { FakeStagingPlatform } from './testing/fake-staging-platform.mjs';
const policy = { projectId: 'project-staging', environmentId: 'env-staging', environmentName: 'staging',
  services: { api: 'api-id', worker: 'worker-id' }, credentialScope: 'project:project-staging:env-staging',
  origins: { database: 'postgresql://postgres.railway.internal:5432/railway', media: 'http://minio.railway.internal:9000', publicMedia: 'https://staging-media.example', api: 'https://staging-api.example' } };
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'staging-control-')); t.after(() => rm(root, { recursive: true, force: true }));
  const remote = join(root, 'shared.git'); execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
  const ledger = new GitLedger({ directory: join(root, 'objects'), remote });
  ledger.latestMain = async () => 'c'.repeat(40); ledger.assertNoSchemaChange = async () => {};
  const platform = new FakeStagingPlatform(policy);
  let sequence = 0;
  const control = new StagingControl({ ledger, platform, policy, actor: 'alice', now: () => '2026-10-15T01:00:00.000Z', id: () => (++sequence).toString(16).padStart(32, '0') });
  const request = { parent: 897, pr: 902, candidate: 'a'.repeat(40), priority: 1, priorityEvidence: 'https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/897' };
  const claim = async () => { const id = await control.enqueue(request); return control.acquire(id); };
  return { control, ledger, platform, request, claim };
}
test('oldest ready request wins within founder priority and keeps all authority fields durably', async(t) => {
  const { control, request } = await setup(t);
  const low = await control.enqueue({ ...request, priority: 2 });
  const first = await control.enqueue(request); const second = await control.enqueue(request);
  await assert.rejects(control.acquire(low), /priority|ready/);
  await assert.rejects(control.acquire(second), /priority|ready/);
  const lease = await control.acquire(first);
  const state = await control.inspect();
  assert.equal(state.reservation.id, lease.id); assert.equal(state.reservation.owner, 'alice');
  assert.equal(state.reservation.candidate, 'a'.repeat(40)); assert.equal(state.reservation.parent, 897);
  assert.equal(state.reservation.pr, 902); assert.equal(state.reservation.identity.projectId, 'project-staging');
  assert.equal(state.reservation.lifecycle, 'active'); assert.match(state.reservation.namespace, /^cf_[a-f0-9]{32}$/);
  await assert.rejects(control.acquire(second), /reserved/);
});

test('fresh authoritative identity rejects wrong IDs, production, ambiguous origins and wrong credential scope before mutation', async(t) => {
  for (const change of [
    { projectId: 'wrong' }, { environmentId: 'production-id' }, { environmentName: 'production' },
    { environmentName: '' }, { services: { api: 'other', worker: 'worker-id' } },
    { credentialScope: 'account-wide' }, { origins: { ...policy.origins, database: 'postgresql://production/railway' } },
  ]) {
    const { platform, claim } = await setup(t); Object.assign(platform.policy, change);
    await assert.rejects(claim(), /identity|scope|origins/); assert.deepEqual(platform.operations, []);
  }
});
