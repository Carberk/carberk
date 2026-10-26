import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  for (const name of ['diagnostic_source_commands', 'campaign_preparations']) assert.equal(manifest.tables[name], 'refuse-if-nonempty', name);
  for (const name of ['diagnostic_source_anchors', 'diagnostic_ownership_grants']) assert.equal(manifest.tables[name], 'delete', name);
});

// Dynamic installs/replacements are interpreted only for these exact historical
// bytes. Unknown DROP or dynamic CREATE still requires an explicit reviewed pin.
const dynamicTriggerPins = {
  "20261023130000_diagnostic_source_kernel": "b9b2d465c04cc34693e5774d12910a33bb29b39d8452f5a2862dc24b667f4fbf",
  "20261024010000_diagnostic_source_guard_repair": "786aa19839002c915cf00038f888c85e0b27a4d20b0905a1aac4edf5db5a1be3",
  "20261024020000_campaign_preparation": "cceb9c0d75c8d1f3a9302548d7791ac752635c3775e7b5ca3ec3c516b7db9429",
  "20261024030000_diagnostic_purge_effects": "23d894c79c5927d7d976c79e4cbe958af83725ccf172208b7f4d6132e0d3d4ba",
  "20261024050000_diagnostic_kernel_invariants": "6fdb70cd2364b0125080293a1602f78788c1db450d82859613c04b0020b732f8",
  "20261024070000_diagnostic_user_eligibility": "f5fabb22e4e6e5a2dace529e5bcb4de5e56a6daf18ebbff02351e9407430893e",
  "20261025020000_diagnostic_listing_publication_effects": "6923b8e4869928d942d909d305a3ef7eebfe166ea82628f313baf665759d0d39"
};
function migrationTriggers(readSql = dir => read(`packages/db/prisma/migrations/${dir}/migration.sql`)) {
  const created = new Set(); let registry = [], specs = [];
  const jsonLiteral = sql => JSON.parse(sql.match(/SELECT '(\[[\s\S]*?\])'::jsonb/)[1]);
  const add = (table, name) => { const key = `${table}.${name}`; assert.ok(!created.has(key), `Duplicate trigger ${key}`); created.add(key); };
  const drop = (table, name) => assert.ok(created.delete(`${table}.${name}`), `Unknown trigger removal ${table}.${name}`);
  const each = (tables, names, effect = add) => { for (const table of tables) for (const name of names) effect(table, name); };
  for (const dir of readdirSync(join(root, 'packages/db/prisma/migrations')).sort()) {
    if (dir === 'migration_lock.toml') continue;
    const sql = readSql(dir);
    if (Object.hasOwn(dynamicTriggerPins, dir)) assert.equal(createHash('sha256').update(sql).digest('hex'), dynamicTriggerPins[dir], `${dir} trigger pin changed`);
    else {
      assert.doesNotMatch(sql, /DROP TRIGGER/i, `${dir} drops a trigger; extend the pin`);
      assert.doesNotMatch(sql, /EXECUTE\s+format\([^;]*CREATE\s+(?:CONSTRAINT\s+)?TRIGGER/is, `${dir} dynamically installs a trigger; extend the pin`);
    }
    // Replacements remove only exact existing names, then recreate them below.
    if (dir === '20261024010000_diagnostic_source_guard_repair') each(registry.filter(t => t !== 'diagnostic_source_anchors'), ['diagnostic_source_presence', 'diagnostic_source_effective'], drop);
    for (const m of sql.matchAll(/DROP TRIGGER "?([a-z_]+)"? ON (?:public\.)?"?([a-z_]+)"?(?=[\s;])/g)) drop(m[2], m[1]);
    for (const m of sql.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER "?([a-z_]+)"?[^;]*?\bON (?:public\.)?"?([a-z_]+)"?(?=[\s;(])/g)) add(m[2], m[1]);
    if (dir === '20261023130000_diagnostic_source_kernel') {
      registry = jsonLiteral(sql).map(m => m.table);
      each(registry.filter(t => t !== 'diagnostic_source_anchors'), ['diagnostic_source_presence', 'diagnostic_source_effective', 'diagnostic_source_no_truncate']);
    } else if (dir === '20261024010000_diagnostic_source_guard_repair') {
      specs = jsonLiteral(sql).map(m => m.table);
      each(specs, ['zz_diagnostic_source_presence', 'zz_diagnostic_source_effective', 'zz_diagnostic_source_target']);
    } else if (dir === '20261024020000_campaign_preparation') {
      each(jsonLiteral(sql), ['zzzz_campaign_preparation', 'zzzz_campaign_preparation_truncate']);
    } else if (dir === '20261024030000_diagnostic_purge_effects') {
      registry = jsonLiteral(sql).map(m => m.table);
      each(registry.filter(t => !specs.includes(t)), ['zz_diagnostic_source_purge']);
    } else if (dir === '20261025020000_diagnostic_listing_publication_effects') {
      each(['listing_drafts', 'listing_media', 'media_uploads', 'video_upload_sessions', 'video_generations', 'measurement_outbox', 'audit_logs', 'media_upload_cleanups'], ['zz_diagnostic_source_publication']);
    }
  }
  return [...created].sort();
}

test('migration-owned triggers in the manifest are exactly the effective migration-created triggers', () => {
  assert.deepEqual([...manifest.migrationTriggers].sort(), migrationTriggers());
  assert.equal(new Set(manifest.migrationTriggers).size, manifest.migrationTriggers.length);
});

test('changed pinned replacements and unknown trigger drops or dynamic installs still refuse', () => {
  const original = dir => read(`packages/db/prisma/migrations/${dir}/migration.sql`);
  const pin = '20261024010000_diagnostic_source_guard_repair';
  assert.throws(() => migrationTriggers(dir => original(dir) + (dir === pin ? '\nDROP TRIGGER other ON users;' : '')), /trigger pin changed/);
  const unpinned = '20261026010000_diagnostic_automatic_public_continuity';
  assert.throws(() => migrationTriggers(dir => original(dir) + (dir === unpinned ? '\nDROP TRIGGER other ON users;' : '')), /drops a trigger; extend the pin/);
  assert.throws(() => migrationTriggers(dir => original(dir) + (dir === unpinned ? "\nEXECUTE format('CREATE TRIGGER other BEFORE INSERT ON public.%I', t);" : '')), /dynamically installs a trigger; extend the pin/);
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

test('identity fields must be actual strings: numeric or array IDs refuse even when policy and attestation agree', () => {
  const numeric = stagingInput();
  numeric.request.policy.projectId = 176; numeric.attestation.projectId = 176;
  assert.throws(() => guardTarget(numeric), /Exact clean-reset policy/);
  const numericService = stagingInput();
  numericService.request.policy.services.api = 6; numericService.attestation.services.api = 6;
  assert.throws(() => guardTarget(numericService), /Exact clean-reset policy/);
  const attestedNumber = stagingInput(); attestedNumber.attestation.services.worker = 24;
  assert.throws(() => guardTarget(attestedNumber), /Exact authoritative attestation/);
  assert.throws(() => parseRequest({ ...stagingPolicy, environmentId: [stagingPolicy.environmentId] }, claim), /Exact clean-reset policy/);
  assert.throws(() => parseRequest(stagingPolicy, { ...claim, id: [claim.id] }), /Exact clean-reset claim/);
  assert.throws(() => parseRequest(stagingPolicy, { ...claim, candidate: [claim.candidate] }), /Exact clean-reset claim/);
  const deployment = quiet(); deployment.deployments.api[0].id = 42;
  assert.throws(() => evaluateQuiescence(deployment, context), /quiescence/i);
  assert.throws(() => evaluateQuiescence(quiet(), { operationId: [operationId], candidate: claim.candidate }), /operation identity/);
  assert.throws(() => nextPhase(record('rows'), request('redis', { owner: ['alice'] })), /Exact phase request/);
  assert.throws(() => nextPhase(record('rows'), request('redis', { operationId: [operationId] })), /Exact phase request/);
  const namespace = live(); namespace.cfNamespaces[0].name = [ns];
  assert.throws(() => planTables(manifest, namespace), /cf namespace inventory|live inventory/);
});

test('inherited object names are never manifest tables for live tables, trigger tables or foreign-key endpoints', () => {
  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const table = live(); table.tables.push({ schema: 'public', name, rows: 0 });
    assert.throws(() => planTables(manifest, table), /Unknown live table/, name);
    const trigger = live(); trigger.triggers.push({ table: name, name: 'x', functionSchema: 'public', truncate: false });
    assert.throws(() => planTables(manifest, trigger), /Unknown trigger table/, name);
    for (const key of [{ name: 'x', from: `public.${name}`, to: 'public.users' }, { name: 'x', from: 'public.sessions', to: `public.${name}` }]) {
      const fk = live(); fk.foreignKeys.push(key);
      assert.throws(() => planTables(manifest, fk), /Unknown foreign key/, `${key.from}->${key.to}`);
    }
  }
});

// Read the recovery migration independently of the manifest so a new live table
// or a trigger on an existing table cannot disappear from the plan fixture.
function continuityRequestInventory() {
  const sql = read('packages/db/prisma/migrations/20261023110000_diagnostic_continuity_requests/migration.sql');
  const tables = [...sql.matchAll(/CREATE TABLE ([a-z_]+)\s*\(/g)].map(m => m[1]);
  assert.deepEqual(tables, ['diagnostic_continuity_requests']);
  const triggers = [...sql.matchAll(/CREATE TRIGGER ([a-z_]+)\s+[\s\S]*?\bON ([a-z_]+)\s+FOR EACH ROW/g)]
    .map(m => ({ table: m[2], name: m[1], functionSchema: 'public', truncate: false }));
  assert.equal(triggers.length, 6);
  const inventory = live();
  inventory.tables = inventory.tables.filter(t => !tables.includes(t.name));
  inventory.tables.push(...tables.map(name => ({ schema: 'public', name, rows: 3 })));
  inventory.triggers.push(...triggers);
  const references = [...sql.matchAll(/"([a-zA-Z]+)" TEXT NOT NULL REFERENCES ([a-z_]+)\(id\)/g)];
  assert.equal(references.length, 3);
  inventory.foreignKeys.push(...references.map(m => ({ name: `diagnostic_continuity_requests_${m[1]}_fkey`,
    from: 'public.diagnostic_continuity_requests', to: `public.${m[2]}` })));
  return { inventory, triggers };
}

test('clean reset deletes populated continuity requests and admits their migration triggers without detaching them', () => {
  const { inventory } = continuityRequestInventory();
  const plan = planTables(manifest, inventory);
  assert.ok(plan.truncate.includes('public.diagnostic_continuity_requests'));
  assert.ok(!plan.retain.includes('public.diagnostic_continuity_requests'));
  assert.equal(plan.mode, 'RESTRICT');
  assert.deepEqual(plan.detachTriggers, [
    { namespace: ns, table: 'public.audit_logs', trigger: `${ns}_promotion` },
    { namespace: ns, table: 'public.users', trigger: `${ns}_auth` },
  ]);
});

test('continuity request classification still refuses unknown tables and inexact or truncate triggers', () => {
  const { inventory, triggers } = continuityRequestInventory();
  // Establish that refusals below are not masked by the original manifest drift.
  assert.doesNotThrow(() => planTables(manifest, inventory));
  const unknownTable = clone(inventory);
  unknownTable.tables.push({ schema: 'public', name: 'diagnostic_continuity_requests_shadow', rows: 0 });
  assert.throws(() => planTables(manifest, unknownTable), /Unknown live table/);
  for (const trigger of triggers) {
    for (const change of [{ name: `${trigger.name}_shadow` }, { table: 'users' }, { functionSchema: 'other' }]) {
      const unknownTrigger = clone(inventory);
      unknownTrigger.triggers.push({ ...trigger, ...change });
      assert.throws(() => planTables(manifest, unknownTrigger), /Unknown trigger/);
    }
    const truncateTrigger = clone(inventory);
    truncateTrigger.triggers.push({ ...trigger, truncate: true });
    assert.throws(() => planTables(manifest, truncateTrigger), /TRUNCATE trigger/);
  }
});
