import { randomUUID } from "node:crypto";

import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaMeasurementRetentionLedger } from "./PrismaMeasurementRetentionLedger";
import { ExpireMeasurement } from "./ExpireMeasurement";
import { retentionStore } from "./application/testing/MeasurementRetentionPostgresFixture";
const databaseUrl = process.env["DATABASE_URL"] ?? "";
const hosted = process.env["GITHUB_ACTIONS"] === "true" && /^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):\d+\//.test(databaseUrl);
const now = new Date("2000-01-02T00:00:00Z");
describe.skipIf(!hosted)("measurement expiry on disposable PostgreSQL", () => {
 let prisma: PrismaService; const user = randomUUID(), principal = randomUUID(), visit = randomUUID(), old = randomUUID(), fresh = randomUUID(), outbox = randomUUID(), rollup=randomUUID(), artifact=randomUUID(), freshRollup=randomUUID();
 beforeAll(async () => {
  prisma = new PrismaService();
  // Use the production initializer; ordinary bootstrap does not invent a collector.
  await (await retentionStore(prisma, principal, now)).rotateRestoreEpoch(principal);
  await prisma.user.create({ data: { id: user } });
  await prisma.measurementPrincipal.create({ data: { id: principal, pseudonym: "f".repeat(64), generation: randomUUID(), epoch: randomUUID(), kind: "account", userId: user } });
  await prisma.measurementVisit.create({ data: { id: visit, principalId: principal, startedAt: now, foregroundAt: now } });
  await prisma.measurementRecord.createMany({ data: [old, fresh].map((id) => ({ id, principalId: principal, visitId: visit, event: {}, origin: "client", environment: "test", population: "synthetic", occurredAt: now, receivedAt: now, expiresAt: id === old ? now : new Date("2000-01-03T00:00:00Z") })) });
  await prisma.measurementOutbox.create({ data: { id: outbox, principalId: principal, generation: "original", epoch: "original", environment: "test", population: "synthetic", event: {}, expiresAt: now } });
  await prisma.measurementRollup.createMany({data:[rollup,freshRollup].map(key=>({key,version:1,epoch:"retention-test",environment:"test",population:"synthetic",windowFrom:now,windowTo:now,completeThrough:now,inputDigest:"synthetic",metrics:{},generatedAt:now,expiresAt:key===rollup?now:new Date("2000-01-03T00:00:00Z")}))});
  await prisma.measurementInvestigationExport.create({data:{id:artifact,actorId:user,sessionId:"synthetic",epoch:"retention-test",reason:"Synthetic retention fixture",auditId:"synthetic",scope:{},evidence:{},expiresAt:now}});
 });
 afterAll(async () => { if (prisma) { await prisma.measurementRollup.deleteMany({where:{key:{in:[rollup,freshRollup]}}}); await prisma.measurementInvestigationExport.deleteMany({where:{id:artifact}}); await prisma.user.deleteMany({ where: { id: user } }); await prisma.measurementState.deleteMany({where:{key:"collector",epoch:principal}}); await prisma.onModuleDestroy(); } });
 it("erases exact-boundary raw/outbox only and preserves fresh facts and core user", async () => {
  const worker = new ExpireMeasurement(new PrismaMeasurementRetentionLedger(prisma));
  const result = await worker.execute(now, { batchSize: 1 }); expect(result.deleted).toBe(4); expect(result.oldestOverdueAt).toBeNull();
  expect(await prisma.measurementRecord.findUnique({ where: { id: old } })).toBeNull();
  expect(await prisma.measurementOutbox.findUnique({ where: { id: outbox } })).toBeNull();
  expect(await prisma.measurementRecord.findUnique({ where: { id: fresh } })).not.toBeNull();
  expect(await prisma.user.findUnique({ where: { id: user } })).not.toBeNull();
  expect(await prisma.measurementRollup.findUnique({where:{key:rollup}})).toBeNull();
  expect(await prisma.measurementInvestigationExport.findUnique({where:{id:artifact}})).toBeNull();
  expect(await prisma.measurementRollup.findUnique({where:{key:freshRollup}})).not.toBeNull();
  expect((await worker.execute(now)).deleted).toBe(0);
 });
});
