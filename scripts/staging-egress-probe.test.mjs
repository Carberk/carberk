import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const script = resolve('infra/egress/probe.py');
const sha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
async function fixture(t, handler) {
  const dir = await mkdtemp(join(tmpdir(), 'egress-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-keyout', join(dir, 'key'), '-out', join(dir, 'cert')], { stdio: 'ignore' });
  const server = createServer({ key: await readFile(join(dir, 'key')), cert: await readFile(join(dir, 'cert')) }, handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const url = `https://localhost:${server.address().port}`;
  return { dir, url };
}
async function probe(f, overrides = {}, trust = true) {
  const manifest = join(f.dir, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ bytes: 3, sha256: sha, storage: [{ label: 'photo', downloadUrl: f.url + '/data?secret=hidden', ...overrides }] }), { mode: 0o600 });
  const child = spawn('python3', [script, '--manifest', manifest, '--read-only'], { env: { ...process.env, CURL_CA_BUNDLE: trust ? join(f.dir, 'cert') : '' } });
  let output = '';
  child.stdout.on('data', b => output += b);
  child.stderr.on('data', b => output += b);
  const code = await new Promise(r => child.on('close', r));
  assert.ok(!output.includes('secret=hidden'), output);
  return { code, output, rows: output.trim().split('\n').filter(Boolean).map(s => JSON.parse(s)) };
}
test('verified HTTPS bytes pass; a same-size corrupt body fails', async t => {
  let body = 'abc';
  const f = await fixture(t, (_req, res) => res.end(body));
  assert.equal((await probe(f)).code, 0);
  body = 'abd';
  const result = await probe(f);
  assert.notEqual(result.code, 0);
  assert.equal(result.rows.find(r => r.kind === 'download').checksum_ok, false);
});
test('untrusted TLS is refused', async t => {
  const f = await fixture(t, (_req, res) => res.end('abc'));
  const result = await probe(f, {}, false);
  assert.notEqual(result.code, 0);
  assert.equal(result.rows.find(r => r.kind === 'download').curl_exit, 60);
});
test('redirects are not followed, including signed query strings', async t => {
  let followed = false;
  const f = await fixture(t, (req, res) => {
    if (req.url === '/elsewhere') { followed = true; res.end('abc'); }
    else { res.writeHead(302, { Location: '/elsewhere' }); res.end(); }
  });
  assert.notEqual((await probe(f)).code, 0);
  assert.equal(followed, false);
});

test('uploads must be acknowledged and match a fresh readback', async t => {
  let stored = Buffer.alloc(0);
  let corrupt = false;
  const f = await fixture(t, (req, res) => {
    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', b => chunks.push(b));
      req.on('end', () => { stored = Buffer.concat(chunks); res.end(); });
    } else res.end(req.url === '/uploaded' ? (corrupt ? Buffer.alloc(3) : stored) : 'abc');
  });
  const manifest = join(f.dir, 'write.json');
  await writeFile(manifest, JSON.stringify({ bytes: 3, sha256: sha, storage: [{ label: 'photo',
    downloadUrl: f.url + '/data', uploadUrl: f.url + '/upload', uploadReadUrl: f.url + '/uploaded' }] }));
  async function run() {
    const child = spawn('python3', [script, '--manifest', manifest], { env: { ...process.env, CURL_CA_BUNDLE: join(f.dir, 'cert') } });
    let output = '';
    child.stdout.on('data', b => output += b);
    child.stderr.on('data', b => output += b);
    return { code: await new Promise(r => child.on('close', r)), output };
  }
  assert.equal((await run()).code, 0);
  assert.equal(stored.length, 3);
  corrupt = true;
  assert.notEqual((await run()).code, 0);
});

test('relay preparation refuses local or chained upstreams without changing the source', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'relay-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, 'source.json');
  for (const outbound of [
    { tag: 'mac', protocol: 'socks', settings: { servers: [{ address: '127.0.0.1', port: 18080 }] } },
    { tag: 'mac', protocol: 'vless', settings: { vnext: [{ address: '8.8.8.8', port: 443 }] },
      streamSettings: { security: 'reality', sockopt: { dialerProxy: 'hidden-mac' } } },
  ]) {
    const original = JSON.stringify({ outbounds: [outbound] });
    await writeFile(source, original);
    const result = await new Promise(resolve => {
      const child = spawn('python3', ['infra/egress/relay-config.py', '--source', source, '--tag', 'mac', '--host', 'example.com', '--output', join(dir, 'output.json')]);
      let output = ''; child.stdout.on('data', b => output += b);
      child.on('close', code => resolve({ code, output }));
    });
    assert.notEqual(result.code, 0);
    assert.ok(!result.output.includes('hidden-mac'));
    assert.equal(await readFile(source, 'utf8'), original);
  }
});
