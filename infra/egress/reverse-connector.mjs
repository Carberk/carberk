import http from 'node:http';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

export const origins = Object.freeze(['api-staging-2861.up.railway.app', 'minio-staging-5795.up.railway.app', 't3.storageapi.dev']);

/** Fixed CONNECT seam for consumers; only Railway-owned loopback reverse listeners are dialed. */
export function createReverseConnector({ ports = [11901, 11902, 11903], connectMs = 6000, idleMs = 30000,
  maxConnections = 32 } = {}) {
  if (ports.length !== 3 || ports.some(p => !Number.isInteger(p) || p < 1 || p > 65535)) throw Error('Invalid reverse listeners');
  const peers = new Set();
  let active = 0;
  const server = http.createServer({ maxHeaderSize: 8192 }, (_req, res) => {
    res.writeHead(405, { connection: 'close' }); res.end();
  });
  server.on('connection', socket => { peers.add(socket); socket.once('close', () => peers.delete(socket)); });
  server.on('connect', (req, socket, head) => {
    const index = origins.findIndex(host => req.url === `${host}:443`);
    const deny = status => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    if (index < 0 || head.length) { deny('403 Forbidden'); return; }
    if (active >= maxConnections) { deny('503 Service Unavailable'); return; }
    active++;
    let established = false;
    const peer = net.connect({ host: '127.0.0.1', port: ports[index] });
    peers.add(peer);
    const timer = setTimeout(() => peer.destroy(), connectMs);
    peer.once('close', () => { clearTimeout(timer); peers.delete(peer); active--; socket.destroy(); });
    peer.on('error', () => { if (!established) deny('502 Bad Gateway'); else socket.destroy(); });
    socket.on('error', () => peer.destroy());
    socket.once('close', () => peer.destroy());
    peer.once('connect', () => {
      clearTimeout(timer);
      if (socket.destroyed) { peer.destroy(); return; }
      established = true;
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      socket.setTimeout(idleMs, () => socket.destroy());
      peer.setTimeout(idleMs, () => peer.destroy());
      socket.pipe(peer); peer.pipe(socket);
    });
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 10000;
  server.maxConnections = maxConnections + 8;
  // CONNECT sockets are detached from HTTP's closeAllConnections accounting.
  server.stop = () => { for (const peer of peers) peer.destroy(); server.close(); };
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createReverseConnector();
  server.on('error', () => { console.error('{"event":"reverse_connector_failed"}'); process.exitCode = 1; });
  server.listen(11819, '127.0.0.1');
  process.once('SIGTERM', () => server.stop());
  process.once('SIGINT', () => server.stop());
}
