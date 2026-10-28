import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as remote from './staging-clean-reset-remote.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const settings = { videoBucket: 'configured-video', diagnosticBucket: 'diagnostic-test-private' };
const scope = () => ({ api: { ...settings }, worker: { ...settings }, unboundBuckets: ['outside'] });
const reference = { bucket: 'catalog-assets', key: 'brands/acme/logo.webp', versionId: 'logo-v1', sha256: hash('approved-artwork') };
const binding = () => ({ operationId: '1'.repeat(32), candidate: 'a'.repeat(40), closureGeneration: '2'.repeat(32),
  projectId: 'project', environmentId: 'stage', endpoint: 'http://minio.railway.internal:9000', referenceDigest: hash(JSON.stringify([reference])) });

/** One transparent S3 wire boundary. Lists use actual S3 response/marker names. */
class StorageBoundary {
  constructor() {
    this.buckets = new Map(); this.effects = []; this.reads = []; this.pageSize = 1;
    for (const name of ['listing-photos', 'listing-videos', 'chat-attachments', 'catalog-assets', 'business-chat-private',
      'service-private', 'configured-video', 'diagnostic-test-private', 'outside']) this.buckets.set(name, { versions: [], markers: [], uploads: [], bytes: new Map() });
    this.put('catalog-assets', reference.key, reference.versionId, 'approved-artwork');
    this.put('listing-photos', 'pending/a.webp', 'v1', 'old');
    this.put('listing-photos', 'pending/a.webp', 'v2', 'new');
    this.put('business-chat-private', 'business-chat-private/a/b/original.webp', 'null', 'private-chat');
    this.put('diagnostic-test-private', 'diagnostic-evidence/a/hash', 'd1', 'diagnostic');
    this.put('outside', 'unowned-bytes', 'outside-v1', 'keep-foreign');
    this.buckets.get('listing-photos').markers.push({ Key: 'pending/a.webp', VersionId: 'marker-v3' });
    this.buckets.get('configured-video').uploads.push({ Key: 'video/v1/a/b/source.mp4', UploadId: 'upload-1' }, { Key: 'video/v1/a/c/source.mp4', UploadId: 'upload-2' });
  }
  put(bucket, Key, VersionId, bytes) {
    const b = this.buckets.get(bucket);
    b.versions.push({ Key, VersionId, Size: Buffer.byteLength(bytes), ETag: 'same-etag' });
    b.bytes.set(JSON.stringify([Key, VersionId]), Buffer.from(bytes));
  }
  async send(operation, input) {
    this.reads.push({ operation, input: structuredClone(input) });
    if (operation === 'ListBuckets') return { Buckets: [...this.buckets.keys()].map(Name => ({ Name })) };
    const b = this.buckets.get(input.Bucket);
    if (!b) throw new Error('NoSuchBucket');
    if (operation === 'GetBucketVersioning') return { Status: 'Enabled' };
    if (operation === 'GetObject') return { Body: b.bytes.get(JSON.stringify([input.Key, input.VersionId])) };
    if (operation === 'ListObjectVersions' || operation === 'ListMultipartUploads') {
      const multipart = operation === 'ListMultipartUploads';
      const id = multipart ? 'UploadId' : 'VersionId';
      const all = (multipart ? b.uploads : [...b.versions.map(row => ({ ...row, kind: 'version' })), ...b.markers.map(row => ({ ...row, kind: 'marker' }))])
        .sort((a, z) => JSON.stringify([a.Key, a[id]]).localeCompare(JSON.stringify([z.Key, z[id]])));
      const marker = multipart ? input.UploadIdMarker : input.VersionIdMarker;
      const start = input.KeyMarker === undefined ? 0 : all.findIndex(row => row.Key === input.KeyMarker && row[id] === marker) + 1;
      const page = all.slice(start, start + this.pageSize);
      const IsTruncated = start + page.length < all.length;
      const tail = page.at(-1);
      const output = multipart ? { Uploads: page } : { Versions: page.filter(row => row.kind === 'version').map(({ kind, ...row }) => row),
        DeleteMarkers: page.filter(row => row.kind === 'marker').map(({ kind, ...row }) => row) };
      Object.assign(output, { IsTruncated, ...(IsTruncated ? { NextKeyMarker: tail.Key,
        [multipart ? 'NextUploadIdMarker' : 'NextVersionIdMarker']: tail[id] } : {}) });
      return this.transformPage ? this.transformPage(operation, output, input) : output;
    }
    if (operation === 'AbortMultipartUpload') {
      this.effects.push({ operation, input: structuredClone(input) });
      b.uploads = b.uploads.filter(row => row.Key !== input.Key || row.UploadId !== input.UploadId);
      if (this.loseAbort) { this.loseAbort = false; throw new Error('Lost abort reply'); }
      return {};
    }
    if (operation === 'DeleteObjects') {
      this.effects.push({ operation, input: structuredClone(input) });
      const deleted = [];
      for (const object of input.Delete.Objects) {
        if (this.itemError) continue;
        b.versions = b.versions.filter(row => row.Key !== object.Key || row.VersionId !== object.VersionId);
        b.markers = b.markers.filter(row => row.Key !== object.Key || row.VersionId !== object.VersionId);
        b.bytes.delete(JSON.stringify([object.Key, object.VersionId])); deleted.push(object);
      }
      if (this.loseDelete) { this.loseDelete = false; throw new Error('Lost delete reply'); }
      return { $metadata: { httpStatusCode: 200 }, Deleted: deleted,
        ...(this.itemError ? { Errors: input.Delete.Objects.map(row => ({ ...row, Code: 'AccessDenied' })) } : {}) };
    }
    throw new Error(`Unexpected storage operation ${operation}`);
  }
}
const journal = () => ({ revision: 0, state: null,
  async read() { return { revision: this.revision, state: structuredClone(this.state) }; },
  async compareAndSwap(revision, state) { if (revision !== this.revision) return false; this.state = structuredClone(state); this.revision++; return true; },
});
const argumentsFor = storage => ({ storage, journal: journal(), binding: binding(), scope: scope(), references: [reference], admit: async () => {} });

test('the collector exhausts all eight configured families, version and multipart marker pairs and checks exact reference bytes', async () => {
  assert.equal(typeof remote.collectResetObjects, 'function', 'The fixed reset boundary must collect actual S3 inventory');
  const storage = new StorageBoundary();
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
    const storage = new StorageBoundary(), args = argumentsFor(storage);
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
    const storage = new StorageBoundary(), args = argumentsFor(storage);
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
    const storage = new StorageBoundary(), args = argumentsFor(storage);
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
