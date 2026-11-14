import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observeGateway } from '../infra/gateway/monitor-metrics.mjs';
import { probeGateway, createAlarm } from '../infra/gateway/monitor-probe.mjs';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; };

test('route metrics expose failures, time and stalled transfers without retaining private requests', async t => {
  let clock = 100;
  let unblock;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/v1/stall')) { res.writeHead(200); res.write('private body'); unblock = () => res.destroy(); }
    else { clock += 25; res.writeHead(502); res.end('private error'); }
  });
  const monitor = observeGateway(server, { now: () => clock, stallMs: 100, resources: () => ({ rssBytes: 123 }) });
  const origin = await listen(server);
  t.after(() => { monitor.close(); server.closeAllConnections(); server.close(); });
  await (await fetch(origin + '/api/v1/read?signature=secret-query', { headers: { authorization: 'Bearer secret-token' } })).text();
  const stalled = await fetch(origin + '/api/v1/stall');
  clock += 101;
  const during = monitor.snapshot();
  assert.equal(during.routes.api.failures, 1);
  assert.equal(during.routes.api.active, 1);
  assert.equal(during.routes.api.stalled, 1);
  assert.equal(during.routes.api.stalls, 1);
  assert.equal(monitor.snapshot().routes.api.stalls, 1);
  assert.equal(during.resources.rssBytes, 123);
  assert.ok(during.sockets.open >= 1);
  unblock();
  await assert.rejects(stalled.text());
  const after = monitor.snapshot();
  assert.equal(after.routes.api.active, 0);
  assert.equal(after.routes.api.interrupted, 1);
  assert.equal(after.routes.api.completed, 2);
  assert.equal(after.routes.api.durationMs, 126);
  for (const privateValue of ['secret-query', 'secret-token', 'private body', 'private error', 'signature', '/api/v1/read']) {
    assert.ok(!JSON.stringify(after).includes(privateValue));
  }
});

test('independent probes distinguish API and media failures and emit a local controlled alarm then recovery', async t => {
  let broken = false;
  const server = http.createServer((req, res) => {
    assert.equal(req.headers['x-carberk-gateway-key'], 'private-gateway-key');
    if (req.url === '/readyz') res.end(JSON.stringify({ status: 'ready', service: 'api' }));
    else if (req.url.startsWith('/photo') && broken) { res.writeHead(503); res.end('private failure'); }
    else res.end('synthetic canary');
  });
  const baseUrl = await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); });
  const hash = createHash('sha256').update('synthetic canary').digest('hex');
  const config = { baseUrl, accessKey: 'private-gateway-key',
    targets: { api: { path: '/readyz' }, photo: { path: '/photo?signature=private-query', sha256: hash }, video: { path: '/video', sha256: hash } } };
  const events = [];
  const alarm = createAlarm({ emit: row => events.push(row) });
  const healthy = await probeGateway(config);
  assert.deepEqual(healthy.routes.map(row => [row.route, row.healthy]), [['api', true], ['photo', true], ['video', true]]);
  broken = true;
  const failed = await probeGateway(config);
  assert.deepEqual(failed.routes.map(row => [row.route, row.healthy]), [['api', true], ['photo', false], ['video', true]]);
  alarm(failed); assert.equal(events.length, 0);
  alarm(failed); alarm(failed);
  assert.deepEqual(events, [{ event: 'gateway_alarm', route: 'photo', state: 'firing' }]);
  broken = false; alarm(await probeGateway(config));
  assert.deepEqual(events[1], { event: 'gateway_alarm', route: 'photo', state: 'recovered' });
  for (const value of ['private-query', 'private-gateway-key', 'synthetic canary', 'private failure', baseUrl]) {
    assert.ok(!JSON.stringify([healthy, failed, events]).includes(value));
  }

  const dir = await mkdtemp(join(tmpdir(), 'gateway-monitor-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'manifest.json');
  await writeFile(file, JSON.stringify(config), { mode: 0o600 });
  const run = async () => {
    const child = spawn(process.execPath, ['infra/gateway/monitor-probe.mjs', file, '--once']);
    let output = '';
    child.stdout.on('data', bytes => { output += bytes; });
    const [code] = await once(child, 'exit');
    return { code, result: JSON.parse(output) };
  };
  assert.equal((await run()).code, 0);
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  const stopped = await run();
  assert.equal(stopped.code, 1);
  assert.ok(stopped.result.routes.every(row => row.healthy === false));
});

test('media success requires exact bytes and redirects never leak the gateway key', async t => {
  let leaked = false;
  const outside = http.createServer((_req, res) => { leaked = true; res.end('outside'); });
  const outsideUrl = await listen(outside);
  const server = http.createServer((req, res) => {
    if (req.url === '/readyz') res.end('{"status":"ok","service":"api"}');
    else if (req.url === '/photo') res.end('wrong bytes');
    else { res.writeHead(302, { location: outsideUrl }); res.end(); }
  });
  const baseUrl = await listen(server);
  t.after(() => { for (const s of [outside, server]) { s.closeAllConnections(); s.close(); } });
  const result = await probeGateway({ baseUrl, accessKey: 'secret', targets: {
    api: { path: '/readyz' }, photo: { path: '/photo', sha256: 'a'.repeat(64) }, video: { path: '/video', sha256: 'a'.repeat(64) },
  } });
  assert.deepEqual(result.routes.map(row => row.reason), ['integrity', 'integrity', 'http']);
  assert.equal(leaked, false);
});

test('fixed photo buckets and socket indicators never expose arbitrary targets', async t => {
  const server = http.createServer((_req, res) => { res.writeHead(403); res.end(); });
  server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n'));
  const monitor = observeGateway(server);
  const baseUrl = await listen(server);
  t.after(() => { monitor.close(); server.closeAllConnections(); server.close(); });
  await (await fetch(baseUrl + '/photos/chat-attachments/private-user-key?secret=private')).text();
  await (await fetch(baseUrl + '/arbitrary-private-path')).text();
  const upgradeClosed = new Promise(resolve => server.once('upgrade', (_req, peer) => peer.once('close', resolve)));
  const socket = net.connect({ host: '127.0.0.1', port: server.address().port });
  socket.resume();
  socket.write('GET /private-socket-path HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  await once(socket, 'close');
  await upgradeClosed;
  const result = monitor.snapshot();
  assert.equal(result.routes.photo.denied, 1);
  assert.equal(result.routes.other.denied, 1);
  assert.equal(result.sockets.upgrades, 1);
  assert.equal(result.sockets.upgradedOpen, 0);
  assert.ok(result.sockets.connections >= 1);
  assert.ok(result.resources.rssBytes > 0);
  assert.ok(result.resources.hostTotalBytes > 0);
  for (const value of ['private-user-key', 'secret=', 'private-socket-path', 'arbitrary-private-path']) {
    assert.ok(!JSON.stringify(result).includes(value));
  }
});
