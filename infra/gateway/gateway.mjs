import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { Duplex, PassThrough } from 'node:stream';
import { timingSafeEqual } from 'node:crypto';

const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const hopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'expect'];
const allowedPath = value => value.startsWith('/api/v1/') || ['/healthz', '/readyz'].includes(value.split('?')[0]);

function headersFor(headers) {
  const denied = new Set([...hopHeaders, ...(headers.connection ?? '').toLowerCase().split(',').map(s => s.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !denied.has(name)
    && !/^(forwarded$|x-forwarded-|x-real-ip$|x-carberk-|x-railway-|cf-|true-client-ip$|x-client-ip$|refresh$)/i.test(name)));
}

/** One fixed API origin, reached only through an explicit loopback CONNECT proxy. */
export function createGateway({ origin, proxy, hostname, accessKey, ca, log = () => {}, now = Date.now,
  deadlineMs = 30_000, connectMs = 6_000, maxBodyBytes = 16 * 1024 * 1024, maxConcurrent = 16 }) {
  const upstream = new URL(origin);
  const relay = new URL(proxy);
  if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash
      || relay.protocol !== 'http:' || relay.hostname !== '127.0.0.1' || relay.username || relay.password
      || !/^[a-z0-9.-]+$/.test(hostname) || typeof accessKey !== 'string' || accessKey.length < 32) throw Error('Invalid gateway configuration');
  const expectedKey = Buffer.from(accessKey);
  const agent = new https.Agent({ keepAlive: true, maxSockets: 8, maxTotalSockets: 8, maxFreeSockets: 4, timeout: 15_000 });
  const pendingConnections = new WeakMap();
  agent.createConnection = () => {
    // Count the TLS socket immediately, but do not dial until Node assigns it
    // to a live request. Cancelled queued requests never start a transport.
    let peer;
    let tunnel;
    let timer;
    const outgoing = new PassThrough({ highWaterMark: 64 * 1024 });
    const stream = new Duplex({
      highWaterMark: 64 * 1024,
      read() { peer?.resume(); },
      write(chunk, encoding, callback) { outgoing.write(chunk, encoding, callback); },
      final(callback) { outgoing.end(callback); },
      destroy(error, callback) { outgoing.destroy(); peer?.destroy(); callback(error); },
    });
    const secure = tls.connect({ socket: stream, servername: upstream.hostname,
      rejectUnauthorized: true, ...(ca ? { ca } : {}) });
    secure.once('secureConnect', () => clearTimeout(timer));
    secure.once('close', () => {
      clearTimeout(timer); pendingConnections.delete(secure);
      tunnel?.destroy(); peer?.destroy(); stream.destroy();
    });
    for (const part of [stream, outgoing]) part.on('error', error => secure.destroy(error));
    pendingConnections.set(secure, () => {
      pendingConnections.delete(secure);
      if (secure.destroyed) return;
      timer = setTimeout(() => secure.destroy(Error('Connect deadline')), connectMs);
      tunnel = http.request({ hostname: relay.hostname, port: relay.port || 80, method: 'CONNECT',
        path: `${upstream.hostname}:${upstream.port || 443}`, headers: { host: upstream.host }, agent: false });
      tunnel.once('error', error => secure.destroy(error));
      tunnel.once('connect', (response, socket, head) => {
        peer = socket;
        peer.once('error', error => secure.destroy(error));
        peer.once('close', () => secure.destroy());
        if (secure.destroyed || response.statusCode !== 200 || head.length) {
          peer.destroy(); secure.destroy(Error('Tunnel refused')); return;
        }
        peer.on('data', chunk => { if (!stream.push(chunk)) peer.pause(); });
        peer.once('end', () => stream.push(null));
        outgoing.pipe(peer);
      });
      tunnel.end();
    });
    return secure;
  };
  let active = 0;
  const server = http.createServer({ maxHeaderSize: 16 * 1024, highWaterMark: 64 * 1024 }, (req, res) => {
    const started = now();
    let counted = false;
    let outbound;
    let responseStream;
    let outboundClosed = false;
    let outcome = 'response';
    let done = false;
    const release = () => {
      if (counted && done && (!outbound || outboundClosed)) { active--; counted = false; }
    };
    const timer = setTimeout(() => fail(504, 'deadline'), deadlineMs);
    const finish = () => {
      if (done) return;
      done = true; clearTimeout(timer);
      release();
      if (!req.complete) { req.unpipe(); req.pause(); outbound?.destroy(); }
      if (!res.writableFinished) { outbound?.destroy(); responseStream?.destroy(); }
      log({ method: methods.has(req.method) ? req.method : 'OTHER', status: res.headersSent ? res.statusCode : 0,
        outcome: res.writableFinished ? outcome : 'interrupted', durationMs: Math.max(0, now() - started) });
    };
    res.once('close', finish);
    function fail(status, reason) {
      if (done || res.writableEnded) return;
      outcome = reason;
      req.unpipe(); req.pause();
      outbound?.destroy(); responseStream?.destroy();
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', connection: 'close' });
      res.end(JSON.stringify({ error: reason }));
    }
    if (req.headers.host !== hostname || !methods.has(req.method) || !req.url.startsWith('/') || req.url.startsWith('//')
        || req.url.includes('\\') || !allowedPath(req.url)) { fail(400, 'invalid_target'); return; }
    const supplied = Buffer.from(req.headers['x-carberk-gateway-key'] ?? '');
    if (supplied.length !== expectedKey.length || !timingSafeEqual(supplied, expectedKey)) { fail(403, 'gateway_access_denied'); return; }
    if (Number(req.headers['content-length'] ?? 0) > maxBodyBytes) { fail(413, 'body_limit'); return; }
    if (active >= maxConcurrent) { fail(503, 'capacity'); return; }
    active++; counted = true;
    const headers = headersFor(req.headers);
    headers.host = upstream.host;
    // Rebuild framing from the parsed message after hop-by-hop filtering. Node
    // otherwise omits chunked bodies for methods such as DELETE/GET/OPTIONS.
    if (req.headers['content-length'] !== undefined) headers['content-length'] = req.headers['content-length'];
    else if (req.headers['transfer-encoding']) headers['transfer-encoding'] = req.headers['transfer-encoding'];
    outbound = https.request({ hostname: upstream.hostname, port: upstream.port || 443, method: req.method,
      path: req.url, headers, agent }, originResponse => {
      responseStream = originResponse;
      const responseHeaders = headersFor(originResponse.headers);
      const location = responseHeaders.location;
      if (location !== undefined) {
        try {
          const target = new URL(location, upstream.origin + req.url);
          if (target.origin !== upstream.origin || target.username || target.password || !allowedPath(target.pathname)) throw Error('Unapproved redirect');
          responseHeaders.location = target.pathname + target.search + target.hash;
        } catch { fail(502, 'redirect_refused'); return; }
      }
      if (done || res.writableEnded) { originResponse.destroy(); return; }
      // A final early response must not retain an unfinished upload/client slot.
      if (!req.complete) responseHeaders.connection = 'close';
      res.writeHead(originResponse.statusCode, responseHeaders);
      originResponse.once('aborted', () => fail(502, 'upstream_interrupted'));
      originResponse.once('error', () => fail(502, 'upstream_interrupted'));
      originResponse.pipe(res);
    });
    outbound.once('socket', socket => pendingConnections.get(socket)?.());
    outbound.once('error', () => fail(502, 'upstream_unavailable'));
    outbound.once('close', () => { outboundClosed = true; release(); });
    let bytes = 0;
    req.on('data', chunk => { bytes += chunk.length; if (bytes > maxBodyBytes) fail(413, 'body_limit'); });
    req.once('aborted', () => { outbound.destroy(); res.destroy(); });
    req.once('error', () => { outbound.destroy(); res.destroy(); });
    req.pipe(outbound);
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 64;
  server.on('connect', (_req, socket) => socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
  server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
  server.once('close', () => agent.destroy());
  return server;
}
