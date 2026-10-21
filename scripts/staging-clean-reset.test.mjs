import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  PRODUCTION_RESET, PHASES, QUEUES, GRANT_ISSUERS, GRANT_WINDOW_SECONDS,
  parseRequest, guardTarget, grantWindowSeconds, evaluateQuiescence, evaluateWindow, planTables, nextPhase,
} from './staging-clean-reset.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(root, path), 'utf8');
const manifest = JSON.parse(read('scripts/staging-clean-reset.tables.json'));
const clone = value => structuredClone(value);

// Offline fixtures only. Every value below stands in for a future
// authoritative adapter observation; none was read from a live environment.
const stagingPolicy = { target: 'staging', projectId: '176ddec0-dd65-4087-b82c-798599fc2ebe', environmentId: '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2',
  services: { api: '6db6f1b1-5c7a-4033-88d0-53f5f315bfc0', worker: '24aa02e0-25a9-4e80-9cc2-c1795ef82091' } };
const claim = { id: '1'.repeat(32), candidate: 'a'.repeat(40) };
const stagingAttestation = { projectId: stagingPolicy.projectId, environmentId: stagingPolicy.environmentId, environmentName: 'staging',
  services: clone(stagingPolicy.services), appEnv: { api: 'staging', worker: 'staging' } };
const stagingInput = () => ({ request: { policy: clone(stagingPolicy), claim: clone(claim) }, attestation: clone(stagingAttestation),
  credentials: { staging: true, production: false }, authorization: `${claim.id}:${claim.candidate}` });
const productionId = 'c0ffee00-0000-4000-8000-000000000001';
const productionInput = () => {
  const policy = { target: 'production', projectId: 'p-1', environmentId: productionId, services: { api: 's-api', worker: 's-worker' } };
  return { request: { policy, claim: clone(claim) },
    attestation: { projectId: 'p-1', environmentId: productionId, environmentName: 'production', services: clone(policy.services), appEnv: { api: 'production', worker: 'production' } },
    credentials: { staging: false, production: true }, authorization: undefined, trusted: { open: true, environmentId: productionId } };
};

test('staging target passes only with authoritative identity, exclusive staging credential and reservation authorization', () => {
  assert.deepEqual(guardTarget(stagingInput()), { target: 'staging', claim, identity: stagingPolicy });
});

test('wrong project, environment or service, name-only targets and cross-target credentials refuse', () => {
  const cases = [
    [i => { i.attestation.projectId = 'other'; }, /identity mismatch/],
    [i => { i.attestation.environmentId = 'other'; }, /identity mismatch/],
    [i => { i.attestation.services.worker = 'other'; }, /identity mismatch/],
    [i => { i.attestation.environmentName = 'production'; }, /identity mismatch/],
    [i => { i.attestation.appEnv.worker = 'production'; }, /identity mismatch/],
    [i => { i.request.policy = { target: 'staging', environmentName: 'staging' }; }, /Exact clean-reset policy/],
    [i => { i.credentials.production = true; }, /Exactly one target credential/],
    [i => { i.credentials.staging = false; }, /Exactly one target credential/],
    [i => { i.credentials.staging = 'true'; }, /credential presence/],
    [i => { i.authorization = `${claim.id}:${'b'.repeat(40)}`; }, /reservation authorization/],
    [i => { i.authorization = undefined; }, /reservation authorization/],
    [i => { i.attestation.verified = true; }, /attestation/],
  ];
  for (const [mutate, expected] of cases) {
    const input = stagingInput(); mutate(input);
    assert.throws(() => guardTarget(input), expected);
  }
});

test('caller policy and claim JSON cannot assert state: extra, missing or non-strict fields refuse', () => {
  for (const key of ['workersStopped', 'publicLaunch', 'quiesced', 'closedAt', 'phase']) {
    assert.throws(() => parseRequest({ ...stagingPolicy, [key]: true }, claim), /Exact clean-reset policy/);
    assert.throws(() => parseRequest(stagingPolicy, { ...claim, [key]: true }), /Exact clean-reset claim/);
  }
  assert.throws(() => parseRequest({ ...stagingPolicy, services: { ...stagingPolicy.services, admin: 'x' } }, claim), /Exact clean-reset policy/);
  assert.throws(() => parseRequest(stagingPolicy, { id: claim.id }), /Exact clean-reset claim/);
  assert.throws(() => parseRequest(stagingPolicy, { ...claim, candidate: 'A'.repeat(40) }), /Exact clean-reset claim/);
  assert.throws(() => parseRequest({ ...stagingPolicy, target: 'Staging' }, claim), /Exact clean-reset policy/);
  assert.throws(() => parseRequest(null, claim), /Exact clean-reset policy/);
  assert.deepEqual(parseRequest(stagingPolicy, claim), { policy: stagingPolicy, claim });
});

test('production clean reset is unconditionally disabled by the committed trusted switch', () => {
  assert.deepEqual(PRODUCTION_RESET, { open: false, environmentId: null });
  const { trusted, ...input } = productionInput();
  assert.throws(() => guardTarget(input), /Production clean reset disabled/);
});

test('production refusals stay ordered behind independently sourced identity even when a test opens the switch', () => {
  const cases = [
    [i => { i.trusted = { open: true, environmentId: null }; }, /independently sourced production identity/],
    [i => { i.trusted = { open: 'true', environmentId: productionId }; }, /Production clean reset disabled/],
    [i => { i.trusted.environmentId = 'c0ffee00-0000-4000-8000-000000000002'; }, /identity mismatch/],
    [i => { i.credentials.staging = true; }, /Exactly one target credential/],
    [i => { i.credentials.production = false; }, /Exactly one target credential/],
    [i => { i.attestation.appEnv.api = 'staging'; }, /identity mismatch/],
    [i => { i.attestation.environmentName = 'staging'; }, /identity mismatch/],
  ];
  for (const [mutate, expected] of cases) {
    const input = productionInput(); mutate(input);
    assert.throws(() => guardTarget(input), expected);
  }
  assert.throws(() => guardTarget(productionInput()), /Production executor not implemented/);
  const stagingPolicyToProduction = productionInput(); stagingPolicyToProduction.request.policy = clone(stagingPolicy);
  assert.throws(() => guardTarget(stagingPolicyToProduction), /Exactly one target credential|identity mismatch/);
});

const operationId = 'f'.repeat(32);
const quiet = (observedAt = '2026-10-21T10:00:00.000Z') => ({
  operationId, candidate: claim.candidate, observedAt, issuerSha: claim.candidate,
  readyz: { status: 'maintenance', commitSha: claim.candidate },
  deployments: { api: [{ id: 'dep-api', status: 'SUCCESS', sha: claim.candidate }], worker: [{ id: 'dep-worker', status: 'SUCCESS', sha: claim.candidate }] },
  workerLog: { paused: true, consumerStarted: false },
  queueWorkers: Object.fromEntries(['video-transcode', 'notification-fanout', 'orphan-cleanup', 'account-purge', 'retired-upload-cleanup',
    'listing-view-retention', 'measurement-retention', 'measurement-outbox', 'service-lifecycle', 'service-push', 'diagnostic-artifacts', 'email-code'].map(q => [q, 0])),
  heartbeat: 'absent', otherBackends: 0,
});
const context = { operationId, candidate: claim.candidate };

test('authoritative ingress closure is recorded at the database clock of the first passing observation', () => {
  assert.deepEqual(evaluateQuiescence(quiet(), context), { operationId, candidate: claim.candidate, closedAt: '2026-10-21T10:00:00.000Z' });
});

test('any open ingress, live consumer, stale replica, other backend or unknown field refuses quiescence', () => {
  const cases = [
    o => { o.readyz.status = 'ready'; },
    o => { o.readyz.commitSha = 'b'.repeat(40); },
    o => { o.workerLog.consumerStarted = true; },
    o => { o.workerLog.paused = false; },
    o => { o.queueWorkers['email-code'] = 1; },
    o => { o.queueWorkers['service-push'] = 0.5; },
    o => { delete o.queueWorkers['account-purge']; },
    o => { o.queueWorkers['unknown-queue'] = 0; },
    o => { o.heartbeat = 'present'; },
    o => { o.otherBackends = 1; },
    o => { o.otherBackends = Number.POSITIVE_INFINITY; },
    o => { o.deployments.api.push({ id: 'dep-api-old', status: 'SUCCESS', sha: claim.candidate }); },
    o => { o.deployments.worker[0].status = 'DEPLOYING'; },
    o => { o.deployments.worker[0].sha = 'b'.repeat(40); },
    o => { o.deployments.worker = []; },
    o => { o.readyz = undefined; },
    o => { o.heartbeat = undefined; },
    o => { o.workersStopped = true; },
    o => { o.observedAt = 'yesterday'; },
    o => { o.operationId = 'e'.repeat(32); },
    o => { o.candidate = 'b'.repeat(40); },
    o => { o.issuerSha = 'b'.repeat(40); },
  ];
  for (const mutate of cases) {
    const observation = quiet(); mutate(observation);
    assert.throws(() => evaluateQuiescence(observation, context), /quiescence|Grant lifetime unknown|operation identity/i, mutate.toString());
  }
});

test('grant window opens only after a repeated quiescent observation 900 database seconds after closure', () => {
  const closure = { operationId, candidate: claim.candidate, closedAt: '2026-10-21T10:00:00.000Z' };
  assert.equal(GRANT_WINDOW_SECONDS, 900);
  assert.throws(() => evaluateWindow(closure, quiet('2026-10-21T10:14:59.000Z')), /Grant window open/);
  assert.deepEqual(evaluateWindow(closure, quiet('2026-10-21T10:15:00.000Z')),
    { operationId, candidate: claim.candidate, closedAt: closure.closedAt, observedAt: '2026-10-21T10:15:00.000Z', elapsedSeconds: 900 });
  assert.throws(() => evaluateWindow(closure, quiet('2026-10-21T09:59:59.000Z')), /clock regressed/);
  const reopened = quiet('2026-10-21T10:20:00.000Z'); reopened.readyz.status = 'ready';
  assert.throws(() => evaluateWindow(closure, reopened), /quiescence/i);
  assert.throws(() => evaluateWindow({ ...closure, operationId: 'e'.repeat(32) }, quiet('2026-10-21T10:20:00.000Z')), /operation identity/);
  assert.throws(() => evaluateWindow({ ...closure, closedAt: undefined }, quiet('2026-10-21T10:20:00.000Z')), /closure/);
});

function productionSources() {
  const files = {};
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (['node_modules', 'testing', 'tests', 'test', '__tests__', 'dist', '.next'].includes(name)) continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|mts)$/.test(name) && !/\.(spec|test|e2e-spec)\.tsx?$/.test(name) && !/\.e2e\./.test(name)) files[relative(root, path)] = readFileSync(path, 'utf8');
    }
  };
  for (const parent of ['apps', 'packages']) for (const name of readdirSync(join(root, parent))) {
    const src = join(root, parent, name, 'src');
    try { if (statSync(src).isDirectory()) walk(src); } catch {}
  }
  return files;
}

test('the grant window is the maximum of the pinned issuer definitions in current production source', () => {
  const sources = productionSources();
  assert.equal(grantWindowSeconds(sources), 900);
  assert.equal(GRANT_WINDOW_SECONDS, grantWindowSeconds(sources));
  assert.deepEqual(GRANT_ISSUERS.map(x => x.file).sort(), [
    'apps/api/src/modules/catalog/application/PresignBrandLogoUpload.ts',
    'apps/api/src/modules/catalog/infrastructure/MinioBrandLogoStorage.ts',
    'apps/api/src/modules/conversations/application/PresignChatAttachmentUpload.ts',
    'apps/api/src/modules/listings/application/PresignUpload.ts',
    'apps/api/src/modules/listings/infrastructure/MinioMediaStorageAdapter.ts',
    'apps/api/src/modules/listings/infrastructure/S3VideoObjectStorage.ts',
  ]);
});

test('an unknown signer, unknown caller or changed lifetime definition refuses the grant window', () => {
  const sources = productionSources();
  const video = 'apps/api/src/modules/listings/infrastructure/S3VideoObjectStorage.ts';
  const logo = 'apps/api/src/modules/catalog/application/PresignBrandLogoUpload.ts';
  assert.throws(() => grantWindowSeconds({ ...sources, 'apps/api/src/New.ts': 'import { getSignedUrl } from "@aws-sdk/s3-request-presigner";' }), /Unknown presigned grant issuer/);
  assert.throws(() => grantWindowSeconds({ ...sources, 'apps/api/src/Caller.ts': 'await this.storage.presignUpload(key, type, 3600, size);' }), /Unknown presigned grant issuer/);
  assert.throws(() => grantWindowSeconds({ ...sources, [video]: sources[video].replace('Math.min(900,', 'Math.min(1800,') }), /Grant lifetime unknown/);
  assert.throws(() => grantWindowSeconds({ ...sources, [logo]: sources[logo].replace('UPLOAD_EXPIRY_SECONDS = 600', 'UPLOAD_EXPIRY_SECONDS = Number(process.env.TTL)') }), /Grant lifetime unknown/);
  assert.throws(() => grantWindowSeconds({ ...sources, [logo]: `${sources[logo]}\nconst UPLOAD_EXPIRY_SECONDS = 600;` }), /Grant lifetime unknown/);
  const { [video]: _removed, ...missing } = sources;
  assert.throws(() => grantWindowSeconds(missing), /Grant lifetime unknown/);
});

test('quiescence queues are exactly the watchdog worker queues', () => {
  const literal = read('apps/worker/src/operations/watchdog.main.ts').match(/const QUEUES = \[([^\]]+)\] as const;/);
  assert.ok(literal);
  assert.deepEqual([...QUEUES], [...literal[1].matchAll(/"([a-z-]+)"/g)].map(x => x[1]));
});

// Live-shaped table inventory built from the manifest; each test perturbs one fact.
const ns = `cf_${'2'.repeat(32)}`;
const live = () => ({
  schemas: ['public', ns],
  tables: Object.keys(manifest.tables).map(name => ({ schema: 'public', name, rows: manifest.tables[name] === 'delete' ? 3 : manifest.tables[name].startsWith('refuse') ? 0 : 5 })),
  foreignKeys: [{ name: 'sessions_userId_fkey', from: 'public.sessions', to: 'public.users' }, { name: 'models_brandId_fkey', from: 'public.models', to: 'public.brands' },
    { name: 'blog_posts_authorId_fkey', from: 'public.blog_posts', to: 'public.users' }],
  triggers: [
    { table: 'users', name: 'business_enquiry_user_revocation', functionSchema: 'public', truncate: false },
    { table: 'users', name: `${ns}_auth`, functionSchema: ns, truncate: false },
    { table: 'audit_logs', name: `${ns}_promotion`, functionSchema: ns, truncate: false },
  ],
  cfNamespaces: [{ name: ns, state: 'disposed', campaignRecords: true, listingManifest: false }],
  approvedDiagnosticCenters: 0,
});

test('the table manifest maps every Prisma table exactly once and retains reference and protected tables', () => {
  const mapped = [...read('packages/db/prisma/schema.prisma').matchAll(/@@map\("([a-z_]+)"\)/g)].map(x => x[1]);
  assert.deepEqual(Object.keys(manifest.tables).sort(), ['_prisma_migrations', ...mapped].sort());
  assert.deepEqual(Object.keys(manifest).sort(), ['migrationTriggers', 'tables', 'version']);
  for (const name of ['brands', 'models', 'generations', 'regions', 'cities', 'body_types', 'colors', 'engine_types', 'transmissions', 'drive_types', 'exchange_rates'])
    assert.equal(manifest.tables[name], 'retain-reference', name);
  for (const name of ['_prisma_migrations', 'measurement_state']) assert.equal(manifest.tables[name], 'retain-protected', name);
  for (const name of ['blog_posts', 'market_knowledge_sources', 'market_knowledge_datasets', 'market_knowledge_dataset_sources'])
    assert.equal(manifest.tables[name], 'refuse-if-nonempty', name);
  assert.equal(manifest.tables.diagnostic_centers, 'refuse-if-approved');
});

test('migration-owned triggers in the manifest are exactly those the migrations create', () => {
  const created = [];
  for (const dir of readdirSync(join(root, 'packages/db/prisma/migrations'))) {
    let sql; try { sql = read(`packages/db/prisma/migrations/${dir}/migration.sql`); } catch { continue; }
    for (const m of sql.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER "?([a-z_]+)"?[\s\S]*?\bON "?([a-z_]+)"?/g)) created.push(`${m[2]}.${m[1]}`);
    assert.doesNotMatch(sql, /DROP TRIGGER/i, `${dir} drops a trigger; extend the pin`);
  }
  assert.deepEqual([...manifest.migrationTriggers].sort(), created.sort());
});

test('the plan names exact truncate, retain, detach and tombstone identities with no wildcard or cascade', () => {
  const plan = planTables(manifest, live());
  const expectedTruncate = Object.entries(manifest.tables).filter(([, d]) => !d.startsWith('retain')).map(([n]) => `public.${n}`).sort();
  assert.deepEqual(plan.truncate, expectedTruncate);
  assert.ok(plan.truncate.includes('public.blog_posts') && plan.truncate.includes('public.diagnostic_centers'));
  assert.deepEqual(plan.retain, Object.entries(manifest.tables).filter(([, d]) => d.startsWith('retain')).map(([n]) => `public.${n}`).sort());
  assert.deepEqual(plan.detachTriggers, [
    { namespace: ns, table: 'public.audit_logs', trigger: `${ns}_promotion` },
    { namespace: ns, table: 'public.users', trigger: `${ns}_auth` },
  ]);
  assert.deepEqual(plan.redisExclusions, [`bull:email-code:de:campaign-${ns}-`]);
  assert.deepEqual(plan.retainedNamespaces, [ns]);
  assert.deepEqual(plan.restartBlockers, ['cf-namespace-inertness-unproven']);
  assert.equal(plan.mode, 'RESTRICT');
  assert.doesNotMatch(JSON.stringify(plan), /\*|%|CASCADE/);
  const clean = live(); clean.schemas = ['public']; clean.cfNamespaces = []; clean.triggers = clean.triggers.slice(0, 1);
  assert.deepEqual(planTables(manifest, clean).restartBlockers, []);
});

test('unknown tables, schemas, foreign keys or triggers and non-empty refuse sets refuse the plan', () => {
  const cases = [
    [l => { l.tables.push({ schema: 'public', name: 'shadow_users', rows: 0 }); }, /Unknown live table/],
    [l => { l.tables = l.tables.filter(t => t.name !== 'listings'); }, /inventory incomplete/],
    [l => { l.schemas.push('scratch'); }, /Unknown schema/],
    [l => { l.foreignKeys.push({ name: 'x', from: 'public.exchange_rates', to: 'public.users' }); }, /Retained table references deleted table/],
    [l => { l.foreignKeys.push({ name: 'x', from: `${ns}.campaign_records`, to: 'public.users' }); }, /Unknown foreign key/],
    [l => { l.foreignKeys.push({ name: 'x', from: 'public.sessions', to: 'public.ghost' }); }, /Unknown foreign key/],
    [l => { l.triggers.push({ table: 'users', name: 'audit_everything', functionSchema: 'public', truncate: false }); }, /Unknown trigger/],
    [l => { l.triggers.push({ table: 'users', name: 'business_enquiry_user_revocation', functionSchema: 'public', truncate: true }); }, /TRUNCATE trigger/],
    [l => { l.triggers.push({ table: 'users', name: `${ns}_other`, functionSchema: ns, truncate: false }); }, /Unknown trigger/],
    [l => { l.tables.find(t => t.name === 'blog_posts').rows = 1; }, /non-empty refuse-if-nonempty table public.blog_posts/],
    [l => { l.tables.find(t => t.name === 'market_knowledge_sources').rows = 2; }, /non-empty refuse-if-nonempty/],
    [l => { l.approvedDiagnosticCenters = 1; }, /Approved diagnostic center/],
    [l => { l.approvedDiagnosticCenters = undefined; }, /live inventory/i],
    [l => { l.tables[0].rows = -1; }, /live inventory/i],
    [l => { l.publicLaunch = false; }, /live inventory/i],
  ];
  for (const [mutate, expected] of cases) {
    const value = live(); mutate(value);
    assert.throws(() => planTables(manifest, value), expected, mutate.toString());
  }
  assert.throws(() => planTables({ ...manifest, tables: { ...manifest.tables, users: 'truncate-everything' } }, live()), /manifest/);
});

test('nonterminal or incomplete cf namespaces refuse by default; abandonment is unresolved S2 work', () => {
  const cases = [
    [l => { l.cfNamespaces[0].state = 'identities'; }, /Nonterminal cf namespace .*abandonment.*S2/],
    [l => { l.cfNamespaces[0].state = 'cleaning'; }, /Nonterminal cf namespace/],
    [l => { l.cfNamespaces[0].listingManifest = true; }, /Incomplete cf namespace/],
    [l => { l.cfNamespaces[0].campaignRecords = false; }, /Incomplete cf namespace/],
    [l => { l.cfNamespaces[0].name = 'cf_short'; }, /Unknown schema|cf namespace/],
    [l => { l.schemas.push(`cf_${'3'.repeat(32)}`); }, /cf namespace inventory/],
  ];
  for (const [mutate, expected] of cases) {
    const value = live(); mutate(value);
    assert.throws(() => planTables(manifest, value), expected, mutate.toString());
  }
});

const record = (phase) => ({ operationId, reservationId: claim.id, owner: 'alice', candidate: claim.candidate, phase });
const request = (phase, overrides = {}) => ({ ...record(phase), ...overrides });

test('phases advance strictly in order and a new operation starts only at attested', () => {
  assert.deepEqual([...PHASES], ['attested', 'quiesced', 'window', 'inventoried', 'cf-detached', 'rows', 'redis', 'objects', 'reseeded', 'reopened']);
  assert.deepEqual(nextPhase(null, request('attested')), { action: 'execute', phase: 'attested' });
  assert.throws(() => nextPhase(null, request('quiesced')), /out of order/);
  for (let i = 1; i < PHASES.length; i++) assert.deepEqual(nextPhase(record(PHASES[i - 1]), request(PHASES[i])), { action: 'execute', phase: PHASES[i] });
  assert.throws(() => nextPhase(record('quiesced'), request('inventoried')), /out of order/);
  assert.throws(() => nextPhase(record('window'), request('rows')), /out of order/);
});

test('completed phases replay observe-only; changed operation, owner, reservation or candidate refuses', () => {
  assert.deepEqual(nextPhase(record('rows'), request('quiesced')), { action: 'observe', phase: 'quiesced' });
  assert.deepEqual(nextPhase(record('rows'), request('rows')), { action: 'observe', phase: 'rows' });
  assert.deepEqual(nextPhase(record('reopened'), request('reopened')), { action: 'observe', phase: 'reopened' });
  for (const change of [{ operationId: 'e'.repeat(32) }, { owner: 'mallory' }, { reservationId: '3'.repeat(32) }, { candidate: 'b'.repeat(40) }])
    assert.throws(() => nextPhase(record('rows'), request('redis', change)), /operation identity changed/);
  for (const extra of [{ completed: ['rows', 'redis'] }, { workersStopped: true }, { publicLaunch: false }])
    assert.throws(() => nextPhase(record('rows'), request('objects', extra)), /Exact phase request/);
  assert.throws(() => nextPhase({ ...record('rows'), completed: true }, request('redis')), /Exact phase record/);
  assert.throws(() => nextPhase(record('rows'), request('teardown')), /Exact phase request/);
});
