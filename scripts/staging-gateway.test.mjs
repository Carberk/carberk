import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createGateway } from '../infra/gateway/gateway.mjs';

const key = 'controlled-staging-key-0123456789abcdef';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
async function setup(t, handler, overrides = {}, proxyMode = 'normal') {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-keyout', join(dir, 'key'), '-out', join(dir, 'cert')], { stdio: 'ignore' });
  const ca = await readFile(join(dir, 'cert'));
  const upstream = https.createServer({ key: await readFile(join(dir, 'key')), cert: ca }, handler);
  const port = await listen(upstream);
  let tunnels = 0;
  const sockets = new Set();
  const peers = new Set();
  let peakPeers = 0;
  const proxy = http.createServer();
  proxy.on('connect', (req, client, head) => {
    tunnels++;
    assert.equal(req.url, `localhost:${port}`);
    sockets.add(client); peers.add(client); peakPeers = Math.max(peakPeers, peers.size);
    client.on('error', () => {});
    client.on('close', () => { sockets.delete(client); peers.delete(client); });
    if (proxyMode !== 'normal') {
      if (proxyMode === 'stall-tls') client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      client.on('end', () => client.end());
      client.resume();
      return;
    }
    const remote = net.connect(port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) remote.write(head);
      remote.pipe(client); client.pipe(remote);
    });
    for (const s of [client, remote]) { sockets.add(s); s.on('error', () => {}); s.on('close', () => sockets.delete(s)); }
    client.on('close', () => remote.destroy()); remote.on('close', () => client.destroy());
  });
  const proxyPort = await listen(proxy);
  const logs = [];
  const gateway = createGateway({ origin: `https://localhost:${port}`, proxy: `http://127.0.0.1:${proxyPort}`,
    hostname: 'gateway.example.test', accessKey: key, ca, log: row => logs.push(row), ...overrides });
  const gatewayPort = await listen(gateway);
  t.after(async () => {
    gateway.closeAllConnections(); await new Promise(r => gateway.close(r));
    for (const s of sockets) s.destroy();
    upstream.closeAllConnections(); await Promise.all([new Promise(r => upstream.close(r)), new Promise(r => proxy.close(r))]);
  });
  async function request({ path = '/healthz', method = 'GET', body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: gatewayPort, path, method,
        headers: { host: 'gateway.example.test', 'x-carberk-gateway-key': key, ...headers } }, res => {
        const chunks = []; res.on('data', b => chunks.push(b)); res.on('error', reject);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject); req.end(body);
    });
  }
  return { request, logs, tunnels: () => tunnels, upstream, proxy, gateway, port: gatewayPort, peakPeers: () => peakPeers, peerCount: () => peers.size };
}

test('controlled client preserves method, raw signed target, body and API status through verified TLS', async t => {
  const f = await setup(t, (req, res) => {
    const chunks = []; req.on('data', b => chunks.push(b));
    req.on('end', () => { res.writeHead(422, { 'content-type': 'application/json' }); res.end(JSON.stringify({ method: req.method, target: req.url, body: Buffer.concat(chunks).toString(), auth: req.headers.authorization })); });
  });
  const result = await f.request({ method: 'PATCH', path: '/api/v1/echo?x=a%2Fb&x=1+2', body: 'exact\nbody', headers: { authorization: 'Bearer synthetic' } });
  assert.equal(result.status, 422);
  assert.deepEqual(JSON.parse(result.body), { method: 'PATCH', target: '/api/v1/echo?x=a%2Fb&x=1+2', body: 'exact\nbody', auth: 'Bearer synthetic' });
});

test('closed entry refuses missing keys and arbitrary targets without contacting an upstream', async t => {
  const f = await setup(t, (_req, res) => res.end('should not be reached'));
  for (const input of [
    { headers: { 'x-carberk-gateway-key': '' } },
    { path: 'https://other.example/healthz' },
    { path: '//other.example/healthz' },
    { headers: { host: 'other.example' } },
    { path: '/unconfigured-storage' },
  ]) assert.ok([400, 403].includes((await f.request(input)).status));
  assert.equal(f.tunnels(), 0);
});

test('forwarding metadata and edge key are stripped, API bearer is preserved, and tunnels are reused', async t => {
  const f = await setup(t, (req, res) => res.end(JSON.stringify(req.headers)));
  const headers = { authorization: 'Bearer api-secret', 'x-carberk-gateway-key': key,
    forwarded: 'for=spoofed', 'x-forwarded-for': 'spoofed', 'x-real-ip': 'spoofed',
    'x-carberk-client-signature': 'spoofed', 'cf-connecting-ip': 'spoofed',
    'x-railway-request-id': 'spoofed', connection: 'x-hop-secret', 'x-hop-secret': 'hidden' };
  const first = await f.request({ headers });
  const received = JSON.parse(first.body);
  assert.equal(received.authorization, 'Bearer api-secret');
  for (const name of Object.keys(headers).filter(name => name !== 'authorization')) assert.equal(received[name], name === 'connection' ? 'keep-alive' : undefined);
  assert.equal((await f.request()).status, 200);
  assert.equal(f.tunnels(), 1);
  assert.ok(!JSON.stringify(f.logs).includes('api-secret'));
  assert.ok(!JSON.stringify(f.logs).includes(key));
});

test('external redirects are refused and same-origin redirects stay on the gateway', async t => {
  let external = true;
  const f = await setup(t, (_req, res) => {
    res.writeHead(307, { location: external ? 'https://other.example/steal' : '/api/v1/next?x=a%2Fb' }); res.end();
  });
  const refused = await f.request({ headers: { authorization: 'Bearer secret' } });
  assert.equal(refused.status, 502);
  assert.equal(refused.headers.location, undefined);
  external = false;
  const accepted = await f.request();
  assert.equal(accepted.status, 307);
  assert.equal(accepted.headers.location, '/api/v1/next?x=a%2Fb');
});

test('untrusted upstream TLS fails without a direct fallback', async t => {
  const f = await setup(t, (_req, res) => res.end('wrong trust'), { ca: undefined });
  assert.equal((await f.request()).status, 502);
  assert.equal(f.tunnels(), 1);
});

test('silent upstream times out truthfully, then a later request can recover', async t => {
  let silent = true;
  const f = await setup(t, (_req, res) => { if (!silent) res.end('recovered'); }, { deadlineMs: 100 });
  assert.equal((await f.request()).status, 504);
  silent = false;
  assert.equal((await f.request()).body.toString(), 'recovered');
});

test('oversized body is refused before forwarding and chunked body remains bounded', async t => {
  const f = await setup(t, (req, res) => { req.resume(); req.on('end', () => res.end()); }, { maxBodyBytes: 4 });
  assert.equal((await f.request({ method: 'POST', body: '12345', headers: { 'content-length': '5' } })).status, 413);
  assert.equal(f.tunnels(), 0);
  assert.equal((await f.request({ method: 'POST', body: '12345', headers: { 'transfer-encoding': 'chunked' } })).status, 413);
});

test('upstream disconnection is never retried or converted to success', async t => {
  let writes = 0;
  const f = await setup(t, (req, _res) => { writes++; req.socket.destroy(); });
  const result = await f.request({ method: 'POST', path: '/api/v1/write', body: 'once' });
  assert.equal(result.status, 502);
  assert.equal(writes, 1);
});

test('concurrent work is bounded instead of growing an unbounded queue', async t => {
  let release;
  const entered = new Promise(resolve => release = resolve);
  let held;
  const f = await setup(t, (_req, res) => { held = res; release(); }, { maxConcurrent: 1 });
  const first = f.request();
  await entered;
  assert.equal((await f.request()).status, 503);
  held.end('done');
  assert.equal((await first).status, 200);
});

test('a truncated upstream response remains visibly incomplete to the client', async t => {
  const f = await setup(t, (_req, res) => {
    res.writeHead(200, { 'content-length': '100' }); res.write('partial');
    setTimeout(() => res.destroy(), 30);
  });
  await assert.rejects(f.request(), /aborted|reset|hang up/i);
});

test('an early API rejection closes an unfinished upload instead of retaining an unbounded client stream', async t => {
  const f = await setup(t, (_req, res) => { res.writeHead(403); res.end('denied'); });
  const result = await new Promise((resolve, reject) => {
    const socket = net.connect(f.port, '127.0.0.1', () => socket.write(
      `POST /api/v1/upload HTTP/1.1\r\nHost: gateway.example.test\r\nX-Carberk-Gateway-Key: ${key}\r\nTransfer-Encoding: chunked\r\n\r\n4\r\ndata\r\n`));
    let text = '';
    socket.on('data', b => text += b);
    socket.on('end', () => resolve(text)); socket.on('error', reject);
    socket.setTimeout(1000, () => { socket.destroy(); reject(Error('Unfinished upload retained')); });
  });
  assert.match(result, /HTTP\/1.1 403/);
  assert.match(result, /denied/);
  assert.match(result.toLowerCase(), /connection: close/);
});

test('chunked DELETE, GET and OPTIONS bodies arrive intact with the origin status preserved', async t => {
  const f = await setup(t, (req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => { const body = Buffer.concat(chunks).toString(); res.writeHead(body === 'chunked-payload' ? 201 : 400); res.end(body); });
  });
  for (const method of ['DELETE', 'GET', 'OPTIONS']) {
    for (const headers of [{ 'transfer-encoding': 'chunked' }, { 'content-length': '15', connection: 'content-length' }]) {
      const result = await f.request({ method, path: '/api/v1/body', body: 'chunked-payload', headers });
      assert.equal(result.status, 201, method);
      assert.equal(result.body.toString(), 'chunked-payload');
    }
  }
});

for (const phase of ['stall-connect', 'stall-tls']) {
  test(`at most eight proxy connections exist while ${phase} is pending`, async t => {
    const f = await setup(t, (_req, res) => res.end(), { deadlineMs: 250, connectMs: 2000 }, phase);
    const responses = await Promise.all(Array.from({ length: 16 }, () => f.request()));
    assert.ok(responses.every(r => r.status === 504));
    assert.ok(f.peakPeers() <= 8, `Observed ${f.peakPeers()} simultaneous proxy connections`);
  });

  test(`client cancellation promptly closes its pending ${phase} transport`, async t => {
    const f = await setup(t, (_req, res) => res.end(), { connectMs: 3000 }, phase);
    for (let i = 0; i < 32; i++) {
      const connected = new Promise(resolve => f.proxy.once('connect', (_req, socket) => resolve(socket)));
      const req = http.request({ hostname: '127.0.0.1', port: f.port, path: '/healthz',
        headers: { host: 'gateway.example.test', 'x-carberk-gateway-key': key } });
      req.on('error', () => {}); req.end();
      const peer = await connected;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Cancelled transport retained')), 500);
        peer.once('close', () => { clearTimeout(timer); resolve(); });
        req.destroy();
      });
    }
    assert.equal(f.peerCount(), 0);
  });
}

test('cancelled queued clients never dial later and release their admission slots', async t => {
  const f = await setup(t, (_req, res) => res.end(), { deadlineMs: 1000, connectMs: 2000 }, 'stall-connect');
  const peers = [];
  const connected = new Promise(resolve => f.proxy.on('connect', (_req, socket) => {
    peers.push(socket); if (peers.length === 8) resolve();
  }));
  function start(path) {
    const req = http.request({ hostname: '127.0.0.1', port: f.port, path,
      headers: { host: 'gateway.example.test', 'x-carberk-gateway-key': key } });
    req.on('error', () => {}); req.end(); return req;
  }
  const running = Array.from({ length: 8 }, () => start('/healthz'));
  await connected;
  const serverClosed = [];
  const received = new Promise(resolve => f.gateway.on('request', (req, res) => {
    if (req.url.startsWith('/healthz?queued=')) {
      serverClosed.push(new Promise(r => res.once('close', r)));
      if (serverClosed.length === 8) resolve();
    }
  }));
  const queued = Array.from({ length: 8 }, (_, i) => start('/healthz?queued=' + i));
  await received;
  for (const req of queued) req.destroy();
  await Promise.all(serverClosed);
  const peerClosed = peers.map(socket => new Promise(resolve => socket.once('close', resolve)));
  for (const req of running) req.destroy();
  await Promise.all(peerClosed);
  assert.equal(f.tunnels(), 8);
  // All cancelled work drains; a fresh client is admitted and reaches the proxy.
  const result = await f.request();
  assert.equal(result.status, 504);
  assert.equal(f.tunnels(), 9);
});
