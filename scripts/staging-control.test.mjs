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
  ledger.latestMain = async () => 'c'.repeat(40); ledger.migrationsAt = async () => ['20260101_initial']; ledger.assertNoSchemaChange = async () => {};
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
test('changed candidate, former owner and changed policy fail closed on each mutation', async(t) => {
  const { control, platform, claim } = await setup(t); const lease = await claim();
  await assert.rejects(control.operate({ ...lease, candidate: 'b'.repeat(40) }, 'fixture'), /candidate/);
  control.actor = 'bob'; await assert.rejects(control.operate(lease, 'fixture'), /owner/);
  control.actor = 'alice'; platform.policy.services.api = 'other';
  await assert.rejects(control.operate(lease, 'deploy'), /identity/);
  assert.deepEqual(platform.operations, []);
});
test('fixture and reset use only the durable disposable namespace; arbitrary commands are refused', async(t) => {
  const { control, platform, claim } = await setup(t); const lease = await claim();
  await assert.rejects(control.operate(lease, 'truncate-public'), /operation/);
  await control.operate(lease, 'fixture'); await control.operate(lease, 'reset');
  assert.deepEqual(platform.operations.map(x => [x.kind, x.namespace]), [['fixture', `cf_${lease.id}`], ['reset', `cf_${lease.id}`]]);
  const state = await control.inspect(); assert.equal(state.reservation.operation, null);
});
test('a durable in-flight operation excludes deployments, resets, release and another owner', async(t) => {
  const { control, ledger, claim } = await setup(t); const lease = await claim();
  const current = await ledger.read(); current.state.reservation.operation = { kind: 'deploy', id: 'uncertain' };
  await ledger.compareAndSwap(current.revision, current.state);
  await assert.rejects(control.operate(lease, 'reset'), /in-flight/);
  await assert.rejects(control.release(lease), /in-flight/);
  await assert.rejects(control.restore(lease), /in-flight/);
  assert.equal((await control.inspect()).reservation.operation.id, 'uncertain');
});
test('an interrupted mutation retains blocked recovery state and redacts provider diagnostics', async(t) => {
  const { control, platform, claim } = await setup(t); const lease = await claim(); platform.fail = true;
  await assert.rejects(control.operate(lease, 'fixture'), (error) => /blocked/.test(error.message) && !/Secret/.test(error.message));
  const state = await control.inspect(); assert.equal(state.reservation.lifecycle, 'blocked');
  assert.equal(state.reservation.operation.kind, 'fixture'); assert.equal(state.reservation.recovery.owner, 'alice');
  await assert.rejects(control.release(lease), /in-flight/);
});
test('current-main restoration and readiness proof are required before release; moved main needs another restore', async(t) => {
  const { control, ledger, platform, claim } = await setup(t); const lease = await claim();
  await assert.rejects(control.release(lease), /restoration/);
  await control.operate(lease, 'deploy');
  await control.restore(lease);
  assert.equal(platform.operations.at(-1).target, 'c'.repeat(40));
  ledger.latestMain = async () => 'd'.repeat(40);
  await assert.rejects(control.release(lease), /main changed/);
  await control.restore(lease); await control.release(lease);
  const state = await control.inspect(); assert.equal(state.reservation, null);
  assert.equal(state.history.at(-1).restoredSha, 'd'.repeat(40));
});
test('persistent schema differences and incomplete readiness prevent restoration/release', async(t) => {
  const { control, ledger, platform, claim } = await setup(t); const lease = await claim();
  ledger.assertNoSchemaChange = async () => { throw new Error('Persistent schema disposition unresolved'); };
  await assert.rejects(control.operate(lease, 'deploy'), /schema/); assert.deepEqual(platform.operations, []);
  ledger.assertNoSchemaChange = async () => {};
  platform.verify = async () => ({ sha: 'c'.repeat(40), readyz: true, worker: false, media: true, mock: true, fixtures: 'absent', schema: 'unchanged' });
  await assert.rejects(control.restore(lease), /blocked/);
  assert.equal((await control.inspect()).reservation.lifecycle, 'blocked');
  await assert.rejects(control.release(lease), /in-flight/);
});

test('simultaneous deploy and reset contenders cannot both cross the mutation boundary',async(t)=>{
  const {control,platform,claim}=await setup(t);const lease=await claim();
  const results=await Promise.allSettled([control.operate(lease,'deploy'),control.operate(lease,'reset')]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(platform.operations.length,1);
});

test('a changed authenticated coordinator cannot persist another owner operation',async(t)=>{
  const {control,platform,claim}=await setup(t);const lease=await claim();
  control.actorIdentity=async()=>'bob';
  await assert.rejects(control.operate(lease,'fixture'),/Authenticated/);
  assert.deepEqual(platform.operations,[]);
});
test('main moving during restoration proof never records a releasable restoration',async(t)=>{
  const {control,ledger,platform,claim}=await setup(t);const lease=await claim();
  const verify=platform.verify.bind(platform);
  platform.verify=async(...args)=>{ledger.latestMain=async()=>'d'.repeat(40);return verify(...args);};
  await assert.rejects(control.restore(lease),/blocked/);
  assert.equal((await control.inspect()).reservation.lifecycle,'blocked');
  await assert.rejects(control.release(lease),/in-flight/);
});

test('interruption after a provider creates a deployment preserves its actual ID for recovery',async(t)=>{
  const {control,platform,claim}=await setup(t);const lease=await claim();
  platform.execute=async(kind,active,target,record)=>{await record('api','actual-api-deployment');throw new Error('Transport lost');};
  await assert.rejects(control.operate(lease,'deploy'),/blocked/);
  const state=await control.inspect();
  assert.equal(state.reservation.operation.deployments.api,'actual-api-deployment');
  assert.equal(state.reservation.lifecycle,'blocked');
});
