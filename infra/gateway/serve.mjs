import { readFile } from 'node:fs/promises';
import { createGateway } from './gateway.mjs';
import { observeGateway } from './monitor-metrics.mjs';

try {
  const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const transport = config.transport ?? 'relay';
  const proxy = { relay: 'http://127.0.0.1:11809', reverse: 'http://127.0.0.1:11819' }[transport];
  if (config.origin !== 'https://api-staging-2861.up.railway.app'
      || !proxy || config.proxy !== proxy) throw Error('Unexpected destination');
  const server = createGateway({ origin: config.origin, photoOrigin: 'https://minio-staging-5795.up.railway.app', videoOrigin: 'https://t3.storageapi.dev', proxy: config.proxy, hostname: config.hostname,
    accessKey: config.accessKey, signing: config.signing, log: row => console.log(JSON.stringify(row)) });
  server.on('error', () => { console.error('{"event":"gateway_start_failed"}'); process.exitCode = 1; });
  if (process.argv[3] === '--check') { server.close(); console.log('{"configuration_valid":true}'); }
  else {
    const monitor = observeGateway(server);
    const metrics = setInterval(() => console.log(JSON.stringify(monitor.snapshot())), 15_000).unref();
    server.once('close', () => { clearInterval(metrics); monitor.close(); });
    server.listen(11880, '127.0.0.1', () => console.log('{"event":"gateway_listening"}'));
    const stop = () => { server.close(); setTimeout(() => server.closeAllConnections(), 5_000).unref(); };
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
  }
} catch {
  console.error('{"event":"invalid_gateway_configuration"}');
  process.exitCode = 1;
}
