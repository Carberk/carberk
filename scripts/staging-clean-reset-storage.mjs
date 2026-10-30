import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value);
const same = (a, b) => json(a) === json(b);
const text = value => typeof value === 'string' && value.length > 0 && !/[\u0000-\u001f]/.test(value);
const hex = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const exact = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...fields].sort().join();
const refuse = reason => { throw new Error(`Storage reset refused: ${reason}`); };
const keyOf = row => json([row.bucket, row.key, row.versionId ?? row.uploadId]);
const sort = rows => rows.sort((a, b) => keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0);
const bucketName = value => typeof value === 'string' && /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value);

function context(input) {
  const { binding, scope, references } = structuredClone({ binding: input.binding, scope: input.scope, references: input.references });
  if (!exact(binding, ['operationId', 'candidate', 'closureGeneration', 'projectId', 'environmentId', 'endpoint', 'referenceDigest', 'reservationId', 'owner', 'storageEpoch', 'configurationDigest']) ||
      !hex(binding.reservationId, 32) || !text(binding.owner) || !text(binding.storageEpoch) || !hex(binding.configurationDigest, 64) ||
      !hex(binding.operationId, 32) || !hex(binding.closureGeneration, 32) || !hex(binding.candidate, 40) ||
      binding.projectId !== '176ddec0-dd65-4087-b82c-798599fc2ebe' || binding.environmentId !== '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2' || binding.endpoint !== 'http://minio.railway.internal:9000' ||
      !hex(binding.referenceDigest, 64) || !Array.isArray(references) || hash(json(references)) !== binding.referenceDigest)
    refuse('immutable binding or approved reference digest unavailable');
  if (!exact(scope, ['api', 'worker', 'unboundBuckets']) || !exact(scope.api, ['videoBucket', 'diagnosticBucket']) ||
      !exact(scope.worker, ['videoBucket', 'diagnosticBucket']) || !same(scope.api, scope.worker) ||
      !bucketName(scope.api.videoBucket) || !['diagnostic-private', 'diagnostic-test-private'].includes(scope.api.diagnosticBucket) ||
      !Array.isArray(scope.unboundBuckets) || scope.unboundBuckets.some(bucket => !bucketName(bucket)) ||
      new Set(scope.unboundBuckets).size !== scope.unboundBuckets.length) refuse('application storage scope unavailable');
  const families = new Map();
  for (const [family, bucket] of [['photos', 'listing-photos'], ['legacy-video', 'listing-videos'], ['chat', 'chat-attachments'],
    ['catalog', 'catalog-assets'], ['business-chat', 'business-chat-private'], ['service', 'service-private'],
    ['video', scope.api.videoBucket], ['diagnostic', scope.api.diagnosticBucket]]) {
    const list = families.get(bucket) ?? []; list.push(family); families.set(bucket, list);
  }
  // Configured private families cannot widen a public bucket's interpretation.
  if (['listing-photos', 'listing-videos', 'chat-attachments', 'catalog-assets'].includes(scope.api.videoBucket) ||
      scope.unboundBuckets.some(bucket => families.has(bucket))) refuse('overlapping storage ownership');
  const ids = new Set();
  for (const row of references) {
    if (!exact(row, ['bucket', 'key', 'versionId', 'sha256']) || row.bucket !== 'catalog-assets' ||
        !text(row.key) || !row.key.startsWith('brands/') || !text(row.versionId) || !hex(row.sha256, 64) || ids.has(keyOf(row)))
      refuse('approved artwork membership unavailable');
    ids.add(keyOf(row));
  }
  return { binding, scope, references, families };
}

function classified(families, key) {
  if (!text(key) || key.split('/').some(part => part === '.' || part === '..' || part === '')) return false;
  // These are source-owned namespaces. Unknown legacy layouts are classified by
  // a later reviewed manifest change, never inferred from a bucket's existence.
  return families.some(family => ({
    photos: /^pending\/.+\.(webp|jpg|jpeg|png)$/.test(key),
    'legacy-video': /^(pending\/|listings\/).+\.(mp4|mov)$/.test(key),
    chat: /^chat-attachments\/.+\/(original|cleaned)\.(jpg|webp)$/.test(key),
    catalog: /^(brands\/|pending\/brands\/).+/.test(key),
    'business-chat': /^business-chat-private\/.+\/(original|cleaned)\.(jpg|webp)$/.test(key),
    service: /^(history-artifacts\/|service-attachments\/).+/.test(key),
    video: /^video\/v1\/.+/.test(key),
    diagnostic: /^(diagnostic-evidence\/|diagnostic-pdf\/).+/.test(key),
  })[family]);
}

async function send(input, operation, parameters) {
  try {
    if (typeof input.admit !== 'function') refuse('current closure admission required');
    await input.admit();
    const output = await input.storage.send(operation, parameters);
    await input.admit();
    if (!output || typeof output !== 'object') refuse('storage response unavailable');
    return output;
  } catch { refuse(`${operation} unavailable or authority changed`); }
}

async function bytesDigest(body) {
  const sha = createHash('sha256'); let size = 0;
  const add = chunk => {
    if (!(chunk instanceof Uint8Array)) refuse('artwork bytes unavailable');
    size += chunk.byteLength;
    if (size > 64 * 1024 * 1024) refuse('artwork resource bound exceeded');
    sha.update(chunk);
  };
  if (body instanceof Uint8Array) add(body);
  else if (body && typeof body[Symbol.asyncIterator] === 'function') {
    try { for await (const chunk of body) add(chunk); }
    finally { body.destroy?.(); }
  } else refuse('version-specific artwork body unavailable');
  return { sha256: sha.digest('hex'), size };
}

/** Exhaust the actual S3 wire protocol. No caller completeness assertion is accepted. */
export async function collectResetObjects(input) {
  const c = context(input), reachable = new Set(), bucketCursors = new Set();
  let token;
  for (let page = 0; ; page++) {
    if (page >= 1000) refuse('bucket pagination resource bound');
    const reply = await send(input, 'ListBuckets', { MaxBuckets: 1000, ...(token ? { ContinuationToken: token } : {}) });
    if (!Array.isArray(reply.Buckets)) refuse('bucket inventory unavailable');
    for (const row of reply.Buckets) {
      if (!bucketName(row.Name) || reachable.has(row.Name)) refuse('duplicate or ambiguous bucket identity');
      reachable.add(row.Name);
    }
    if (reply.ContinuationToken === undefined) break;
    if (!text(reply.ContinuationToken) || !reply.Buckets.length || bucketCursors.has(reply.ContinuationToken)) refuse('bucket continuation unavailable');
    token = reply.ContinuationToken; bucketCursors.add(token);
  }
  if ([...c.families.keys()].some(bucket => !reachable.has(bucket)) ||
      [...reachable].some(bucket => !c.families.has(bucket) && !c.scope.unboundBuckets.includes(bucket))) refuse('unknown or missing application bucket');
  const result = { binding: c.binding, scopeDigest: hash(json(c.scope)), versions: [], deleteMarkers: [], multipart: [], preserve: [] };
  const versionIds = new Set(), uploadIds = new Set();
  for (const [bucket, families] of [...c.families].sort(([a], [b]) => a.localeCompare(b))) {
    const versioning = await send(input, 'GetBucketVersioning', { Bucket: bucket });
    if (versioning.Status !== undefined && !['Enabled', 'Suspended'].includes(versioning.Status)) refuse('unknown bucket versioning');
    for (const multipart of [false, true]) {
      let keyMarker, idMarker; const cursors = new Set();
      for (let page = 0; ; page++) {
        if (page >= 10000) refuse('object pagination resource bound');
        const reply = await send(input, multipart ? 'ListMultipartUploads' : 'ListObjectVersions', {
          Bucket: bucket, ...(multipart ? { MaxUploads: 1000 } : { MaxKeys: 1000 }),
          ...(keyMarker === undefined ? {} : { KeyMarker: keyMarker, [multipart ? 'UploadIdMarker' : 'VersionIdMarker']: idMarker }),
        });
        if (typeof reply.IsTruncated !== 'boolean') refuse('terminal page authority unavailable');
        const collections = multipart ? [['multipart', reply.Uploads ?? []]] : [['versions', reply.Versions ?? []], ['deleteMarkers', reply.DeleteMarkers ?? []]];
        let count = 0; const pageIdentities = new Set();
        for (const [kind, rows] of collections) {
          if (!Array.isArray(rows)) refuse('object page unavailable');
          for (const raw of rows) {
            count++;
            const versionId = raw.VersionId, uploadId = raw.UploadId;
            if (!classified(families, raw.Key) || !text(multipart ? uploadId : versionId) ||
                (!multipart && versioning.Status === undefined && versionId !== 'null')) refuse('unknown object scope or ambiguous null version');
            const row = { bucket, key: raw.Key, ...(multipart ? { uploadId } : { versionId }) };
            if (kind === 'versions') {
              if (!Number.isSafeInteger(raw.Size) || raw.Size < 0 || !text(raw.ETag)) refuse('version metadata unavailable');
              Object.assign(row, { size: raw.Size, etag: raw.ETag });
            }
            const seen = multipart ? uploadIds : versionIds;
            if (seen.has(keyOf(row))) refuse('duplicate object identity');
            seen.add(keyOf(row)); result[kind].push(row);
            pageIdentities.add(json([row.key, multipart ? row.uploadId : row.versionId]));
          }
        }
        const nextKey = reply.NextKeyMarker, nextId = reply[multipart ? 'NextUploadIdMarker' : 'NextVersionIdMarker'];
        if (!reply.IsTruncated) {
          if ((nextKey !== undefined && nextKey !== '') || (nextId !== undefined && nextId !== '')) refuse('ambiguous terminal cursor');
          break;
        }
        const cursor = json([nextKey, nextId]);
        if (!count || !text(nextKey) || !text(nextId) || !pageIdentities.has(cursor) || cursors.has(cursor) || (nextKey === keyMarker && nextId === idMarker)) refuse('nonadvancing object continuation');
        cursors.add(cursor); keyMarker = nextKey; idMarker = nextId;
      }
    }
  }
  const approved = new Map(c.references.map(row => [keyOf(row), row]));
  for (const row of [...result.versions, ...result.deleteMarkers, ...result.multipart]) {
    if (row.bucket !== 'catalog-assets' || !row.key.startsWith('brands/')) continue;
    const reference = approved.get(keyOf(row));
    if (!reference || row.size === undefined) refuse('unapproved catalog version, marker or multipart');
    const object = await send(input, 'GetObject', { Bucket: row.bucket, Key: row.key, VersionId: row.versionId });
    const actual = await bytesDigest(object.Body);
    await input.admit();
    if (actual.sha256 !== reference.sha256 || actual.size !== row.size) refuse('approved artwork bytes changed');
    result.preserve.push({ ...row, sha256: actual.sha256 }); approved.delete(keyOf(row));
  }
  if (approved.size) refuse('approved catalog version missing');
  for (const key of ['versions', 'deleteMarkers', 'multipart', 'preserve']) sort(result[key]);
  return result;
}

/** Same-operation, subset-only recovery in the owning controller's durable journal. */
export async function resetObjects(input) {
  context(input);
  const journal = input.journal;
  const snapshot = await journal.read();
  let state = snapshot.state, revision = snapshot.revision;
  const admittedInput = { ...input, admit: async () => {
    await input.admit();
    const current = await journal.read();
    if (current.revision !== revision || !same(current.state, state)) refuse('journal authority changed');
  } };
  const write = async next => {
    try {
      await admittedInput.admit();
      if (!await journal.compareAndSwap(revision, next)) refuse('journal CAS uncertain');
      const after = await journal.read();
      if (!same(after.state, next)) refuse('journal authority changed');
      state = after.state; revision = after.revision;
    } catch { refuse('journal intent/completion uncertain'); }
  };
  let current = await collectResetObjects(admittedInput);
  if (!state) {
    await write({ version: 1, phase: 'intent', plan: current, planDigest: hash(json(current)), batches: [] });
  } else if (!exact(state, ['version', 'phase', 'plan', 'planDigest', 'batches']) || state.version !== 1 ||
      !['intent', 'complete'].includes(state.phase) || !same(state.plan.binding, input.binding) ||
      state.planDigest !== hash(json(state.plan)) || !Array.isArray(state.batches)) refuse('immutable object intent changed');
  const reconcile = actual => {
    if (!same(actual.binding, state.plan.binding) || actual.scopeDigest !== state.plan.scopeDigest || !same(actual.preserve, state.plan.preserve))
      refuse('scope or preserved reference changed');
    for (const kind of ['versions', 'deleteMarkers', 'multipart']) {
      const planned = new Map(state.plan[kind].map(row => [keyOf(row), row]));
      if (actual[kind].some(row => !same(planned.get(keyOf(row)), row))) refuse('unexpected identity; plan enlargement forbidden');
    }
  };
  reconcile(current);
  const preserved = new Set(state.plan.preserve.map(keyOf));
  const remaining = actual => [...actual.versions, ...actual.deleteMarkers].filter(row => !preserved.has(keyOf(row)));
  if (state.phase === 'complete') {
    if (remaining(current).length || current.multipart.length) refuse('completed object phase contradicted');
    return { phase: 'complete', planDigest: state.planDigest };
  }
  const effect = async (operation, parameters) => {
    const id = hash(json([operation, parameters]));
    if (!state.batches.some(batch => batch.id === id)) await write({ ...state, batches: [...state.batches, { id, operation, parameters, state: 'intent' }] });
    const result = await send(admittedInput, operation, parameters);
    if (operation === 'DeleteObjects' && result.Errors !== undefined && (!Array.isArray(result.Errors) || result.Errors.length)) refuse('HTTP200 delete item errors');
    await write({ ...state, batches: state.batches.map(batch => batch.id === id ? { ...batch, state: 'replied' } : batch) });
  };
  // Every effect is one exact original identity. Lost replies re-list first;
  // absent subsets need no repeat effect, and no new identity is adopted.
  for (const row of current.multipart) await effect('AbortMultipartUpload', { Bucket: row.bucket, Key: row.key, UploadId: row.uploadId });
  current = await collectResetObjects(admittedInput); reconcile(current);
  if (current.multipart.length) refuse('multipart upload survived abort');
  for (const row of remaining(current)) await effect('DeleteObjects', { Bucket: row.bucket, Delete: { Quiet: false, Objects: [{ Key: row.key, VersionId: row.versionId }] } });
  for (let pass = 0; pass < 2; pass++) {
    current = await collectResetObjects(admittedInput); reconcile(current);
    if (remaining(current).length || current.multipart.length) refuse('object effects incomplete');
  }
  await write({ ...state, phase: 'complete' });
  return { phase: 'complete', planDigest: state.planDigest };
}

/** AWS SDK boundary; credentials/client construction stay with the existing operator transport. */
export function s3ResetStorage(client, sdk) {
  const operations = ['ListBuckets', 'GetBucketVersioning', 'ListObjectVersions', 'ListMultipartUploads', 'GetObject', 'AbortMultipartUpload', 'DeleteObjects'];
  return { async send(operation, input) {
    if (!operations.includes(operation) || typeof sdk[`${operation}Command`] !== 'function') refuse('unsupported storage operation');
    return client.send(new sdk[`${operation}Command`](input), { abortSignal: AbortSignal.timeout(30000) });
  } };
}
