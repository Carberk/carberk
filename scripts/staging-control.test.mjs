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
  ledger.latestMain = async () => 'c'.repeat(40); ledger.migrationsAt = async () => [{name:'20260101_initial',checksum:'1'.repeat(64)}]; ledger.schemaPlan = async () => ({disposition:'unchanged',migrations:await ledger.migrationsAt()});
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
  ledger.schemaPlan = async () => { throw new Error('Persistent schema disposition unresolved'); };
  await assert.rejects(control.operate(lease, 'deploy'), /schema/); assert.deepEqual(platform.operations, []);
  ledger.schemaPlan = async () => ({disposition:'unchanged',migrations:await ledger.migrationsAt()});
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

test('only proven complete interrupted deployments can recover; unknown or partial states retain ownership', async(t) => {
  const {control,platform,claim,ledger}=await setup(t);const lease=await claim();
  platform.execute=async(_kind,_active,_target,record)=>{
    await record('api','actual-api');await record('worker','actual-worker');throw new Error('Transport lost');
  };
  await assert.rejects(control.operate(lease,'deploy'),/blocked/);
  const unknown=await ledger.read();unknown.state.reservation.operation.deployments={api:'actual-api'};
  await ledger.compareAndSwap(unknown.revision,unknown.state);
  await assert.rejects(control.recover(lease),/deployment|recovery/i);
  assert.ok((await control.inspect()).reservation.operation);
  const complete=await ledger.read();complete.state.reservation.operation.deployments.worker='actual-worker';
  await ledger.compareAndSwap(complete.revision,complete.state);
  await control.recover(lease);
  const state=await control.inspect();assert.equal(state.reservation.operation,null);
  assert.equal(state.reservation.evidence.at(-1).kind,'recovery');
  assert.deepEqual(state.reservation.deployments,{api:'actual-api',worker:'actual-worker'});
  await assert.rejects(control.release(lease),/restoration/);
});

test('restoration carries retained schema forward but never assumes an undeployed candidate migration ran', async(t) => {
  const {control,platform,claim,ledger}=await setup(t);const lease=await claim();const calls=[];
  const base={name:'20260101_initial',checksum:'1'.repeat(64)};
  const addition={name:'20261015_views',checksum:'2'.repeat(64)};
  ledger.schemaPlan=async(candidate,main,retained)=>{
    calls.push({candidate,main,retained});
    return {disposition:retained?.some(x=>x.name===addition.name)||candidate===lease.candidate?'retained-additive':'unchanged',
      migrations:candidate===lease.candidate?[base,addition]:retained??[base]};
  };
  const verify=platform.verify.bind(platform);
  platform.verify=async(active,...args)=>({...await verify(active,...args),schema:active.operation.schemaDisposition,migrations:active.operation.expectedMigrations});
  await control.restore(lease);
  assert.equal(calls[0].candidate,'c'.repeat(40));assert.deepEqual(calls[0].retained,undefined);
  await control.operate(lease,'deploy');
  await control.restore(lease);
  const state=await control.inspect();assert.equal(state.reservation.restoration.schema,'retained-additive');
  assert.deepEqual(state.reservation.expectedMigrations,[base,addition]);
});

test('failed proof, wrong owner and moved-main recovery cannot clear the durable interrupted operation', async(t) => {
  for(const fault of ['proof','owner','main']){
    const {control,platform,claim,ledger}=await setup(t);const lease=await claim();
    platform.execute=async(_kind,_active,_target,record)=>{await record('api','actual-api');await record('worker','actual-worker');throw new Error('lost');};
    await assert.rejects(control.restore(lease),/blocked/);
    if(fault==='proof')platform.recover=async()=>{throw new Error('Active deployment mismatch');};
    if(fault==='owner')control.actor='bob';
    if(fault==='main')ledger.latestMain=async()=>'d'.repeat(40);
    await assert.rejects(control.recover(lease));
    assert.ok((await control.inspect()).reservation.operation);
    assert.equal((await control.inspect()).reservation.restoration,null);
  }
});

test('release preserves retained migration disposition for the next reservation',async(t)=>{
  const {control,claim}=await setup(t);const lease=await claim();
  await control.operate(lease,'deploy');await control.restore(lease);await control.release(lease);
  const history=(await control.inspect()).history.at(-1);assert.ok(history.migrations[0].checksum);
  await claim();assert.deepEqual((await control.inspect()).reservation.expectedMigrations,history.migrations);
});

test('campaign profile is explicit, durable before the first side effect and cannot replace a narrow fixture', async (t) => {
  const { control, ledger, platform, claim } = await setup(t); const lease = await claim();
  for (const profile of ['campaign897', '', { profile: 'campaign897-identities-v1', sql: 'unsafe' }])
    await assert.rejects(control.operate(lease, 'fixture', profile), /profile/);
  assert.deepEqual(platform.operations, []);
  const execute = platform.execute.bind(platform);
  platform.execute = async (...args) => {
    const state = (await ledger.read()).state.reservation;
    assert.equal(state.fixtureProfile, 'campaign897-identities-v1');
    assert.equal(state.operation.profile, 'campaign897-identities-v1');
    return { ...await execute(...args), profile: state.fixtureProfile, candidate: state.candidate, state: 'identities', fixtures: 'present', identities: 4,
      protectedReceipt: `${state.namespace}.campaign_entities` };
  };
  const receipt = await control.operate(lease, 'fixture', 'campaign897-identities-v1');
  assert.equal(receipt.profile, 'campaign897-identities-v1');
  assert.equal(receipt.protectedReceipt, `cf_${lease.id}.campaign_entities`);
  assert.equal((await control.inspect()).reservation.evidence.at(-1).profile, 'campaign897-identities-v1');
  await assert.rejects(control.operate(lease, 'fixture', 'listing-v1'), /profile/);
});

test('a completed narrow fixture cannot silently become campaign identities', async (t) => {
  const { control, claim } = await setup(t); const lease = await claim();
  await control.operate(lease, 'fixture');
  await assert.rejects(control.operate(lease, 'fixture', 'campaign897-identities-v1'), /profile/);
});

async function campaignDisposalSetup(t) {
  const context = await setup(t);
  const { control, platform } = context;
  const claim = await context.claim();
  const execute = platform.execute.bind(platform);
  platform.execute = async (kind, lease, target, record) => ({
    ...await execute(kind, lease, target, record),
    ...(kind === 'fixture' || kind === 'reset' ? {
      reservationId: lease.id, candidate: lease.candidate, profile: 'campaign897-identities-v1',
      namespace: lease.namespace, protectedReceipt: `${lease.namespace}.campaign_entities`,
      state: kind === 'fixture' ? 'identities' : 'disposed', fixtures: kind === 'fixture' ? 'present' : 'absent',
      identities: kind === 'fixture' ? 4 : 0, tombstone: kind === 'reset',
      ...(kind === 'reset' ? { cleanupVersion: 1, deliveryCleanup: 'disposed', queueJobs: 0, sinkRecords: 0 } : {}),
    } : {}),
  });
  await control.operate(claim, 'fixture', 'campaign897-identities-v1');
  return { ...context, claim };
}

test('campaign restoration refuses before deploy without current durable complete disposal evidence', async t => {
  for (const fault of ['missing', 'caller-boolean', 'foreign-reservation', 'candidate', 'profile', 'partial-queue', 'partial-sink', 'cleaning', 'no-tombstone', 'stale-before-fixture']) {
    await t.test(fault, async t => {
      const { control, ledger, platform, claim } = await campaignDisposalSetup(t);
      if (!['missing', 'caller-boolean'].includes(fault)) await control.operate(claim, 'reset');
      const persisted = await ledger.read();
      const lease = persisted.state.reservation;
      const proof = lease.evidence.at(-1);
      if (fault === 'caller-boolean') claim.disposed = true;
      if (fault === 'foreign-reservation') proof.reservationId = 'f'.repeat(32);
      if (fault === 'candidate') proof.candidate = 'b'.repeat(40);
      if (fault === 'profile') proof.profile = 'listing-v1';
      if (fault === 'partial-queue') proof.queueJobs = 1;
      if (fault === 'partial-sink') proof.sinkRecords = 1;
      if (fault === 'cleaning') proof.state = 'cleaning';
      if (fault === 'no-tombstone') proof.tombstone = false;
      if (fault === 'stale-before-fixture') lease.evidence.push({ ...lease.evidence.find(e => e.kind === 'fixture') });
      assert.equal(await ledger.compareAndSwap(persisted.revision, persisted.state), true);
      const before = platform.operations.length;
      await assert.rejects(control.restore(claim), /dispos|reset|cleanup/i);
      assert.equal(platform.operations.length, before);
      const retained = (await ledger.read()).state.reservation;
      assert.equal(retained.id, claim.id);
      assert.equal(retained.candidate, claim.candidate);
      assert.match(retained.recovery.action, /reset|dispos|cleanup/i);
    });
  }
});

test('a fresh controller restores from persisted exact campaign disposal after repeated reset', async t => {
  const { control, ledger, platform, claim } = await campaignDisposalSetup(t);
  await control.operate(claim, 'reset'); await control.operate(claim, 'reset');
  const proof = (await ledger.read()).state.reservation.evidence.at(-1);
  assert.equal(proof.reservationId, claim.id); assert.equal(proof.candidate, claim.candidate);
  assert.equal(proof.cleanupVersion, 1); assert.equal(proof.deliveryCleanup, 'disposed');
  assert.equal(proof.queueJobs, 0); assert.equal(proof.sinkRecords, 0); assert.equal(proof.tombstone, true);
  const recoveredController = new StagingControl({ ...control });
  await recoveredController.restore(claim);
  assert.equal(platform.operations.at(-1).kind, 'restore');
  await recoveredController.release(claim);
  assert.equal((await ledger.read()).state.reservation, null);
});

test('explicit reset continues only its persisted exact campaign cleanup operation after interruption', async t => {
  const { control, ledger, platform, claim } = await campaignDisposalSetup(t);
  platform.fail = true;
  await assert.rejects(control.operate(claim, 'reset'), /blocked/);
  const interrupted = (await ledger.read()).state.reservation.operation;
  platform.fail = false;
  const continued = await new StagingControl({ ...control }).operate(claim, 'reset');
  assert.equal(continued.operation, interrupted.id);
  const state = (await ledger.read()).state;
  assert.equal(state.reservation.operation, null);
  assert.equal(state.reservation.evidence.at(-1).operationId, interrupted.id);
  assert.equal(state.reservation.evidence.at(-1).deliveryCleanup, 'disposed');
  assert.equal(platform.operations.at(-1).kind, 'reset');
  await control.restore(claim);
});

test('explicit reset refuses incomplete or changed in-flight identity, runtime authority and other operation kinds', async t => {
  for (const fault of ['legacy', 'owner', 'namespace', 'candidate', 'profile', 'deploy', 'restore', 'target', 'attestation', 'changed-during-attestation']) {
    await t.test(fault, async t => {
      const { control, ledger, platform, claim } = await campaignDisposalSetup(t);
      platform.fail = true;
      await assert.rejects(control.operate(claim, 'reset'), /blocked/);
      platform.fail = false;
      const before = await ledger.read();
      const op = before.state.reservation.operation;
      if (fault === 'legacy') delete op.namespace;
      if (fault === 'owner') op.owner = 'bob';
      if (fault === 'namespace') op.namespace = `cf_${'f'.repeat(32)}`;
      if (fault === 'candidate') op.candidate = 'b'.repeat(40);
      if (fault === 'profile') op.profile = 'listing-v1';
      if (fault === 'deploy' || fault === 'restore') op.kind = fault;
      if (fault === 'target') op.target = 'b'.repeat(40);
      assert.equal(await ledger.compareAndSwap(before.revision, before.state), true);
      if (fault === 'attestation') platform.policy.services.api = 'wrong-api';
      if (fault === 'changed-during-attestation') {
        const attest = platform.attest.bind(platform);
        platform.attest = async (...args) => {
          const changing = await ledger.read(); changing.state.reservation.operation.id = 'f'.repeat(32);
          await ledger.compareAndSwap(changing.revision, changing.state);
          return attest(...args);
        };
      }
      const operations = platform.operations.length;
      await assert.rejects(control.operate(claim, 'reset'));
      assert.equal(platform.operations.length, operations);
      assert.ok((await ledger.read()).state.reservation.operation);
      await assert.rejects(control.operate(claim, 'deploy'));
      await assert.rejects(control.restore(claim));
    });
  }
});
