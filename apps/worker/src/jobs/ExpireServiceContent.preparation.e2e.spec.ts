import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { PrismaService, type Prisma } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ExpireServiceContent } from "./ExpireServiceContent";

// Explicit opt-in. This suite creates and destroys ONLY its own disposable server.
// It never consumes a supplied DATABASE_URL or shared/staging database.
describe.skipIf(process.env["R6C_EXPIRY_DISPOSABLE"] !== "1")("ordinary expiry preparation on disposable PostgreSQL", () => {
 const name = `r6c-expiry-${randomUUID()}`;
 const now = new Date("2026-10-25T08:00:00Z");
 let db: PrismaService;
 let started = false;
 const priorUrl = process.env["DATABASE_URL"];
 beforeAll(async () => {
  execFileSync("docker", ["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=expiry", "-e", "POSTGRES_DB=expiry", "-p", "127.0.0.1::5432", "postgres:17-alpine"], { stdio: "pipe" });
  started = true;
  const binding = execFileSync("docker", ["port", name, "5432/tcp"], { encoding: "utf8" }).trim();
  for (let attempt = 0; attempt < 80; attempt++) {
   try { execFileSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], { stdio: "pipe" }); break; }
   catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const url = `postgresql://postgres:expiry@${binding}/expiry`;
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: resolve(__dirname, "../../../../packages/db"), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  process.env["DATABASE_URL"] = url;
  db = new PrismaService(); await db.$connect();
 }, 60000);
 afterAll(async () => {
  if (db) await db.onModuleDestroy();
  if (started) execFileSync("docker", ["stop", name], { stdio: "pipe" });
  if (priorUrl === undefined) delete process.env["DATABASE_URL"]; else process.env["DATABASE_URL"] = priorUrl;
 });
 it("refuses a stale selected History cleanup epoch before deleting bytes or scrubbing metadata", async () => {
  const id = randomUUID(), sha256 = "a".repeat(64), objectKey = `history-artifacts/${id}/${sha256}`;
  await db.historyArtifact.create({ data: { id, provider: "carfax", originalDate: now, vin: "1HGCM82633A004352", objectKey, sha256, sizeBytes: 10, expectedPages: 1, state: "restricted", restrictedAt: now, rights: {} } });
  await db.historyArtifactCleanup.create({ data: { artifactId: id, objectKey, sha256, epoch: 1 } });
  const selected = db.historyArtifactCleanup.findMany.bind(db.historyArtifactCleanup);
  const instrumented = new Proxy(db, { get(target, property) {
   if (property === "historyArtifactCleanup") return new Proxy(target.historyArtifactCleanup, { get(delegate, key) {
    if (key === "findMany") return async (args: Prisma.HistoryArtifactCleanupFindManyArgs) => {
     const rows = await selected(args);
     await db.historyArtifactCleanup.update({ where: { artifactId: id }, data: { epoch: 2 } });
     return rows;
    };
    return Reflect.get(delegate, key);
   } });
   return Reflect.get(target, property);
  } });
  const artifact = await db.historyArtifact.findUniqueOrThrow({ where: { id } });
  const deleted: string[][] = [];
  await new ExpireServiceContent(instrumented, { deleteAndVerify: async keys => { deleted.push(keys); } }).execute(now);
  expect(deleted).toEqual([]);
  expect(await db.historyArtifact.findUniqueOrThrow({ where: { id } })).toEqual(artifact);
  expect(await db.historyArtifactCleanup.findUniqueOrThrow({ where: { artifactId: id } })).toMatchObject({ epoch: 2, completedAt: null });
 });
});
