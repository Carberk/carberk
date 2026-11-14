import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { origins } from './reverse-connector.mjs';

/** Isolate API from bulk media queues; supervise one immutable connection per fixed origin. */
export async function runClient(env = process.env, binary = '/app/chisel') {
  if (env.RAILWAY_ENVIRONMENT_ID !== '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2'
      || !/^[a-z0-9.-]+$/.test(env.GATEWAY_HOST ?? '') || !env.TUNNEL_AUTH
      || !/^[A-Za-z0-9+/]{43}=$/.test(env.TUNNEL_FINGERPRINT ?? '')) throw Error('Invalid staging connector configuration');
  const children = origins.map((origin, i) => {
    const child = spawn(binary, ['client', '--fingerprint', env.TUNNEL_FINGERPRINT, '--keepalive', '10s',
      '--min-retry-interval', '1s', '--max-retry-interval', '5s', `https://${env.GATEWAY_HOST}:24443`,
      `R:127.0.0.1:${11901 + i}:${origin}:443`],
    { env: { PATH: env.PATH, AUTH: env.TUNNEL_AUTH, CHISEL_PING_TIMEOUT: '10s',
      HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', NO_PROXY: '*' }, stdio: ['ignore', 'pipe', 'pipe'] });
    // Raw diagnostics can contain endpoints/credentials. Each stream buffer is bounded.
    let pending = '';
    const capture = chunk => {
      pending = (pending + chunk).slice(-8192);
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end); pending = pending.slice(end + 1);
        const event = /Connected/.test(line) ? 'tunnel_authenticated' : /Retrying/.test(line) ? 'tunnel_retry' : null;
        if (event) console.log(JSON.stringify({ event, target: ['api', 'photo', 'video'][i],
          deploymentId: env.RAILWAY_DEPLOYMENT_ID ?? 'local' }));
      }
    };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    return child;
  });
  const closed = children.map(child => new Promise(resolve => {
    child.once('error', () => {}); // close also follows a spawn error; suppress raw details.
    child.once('close', resolve);
  }));
  let stopping = false;
  let killTimer;
  const stop = () => {
    stopping = true;
    for (const child of children) child.kill('SIGTERM');
    killTimer ??= setTimeout(() => { for (const child of children) child.kill('SIGKILL'); }, 1000);
  };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {
    await Promise.race(closed);
    if (!stopping) throw Error('Connector exited unexpectedly');
  } finally {
    stop();
    await Promise.all(closed);
    clearTimeout(killTimer);
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runClient().catch(() => { console.error('{"event":"connector_failed"}'); process.exitCode = 1; });
}
