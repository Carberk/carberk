/** One transparent S3 wire boundary. Lists use actual S3 response/marker names. */
export class StorageBoundary {
  constructor(reference) {
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
