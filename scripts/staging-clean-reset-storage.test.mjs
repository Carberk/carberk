import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as remote from './staging-clean-reset-remote.mjs';
import { StorageBoundary } from './testing/fake-reset-storage.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const settings = { videoBucket: 'configured-video', diagnosticBucket: 'diagnostic-test-private' };
const scope = () => ({ api: { ...settings }, worker: { ...settings }, unboundBuckets: ['outside'] });
const reference = { bucket: 'catalog-assets', key: 'brands/acme/logo.webp', versionId: 'logo-v1', sha256: hash('approved-artwork') };
const binding = () => ({ reservationId: '3'.repeat(32), owner: 'alice', storageEpoch: 'minio-new', configurationDigest: '5'.repeat(64), operationId: '1'.repeat(32), candidate: 'a'.repeat(40), closureGeneration: '2'.repeat(32),
  projectId: '176ddec0-dd65-4087-b82c-798599fc2ebe', environmentId: '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2', endpoint: 'http://minio.railway.internal:9000', referenceDigest: hash(JSON.stringify([reference])) });

const journal = () => ({ revision: 0, state: null,
  async read() { return { revision: this.revision, state: structuredClone(this.state) }; },
  async compareAndSwap(revision, state) { if (revision !== this.revision) return false; this.state = structuredClone(state); this.revision++; return true; },
});
const argumentsFor = storage => ({ storage, journal: journal(), binding: binding(), scope: scope(), references: [reference], admit: async () => {} });

test('the collector exhausts all eight configured families, version and multipart marker pairs and checks exact reference bytes', async () => {
  assert.equal(typeof remote.collectResetObjects, 'function', 'The fixed reset boundary must collect actual S3 inventory');
  const storage = new StorageBoundary(reference);
  const inventory = await remote.collectResetObjects(argumentsFor(storage));
  assert.equal(inventory.versions.length, 5);
  assert.deepEqual(inventory.multipart.map(row => row.uploadId), ['upload-1', 'upload-2']);
  assert.equal(inventory.deleteMarkers[0].versionId, 'marker-v3');
  assert.equal(inventory.preserve[0].sha256, reference.sha256);
  assert.equal(inventory.versions.find(row => row.bucket === 'business-chat-private').versionId, 'null');
  assert.ok(storage.reads.some(row => row.input.UploadIdMarker === 'upload-1'));
  assert.ok(storage.reads.some(row => row.input.VersionIdMarker === 'v1'));
  assert.deepEqual(storage.effects, []);
});

test('unknown scope, incomplete pagination, ambiguous null versions and equal-ETag different artwork refuse', async () => {
  assert.equal(typeof remote.collectResetObjects, 'function');
  for (const fault of ['unknown-bucket', 'configuration', 'missing-marker', 'repeated-marker', 'null-version', 'unknown-prefix', 'artwork']) {
    const storage = new StorageBoundary(reference), args = argumentsFor(storage);
    if (fault === 'unknown-bucket') storage.buckets.set('unexplained-application', { versions: [], markers: [], uploads: [], bytes: new Map() });
    if (fault === 'configuration') args.scope.worker.videoBucket = 'other-video';
    if (fault === 'missing-marker') storage.transformPage = (_op, page) => { if (page.IsTruncated) delete page.NextKeyMarker; return page; };
    if (fault === 'repeated-marker') storage.transformPage = (_op, page, input) => input.KeyMarker ? { ...page, IsTruncated: true,
      NextKeyMarker: input.KeyMarker, NextVersionIdMarker: input.VersionIdMarker, NextUploadIdMarker: input.UploadIdMarker } : page;
    if (fault === 'null-version') delete storage.buckets.get('business-chat-private').versions[0].VersionId;
    if (fault === 'unknown-prefix') storage.put('catalog-assets', 'unclassified/private.bin', 'v1', 'unknown');
    if (fault === 'artwork') storage.buckets.get('catalog-assets').bytes.set(JSON.stringify([reference.key, reference.versionId]), Buffer.from('altered-artwork'));
    await assert.rejects(remote.collectResetObjects(args), /Storage reset refused/);
    assert.deepEqual(storage.effects, []);
  }
});

test('durable exact object intent reconciles lost replies and subsets without enlarging the plan, completion replays read-only', async () => {
  assert.equal(typeof remote.resetObjects, 'function', 'The fixed reset boundary must own object recovery');
  for (const loss of ['loseAbort', 'loseDelete']) {
    const storage = new StorageBoundary(reference), args = argumentsFor(storage);
    storage[loss] = true;
    await assert.rejects(remote.resetObjects(args), /Storage reset/);
    const original = structuredClone(args.journal.state.plan);
    assert.equal(args.journal.state.phase, 'intent');
    const result = await remote.resetObjects(args);
    assert.equal(result.phase, 'complete');
    assert.deepEqual(args.journal.state.plan, original);
    assert.equal(storage.buckets.get('catalog-assets').bytes.get(JSON.stringify([reference.key, reference.versionId])).toString(), 'approved-artwork');
    assert.equal(storage.buckets.get('outside').bytes.get(JSON.stringify(['unowned-bytes', 'outside-v1'])).toString(), 'keep-foreign');
    const effects = structuredClone(storage.effects);
    await remote.resetObjects(args);
    assert.deepEqual(storage.effects, effects);
  }
});

test('HTTP200 per-item errors, a new identity or changed authority cannot become object completion', async () => {
  assert.equal(typeof remote.resetObjects, 'function');
  for (const fault of ['item-error', 'new-identity', 'authority', 'binding']) {
    const storage = new StorageBoundary(reference), args = argumentsFor(storage);
    storage.loseAbort = true;
    await assert.rejects(remote.resetObjects(args), /Storage reset/);
    if (fault === 'item-error') storage.itemError = true;
    if (fault === 'new-identity') storage.put('listing-photos', 'pending/new.webp', 'new-version', 'late');
    if (fault === 'authority') args.admit = async () => { throw new Error('Changed owner'); };
    if (fault === 'binding') args.binding.closureGeneration = 'f'.repeat(32);
    const prior = structuredClone(storage.effects);
    await assert.rejects(remote.resetObjects(args), /Storage reset/);
    assert.notEqual(args.journal.state.phase, 'complete');
    if (fault !== 'item-error') assert.deepEqual(storage.effects, prior);
  }
});

test('the object intent admits an explicit storage epoch/configuration and detects journal change at an effect boundary', async () => {
  const storage = new StorageBoundary(reference), args = argumentsFor(storage);
  Object.assign(args.binding, { reservationId: '3'.repeat(32), owner: 'alice', storageEpoch: 'minio-new', configurationDigest: '5'.repeat(64) });
  assert.equal((await remote.collectResetObjects(args)).binding.storageEpoch, 'minio-new');
  let changed = false;
  args.admit = async () => {
    if (!changed && args.journal.state?.batches.length) {
      changed = true;
      args.journal.revision++;
      args.journal.state = { ...args.journal.state, interruptedByOtherCoordinator: true };
    }
  };
  await assert.rejects(remote.resetObjects(args), /Storage reset/);
  assert.deepEqual(storage.effects, []);
});

test('a wrong staging target refuses before any storage read', async () => {
  const storage = new StorageBoundary(reference), args = argumentsFor(storage);
  args.binding.projectId = 'wrong-project';
  await assert.rejects(remote.collectResetObjects(args), /Storage reset refused/);
  assert.deepEqual(storage.reads, []);
});

test('a truncated page cannot skip identities using a cursor absent from that page', async () => {
  const storage = new StorageBoundary(reference), args = argumentsFor(storage);
  storage.transformPage = (operation, page, input) => {
    if (input.KeyMarker === 'pending/skipped.webp') return { Versions: [], DeleteMarkers: [], IsTruncated: false };
    if (operation === 'ListObjectVersions' && page.IsTruncated) return { ...page, NextKeyMarker: 'pending/skipped.webp', NextVersionIdMarker: 'unlisted-version' };
    return page;
  };
  await assert.rejects(remote.collectResetObjects(args), /Storage reset refused/);
  assert.deepEqual(storage.effects, []);
});
