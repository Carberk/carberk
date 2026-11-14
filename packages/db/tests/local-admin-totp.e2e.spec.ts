import { createCipheriv, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";

const execute = promisify(execFile);
const root = resolve(__dirname, "../../..");
const key = Buffer.alloc(32, 9).toString("base64");
const phone = "+99365000136";
const api = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ service: "api", environment: "test" }));
});
let container: StartedPostgreSqlContainer, pool: Pool, db: PrismaClient, directory: string, databaseUrl: string;
let args: string[], userId: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").withDatabase("local_totp_1236").start();
  databaseUrl = container.getConnectionUri();
  await execute("pnpm", ["--filter", "@auto-tm/db", "migrate:deploy"], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl } });
  pool = new Pool({ connectionString: databaseUrl });
  db = new PrismaClient({ adapter: new PrismaPg(pool) });
  directory = await mkdtemp("/tmp/carberk-totp-integration-");
  await new Promise<void>(done => api.listen(0, "127.0.0.1", done));
  const address = api.address();
  if (!address || typeof address === "string") throw new Error("Owned HTTP fixture unavailable");
  const port = address.port;
  const envFile = join(directory, "api.env");
  await writeFile(envFile, `APP_ENV=test\nNODE_ENV=test\nSMS_DRIVER=mock\nOTP_TEST_MODE=false\nOTP_TEST_CODE_RESPONSE=false\nPORT=${port}\nDATABASE_URL=${databaseUrl}\nTOTP_SECRET_ENCRYPTION_KEY=${key}\n`, { mode: 0o600 });
  args = ["totp", "--api", `http://127.0.0.1:${port}/api/v1`, "--admin", "http://127.0.0.1:4301", "--api-env", envFile, "--phone", phone];
  const iv = randomBytes(16), cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  const encrypted = Buffer.concat([cipher.update("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"), cipher.final()]);
  const user = await db.user.create({ data: { phone, phoneVerifiedAt: new Date(), role: "buyer", staffGrants: { create: { purpose: "vehicle_history" } },
    totpEnrollment: { create: { encryptedSecret: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64") } } } });
  userId = user.id;
});
afterAll(async () => {
  await new Promise<void>(done => api.close(() => done()));
  await db?.$disconnect(); await pool?.end(); await container?.stop({ removeVolumes: false });
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function invoke(extra: string[] = []) {
  try {
    const { stdout, stderr } = await execute(process.execPath, [join(root, "scripts/admin-access.mjs"), ...args, ...extra], { cwd: root, timeout: 20_000 });
    return { success: true, stdout, stderr };
  } catch { return { success: false, stdout: "", stderr: "suppressed" }; }
}

async function expectPrivateHandoff(extra: string[] = []) {
  const result = await invoke(extra);
  expect(result.success).toBe(true);
  const handoff = JSON.parse(result.stdout) as { codeFile: string; directory: string; expiresAt: string };
  try {
    const code = await readFile(handoff.codeFile, "utf8");
    expect(/^\d{6}$/.test(code)).toBe(true);
    expect(result.stdout.includes(code) || result.stderr.includes(code) || result.stdout.includes(key)).toBe(false);
    expect((await stat(handoff.codeFile)).mode & 0o777).toBe(0o600);
    expect((await stat(handoff.directory)).mode & 0o777).toBe(0o700);
    expect(Date.parse(handoff.expiresAt) > Date.now()).toBe(true);
  } finally { await rm(handoff.directory, { recursive: true, force: true }); }
}

it("the real wrapper and DB subprocess privately read pending and verified buyer enrollment without elevating or changing it", async () => {
  for (const verifiedAt of [null, new Date(0)]) {
    await db.totpEnrollment.update({ where: { userId }, data: { verifiedAt } });
    // Use the real clock, keeping the wrapper's normal minimum-validity guard.
    const remaining = 30_000 - Date.now() % 30_000;
    if (remaining < 10_000) await delay(remaining + 50);
    await expectPrivateHandoff(["--purpose", "vehicle-history"]);
    expect((await db.totpEnrollment.findUniqueOrThrow({ where: { userId } })).verifiedAt?.getTime() ?? null).toBe(verifiedAt?.getTime() ?? null);
    expect(await db.session.count()).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).role).toBe("buyer");
  }
});

it("the actual DB command refuses default buyer, missing/wrong/revoked/future grants and lifecycle failures", async () => {
  expect((await invoke()).success).toBe(false);
  for (const data of [
    { revokedAt: new Date() }, { revokedAt: null, grantedAt: new Date(Date.now() + 60_000) },
  ]) {
    await db.staffGrant.update({ where: { userId_purpose: { userId, purpose: "vehicle_history" } }, data });
    expect((await invoke(["--purpose", "vehicle-history"])).success).toBe(false);
  }
  await db.staffGrant.deleteMany({ where: { userId } });
  await db.user.update({ where: { id: userId }, data: { role: "admin" } });
  expect((await invoke(["--purpose", "vehicle-history"])).success).toBe(false);
  await db.staffGrant.create({ data: { userId, purpose: "vehicle_history_payment_evidence" } });
  expect((await invoke(["--purpose", "vehicle-history"])).success).toBe(false);
  await db.staffGrant.create({ data: { userId, purpose: "vehicle_history" } });
  for (const field of ["suspendedAt", "deletionScheduledAt"] as const) {
    await db.user.update({ where: { id: userId }, data: { [field]: new Date() } });
    expect((await invoke(["--purpose", "vehicle-history"])).success).toBe(false);
    await db.user.update({ where: { id: userId }, data: { [field]: null } });
  }
  const remaining = 30_000 - Date.now() % 30_000;
  if (remaining < 10_000) await delay(remaining + 50);
  await expectPrivateHandoff(); // Ordinary marketplace Admin still uses the omitted-purpose path.
});

it("the direct DB entrypoint rejects malformed purpose arguments without connecting or exposing diagnostics", async () => {
  for (const flags of [["--purpose", "unknown"], ["--purpose"], ["--purpose", "vehicle-history", "--purpose", "legacyAdmin"]]) {
    const result = await execute("pnpm", ["-s", "--filter", "@auto-tm/db", "admin:totp", "--phone", phone, ...flags], {
      cwd: root, env: { ...process.env, DATABASE_URL: "postgresql://private:private@127.0.0.1:1/absent", TOTP_SECRET_ENCRYPTION_KEY: key },
    }).then(() => false, error => !String(error.stderr).includes(key) && !String(error.stderr).includes("private@") &&
      (flags.length === 1 ? String(error.stderr).includes("raw diagnostics suppressed") : String(error.stderr).includes("Refusing:")));
    expect(result).toBe(true);
  }
  expect(await readdir(directory)).toEqual(["api.env"]);
});
