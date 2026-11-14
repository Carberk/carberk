import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createReverseConnector } from '../infra/egress/reverse-connector.mjs';

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.stop?.(); server.closeAllConnections?.(); server.close(); });
  return server.address().port;
}
async function connect(port, target) {
  const socket = net.connect(port, '127.0.0.1');
  await once(socket, 'connect');
  socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
  const [head] = await once(socket, 'data');
  return { socket, head: head.toString() };
}
test('fixed reverse CONNECT preserves bytes and refuses arbitrary destinations without dialing them', async t => {
  const echo = net.createServer(socket => socket.pipe(socket));
  const port = await listen(t, echo);
  const connector = createReverseConnector({ ports: [port, port, port] });
  const entry = await listen(t, connector);
  for (const host of ['api-staging-2861.up.railway.app', 'minio-staging-5795.up.railway.app', 't3.storageapi.dev']) {
    const { socket, head } = await connect(entry, `${host}:443`);
    assert.match(head, /^HTTP\/1.1 200 /);
    socket.write('PATCH /a%2Fb?part=2&part=1 HTTP/1.1\r\n\r\nraw-body');
    assert.equal((await once(socket, 'data'))[0].toString(), 'PATCH /a%2Fb?part=2&part=1 HTTP/1.1\r\n\r\nraw-body');
    socket.destroy();
  }
  for (const target of ['example.com:443', '127.0.0.1:443', 'api-staging-2861.up.railway.app:80', 'https://api-staging-2861.up.railway.app:443']) {
    const { socket, head } = await connect(entry, target);
    assert.match(head, /^HTTP\/1.1 403 /);
    socket.destroy();
  }
});

test('a missing reverse listener fails promptly and failed sessions release capacity', async t => {
  const unused = net.createServer();
  const port = await listen(t, unused);
  await new Promise(r => unused.close(r));
  const connector = createReverseConnector({ ports: [port, port, port], connectMs: 100, maxConnections: 1 });
  const entry = await listen(t, connector);
  for (let i = 0; i < 3; i++) {
    const { socket, head } = await connect(entry, 'api-staging-2861.up.railway.app:443');
    assert.match(head, /^HTTP\/1.1 502 /);
    socket.destroy();
  }
});

test('active tunnels hold admission until cancellation closes the peer', async t => {
  const echo = net.createServer(socket => socket.pipe(socket));
  const peerPort = await listen(t, echo);
  const connector = createReverseConnector({ ports: [peerPort, peerPort, peerPort], maxConnections: 1 });
  const entry = await listen(t, connector);
  const peerAccepted = once(echo, 'connection');
  const first = await connect(entry, 'api-staging-2861.up.railway.app:443');
  const [peer] = await peerAccepted;
  const closed = once(peer, 'close');
  const refused = await connect(entry, 'api-staging-2861.up.railway.app:443');
  assert.match(refused.head, /^HTTP\/1.1 503 /);
  refused.socket.destroy(); first.socket.destroy();
  await closed;
  const next = await connect(entry, 'api-staging-2861.up.railway.app:443');
  assert.match(next.head, /^HTTP\/1.1 200 /);
  next.socket.destroy();
});

test('gateway CLI selects reverse explicitly and rejects unknown or mismatched transport', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'reverse-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  async function check(transport, proxy) {
    const config = join(dir, 'config.json');
    await writeFile(config, JSON.stringify({ origin: 'https://api-staging-2861.up.railway.app',
      hostname: 'gateway.example.test', accessKey: 'x'.repeat(32), transport, proxy }));
    const child = spawn(process.execPath, ['infra/gateway/serve.mjs', config, '--check']);
    let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
    return { code: await new Promise(r => child.once('close', r)), output };
  }
  assert.equal((await check('reverse', 'http://127.0.0.1:11819')).code, 0);
  assert.equal((await check(undefined, 'http://127.0.0.1:11809')).code, 0);
  for (const mode of ['automatic', 'reverse', 'toString', '__proto__']) {
    assert.notEqual((await check(mode, 'http://127.0.0.1:11809')).code, 0);
  }
});

test('connector premature exit is failure, private child logs are suppressed, and shutdown owns its child', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'reverse-child-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const binary = join(dir, 'child');
  const run = join(dir, 'run.mjs');
  await writeFile(run, `import { runClient } from ${JSON.stringify(new URL('../infra/egress/reverse-client.mjs', import.meta.url).href)};
    runClient(process.env, ${JSON.stringify(binary)}).catch(() => process.exitCode = 1);`);
  const env = { ...process.env, RAILWAY_ENVIRONMENT_ID: '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2',
    GATEWAY_HOST: 'gateway.example.test', TUNNEL_AUTH: 'private-marker', TUNNEL_FINGERPRINT: 'a'.repeat(43) + '=' };
  const pidFile = join(dir, 'pid');
  await writeFile(binary, `#!${process.execPath}
import{appendFileSync,readFileSync}from'node:fs';
appendFileSync(${JSON.stringify(pidFile)},JSON.stringify({pid:process.pid})+'\\n');
console.error('Connected private-marker');
setTimeout(()=>process.exit(2),3000);
if(process.argv.some(x=>x.startsWith('R:127.0.0.1:11901:')))setInterval(()=>{
  if(readFileSync(${JSON.stringify(pidFile)},'utf8').trim().split('\\n').length===3)process.exit(0);
},5);`, { mode: 0o700 });
  const child = spawn(process.execPath, [run], { env });
  let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
  assert.equal(await new Promise(r => child.once('close', r)), 1);
  assert.ok(!output.includes('private-marker'));
  const { readFile } = await import('node:fs/promises');
  const failedGroup = (await readFile(pidFile, 'utf8')).trim().split('\n').map(s => JSON.parse(s));
  assert.equal(failedGroup.length, 3);
  for (const { pid } of failedGroup) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  await writeFile(pidFile, '');
  await writeFile(binary, `#!${process.execPath}\nimport{appendFileSync}from'node:fs';appendFileSync(${JSON.stringify(pidFile)},JSON.stringify({pid:process.pid,remotes:process.argv.filter(x=>x.startsWith('R:'))})+'\\n');console.log('Connected');setInterval(()=>{},100);`, { mode: 0o700 });
  const survivor = spawn(process.execPath, [run], { env });
  let connected = 0;
  let timer;
  await Promise.race([new Promise(resolve => survivor.stdout.on('data', b => {
    connected += b.toString().trim().split('\n').length;
    if (connected >= 3) resolve();
  })), new Promise(resolve => { timer = setTimeout(resolve, 800); })]);
  clearTimeout(timer);
  survivor.kill('SIGTERM');
  assert.equal(await new Promise(r => survivor.once('close', r)), 0);
  const children = (await readFile(pidFile, 'utf8')).trim().split('\n').map(s => JSON.parse(s));
  assert.equal(children.length, 3, 'Each fixed origin needs its own connection, isolating bulk media from API');
  assert.ok(children.every(c => c.remotes.length === 1));
  assert.deepEqual(children.flatMap(c => c.remotes).sort(), [
    'R:127.0.0.1:11901:api-staging-2861.up.railway.app:443',
    'R:127.0.0.1:11902:minio-staging-5795.up.railway.app:443',
    'R:127.0.0.1:11903:t3.storageapi.dev:443',
  ]);
  for (const { pid } of children) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
