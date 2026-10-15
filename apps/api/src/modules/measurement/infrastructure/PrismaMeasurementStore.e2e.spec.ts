import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "@auto-tm/db";
import type { MeasurementSchemas } from "@auto-tm/contracts";
import { PrismaMeasurementStore } from "./PrismaMeasurementStore";
import { defineE2eSuite } from "../../../../test/helpers/e2eSuite";

const suite = defineE2eSuite("measurement-ledger");
const USER = suite.id("account");
const EPOCH = suite.id("epoch");
const NEXT_EPOCH = suite.id("restore-epoch");
const initial = new Date("2026-10-15T00:00:00Z");
const fact = (visitId: string, time: Date, id = randomUUID()): MeasurementSchemas.MeasurementEvent => ({ version: 1, eventId: id, visitId, occurredAt: time.toISOString(), purpose: "product_improvement",
 eventName: "listing_detail_opened", context: { platform: "android", release: "1.0", build: "1", locale: "ru" }, payload: { listingId: suite.id("listing") } });

describe("durable measurement identity, ledger and restore", () => {
 let prisma: PrismaService; let store: PrismaMeasurementStore; let now: Date;
 beforeAll(async () => { prisma = new PrismaService(); await prisma.$connect(); });
 beforeEach(async () => {
  // Disposable worker DB only. Restore necessarily exercises the collector-wide epoch boundary.
  await prisma.measurementPrincipal.deleteMany();
  await prisma.measurementState.upsert({ where: { key: "collector" }, create: { key: "collector", epoch: EPOCH }, update: { epoch: EPOCH } });
  await prisma.user.upsert({ where: { id: USER }, create: { id: USER }, update: { deletionScheduledAt: null } });
  now = new Date(initial); store = new PrismaMeasurementStore(prisma, { epoch: EPOCH, environment: "test", population: "synthetic" }, () => now);
 });
 afterAll(async () => {
  await prisma.measurementPrincipal.deleteMany(); await prisma.measurementState.deleteMany({ where: { key: "collector" } });
  await prisma.user.deleteMany({ where: { id: USER } }); await prisma.onModuleDestroy();
 });
 // Cross-context deletion fixture. The identity unit-of-work suite separately proves this
 // protocol through DeleteMe, including atomic rollback. No internal identity imports.
 const deleteAccountFixture = () => prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id: USER }, data: { deletionScheduledAt: new Date("2026-11-14T00:00:00Z") } });
  await tx.measurementPrincipal.deleteMany({ where: { userId: USER } });
 });
 const append = async (authority: NonNullable<Awaited<ReturnType<PrismaMeasurementStore["resolve"]>>>, event: MeasurementSchemas.MeasurementEvent) => store.appendIfEligible({ event, authority, receivedAt: now, expiresAt: new Date(now.getTime() + 90 * 86400000) });
 it("issues hash-only scoped guest identity and atomically deduplicates concurrent delivery", async () => {
  const boot = await store.bootstrap({}); expect(boot?.guestCapability).toMatch(/^mg_[A-Za-z0-9_-]{43}$/);
  const authority = await store.resolve({ guestCapability: boot!.guestCapability! }); expect(authority?.subject.kind).toBe("guest");
  const event = fact(boot!.visitId, now);
  expect((await Promise.all(Array.from({ length: 8 }, () => append(authority!, event)))).sort()).toEqual(["accepted", "duplicate", "duplicate", "duplicate", "duplicate", "duplicate", "duplicate", "duplicate"]);
  const row = await prisma.measurementPrincipal.findUniqueOrThrow({ where: { generation: boot!.generation } });
  expect(row.capabilityHash).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(row)).not.toContain(boot!.guestCapability!);
  expect(await append(authority!, fact(randomUUID(), now))).toBe("revoked");
  expect(await prisma.measurementVisit.count()).toBe(1);
 });
 it("serializes deletion against receipt, purges raw facts and refuses every queued old generation", async () => {
  const boot = await store.bootstrap({ authenticatedUserId: USER }); const authority = await store.resolve({ authenticatedUserId: USER });
  expect(await append(authority!, fact(boot!.visitId, now))).toBe("accepted");
  await Promise.all([append(authority!, fact(boot!.visitId, now)), deleteAccountFixture()]);
  expect(await store.resolve({ authenticatedUserId: USER })).toBeNull();
  expect(await store.bootstrap({ authenticatedUserId: USER })).toBeNull();
  expect(await prisma.measurementRecord.count()).toBe(0);
  expect(await append(authority!, fact(boot!.visitId, now))).toBe("revoked");
  // Core identity recovery is a fixture in this context. It does not restore measurement maps.
  await prisma.user.update({ where: { id: USER }, data: { deletionScheduledAt: null } });
  const recovered = await store.bootstrap({ authenticatedUserId: USER });
  const fresh = await store.resolve({ authenticatedUserId: USER });
  expect(recovered!.generation).not.toBe(boot!.generation);
  expect(await append(fresh!, fact(boot!.visitId, now))).toBe("revoked");
  expect(await append(authority!, fact(recovered!.visitId, now))).toBe("revoked");
 });
 it("associates and erases only the current guest visit at sign-in", async () => {
  const first = await store.bootstrap({}); const guest = await store.resolve({ guestCapability: first!.guestCapability! });
  expect(await append(guest!, fact(first!.visitId, now))).toBe("accepted");
  now = new Date("2026-10-15T00:31:00Z");
  const current = await store.bootstrap({ guestCapability: first!.guestCapability!, visitId: first!.visitId });
  expect(current!.visitId).not.toBe(first!.visitId);
  expect(await append(guest!, fact(current!.visitId, now))).toBe("accepted");
  now = new Date("2026-10-15T00:32:00Z");
  await store.bootstrap({ authenticatedUserId: USER, guestCapability: first!.guestCapability!, visitId: current!.visitId });
  await deleteAccountFixture();
  expect(await prisma.measurementRecord.count()).toBe(1);
  expect(await prisma.measurementVisit.findUnique({ where: { id: current!.visitId } })).toBeNull();
  expect(await append(guest!, fact(current!.visitId, new Date("2026-10-15T00:31:30Z")))).toBe("revoked");
  await store.eraseGuest(first!.guestCapability!);
  expect(await prisma.measurementRecord.count()).toBe(0);
 });
 it("does not retain guest continuity past ninety days or revive erased credentials", async () => {
  const boot = await store.bootstrap({}); const old = await store.resolve({ guestCapability: boot!.guestCapability! });
  now = new Date(initial.getTime() + 90 * 86400000);
  expect(await store.resolve({ guestCapability: boot!.guestCapability! })).toBeNull();
  expect(await append(old!, fact(boot!.visitId, now))).toBe("revoked");
  const fresh = await store.bootstrap({ guestCapability: boot!.guestCapability!, visitId: boot!.visitId });
  expect(fresh!.guestCapability).toMatch(/^mg_/); expect(fresh!.generation).not.toBe(boot!.generation);
  await store.eraseGuest(fresh!.guestCapability!);
  expect(await store.resolve({ guestCapability: fresh!.guestCapability! })).toBeNull();
 });
 it("fences restored revoked principal and visit rows by rotating external epoch before serving", async () => {
  const boot = await store.bootstrap({ authenticatedUserId: USER }); const old = await store.resolve({ authenticatedUserId: USER });
  expect(await append(old!, fact(boot!.visitId, now))).toBe("accepted");
  const principalBackup = await prisma.measurementPrincipal.findMany(); const visitBackup = await prisma.measurementVisit.findMany();
  await deleteAccountFixture();
  // Simulate a backup that resurrects old maps; new externally supplied epoch refuses it immediately.
  await prisma.measurementPrincipal.createMany({ data: principalBackup }); await prisma.measurementVisit.createMany({ data: visitBackup });
  const restored = new PrismaMeasurementStore(prisma, { epoch: NEXT_EPOCH, environment: "test", population: "synthetic" }, () => now);
  expect(await restored.resolve({ authenticatedUserId: USER })).toBeNull();
  expect(await restored.bootstrap({ authenticatedUserId: USER })).toBeNull();
  await restored.rotateRestoreEpoch(NEXT_EPOCH);
  expect(await append(old!, fact(boot!.visitId, now))).toBe("revoked");
  expect(await restored.bootstrap({ authenticatedUserId: USER })).toBeNull();
  expect(await prisma.measurementPrincipal.count()).toBe(0);
  await expect(restored.rotateRestoreEpoch(NEXT_EPOCH)).rejects.toThrow("Fresh collector epoch required");
 });
});
