// One-shot Railway Function preflight. No incoming listener, business secrets, or persistent adoption.
import https from 'node:https';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const emit = row => console.log(JSON.stringify(row));
const sha256 = b => createHash('sha256').update(b).digest('hex');
const artifact = 'https://github.com/jpillora/chisel/releases/download/v1.12.0/chisel_1.12.0_linux_amd64.gz';
const checksum = 'f3f180f1d93aa72cce4e6386f98cc06569a0146fbd65eb4423cf83e6434bcfe6';
const origins = ['api-staging-2861.up.railway.app', 'minio-staging-5795.up.railway.app', 't3.storageapi.dev'];

async function health(host, port, agent, sample) {
  const start = performance.now();
  const row = { kind: 'directional-https', port, sample, reused: false };
  await new Promise(resolve => {
    const request = https.get({ hostname: host, port, path: '/healthz', agent, rejectUnauthorized: true }, response => {
      row.status = response.statusCode;
      row.ttfbMs = performance.now() - start;
      row.reused = request.reusedSocket;
      let bytes = 0;
      response.on('data', b => { bytes += b.length; if (bytes > 65536) response.destroy(); });
      response.on('end', () => { row.ok = response.statusCode === (port === 443 ? 403 : 404); resolve(); });
      response.on('error', () => resolve());
    });
    request.on('socket', socket => {
      socket.once('connect', () => { row.tcpMs = performance.now() - start; });
      socket.once('secureConnect', () => { row.tlsMs = performance.now() - start; });
    });
    const timer = setTimeout(() => request.destroy(new Error('deadline')), 8000);
    request.once('close', () => clearTimeout(timer));
    request.once('error', () => { row.ok = false; row.error = 'connection-or-TLS-failed'; resolve(); });
  });
  row.totalMs = performance.now() - start;
  emit(row);
}

async function main() {
  const { GATEWAY_HOST: host, TUNNEL_AUTH: auth, TUNNEL_FINGERPRINT: fingerprint, EXPIRES_AT: expires } = process.env;
  if (!host || !auth || !fingerprint) { emit({ kind: 'configuration', ready: false }); return; }
  const basePort = Number(process.env.TUNNEL_BASE_PORT || 11901);
  if (![11901, 11911].includes(basePort)) throw Error('invalid fixed listener slot');
  const remotes = origins.map((origin, i) => `R:127.0.0.1:${basePort + i}:${origin}:443`);
  const observe = Number(process.env.OBSERVE_SECONDS || 30);
  if (!Number.isInteger(observe) || observe < 30 || observe > 600) throw Error('invalid observation bound');
  const remaining = Number(expires) * 1000 - Date.now();
  if (process.env.RAILWAY_ENVIRONMENT_ID !== '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2'
      || !/^[a-z0-9.-]+$/.test(host) || !Number.isFinite(remaining) || remaining < (observe + 90) * 1000 || remaining > 1800000) {
    throw Error('invalid staging scope or lifetime');
  }
  let child;
  const deadline = setTimeout(() => { child?.kill('SIGKILL'); process.exit(1); }, (observe + 90) * 1000);
  const directory = await mkdtemp(join(tmpdir(), 'carberk-reverse-'));
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  try {
    emit({ kind: 'vantage', serviceId: process.env.RAILWAY_SERVICE_ID, deploymentId: process.env.RAILWAY_DEPLOYMENT_ID,
      region: process.env.RAILWAY_REPLICA_REGION, apiContainer: false, lifetimeSeconds: observe + 90 });
    for (let sample = 1; sample <= 5; sample++) await health(host, 443, agent, sample);
    await health(host, 24443, agent, 1);
    const response = await fetch(artifact, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error('artifact unavailable');
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) throw Error('artifact size');
      chunks.push(chunk);
    }
    const compressed = Buffer.concat(chunks);
    if (sha256(compressed) !== checksum) throw Error('artifact checksum');
    const binary = join(directory, 'chisel');
    await writeFile(binary, gunzipSync(compressed, { maxOutputLength: 32 * 1024 * 1024 }), { mode: 0o700 });
    // AUTH stays in the private environment, never process arguments or log output.
    child = spawn(binary, ['client', '--fingerprint', fingerprint, '--keepalive', '10s',
      '--max-retry-interval', '5s', `https://${host}:24443`, ...remotes],
      { env: { ...process.env, AUTH: auth, HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', NO_PROXY: '*', http_proxy: '', https_proxy: '', all_proxy: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    let connected = false;
    const capture = b => {
      log = (log + b.toString()).slice(-8192);
      connected ||= /Connected/.test(log);
    };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    const exited = new Promise(resolve => {
      child.once('exit', () => resolve());
      child.once('error', () => resolve());
    });
    let timer;
    await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, observe * 1000); })]);
    clearTimeout(timer);
    emit({ kind: 'authenticated-tunnel', connectedDuringObservation: connected, stillRunning: child.exitCode === null,
      observationSeconds: observe, adoptionProven: false });
    if (!connected) process.exitCode = 1;
    child.kill('SIGTERM');
    let killTimer;
    await Promise.race([exited, new Promise(resolve => { killTimer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 1000); })]);
    clearTimeout(killTimer);
    await exited;
    emit({ kind: 'cleanup', childStopped: true, rssBytes: process.memoryUsage().rss });
  } finally {
    child?.kill('SIGKILL');
    agent.destroy();
    await rm(directory, { recursive: true, force: true });
    clearTimeout(deadline);
  }
}
main().catch(() => { emit({ kind: 'error', ok: false, message: 'Bounded preflight failed; raw details suppressed' }); process.exitCode = 1; });
