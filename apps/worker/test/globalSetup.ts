import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { PrismaService } from "@auto-tm/db";
import type { TestProject } from "vitest/node";

import { withDatabase, workerDatabaseName, type WorkerTestDatabases } from "./databases";

const run = promisify(execFile);
const dbPackageDir = resolve(__dirname, "../../../packages/db");
async function admin<T>(url: string, work: (db: PrismaService) => Promise<T>): Promise<T> {
 const previous = process.env["DATABASE_URL"]; process.env["DATABASE_URL"] = url;
 const db = new PrismaService();
 if (previous === undefined) delete process.env["DATABASE_URL"]; else process.env["DATABASE_URL"] = previous;
 try { return await work(db); } finally { await db.onModuleDestroy(); }
}
/** Global lifecycle jobs must see only their worker's fixtures. Never flush or
 * reassign Redis: API checks can run concurrently on the same disposable host. */
export default async function setup({ config, provide }: TestProject) {
 const baseDatabaseUrl = process.env["DATABASE_URL"];
 if (process.env["AUTO_TM_TEST_DATABASES"] === "off" || !baseDatabaseUrl || process.env["GITHUB_ACTIONS"] !== "true") { provide("workerTestDatabases", undefined); return; }
 if (!/^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):\d+\//.test(baseDatabaseUrl)) throw new Error("Worker database isolation requires hosted disposable PostgreSQL");
 const workers = config.maxWorkers;
 if (workers > 4) throw new Error("Worker PostgreSQL fixtures support at most four concurrent workers");
 const prefix = `${decodeURIComponent(new URL(baseDatabaseUrl).pathname.slice(1))}_worker${randomBytes(3).toString("hex")}`;
 if (!/^[a-z0-9_]+$/.test(prefix) || prefix.length + "_template".length > 63) throw new Error("Unsafe or oversized worker fixture database name");
 const template = `${prefix}_template`, names = Array.from({ length: workers }, (_, index) => workerDatabaseName(prefix, index + 1));
 const drop = () => admin(baseDatabaseUrl, async db => {
  for (const name of [...names, template]) await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
 });
 try {
  await admin(baseDatabaseUrl, db => db.$executeRawUnsafe(`CREATE DATABASE "${template}"`));
  await run(resolve(dbPackageDir, "node_modules/.bin/prisma"), ["migrate", "deploy"], { cwd: dbPackageDir, env: { ...process.env, DATABASE_URL: withDatabase(baseDatabaseUrl, template) } });
  await admin(baseDatabaseUrl, async db => { for (const name of names) await db.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "${template}"`); });
 } catch (error) { await drop().catch(() => undefined); throw new Error("Could not isolate hosted worker test databases", { cause: error }); }
 provide("workerTestDatabases", { baseDatabaseUrl, prefix, workers } satisfies WorkerTestDatabases);
 return drop;
}
