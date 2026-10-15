import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "@auto-tm/db";
import { defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { PrismaMeasurementCommit } from "./PrismaMeasurementCommit";

const suite = defineE2eSuite("measurement-commit");
const USER = suite.id("publisher");
const EPOCH = suite.id("epoch");
const activation = { enabled: true, environment: "test" as const, purposes: ["product_improvement" as const], evidenceRef: "publication-e2e", realCollectionApproved: false };

const event = (id = randomUUID()) => ({ version: 1 as const, eventId: id, occurredAt: new Date("2026-10-15T00:00:00Z").toISOString(), purpose: "product_improvement" as const,
  eventName: "listing_published" as const, context: { platform: "server" as const, release: "server", build: "e2e", locale: "en" }, payload: { listingId: suite.id("listing"), cityId: suite.id("city") } });

describe("PrismaMeasurementCommit — PostgreSQL source transaction", () => {
  let prisma: PrismaService;
  beforeAll(async () => { prisma = new PrismaService(); await prisma.$connect(); });
  beforeEach(async () => {
    await prisma.measurementOutbox.deleteMany();
    await prisma.measurementPrincipal.deleteMany();
    await prisma.measurementState.upsert({ where: { key: "collector" }, create: { key: "collector", epoch: EPOCH }, update: { epoch: EPOCH } });
    await prisma.user.upsert({ where: { id: USER }, create: { id: USER }, update: { deletionScheduledAt: null } });
  });
  afterAll(async () => { await prisma.measurementOutbox.deleteMany(); await prisma.measurementPrincipal.deleteMany(); await prisma.measurementState.deleteMany({ where: { key: "collector" } }); await prisma.user.delete({ where: { id: USER } }).catch(() => undefined); await prisma.onModuleDestroy(); });

  it("captures the original generation inside the publishing transaction", async () => {
    const principal = await prisma.measurementPrincipal.create({ data: { id: suite.id("principal"), pseudonym: suite.id("pseudonym"), generation: suite.id("generation"), epoch: EPOCH, kind: "account", userId: USER } });
    const commit = new PrismaMeasurementCommit(activation, EPOCH, () => new Date("2026-10-15T00:00:00Z"));
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE IF NOT EXISTS measurement_commit_probe (id text primary key)`;
      expect(await commit.capture(tx, USER, event())).toBe("captured");
      await tx.$executeRaw`INSERT INTO measurement_commit_probe (id) VALUES ('published')`;
    });
    const row = await prisma.measurementOutbox.findFirstOrThrow();
    expect(row.principalId).toBe(principal.id); expect(row.generation).toBe(principal.generation); expect(row.epoch).toBe(EPOCH);
  });

  it("is a no-op when collection is disabled and leaves the source transaction usable", async () => {
    const commit = new PrismaMeasurementCommit({ ...activation, enabled: false }, EPOCH);
    await prisma.$transaction(async (tx) => {
      expect(await commit.capture(tx, USER, event())).toBe("disabled");
      await tx.user.update({ where: { id: USER }, data: { deletionScheduledAt: new Date("2026-10-16T00:00:00Z") } });
    });
    expect(await prisma.measurementOutbox.count()).toBe(0);
  });
});
