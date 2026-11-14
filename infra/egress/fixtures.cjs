#!/usr/bin/env node
// Railway staging credentials stay on the operator host, never on the VPS.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../../apps/api/package.json'));
const s3 = req('@aws-sdk/client-s3');
const { getSignedUrl } = req('@aws-sdk/s3-request-presigner');
const [mode, file] = process.argv.slice(2);
const environment = '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2';
const origin = 'https://api-staging-2861.up.railway.app';
const destinations = [
  { label: 'photo', endpoint: process.env.MINIO_PUBLIC_URL, bucket: 'listing-photos', region: process.env.MINIO_REGION,
    accessKeyId: process.env.MINIO_ACCESS_KEY, secretAccessKey: process.env.MINIO_SECRET_KEY },
  { label: 'video', endpoint: process.env.LISTING_VIDEO_BUCKET_ENDPOINT, bucket: process.env.LISTING_VIDEO_BUCKET_NAME,
    region: process.env.LISTING_VIDEO_BUCKET_REGION, accessKeyId: process.env.LISTING_VIDEO_BUCKET_ACCESS_KEY_ID,
    secretAccessKey: process.env.LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY },
];
function client(d) {
  if (!d.endpoint?.startsWith('https://') || !d.bucket || !d.accessKeyId || !d.secretAccessKey) throw Error('missing staging storage');
  return new s3.S3Client({ endpoint: d.endpoint, region: d.region, forcePathStyle: true, maxAttempts: 1,
    credentials: { accessKeyId: d.accessKeyId, secretAccessKey: d.secretAccessKey }, requestChecksumCalculation: 'WHEN_REQUIRED' });
}
const send = (c, command) => c.send(command, { abortSignal: AbortSignal.timeout(30_000) });
function save(m) { fs.writeFileSync(file, JSON.stringify(m), { mode: 0o600 }); }
async function api(route, method = 'GET', body, token) {
  const r = await fetch(origin + route, { method, redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!r.ok) throw Error(`API status ${r.status}`);
  return r.status === 204 ? null : r.json();
}
async function main() {
  if (process.env.RAILWAY_ENVIRONMENT_ID !== environment || process.env.APP_ENV !== 'staging' || !file || !['setup', 'cleanup'].includes(mode)) throw Error('explicit staging setup/cleanup required');
  if (mode === 'setup') {
    fs.closeSync(fs.openSync(file, 'wx', 0o600));
    const m = { environment, createdAt: new Date().toISOString(), prefix: `r01-probe/${crypto.randomUUID()}`, bytes: 4 * 1024 * 1024, storage: [] };
    save(m);
    const body = crypto.randomBytes(m.bytes);
    m.sha256 = crypto.createHash('sha256').update(body).digest('hex');
    for (const d of destinations) {
      const c = client(d);
      const entry = { label: d.label, bucket: d.bucket, downloadKey: `${m.prefix}/download.bin`, uploadKey: `${m.prefix}/upload.bin` };
      m.storage.push(entry); save(m); // Record ownership before writing.
      await send(c, new s3.PutObjectCommand({ Bucket: d.bucket, Key: entry.downloadKey, Body: body, ContentType: 'application/octet-stream', CacheControl: 'no-store' }));
      entry.downloadUrl = await getSignedUrl(c, new s3.GetObjectCommand({ Bucket: d.bucket, Key: entry.downloadKey }), { expiresIn: 3600 });
      entry.headUrl = await getSignedUrl(c, new s3.HeadObjectCommand({ Bucket: d.bucket, Key: entry.downloadKey }), { expiresIn: 3600 });
      entry.uploadUrl = await getSignedUrl(c, new s3.PutObjectCommand({ Bucket: d.bucket, Key: entry.uploadKey, ContentType: 'application/octet-stream', CacheControl: 'no-store' }), { expiresIn: 3600 });
      entry.uploadReadUrl = await getSignedUrl(c, new s3.GetObjectCommand({ Bucket: d.bucket, Key: entry.uploadKey }), { expiresIn: 3600 });
      save(m);
      console.log(JSON.stringify({ fixture: d.label, bytes: m.bytes, sha256: m.sha256 }));
    }
    const accounts = JSON.parse(process.env.REVIEW_DEMO_ACCOUNT_ENABLED === 'true' ? process.env.REVIEW_DEMO_ACCOUNTS_JSON : process.env.TESTER_ACCOUNTS_JSON);
    const account = accounts.find(a => a.phone && a.code);
    if (!account) throw Error('no configured synthetic phone account');
    const health = await api('/healthz');
    if (health.environment !== 'staging' || health.service !== 'api') throw Error('staging identity mismatch');
    const session = await api('/api/v1/auth/otp/verify', 'POST', { phone: account.phone, code: account.code, deviceLabel: 'R01 disposable probe' });
    m.api = { origin, token: session.accessToken, refreshToken: session.refreshToken, description: crypto.randomBytes(512).toString('hex') }; save(m);
    const draft = await api('/api/v1/listings/drafts', 'POST', { initialPayload: { locationText: m.prefix } }, m.api.token);
    m.api.draftId = draft.id; save(m);
    console.log(JSON.stringify({ apiFixture: true, signedUrlExpirySeconds: 3600 }));
  } else {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (m.environment !== environment || !/^r01-probe\/[0-9a-f-]{36}$/.test(m.prefix)) throw Error('manifest scope mismatch');
    for (const entry of m.storage) {
      const d = destinations.find(d => d.label === entry.label);
      if (!d || entry.bucket !== d.bucket || entry.downloadKey !== `${m.prefix}/download.bin` || entry.uploadKey !== `${m.prefix}/upload.bin`) throw Error('object scope mismatch');
      const c = client(d);
      for (const Key of [entry.downloadKey, entry.uploadKey]) {
        await send(c, new s3.DeleteObjectCommand({ Bucket: d.bucket, Key }));
        try { await send(c, new s3.HeadObjectCommand({ Bucket: d.bucket, Key })); throw Error('object remains'); }
        catch (e) { if (e.$metadata?.httpStatusCode !== 404) throw e; }
      }
      console.log(JSON.stringify({ removed: entry.label, objects: 2, absent: true }));
    }
    if (m.api?.token) {
      // Recover a lost create response using this run's unguessable ownership marker.
      const drafts = await api('/api/v1/me/drafts?limit=20', 'GET', undefined, m.api.token);
      for (const draft of drafts.items.filter(d => (d.id === m.api.draftId || d.payload.locationText === m.prefix))) {
        await api(`/api/v1/listings/drafts/${draft.id}`, 'DELETE', undefined, m.api.token);
      }
      const after = await api('/api/v1/me/drafts?limit=20', 'GET', undefined, m.api.token);
      if (after.items.some(d => (d.id === m.api.draftId || d.payload.locationText === m.prefix))) throw Error('draft remains');
      await api('/api/v1/auth/logout', 'POST', { refreshToken: m.api.refreshToken });
      console.log(JSON.stringify({ apiDraftAbsent: true, sessionRevoked: true }));
    }
    fs.unlinkSync(file);
  }
}
main().catch(e => { console.error(JSON.stringify({ ok: false, error: e.name, status: e.$metadata?.httpStatusCode,
  message: 'Fixture operation failed; retain private manifest for scoped cleanup. Raw details suppressed.' })); process.exitCode = 1; });
