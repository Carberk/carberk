/* global globalThis */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { log } from "node:console";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Exercise the runtime image's actual COPY layout, without building Docker.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const layout = await mkdtemp("/tmp/issue-739-admin-layout-");
const dockerfile = await readFile(path.join(repo, "infra/docker/admin.Dockerfile"), "utf8");
const runtime = dockerfile.split("FROM base AS runtime")[1];
assert.ok(runtime, "Admin runtime stage missing");
for (const copy of runtime.matchAll(/^COPY --from=build (\/app\/\S+) (\/app\S*)$/gm)) {
  const source = path.join(repo, copy[1].slice("/app/".length));
  const destination = path.join(layout, copy[2].slice("/app".length));
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}
// A fixture API lets the built server component render a real report request.
const api = createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  const body = ["/api/v1/auth/admin/totp/status", "/api/v1/auth/staff/totp/status"].includes(request.url)
    ? { elevated: true, enrolled: true }
    : request.url === "/api/v1/staff/capabilities"
      ? { elevated: true, capabilities: [] }
    : ["/api/v1/config", "/api/v1/admin/config"].includes(request.url)
      ? { adminModerationActionsEnabled: true }
      : {
          id: "r1", status: "pending", reason: "other", createdAt: "2026-10-07T12:00:00Z",
          reporter: { available: true, label: "Отправитель" },
          target: { targetType: "user", available: true, label: "Пользователь", targetId: "u1",
            role: "buyer", avatarKey: "pending/u1-photo/original.webp", avatarIndex: 3 },
          pendingReportsOnTargetCount: 1,
        };
  response.end(JSON.stringify(body));
});
api.listen(0, "127.0.0.1");
await once(api, "listening");
const apiPort = api.address().port;
const runtimeMediaOrigin = "https://runtime-media.example.test";
const port = 17492;
const server = spawn(process.execPath, [path.join(layout, "apps/admin/server.js")], {
  cwd: layout,
  env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1",
    API_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`,
    NEXT_PUBLIC_MINIO_PUBLIC_URL: runtimeMediaOrigin },
  stdio: "ignore",
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const health = await globalThis.fetch(`http://127.0.0.1:${port}/healthz`);
      if (health.ok) { ready = true; break; }
    } catch { /* server still starting */ }
    await delay(100);
  }
  assert.ok(ready, "Standalone server did not start");
  const avatar = await globalThis.fetch(`http://127.0.0.1:${port}/assigned-avatars/3.svg`);
  assert.equal(avatar.status, 200, "Assigned Avatar must be served by the Dockerfile runtime layout");
  assert.match(avatar.headers.get("content-type") ?? "", /image\/svg\+xml/);
  assert.match(await avatar.text(), /<svg/);
  // The expiry hint keeps this asset fixture on the authenticated GET path.
  // Only the fixture API accepts its dummy signature; production verifies it.
  const access = `e30.${Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 900,
  })).toString("base64url")}.fixture-signature`;
  const report = await globalThis.fetch(`http://127.0.0.1:${port}/reports/r1`, {
    headers: { cookie: `__Host-auto_tm_admin_access=${access}` },
    redirect: "manual",
  });
  assert.equal(report.status, 200);
  const html = await report.text();
  assert.ok(html.includes(`src="${runtimeMediaOrigin}/listing-photos/pending/u1-photo/thumbnail.webp?v=webp-natural-1"`),
    "Built report must use the admin service's runtime media origin, not its build-time value");
  log(`PASS standalone Dockerfile layout + runtime media origin: Assigned Avatar HTTP 200; layout=${layout}`);
} finally {
  const stopped = once(server, "exit");
  server.kill("SIGTERM");
  await stopped;
  api.close();
}
