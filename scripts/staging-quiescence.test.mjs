import test from 'node:test';
import assert from 'node:assert/strict';
import { observeQuiescence } from './staging-quiescence.mjs';
import { quiescenceBoundary, target } from './testing/quiescence-boundaries.mjs';

test('caller JSON cannot claim quiescence or invoke an executor', async () => {
  const { platform, state } = quiescenceBoundary();
  await assert.rejects(observeQuiescence(platform, { ...target, quiesced: true }), /exact quiescence request/);
  assert.deepEqual(state.mutations, []);
  assert.equal(state.executorCalls, 0);
});

test('ambiguous active deployment reads refuse before remote observation', async () => {
  const { platform, state } = quiescenceBoundary();
  state.instances.api.activeDeployments = [];
  await assert.rejects(observeQuiescence(platform, target), /sole active deployment/);
  assert.equal(state.receipts.length, 0);
});

test('read-only boundary reaches all fixed observations then refuses unresolved evidence', async () => {
  const { platform, state } = quiescenceBoundary();
  await assert.rejects(observeQuiescence(platform, target), error => error.code === 'QUIESCENCE_EVIDENCE_GAP');
  assert.equal(state.mutations.length, 0);
  assert.deepEqual(state.queueNames, ['video-transcode','notification-fanout','orphan-cleanup','account-purge','retired-upload-cleanup','listing-view-retention','measurement-retention','measurement-outbox','service-lifecycle','service-push','diagnostic-artifacts','email-code']);
  assert.deepEqual(state.heartbeatKeys, ['operations:stage-ops:worker']);
  assert.equal(state.sql.length, 1);
});

test('unknown queue workers refuse and do not continue to HTTP or SQL', async () => {
  const { platform, state } = quiescenceBoundary();
  state.workers['email-code'] = [{ name: 'worker' }];
  await assert.rejects(observeQuiescence(platform, target), /remote observation failed/);
  assert.equal(state.sql.length, 0);
});

for (const [name, change, expected] of [
  ['wrong credential scope', s => { s.scope.environmentId = 'production'; }, /credential scope mismatch/],
  ['production identity', s => { s.environmentName = 'production'; }, /staging identity/],
  ['missing active list', s => { delete s.instances.api.activeDeployments; }, /sole active deployment/],
  ['extra active deployment even when latest is candidate', s => { s.instances.worker.activeDeployments.push({ ...s.instances.worker.latestDeployment, id: 'old' }); }, /sole active deployment/],
  ['stale latest deployment', s => { s.instances.api.latestDeployment = { ...s.instances.api.latestDeployment, id: 'old' }; }, /latest identity/],
  ['wrong deployment SHA', s => { s.instances.api.activeDeployments[0].meta.commitHash = 'b'.repeat(40); }, /candidate deployment/],
  ['wrong deployment project', s => { s.instances.api.activeDeployments[0].projectId = 'other'; }, /candidate deployment/],
  ['wrong deployment service', s => { s.instances.worker.activeDeployments[0].serviceId = 'api'; }, /candidate deployment/],
  ['extra deployment instance', s => { s.instances.worker.activeDeployments[0].instances.push({ id: 'replica', status: 'RUNNING' }); }, /candidate deployment/],
  ['unknown instance state', s => { s.instances.api.activeDeployments[0].instances[0].status = 'RESTARTING'; }, /candidate deployment/],
  ['extra deployment fields', s => { s.instances.api.activeDeployments[0].proof = true; }, /candidate deployment/],
  ['missing maintenance flag', s => { delete s.variables.worker.PHOTO_CONVERSION_MAINTENANCE; }, /maintenance configuration/],
  ['different Redis database', s => { s.variables.worker.REDIS_URL = 'redis://user:SECRET@redis.railway.internal:6379/1'; }, /Redis delivery authorities differ/],
  ['missing worker pause', s => { s.logs[0].message = 'Something else'; }, /pause log/],
  ['consumer startup alongside pause', s => { s.logs.push({ ...s.logs[0], message: 'Worker started (BullMQ consumer)' }); }, /consumer startup/],
  ['stale worker log', s => { s.logs[0].timestamp = '2026-10-21T11:58:00.000Z'; }, /log identity or timestamp/],
  ['wrong worker log instance', s => { s.logs[0].tags.deploymentInstanceId = 'old-instance'; }, /log identity or timestamp/],
  ['missing log tags', s => { delete s.logs[0].tags; }, /log identity or timestamp/],
  ['truncated logs', s => { s.logs = Array(5000).fill(s.logs[0]); }, /missing or truncated/],
  ['unknown log read', s => { s.logs = null; }, /missing or truncated/],
  ['wrong runtime deployment', s => { s.env.worker.RAILWAY_DEPLOYMENT_ID = 'old'; }, /remote observation failed/],
  ['runtime scope differs', s => { s.env.worker.OPERATIONS_SCOPE = 'another'; }, /remote observation failed/],
  ['worker heartbeat present', s => { s.heartbeat = '1730000000000'; }, /remote observation failed/],
  ['heartbeat read unknown', s => { s.heartbeat = undefined; }, /remote observation failed/],
  ['getWorkers read unknown', s => { s.workers['service-push'] = undefined; }, /remote observation failed/],
  ['getWorkers unsupported sentinel', s => { s.workers['email-code'] = [{ name: 'GCP does not support client list' }]; }, /remote observation failed/],
  ['queue read failed', s => { s.queueError = true; }, /remote observation failed/],
  ['unaudited BullMQ version', s => { s.bullmqVersion = '5.76.9'; }, /remote observation failed/],
  ['other database client', s => { s.database.otherBackends = 1; }, /remote observation failed/],
  ['database activity visibility unknown', s => { s.database.completeVisibility = false; }, /remote observation failed/],
  ['database activities disabled', s => { s.database.trackActivities = 'off'; }, /remote observation failed/],
  ['database time absent', s => { delete s.database.observedAt; }, /remote observation failed/],
  ['database query failed', s => { s.sqlResult = { status: 1, stdout: 'SECRET' }; }, /remote observation failed/],
  ['database receipt has extra fields', s => { s.database.extra = 0; }, /remote observation failed/],
  ['runtime readyz carries unexpected SHA field', s => { s.readyz.commitSha = target.candidate; }, /remote observation failed/],
  ['runtime health identity absent', s => { delete s.healthz.commitSha; }, /remote observation failed/],
  ['public ingress transport error', s => { s.publicHttpError = true; }, /public maintenance ingress read unavailable/],
  ['public ingress differs from deployment', s => { s.publichealthz = { ...s.healthz, commitSha: 'b'.repeat(40) }; }, /maintenance readyz\/healthz identity/],
  ['public ingress has extra fields', s => { s.publicreadyz = { ...s.readyz, quiesced: true }; }, /maintenance readyz\/healthz identity/],
  ['stale remote challenge', s => { s.transformReceipt = r => ({ ...r, nonce: '0'.repeat(32) }); }, /stale or has ambiguous identity/],
  ['extra remote fields', s => { s.transformReceipt = r => ({ ...r, quiesced: true }); }, /stale or has ambiguous identity/],
  ['missing remote field', s => { s.transformReceipt = r => { delete r.candidate; return r; }; }, /stale or has ambiguous identity/],
  ['extra queue in remote receipt', s => { s.transformReceipt = r => r.role === 'worker' ? { ...r, queueWorkers: { ...r.queueWorkers, unknown: 0 } } : r; }, /queue workers or scoped heartbeat/],
  ['wrong heartbeat key', s => { s.transformReceipt = r => r.role === 'worker' ? { ...r, heartbeatKey: 'operations:staging:worker' } : r; }, /queue workers or scoped heartbeat/],
  ['ambiguous remote stream', s => { s.remoteOutput = '{}\n{}'; }, /exact remote observation/],
  ['deployment changed between reads', s => { s.changeInventory = (role, count) => { if (count === 3) s.instances[role].activeDeployments = []; }; }, /sole active deployment/],
  ['database clock predates worker boot log', s => { s.database.observedAt = '2026-10-21T11:59:01.000Z'; }, /newer than database/],
]) {
  test(`${name} refuses with zero mutation or executor activation`, async () => {
    const { platform, state } = quiescenceBoundary();
    change(state);
    await assert.rejects(platform.observeQuiescence(target), error => {
      assert.equal(error.message.includes('SECRET'), false);
      return expected.test(error.message);
    });
    assert.deepEqual(state.mutations, []);
  assert.equal(state.executorCalls, 0);
  });
}

test('a second observation re-reads all authorities and rejects cached remote receipts', async () => {
  const { platform, state } = quiescenceBoundary();
  await assert.rejects(platform.observeQuiescence(target), { code: 'QUIESCENCE_EVIDENCE_GAP' });
  const previous = state.receipts[0];
  state.transformReceipt = () => previous;
  await assert.rejects(platform.observeQuiescence(target), /stale or has ambiguous identity/);
  assert.deepEqual(state.mutations, []);
  assert.equal(state.executorCalls, 0);
});

test('OperationsConfig default scope is observed rather than inferred from staging', async () => {
  const { platform, state } = quiescenceBoundary();
  delete state.variables.worker.OPERATIONS_SCOPE;
  delete state.env.worker.OPERATIONS_SCOPE;
  await assert.rejects(platform.observeQuiescence(target), { code: 'QUIESCENCE_EVIDENCE_GAP' });
  assert.deepEqual(state.heartbeatKeys, ['operations:development:worker']);
});

for (const queue of ['video-transcode', 'notification-fanout', 'orphan-cleanup', 'account-purge', 'retired-upload-cleanup',
  'listing-view-retention', 'measurement-retention', 'measurement-outbox', 'service-lifecycle', 'service-push', 'diagnostic-artifacts', 'email-code']) {
  test(`a consumer on ${queue} prevents database observation and all executor effects`, async () => {
    const { platform, state } = quiescenceBoundary();
    state.workers[queue] = [{ name: 'consumer' }];
    await assert.rejects(platform.observeQuiescence(target), /remote observation failed/);
    assert.equal(state.sql.length, 0);
    assert.deepEqual(state.mutations, []);
    assert.equal(state.executorCalls, 0);
  });
}

for (const [name, change] of [
  ['caller issuer proof', value => { value.issuerSha = value.candidate; }],
  ['caller deployment proof', value => { value.deployments = {}; }],
  ['missing candidate', value => { delete value.candidate; }],
  ['unknown target service', value => { value.identity.services.admin = 'admin'; }],
  ['ambiguous service identity', value => { value.identity.services.worker = value.identity.services.api; }],
  ['extra identity field', value => { value.identity.quiesced = true; }],
  ['numeric operation ID', value => { value.operationId = 1; }],
]) {
  test(`${name} refuses before any external read`, async () => {
    const { platform, state } = quiescenceBoundary();
    const value = structuredClone(target);
    change(value);
    await assert.rejects(platform.observeQuiescence(value), /Quiescence refused/);
    assert.deepEqual(state.effects, []);
    assert.deepEqual(state.mutations, []);
    assert.equal(state.executorCalls, 0);
  });
}
