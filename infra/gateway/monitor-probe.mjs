import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const routes = ['api', 'photo', 'video'];

export async function probeGateway(config, { fetchImpl = fetch, now = () => performance.now() } = {}) {
  const base = new URL(config.baseUrl);
  if (base.origin !== config.baseUrl || base.username || base.password
      || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)))
      || typeof config.accessKey !== 'string' || !config.accessKey.length) throw Error('Invalid monitor configuration');
  for (const route of routes) {
    const target = config.targets?.[route];
    if (!target && route !== 'api') continue;
    if (!target || typeof target.path !== 'string' || !target.path.startsWith('/') || target.path.startsWith('//')
        || /[\\#\r\n]/.test(target.path) || (route === 'api' ? target.path !== '/readyz' : !/^[a-f0-9]{64}$/.test(target.sha256 ?? '')))
      throw Error('Invalid monitor target');
  }
  return { event: 'gateway_probe', routes: await Promise.all(routes.map(async route => {
    const started = now();
    const target = config.targets[route];
    if (!target) return { route, healthy: false, reason: 'unconfigured', durationMs: 0 };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    let reason = 'unavailable';
    try {
      const response = await fetchImpl(base.origin + target.path, {
        redirect: 'manual', signal: controller.signal,
        headers: { 'x-carberk-gateway-key': config.accessKey,
          ...(target.range ? { range: target.range } : {}) },
      });
      if (response.status !== (target.range ? 206 : 200)) {
        await response.body?.cancel(); reason = 'http';
      } else {
        let bytes = 0;
        const hash = createHash('sha256');
        const chunks = [];
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > (route === 'api' ? 64 * 1024 : 1024 * 1024)) throw Error('Probe limit');
          if (route === 'api') chunks.push(chunk); else hash.update(chunk);
        }
        if (route === 'api') {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          reason = body.status === 'ready' && body.service === 'api' ? 'healthy' : 'integrity';
        } else reason = hash.digest('hex') === target.sha256 ? 'healthy' : 'integrity';
      }
    } catch { reason = controller.signal.aborted ? 'timeout' : 'unavailable'; }
    finally { clearTimeout(timeout); }
    return { route, healthy: reason === 'healthy', reason, durationMs: Math.max(0, now() - started) };
  })) };
}

export function createAlarm({ threshold = 2, emit = row => console.log(JSON.stringify(row)) } = {}) {
  const failures = new Map(routes.map(route => [route, 0]));
  return result => {
    for (const route of routes) {
      const healthy = result.routes.find(row => row.route === route)?.healthy === true;
      const previous = failures.get(route);
      const next = healthy ? 0 : Math.min(threshold, previous + 1);
      failures.set(route, next);
      if (previous < threshold && next === threshold) emit({ event: 'gateway_alarm', route, state: 'firing' });
      if (previous === threshold && healthy) emit({ event: 'gateway_alarm', route, state: 'recovered' });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const alarm = createAlarm();
    do {
      const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
      const result = await probeGateway(config);
      console.log(JSON.stringify(result)); alarm(result);
      if (process.argv.includes('--once')) { process.exitCode = result.routes.every(row => row.healthy) ? 0 : 1; break; }
      await new Promise(resolve => setTimeout(resolve, 15_000));
    } while (true);
  } catch { console.error('{"event":"gateway_monitor_failed"}'); process.exitCode = 1; }
}
