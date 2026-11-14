import { freemem, totalmem, loadavg } from 'node:os';

// No target, identity, header, error string or body is retained in this observer.
export function observeGateway(server, { now = () => performance.now(), resources = () => ({
  rssBytes: process.memoryUsage().rss, hostFreeBytes: freemem(), hostTotalBytes: totalmem(),
  hostLoad1: loadavg()[0], cpuMicros: process.cpuUsage().user + process.cpuUsage().system,
}), stallMs = 10_000 } = {}) {
  const routes = Object.fromEntries(['api', 'photo', 'video', 'other'].map(route => [route, {
    active: 0, completed: 0, failures: 0, denied: 0, interrupted: 0,
    stalls: 0, durationMs: 0, maxDurationMs: 0,
  }]));
  const pending = new Set();
  const sockets = new Set();
  const upgraded = new Set();
  let connections = 0;
  let upgrades = 0;
  function connection(socket) {
    connections++; sockets.add(socket);
    socket.once('close', () => { sockets.delete(socket); upgraded.delete(socket); });
  }
  function upgrade(_req, socket) { upgrades++; upgraded.add(socket); }
  function request(req, res) {
    const route = req.url.startsWith('/photos/') ? 'photo'
      : req.url.startsWith('/api/v1/') || /^\/(healthz|readyz)(\?|$)/.test(req.url) ? 'api' : 'other';
    const row = routes[route];
    const start = now();
    const state = { row, lastProgress: start, stalled: false };
    row.active++; pending.add(state);
    const progress = () => { state.lastProgress = now(); state.stalled = false; };
    // Observe flow without reading, storing, wrapping or buffering any body.
    req.on('data', progress);
    let source;
    const pipe = stream => { source = stream; source.on('data', progress); };
    res.on('pipe', pipe);
    res.on('drain', progress);
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      const duration = Math.max(0, now() - start);
      row.active--; row.completed++; row.durationMs += duration;
      row.maxDurationMs = Math.max(row.maxDurationMs, duration);
      if (!res.writableFinished) row.interrupted++;
      if (!res.writableFinished || res.statusCode >= 500) row.failures++;
      if (res.statusCode >= 400 && res.statusCode < 500) row.denied++;
      pending.delete(state);
      req.off('data', progress); res.off('pipe', pipe); res.off('drain', progress);
      source?.off('data', progress);
    }
    res.once('finish', finish); res.once('close', finish);
  }
  server.prependListener('request', request);
  server.prependListener('connection', connection);
  server.prependListener('upgrade', upgrade);
  return {
    snapshot() {
      const stalled = new Map();
      for (const state of pending) {
        if (now() - state.lastProgress < stallMs) continue;
        if (!state.stalled) { state.row.stalls++; state.stalled = true; }
        stalled.set(state.row, (stalled.get(state.row) ?? 0) + 1);
      }
      return { event: 'gateway_metrics', routes: Object.fromEntries(Object.entries(routes).map(([route, row]) =>
        [route, { ...row, stalled: stalled.get(row) ?? 0 }])),
      sockets: { open: sockets.size, connections, upgrades, upgradedOpen: upgraded.size }, resources: resources() };
    },
    close() { server.off('request', request); server.off('connection', connection); server.off('upgrade', upgrade); },
  };
}
