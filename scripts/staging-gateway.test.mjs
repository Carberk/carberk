import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createGateway } from '../infra/gateway/gateway.mjs';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';

const key = 'controlled-staging-key-0123456789abcdef';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
async function setup(t, handler, overrides = {}, proxyMode = 'normal', photoHandler) {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-keyout', join(dir, 'key'), '-out', join(dir, 'cert')], { stdio: 'ignore' });
  const ca = await readFile(join(dir, 'cert'));
  const upstream = https.createServer({ key: await readFile(join(dir, 'key')), cert: ca }, handler);
  const port = await listen(upstream);
  const photos = photoHandler ? https.createServer({ key: await readFile(join(dir, 'key')), cert: ca }, photoHandler) : undefined;
  const photoPort = photos ? await listen(photos) : undefined;
  let tunnels = 0;
  const sockets = new Set();
  const peers = new Set();
  let peakPeers = 0;
  const proxy = http.createServer();
  proxy.on('connect', (req, client, head) => {
    tunnels++;
    assert.ok([`localhost:${port}`, ...(photoPort ? [`localhost:${photoPort}`] : [])].includes(req.url));
    const destination = Number(req.url.split(':')[1]);
    sockets.add(client); peers.add(client); peakPeers = Math.max(peakPeers, peers.size);
    client.on('error', () => {});
    client.on('close', () => { sockets.delete(client); peers.delete(client); });
    if (proxyMode !== 'normal') {
      if (proxyMode === 'stall-tls') client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      client.on('end', () => client.end());
      client.resume();
      return;
    }
    const remote = net.connect(destination, '127.0.0.1', () => {
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
    ...(photoPort ? { photoOrigin: `https://localhost:${photoPort}` } : {}),
    hostname: 'gateway.example.test', accessKey: key, ca, log: row => logs.push(row), ...overrides });
  const gatewayPort = await listen(gateway);
  t.after(async () => {
    gateway.closeAllConnections(); await new Promise(r => gateway.close(r));
    for (const s of sockets) s.destroy();
    upstream.closeAllConnections(); await Promise.all([new Promise(r => upstream.close(r)), new Promise(r => proxy.close(r))]);
    if (photos) { photos.closeAllConnections(); await new Promise(r => photos.close(r)); }
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

test('photo alias preserves signed raw target, TLS identity, conditional headers and bytes without API credentials', async t => {
  let photoHost;
  let photoTls;
  const f = await setup(t, (_req, res) => res.end('api'), {
    signing: { keyId: 'current', secret: 'ab'.repeat(32) },
  }, 'normal', (req, res) => {
    const chunks = [];
    photoHost = req.headers.host;
    photoTls = req.socket.servername;
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => res.end(JSON.stringify({ target: req.url, method: req.method,
      headers: req.headers, bytes: Buffer.concat(chunks).toString('hex') })));
  });
  const response = await f.request({ method: 'PUT',
    path: '/photos/listing-photos/pending/a%2Fb/original.webp?X-Amz-Signature=synthetic&x=1+2&x=%2f',
    body: Buffer.from([0, 255, 13, 10, 42]), headers: {
      authorization: 'Bearer must-not-reach-storage', cookie: 'api-session=private',
      'content-type': 'image/webp', 'if-match': '"signed-etag"', 'cache-control': 'no-store',
      'x-carberk-client-proof': 'forged',
    } });
  assert.equal(response.status, 200);
  const received = JSON.parse(response.body);
  assert.equal(received.target, '/listing-photos/pending/a%2Fb/original.webp?X-Amz-Signature=synthetic&x=1+2&x=%2f');
  assert.equal(received.method, 'PUT');
  assert.equal(received.bytes, '00ff0d0a2a');
  assert.equal(received.headers['content-type'], 'image/webp');
  assert.equal(received.headers['if-match'], '"signed-etag"');
  assert.equal(received.headers['cache-control'], 'no-store');
  for (const name of ['authorization', 'cookie', 'x-carberk-gateway-key', 'x-carberk-client-proof']) assert.equal(received.headers[name], undefined);
  assert.match(photoHost, /^localhost:\d+$/);
  assert.equal(photoTls, 'localhost');
  assert.equal((await f.request({ headers: { 'x-real-ip': '203.0.113.7' } })).body.toString(), 'api');
  assert.equal(f.tunnels(), 2);
  assert.ok(!JSON.stringify(f.logs).includes('synthetic'));
});

test('photo entry preserves storage refusals and refuses other destinations, methods and redirects', async t => {
  let status = 403;
  const f = await setup(t, (_req, res) => res.end('api'), {}, 'normal', (_req, res) => {
    res.writeHead(status, status === 307 ? { location: '/listing-photos/redirect.webp' } : {});
    res.end('storage-result');
  });
  const path = '/photos/chat-attachments/chat-attachments/conversation/photo/original.webp';
  for (const refused of [403, 412]) {
    status = refused;
    const result = await f.request({ path, method: 'PUT', body: 'photo' });
    assert.equal(result.status, refused);
    assert.equal(result.body.toString(), 'storage-result');
  }
  status = 307;
  assert.equal((await f.request({ path })).status, 502);
  const before = f.tunnels();
  for (const input of [
    { path, method: 'DELETE' }, { path, method: 'POST' },
    { path: '/photos/private-history/secret.webp' }, { path: '/photos/https://other.test/photo.webp' },
    { path, headers: { 'x-carberk-gateway-key': '' } },
  ]) assert.ok([400, 403].includes((await f.request(input)).status));
  assert.equal(f.tunnels(), before);
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


test('gateway replaces spoofed proofs with method/raw-target-bound observed-client attribution', async t => {
  const signing = { keyId: 'current', secret: 'ab'.repeat(32) };
  const f = await setup(t, (req, res) => res.end(JSON.stringify(req.headers)), { signing, now: () => 1800000000000 });
  const target = '/api/v1/echo?x=a%2Fb&x=1+2';
  const response = await f.request({ method: 'PATCH', path: target, headers: {
    'x-real-ip': '203.0.113.7', 'x-carberk-client-proof': 'forged', 'x-forwarded-for': '1.1.1.1', 'cf-ipcountry': 'TM',
  } });
  assert.equal(response.status, 200);
  const received = JSON.parse(response.body);
  const parts = received['x-carberk-client-proof'].split('.');
  assert.deepEqual(parts.slice(0, 3), ['v1', 'current', '1800000000000']);
  assert.match(parts[3], /^[0-9a-f]{32}$/);
  assert.equal(Buffer.from(parts[4], 'base64url').toString(), '203.0.113.7');
  assert.equal(parts[5], createHmac('sha256', Buffer.from(signing.secret, 'hex')).update(`${parts.slice(0, 5).join('.')}\nPATCH\n${target}`).digest('hex'));
  assert.equal(received['x-real-ip'], undefined);
  assert.equal(received['cf-ipcountry'], undefined);
  assert.equal(received['x-forwarded-for'], undefined);
  assert.ok(!JSON.stringify(f.logs).includes('203.0.113.7'));
  assert.ok(!JSON.stringify(f.logs).includes(parts[5]));
  assert.equal((await f.request()).status, 400);
});

test('Socket.IO polling and websocket upgrade reach the fixed API with auth and heartbeat traffic', async t => {
  const f = await setup(t, (_req, res) => res.writeHead(404).end(), {
    hostname: '127.0.0.1',
    signing: { keyId: 'current', secret: 'ab'.repeat(32) },
  });
  const server = new Server(f.upstream, { path: '/socket.io/', pingInterval: 100, pingTimeout: 1000 });
  const namespace = server.of('/ws/chat');
  namespace.use((socket, next) => socket.handshake.auth.token === 'synthetic-bearer' ? next() : next(Error('unauthorized')));
  namespace.on('connection', socket => {
    const proof = socket.handshake.headers['x-carberk-client-proof'];
    assert.equal(typeof proof, 'string');
    assert.equal(socket.handshake.headers['x-carberk-gateway-key'], undefined);
    assert.equal(socket.handshake.headers['x-real-ip'], undefined);
    assert.equal(socket.handshake.headers.authorization, undefined);
    const parts = proof.split('.');
    assert.equal(parts[1], 'current');
    assert.equal(Buffer.from(parts[4], 'base64url').toString(), '203.0.113.7');
    assert.equal(parts[5], createHmac('sha256', Buffer.from('ab'.repeat(32), 'hex'))
      .update(`${parts.slice(0, 5).join('.')}\nGET\n${socket.request.url}`).digest('hex'));
    socket.on('echo', (message, ack) => ack(message));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal((await f.request({ path: '/socket.io/?EIO=4&transport=polling', headers: { host: '127.0.0.1', 'x-real-ip': '203.0.113.7' } })).status, 200);

  for (const transport of ['polling', 'websocket']) {
    const socket = io(`http://127.0.0.1:${f.port}/ws/chat`, {
      path: '/socket.io/', transports: [transport], reconnection: false,
      auth: { token: 'synthetic-bearer' },
      extraHeaders: { 'x-carberk-gateway-key': key, 'x-real-ip': '203.0.113.7', 'x-carberk-client-proof': 'forged' },
    });
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      setTimeout(() => reject(Error(`${transport} did not connect`)), 3000).unref();
    });
    assert.equal(await socket.timeout(1000).emitWithAck('echo', transport), transport);
    socket.disconnect();
  }
  const upgraded = io(`http://127.0.0.1:${f.port}/ws/chat`, {
    path: '/socket.io/', transports: ['polling', 'websocket'], reconnection: false,
    auth: { token: 'synthetic-bearer' },
    extraHeaders: { 'x-carberk-gateway-key': key, 'x-real-ip': '203.0.113.7' },
  });
  t.after(() => upgraded.disconnect());
  await new Promise((resolve, reject) => {
    upgraded.once('connect', resolve);
    upgraded.once('connect_error', reject);
  });
  if (upgraded.io.engine.transport.name !== 'websocket') {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Polling did not upgrade')), 1000);
      upgraded.io.engine.once('upgrade', () => { clearTimeout(timeout); resolve(); });
    });
  }
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(upgraded.connected, true);
  assert.equal(await upgraded.timeout(1000).emitWithAck('echo', 'after-heartbeats'), 'after-heartbeats');
  upgraded.disconnect();
  const denied = io(`http://127.0.0.1:${f.port}/ws/chat`, {
    path: '/socket.io/', transports: ['websocket'], reconnection: false,
    auth: { token: 'wrong-token' },
    extraHeaders: { 'x-carberk-gateway-key': key, 'x-real-ip': '203.0.113.7' },
  });
  await assert.rejects(new Promise((resolve, reject) => {
    denied.once('connect', resolve);
    denied.once('connect_error', reject);
  }), /unauthorized/);
  denied.disconnect();
  assert.equal(f.logs.some(row => JSON.stringify(row).includes('synthetic-bearer')), false);
  assert.equal(f.logs.some(row => JSON.stringify(row).includes(key)), false);
});

test('upgrade rejects missing edge access and unapproved paths before dialing the origin', async t => {
  const f = await setup(t, (_req, res) => res.end('unreachable'), { hostname: '127.0.0.1' });
  async function upgrade(path, suppliedKey) {
    return new Promise((resolve, reject) => {
      const headers = { connection: 'Upgrade', upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-version': '13' };
      if (suppliedKey) headers['x-carberk-gateway-key'] = suppliedKey;
      const req = http.request({ hostname: '127.0.0.1', port: f.port, path, headers }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.once('upgrade', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
      req.once('error', reject);
      req.end();
    });
  }
  assert.equal(await upgrade('/socket.io/?EIO=4&transport=websocket'), 403);
  assert.equal(await upgrade('/photos/listing-photos/file', key), 400);
  assert.equal(await upgrade('/api/v1/other', key), 400);
  assert.equal(f.tunnels(), 0);
});

test('ten concurrent authenticated sockets do not exhaust the upstream HTTP pool', async t => {
  const f = await setup(t, (_req, res) => res.writeHead(404).end(), { hostname: '127.0.0.1' });
  const server = new Server(f.upstream, { path: '/socket.io/' });
  server.of('/ws/chat').on('connection', () => {});
  t.after(() => new Promise(resolve => server.close(resolve)));
  const sockets = Array.from({ length: 10 }, () => io(`http://127.0.0.1:${f.port}/ws/chat`, {
    path: '/socket.io/', transports: ['websocket'], reconnection: false,
    extraHeaders: { 'x-carberk-gateway-key': key },
  }));
  t.after(() => sockets.forEach(socket => socket.disconnect()));
  await Promise.all(sockets.map(socket => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Socket pool exhausted')), 1000);
    socket.once('connect', () => { clearTimeout(timeout); resolve(); });
    socket.once('connect_error', reject);
  })));
  assert.equal(sockets.filter(socket => socket.connected).length, 10);
  sockets.forEach(socket => socket.disconnect());
});
