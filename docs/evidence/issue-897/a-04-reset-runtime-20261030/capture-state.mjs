import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retainedSchemaProfile, evaluateSchemaPlan } from '../../../../scripts/staging-schema.mjs';
import { StagingControl } from '../../../../scripts/staging-control.mjs';
import { GitLedger } from '../../../../scripts/staging-ledger.mjs';
import { FakeStagingPlatform } from '../../../../scripts/testing/fake-staging-platform.mjs';
import { StorageBoundary } from '../../../../scripts/testing/fake-reset-storage.mjs';
import { collectResetObjects, resetObjects } from '../../../../scripts/staging-clean-reset-remote.mjs';

// Evidence capture only. External provider/time/S3 boundaries are the repository's
// existing fakes. This program creates no service and connects to no service.
const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../../..');
const candidate = '52d901c50af1dde97ea22bda8efb1fdf21f169b1';
const hash = value => createHash('sha256').update(value).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const save = (name, value) => writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + '\n');
const manifest = JSON.parse(await readFile(resolve(directory, 'source-manifest.json'), 'utf8'));
const changed = git(['diff', '--name-only', candidate, 'HEAD']).split('\n').filter(Boolean);
const sourceDiff = git(['diff', '--name-only', candidate, 'HEAD', '--', 'packages', 'apps', 'scripts', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']);
assert.equal(sourceDiff, '');
const sources = {};
for (const path of [...Object.keys(manifest.files), 'scripts/staging-schema.mjs', 'packages/db/prisma/schema.prisma',
  'packages/db/prisma/migrations/20261029190000_operational_reset_row_admission/migration.sql']) {
  const baseHash = hash(execFileSync('git', ['show', `${candidate}:${path}`], { cwd: root }));
  const headHash = hash(execFileSync('git', ['show', `HEAD:${path}`], { cwd: root }));
  const worktreeHash = hash(await readFile(resolve(root, path)));
  assert.equal(headHash, baseHash); assert.equal(worktreeHash, baseHash);
  sources[path] = { baseHash, headHash, worktreeHash, equal: true };
}
await save('source-comparison.json', { candidate, actualWorktreeHead: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']),
  changedCommittedPaths: changed, sourceDiff, sources, command: 'git diff --quiet 52d901c50af1dde97ea22bda8efb1fdf21f169b1 HEAD -- packages apps scripts package.json pnpm-lock.yaml pnpm-workspace.yaml', result: 'PASS' });

const inventory = manifest.migrations.map(({ name, sha256 }) => ({ name, checksum: sha256 }));
const baseline = inventory.filter(entry => entry.name < '20261015003500_listing_view_counts');
const candidateSchema = hash(await readFile(resolve(root, 'packages/db/prisma/schema.prisma')));
const expected = retainedSchemaProfile.schemaMigrations[candidateSchema] ?? [];
let failure;
try { evaluateSchemaPlan({ baseline, candidate: inventory, main: baseline, candidateSchema,
  mainSchema: '3cf9a92dc50367112d7e41cfadaf9e3199e0000ef75a7181861c09ebe9d7e51d' }); }
catch (error) { failure = error.message; }
assert.equal(failure, 'Schema snapshot and migration inventory mismatch');
await save('restoration-profile-red.json', { candidate, candidateSchema, result: 'FAIL', failure, migrationCount: inventory.length,
  unlistedForSchema: inventory.filter(entry => !baseline.some(row => row.name === entry.name) && !expected.includes(entry.name)),
  missingForSchema: expected.filter(name => !inventory.some(row => row.name === name)),
  checksumDrift: inventory.filter(entry => { const pinned = retainedSchemaProfile.additions.find(row => row.name === entry.name); return pinned && pinned.checksum !== entry.checksum; }) });

const reference = { bucket: 'catalog-assets', key: 'brands/acme/logo.webp', versionId: 'logo-v1', sha256: hash('approved-artwork') };
const storage = new StorageBoundary(reference);
const storageState = () => [...storage.buckets].map(([bucket, value]) => ({ bucket, versions: structuredClone(value.versions),
  markers: structuredClone(value.markers), uploads: structuredClone(value.uploads),
  bytes: [...value.bytes].map(([key, bytes]) => ({ key, sha256: hash(bytes) })) }));
const journal = { revision: 0, state: null, async read() { return structuredClone({ revision: this.revision, state: this.state }); },
  async compareAndSwap(revision, state) { if (revision !== this.revision) return false; this.state = structuredClone(state); this.revision++; return true; } };
const settings = { videoBucket: 'configured-video', diagnosticBucket: 'diagnostic-test-private' };
const args = { storage, journal, scope: { api: { ...settings }, worker: { ...settings }, unboundBuckets: ['outside'] }, references: [reference], admit: async () => {},
  binding: { reservationId: '3'.repeat(32), owner: 'alice', storageEpoch: 'minio-new', configurationDigest: '5'.repeat(64), operationId: '1'.repeat(32),
    candidate, closureGeneration: '2'.repeat(32), projectId: '176ddec0-dd65-4087-b82c-798599fc2ebe', environmentId: '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2',
    endpoint: 'http://minio.railway.internal:9000', referenceDigest: hash(JSON.stringify([reference])) } };
const before = storageState();
await collectResetObjects(args);
assert.deepEqual(storageState(), before); assert.deepEqual(storage.effects, []);
storage.loseAbort = true;
await assert.rejects(resetObjects(args), /Storage reset/);
const interrupted = { state: storageState(), journal: structuredClone(journal.state), effects: structuredClone(storage.effects) };
assert.equal(journal.state.phase, 'intent');
await resetObjects(args);
assert.equal(journal.state.phase, 'complete');
const completed = { state: storageState(), journal: structuredClone(journal.state), effects: structuredClone(storage.effects) };
await resetObjects(args);
assert.deepEqual(storage.effects, completed.effects); assert.deepEqual(storageState(), completed.state);
for (const bucket of ['outside', 'catalog-assets']) assert.deepEqual(completed.state.find(row => row.bucket === bucket), before.find(row => row.bucket === bucket));
await save('storage-state-snapshots.json', { result: 'PASS', evidenceLevel: 'offline boundary fake only', before, interrupted, completed,
  replayUnchanged: true, outsideAndCatalogUnchanged: true, realStorageResourcesCreated: 0 });

const scratch = await mkdtemp(join('/tmp', 'carberk-a04-c04d2138-'));
const snapshots = [];
try {
  const remote = join(scratch, 'shared.git');
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
  const ledger = new GitLedger({ directory: join(scratch, 'objects'), remote });
  const policy = { projectId: 'project-staging', environmentId: 'env-staging', environmentName: 'staging', services: { api: 'api-id', worker: 'worker-id' },
    credentialScope: 'project:project-staging:env-staging', origins: { database: 'postgresql://postgres.railway.internal:5432/railway', media: 'http://minio.railway.internal:9000', publicMedia: 'https://staging-media.example', api: 'https://staging-api.example' } };
  const platform = new FakeStagingPlatform(policy);
  let ordinal = 0;
  const control = new StagingControl({ ledger, platform, policy, actor: 'alice', now: () => '2026-10-30T00:00:00.000Z', id: () => (++ordinal).toString(16).padStart(32, '0') });
  const id = await control.enqueue({ parent: 897, pr: 902, candidate, priority: 1, priorityEvidence: 'https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/897' });
  const claim = await control.acquire(id);
  platform.configureCleanReset(candidate);
  const capture = async label => snapshots.push({ label, ledger: await ledger.read(), provider: structuredClone(platform.reset), effects: structuredClone(platform.operations) });
  await capture('before');
  await assert.rejects(control.cleanReset(claim), /horizon|issuance/);
  await capture('unknown-horizon-refusal');
  const operation = (await ledger.read()).state.reservation.operation;
  platform.reset.issuance = { families: ['v4'], expiresAtMs: 1000100, authorityDigest: '6'.repeat(64), clockEpoch: 'time-authority-1' };
  // With both one-millisecond error bounds, the conservative lowerTime is
  // exactly 1000100 here, equal to the grant horizon, so it must still refuse.
  platform.reset.clock.ticksMs = 102; platform.reset.clock.storageTimeMs = 1000102;
  await assert.rejects(control.cleanReset(claim), /expiry/);
  await capture('strict-expiry-equality-refusal');
  assert.equal(platform.operations.filter(row => row.kind === 'drain-storage').length, 0);
  platform.reset.clock.ticksMs = 200; platform.reset.clock.storageTimeMs = 1000200;
  platform.loseDrainReply = true;
  await assert.rejects(control.cleanReset(claim), /drain reply unknown/);
  await capture('lost-drain-reply');
  const freshLedger = new GitLedger({ directory: join(scratch, 'fresh-controller'), remote });
  const handedOff = new StagingControl({ ...control, ledger: freshLedger });
  const result = await handedOff.cleanReset(claim);
  assert.equal(result.operationId, operation.id); assert.equal(result.phase, 'inventory-ready');
  assert.equal(result.reopened, false);
  assert.equal(platform.operations.filter(row => row.kind === 'drain-storage').length, 1);
  await capture('fresh-controller-inventory-ready');
  await save('controller-state-snapshots.json', { result: 'PASS', evidenceLevel: 'offline provider/time fake with real local Git ledger',
    scratch, snapshots, returnValue: result, rowsRedisObjectsReopened: false, restorationProved: false });
} finally {
  await rm(scratch, { recursive: true, force: true });
  await save('snapshot-cleanup.json', { scratch, removed: true, serviceContainersCreated: 0, databaseConnections: 0, providerConnections: 0, storageConnections: 0 });
}
console.log('PASS: source comparison and offline state captures; FAIL preserved: retained-schema restoration profile');
