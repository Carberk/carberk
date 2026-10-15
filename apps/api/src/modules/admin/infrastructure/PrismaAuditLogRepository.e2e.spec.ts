import { PrismaService } from "@auto-tm/db";
import { AdminSchemas } from "@auto-tm/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanSuiteFixtures, defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { PrismaAuditLogRepository } from "./PrismaAuditLogRepository";
const suite = defineE2eSuite("staff-audit-isolation-900");
describe("marketplace audit query compatibility on disposable PostgreSQL", () => {
 let prisma: PrismaService;
 beforeAll(async () => { prisma = new PrismaService();await prisma.onModuleInit(); });
 afterAll(async () => { await cleanSuiteFixtures(prisma, suite, { userAliases: ["actor"] });await prisma.onModuleDestroy(); });
 beforeEach(async () => {
  await cleanSuiteFixtures(prisma, suite, { userAliases: ["actor"] });
  await prisma.user.create({ data: { id: suite.id("actor"), phone: suite.phone("actor"), phoneVerifiedAt: new Date() } });
  await prisma.auditLog.createMany({ data: ["LISTING_BAN", "STAFF_CAPABILITY_GRANTED"].map((action) => ({ actorId: suite.id("actor"), action, targetType: "User", targetId: suite.id("actor") })) });
 });
 it("filters items and total before pagination while retaining private staff audit durably", async () => {
  const repo = new PrismaAuditLogRepository(prisma);
  const result = await repo.findMany({ allowedActions: Object.values(AdminSchemas.AdminAuditAction), targetId: suite.id("actor"), page: 1, pageSize: 1 });
  expect(result.total).toBe(1);
  expect(result.items.map((row) => row.action)).toEqual(["LISTING_BAN"]);
  expect(await prisma.auditLog.count({ where: { targetId: suite.id("actor") } })).toBe(2);
 });
});
