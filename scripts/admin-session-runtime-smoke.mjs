/** Run after `pnpm --filter @auto-tm/admin build`. Local loopback only; no deployment. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(root, "apps/admin/.next/standalone/apps/admin/server.js");
const routes = JSON.parse(await readFile(resolve(root, "apps/admin/.next/server/app-paths-manifest.json"), "utf8"));
assert(routes["/page"] && !routes["/(admin)/page"], "only src/app/page.tsx must serve the root");
const manifest = JSON.parse(await readFile(resolve(root, "apps/admin/.next/server/server-reference-manifest.json"), "utf8"));
const actionId = Object.entries(manifest.node).find(([, value]) => value.exportedName === "dismissReport")?.[0];
assert(actionId, "built dismissReport Server Action must exist");
const jwt = (exp) => `e30.${Buffer.from(JSON.stringify({ exp, jti: randomBytes(8).toString("hex") })).toString("base64url")}.test-signature`;
const expired = jwt(1);
const sessions = new Map();
let rotations = 0;
let mutations = 0;
const bearerCalls = [];
let statusUnavailable = false;
function session(failure) {
  const old = randomBytes(32).toString("hex");
  const pair = { accessToken: jwt(Math.floor(Date.now() / 1000) + 900), refreshToken: randomBytes(32).toString("hex") };
  sessions.set(old, { pair, used: false, failure });
  return { old, pair };
}
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.url === "/api/v1/auth/refresh" && req.method === "POST") {
    const record = sessions.get(JSON.parse(body).refreshToken);
    rotations++;
    await delay(75); // Force overlapping GET/POST requests to share an owner.
    if (!record || record.used) { res.writeHead(401); res.end(JSON.stringify({ code: "TOKEN_ALREADY_USED" })); return; }
    if (record.failure === "network") { res.destroy(); return; }
    if (record.failure === "malformed") { res.end("{}"); return; }
    if (record.failure) { res.writeHead(record.failure); res.end("{}"); return; }
    record.used = true;
    res.end(JSON.stringify(record.pair));
    return;
  }
  bearerCalls.push(req.headers.authorization);
  const authorized = [...sessions.values()].some(({ pair, used }) => used && req.headers.authorization === `Bearer ${pair.accessToken}`);
  if (!authorized) { res.writeHead(401); res.end(JSON.stringify({ code: "UNAUTHORIZED" })); return; }
  if (["/api/v1/auth/admin/totp/status", "/api/v1/auth/staff/totp/status"].includes(req.url)) {
    if (statusUnavailable) { res.writeHead(503); res.end("{}"); return; }
    res.end(JSON.stringify({ enrolled: true, elevated: true }));
  } else if (req.url === "/api/v1/staff/capabilities") {
    res.end(JSON.stringify({ capabilities: [], elevated: true }));
  } else if (req.url === "/api/v1/admin/config") {
    res.end(JSON.stringify({ adminModerationActionsEnabled: true }));
  } else if (req.url === "/api/v1/admin/reports/r1/dismiss" && req.method === "POST") {
    assert(JSON.parse(body).reason === "Runtime renewal proof", "original action arguments must reach mutation");
    mutations++;
    res.end(JSON.stringify({ reportId: "r1", status: "dismissed", reviewedAt: new Date().toISOString(), auditLogId: "runtime-proof" }));
  } else if (req.url?.startsWith("/api/v1/admin/reports?")) {
    res.end(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }));
  } else {
    res.writeHead(404); res.end(JSON.stringify({ code: "NOT_FOUND" }));
  }
});
await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
const apiUrl = `http://127.0.0.1:${api.address().port}`;
async function port() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const value = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return value;
}
function start(listenPort, address) {
  const env = { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(listenPort) };
  delete env.NEXT_PHASE;
  delete env.API_BASE_URL;
  env.ADMIN_ORIGIN = `http://127.0.0.1:${listenPort}`;
  if (address !== undefined) env.API_BASE_URL = address;
  const child = spawn(process.execPath, [entry], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  return { child, logs: () => logs };
}
async function stop(child) {
  if (child.exitCode !== null) return;
  const closed = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await closed;
}
const listenPort = await port();
const origin = `http://127.0.0.1:${listenPort}`;
const running = start(listenPort, apiUrl);
const cookie = (old) => `__Host-auto_tm_admin_access=${expired}; __Host-auto_tm_admin_refresh=${old}`;
const request = (old, action = false) => fetch(`${origin}${action ? "/reports/r1" : "/reports"}`, {
  method: action ? "POST" : "GET", redirect: "manual",
  headers: { cookie: cookie(old), ...(action ? { origin, "Next-Action": actionId, "Content-Type": "text/plain" } : {}) },
  ...(action ? { body: JSON.stringify(["r1", "Runtime renewal proof"]) } : {}),
});
function rotatedCookies(response, pair) {
  const cookies = response.headers.getSetCookie();
  for (const [name, value] of [["access", pair.accessToken], ["refresh", pair.refreshToken]]) {
    assert(cookies.some((cookie) => cookie.startsWith(`__Host-auto_tm_admin_${name}=${value};`) && /HttpOnly/i.test(cookie) && /Secure/i.test(cookie)), `rotated ${name} must persist as restricted browser cookie`);
  }
}
try {
  let healthy = false;
  for (let i = 0; i < 100; i++) {
    if (running.child.exitCode !== null) throw new Error("standalone exited before health readiness");
    try { healthy = (await fetch(`${origin}/healthz`)).ok; } catch { /* starting */ }
    if (healthy) break;
    await delay(100);
  }
  assert(healthy, "standalone must become healthy");
  const rootSession = session();
  const rootGet = await fetch(`${origin}/`, { redirect: "manual", headers: { cookie: cookie(rootSession.old) } });
  assert.equal(rootGet.status, 307, "root must renew then use its workspace redirect");
  assert(rootGet.headers.get("location")?.endsWith("/workspace"));
  rotatedCookies(rootGet, rootSession.pair);
  console.log("PASS root GET: sole root page redirects after renewal; both cookies persisted");

  for (const failure of [429, 503, "network", "malformed"]) {
    const temporary = session(failure);
    for (const action of [false, true]) {
      const unavailable = await request(temporary.old, action);
      assert.equal(unavailable.status, 503, "temporary renewal failure must be retryable, never login");
      assert.equal(unavailable.headers.getSetCookie().length, 0, "temporary failure must preserve both browser cookies");
      assert.equal(unavailable.headers.get("location"), null);
      assert((await unavailable.text()).includes("Временно недоступно. Попробуйте ещё раз."));
      assert.equal(mutations, 0, "unavailable action must never execute");
    }
    sessions.get(temporary.old).failure = undefined;
    const retry = await request(temporary.old);
    assert.equal(retry.status, 200, "retry with the unchanged old cookie must recover");
    rotatedCookies(retry, temporary.pair);
  }
  console.log("PASS transient GET/action: 429/503/network/malformed return Russian503, preserve cookies and recover on retry");

  const first = session();
  bearerCalls.length = 0;
  const firstBefore = rotations;
  const get = await request(first.old);
  assert.equal(get.status, 200, "expired GET must renew and render");
  rotatedCookies(get, first.pair);
  assert.equal(rotations, firstBefore + 1);
  assert(bearerCalls.length > 0 && bearerCalls.every((value) => value === `Bearer ${first.pair.accessToken}`), "GET rendering must read forwarded rotated access");
  console.log("PASS expired GET: cookies persisted; rendering uses renewed bearer");

  const currentCookie = `__Host-auto_tm_admin_access=${first.pair.accessToken}; __Host-auto_tm_admin_refresh=${first.pair.refreshToken}`;
  const crafted = await fetch(`${origin}/login?reason=session-expired&mode=totp`, { redirect: "manual", headers: { cookie: currentCookie } });
  assert.equal(crafted.status, 303);
  assert(crafted.headers.get("location")?.endsWith("/login?mode=totp"), "healthy TOTP must ignore a crafted expiry flag");
  assert.equal(crafted.headers.getSetCookie().length, 0);
  const renewable = session();
  const expiryLink = await fetch(`${origin}/login?reason=session-expired`, { redirect: "manual", headers: { cookie: cookie(renewable.old) } });
  assert.equal(expiryLink.status, 303);
  assert(expiryLink.headers.get("location")?.endsWith("/workspace"));
  rotatedCookies(expiryLink, renewable.pair);
  console.log("PASS expiry links: current TOTP cookies survive; renewable session rotates before workspace");

  statusUnavailable = true;
  const layoutOutage = await fetch(`${origin}/reports`, { redirect: "manual", headers: { cookie: currentCookie } });
  assert.equal(layoutOutage.status, 500, "layout API outage must surface an error, never redirect to expired login");
  assert.equal(layoutOutage.headers.get("location"), null);
  assert.equal(layoutOutage.headers.getSetCookie().length, 0);
  await layoutOutage.text();
  statusUnavailable = false;
  console.log("PASS layout outage: error response, no expired-login redirect or cookie clearing");

  const concurrent = session();
  bearerCalls.length = 0;
  const before = rotations;
  const [parallelGet, action] = await Promise.all([request(concurrent.old), request(concurrent.old, true)]);
  assert.equal(parallelGet.status, 200);
  assert.equal(action.status, 200, "expired Server Action must dispatch after renewal");
  assert((await action.text()).includes("runtime-proof"), "actual action result must reach Flight response");
  rotatedCookies(parallelGet, concurrent.pair);
  rotatedCookies(action, concurrent.pair);
  assert.equal(rotations, before + 1, "overlapping GET/POST must rotate exactly once");
  assert.equal(mutations, 1, "original action must execute exactly once");
  assert(bearerCalls.every((value) => value === `Bearer ${concurrent.pair.accessToken}`), "action and rendering must use renewed bearer");
  console.log("PASS concurrent GET/Server Action: one rotation; original mutation runs once");

  const handoff = await request(concurrent.old);
  assert.equal(handoff.status, 200);
  assert.equal(rotations, before + 1, "short handoff must not spend refresh again");
  await delay(5_100);
  const loser = await request(concurrent.old, true);
  // Next.js 16.3+ answers a client-handled action redirect with 200 plus
  // x-action-redirect (vercel/next.js#96310); 16.2 sent 303 without Location.
  assert.equal(loser.status, 200, "client-handled action redirect must not look like an HTTP redirect");
  assert.equal(mutations, 1, "losing action must never execute or replay");
  const redirect = loser.headers.get("x-action-redirect");
  assert(redirect?.startsWith("/login?reason=session-expired") && redirect.endsWith(";push"), "Next action redirect must navigate its JavaScript client to login");
  assert(!loser.headers.has("location"), "action fetch must not follow a proxy redirect into unexpected HTML");
  assert(loser.headers.getSetCookie().filter((value) => /Max-Age=0/i.test(value)).length === 2, "loser must clear both cookies");
  const login = await fetch(new URL(redirect.split(";")[0], origin), { redirect: "manual" });
  assert.equal(login.status, 200, "login must not redirect-loop");
  // Login is statically prerendered with a client useSearchParams boundary.
  // Hydrated Russian copy is covered by the rendered login DOM tests.
  await login.text();
  console.log("PASS cache expiry/loser: action redirect to login, both cookies cleared, no mutation, login GET without loop");

  const ordinaryPost = await fetch(`${origin}/reports`, { method: "POST", redirect: "manual", headers: { cookie: cookie(concurrent.old), origin }, body: "original form" });
  assert.equal(ordinaryPost.status, 303);
  assert(ordinaryPost.headers.get("location")?.includes("/login?reason=session-expired"), "ordinary POST must follow with login GET");
  assert.equal(mutations, 1);
  console.log("PASS ordinary expired POST: canceled with 303 login GET");

  await stop(running.child);
  const restarted = start(listenPort, apiUrl);
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${origin}/healthz`)).ok) break; } catch { /* starting */ }
      await delay(100);
    }
    const restartLoser = await request(first.old, true);
    assert.equal(restartLoser.status, 200, "lost process-local handoff must fail closed after restart");
    assert(restartLoser.headers.get("x-action-redirect")?.startsWith("/login?reason=session-expired"), "restart loser must preserve native action navigation");
    assert.equal(mutations, 1);
    console.log("PASS restart loser: login; original action never runs");
  } finally { await stop(restarted.child); }

  for (const invalid of [undefined, "ftp://api.example.test", "not-a-url"]) {
    const bad = start(await port(), invalid);
    try {
      for (let i = 0; i < 100 && bad.child.exitCode === null; i++) await delay(50);
      assert.equal(bad.child.exitCode, 1, "invalid production API address must exit with status 1");
      assert(bad.logs().includes("API_BASE_URL"), "startup error must name API_BASE_URL");
    } finally { await stop(bad.child); }
  }
  console.log("PASS production startup: missing/non-http/invalid API_BASE_URL exits 1");
} finally {
  await stop(running.child);
  await new Promise((resolve) => api.close(resolve));
}
