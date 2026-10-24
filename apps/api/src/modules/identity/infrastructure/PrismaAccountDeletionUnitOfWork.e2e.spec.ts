import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaService } from "@auto-tm/db";

import { DeleteMe } from "../application/DeleteMe";
import type {
  AccountDeletionUnitOfWork,
  AccountDeletionWrites,
} from "../domain/ports/AccountDeletionUnitOfWork";
import type { ClockPort } from "../domain/ports/ClockPort";
import { BcryptHasherAdapter } from "./BcryptHasherAdapter";
import { PrismaAccountDeletionUnitOfWork } from "./PrismaAccountDeletionUnitOfWork";
import { PrismaSessionRepository } from "./PrismaSessionRepository";
import { PrismaUserRepository } from "./PrismaUserRepository";
import {
  cleanSuiteFixtures,
  defineE2eSuite,
  seedSuiteCatalog,
} from "../../../../test/helpers/e2eSuite";

const suite = defineE2eSuite("account-deletion-atomicity");
const SUITE_USERS = ["member", "session-foreign"] as const;
const USER_ID = suite.id("member");
const NOW = new Date("2026-10-06T12:00:00Z");
const SCHEDULED_AT = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
const PUBLISHED_AT = new Date("2026-09-01T12:00:00Z");
const clock: ClockPort = { now: () => NOW };

type WriteName = keyof AccountDeletionWrites;

/**
 * Wraps the real unit of work so that one write runs against the database and
 * then throws, inside the same transaction as the other write.
 */
function failingAfter(
  real: AccountDeletionUnitOfWork,
  failing: WriteName,
): AccountDeletionUnitOfWork {
  return {
    run: (work) =>
      real.run((writes) => {
        const fail = (name: WriteName) => {
          if (name === failing) throw new Error(`${name} failed`);
        };
        return work({
          scheduleDeletion: async (userId, deletionScheduledAt) => {
            await writes.scheduleDeletion(userId, deletionScheduledAt);
            fail("scheduleDeletion");
          },
          archiveActiveListings: async (sellerId) => {
            await writes.archiveActiveListings(sellerId);
            fail("archiveActiveListings");
          },
        });
      }),
  };
}

describe("PrismaAccountDeletionUnitOfWork e2e", () => {
  let prisma: PrismaService;
  let unitOfWork: PrismaAccountDeletionUnitOfWork;
  let userRepo: PrismaUserRepository;
  let sessionRepo: PrismaSessionRepository;
  let activeId: string;
  let selfArchivedId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    unitOfWork = new PrismaAccountDeletionUnitOfWork(prisma);
    userRepo = new PrismaUserRepository(prisma);
    sessionRepo = new PrismaSessionRepository(prisma, new BcryptHasherAdapter());
  });

  afterAll(async () => {
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
    await prisma.user.create({
      data: {
        id: USER_ID,
        phone: suite.phone("member"),
        phoneVerifiedAt: new Date(),
      },
    });
    const catalog = await seedSuiteCatalog(prisma, suite);
    const base = {
      sellerId: USER_ID,
      brandId: catalog.brandId,
      modelId: catalog.modelId,
      cityId: catalog.cityId,
      regionId: catalog.regionId,
      year: 2020,
      mileageKm: 50000,
      priceAmount: 100000,
      priceCurrency: "TMT" as const,
      description: "Great car",
      allowCalls: true,
      allowChat: true,
      publishedAt: PUBLISHED_AT,
      archivedByDeletion: false,
    };
    activeId = randomUUID();
    selfArchivedId = randomUUID();
    await prisma.listing.create({
      data: { id: activeId, ...base, status: "active" },
    });
    await prisma.listing.create({
      data: { id: selfArchivedId, ...base, status: "archived" },
    });
  });

  function deleteMe(work: AccountDeletionUnitOfWork = unitOfWork): DeleteMe {
    return new DeleteMe(userRepo, sessionRepo, work, clock);
  }

  async function readState() {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: USER_ID } });
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: activeId } });
    return {
      deletionScheduledAt: user.deletionScheduledAt,
      listing: {
        status: listing.status,
        archivedByDeletion: listing.archivedByDeletion,
        publishedAt: listing.publishedAt,
      },
    };
  }

  const untouched = {
    deletionScheduledAt: null,
    listing: { status: "active", archivedByDeletion: false, publishedAt: PUBLISHED_AT },
  };

  const scheduled = {
    deletionScheduledAt: SCHEDULED_AT,
    listing: { status: "archived", archivedByDeletion: true, publishedAt: PUBLISHED_AT },
  };

  it("commits both writes together and leaves a self-archived Listing alone", async () => {
    await deleteMe().execute({ userId: USER_ID });

    expect(await readState()).toEqual(scheduled);
    const selfArchived = await prisma.listing.findUniqueOrThrow({
      where: { id: selfArchivedId },
    });
    expect(selfArchived).toMatchObject({ status: "archived", archivedByDeletion: false });
  });

  // Authored only in the Session coverage repair. Uses the real caller and
  // receipt path; the query extension commits S2 after the unlocked inventory
  // returns, before preparation starts. This is not a lock-wait simulation.
  it("refuses an uncovered committed Session before account scheduling and leaves no receipt", async () => {
    const foreignId = suite.id("session-foreign");
    await prisma.user.create({ data: { id: foreignId, phone: suite.phone("session-foreign") } });
    const firstId = suite.id("coverage-session-1");
    const secondId = suite.id("coverage-session-2");
    const foreignSessionId = suite.id("coverage-session-foreign");
    const addSession = (id: string, userId: string) => prisma.session.create({ data: {
      id, userId, refreshTokenHash: `fixture-${id}`, expiresAt: SCHEDULED_AT,
    } });
    await addSession(firstId, USER_ID);
    await addSession(foreignSessionId, foreignId);
    let inserted = false;
    const intercepted = prisma.$extends({ query: { session: {
      async findMany({ args, query }) {
        const result = await query(args);
        if (!inserted) {
          inserted = true;
          await addSession(secondId, USER_ID);
        }
        return result;
      },
    } } });
    const racingSessions = new PrismaSessionRepository(intercepted as unknown as PrismaService, new BcryptHasherAdapter());
    const caller = new DeleteMe(userRepo, racingSessions, unitOfWork, clock);

    await expect(caller.execute({ userId: USER_ID })).rejects.toThrow("diagnostic_source_graph_changed");
    expect(await readState()).toEqual(untouched);
    expect(await prisma.session.findMany({
      where: { userId: { in: [USER_ID, foreignId] } },
      select: { id: true }, orderBy: { id: "asc" },
    })).toEqual([firstId, secondId, foreignSessionId].sort().map((id) => ({ id })));
    expect(await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM public.diagnostic_source_commands
    `).toEqual([{ count: 0n }]);
  });

  it("invalidates synthetic inventory evidence atomically without publishing an erased actor fact",async()=>{
    const epoch=suite.id("baseline-epoch"),key=`inventory_baseline:${epoch}`;
    await prisma.measurementState.create({data:{key:"collector",epoch}});await prisma.measurementState.create({data:{key,epoch:NOW.toISOString()}});
    try{
      await expect(deleteMe(failingAfter(unitOfWork,"archiveActiveListings")).execute({userId:USER_ID})).rejects.toThrow("archiveActiveListings failed");expect(await prisma.measurementState.findUnique({where:{key}})).not.toBeNull();
      await deleteMe().execute({userId:USER_ID});expect(await prisma.measurementState.findUnique({where:{key}})).toBeNull();
    }finally{await prisma.measurementState.deleteMany({where:{key:{in:[key,"collector"]}}});}
  });

  it("erases telemetry immediately and rolls its erase back with a failed core deletion", async () => {
    const principalId = randomUUID();
    const guestId = randomUUID();
    const visitId = randomUUID();
    await prisma.measurementPrincipal.create({ data: {
      id: principalId, pseudonym: "a".repeat(64), generation: randomUUID(), epoch: randomUUID(), kind: "account", userId: USER_ID,
    } });
    await prisma.measurementPrincipal.create({ data: {
      id: guestId, pseudonym: "b".repeat(64), generation: randomUUID(), epoch: randomUUID(), kind: "guest", capabilityHash: "c".repeat(64), expiresAt: SCHEDULED_AT,
    } });
    await prisma.measurementVisit.create({ data: { id: visitId, principalId: guestId, linkedAccountId: principalId, startedAt: NOW, foregroundAt: NOW } });
    const recordId = randomUUID();
    await prisma.measurementRecord.create({ data: { id: recordId, principalId: guestId, visitId, event: {}, origin: "client", environment: "test", population: "synthetic", occurredAt: NOW, receivedAt: NOW, expiresAt: SCHEDULED_AT } });
    await prisma.measurementOutbox.create({ data: { id: randomUUID(), principalId, generation: "old-generation", epoch: "old-epoch", environment: "test", population: "synthetic", event: {}, expiresAt: SCHEDULED_AT } });
    try {
      await expect(deleteMe(failingAfter(unitOfWork, "archiveActiveListings")).execute({ userId: USER_ID })).rejects.toThrow("archiveActiveListings failed");
      expect(await prisma.measurementRecord.findUnique({ where: { id: recordId } })).not.toBeNull();
      expect(await prisma.measurementPrincipal.findUnique({ where: { id: principalId } })).not.toBeNull();
      await deleteMe().execute({ userId: USER_ID });
      expect(await prisma.measurementPrincipal.findUnique({ where: { id: principalId } })).toBeNull();
      expect(await prisma.measurementVisit.findUnique({ where: { id: visitId } })).toBeNull();
      expect(await prisma.measurementRecord.findUnique({ where: { id: recordId } })).toBeNull();
      expect(await prisma.measurementOutbox.count({ where: { principalId } })).toBe(0);
      // Earlier guest continuity remains independent; only the account-linked visit was erased.
      expect(await prisma.measurementPrincipal.findUnique({ where: { id: guestId } })).not.toBeNull();
    } finally { await prisma.measurementPrincipal.deleteMany({ where: { id: { in: [guestId, principalId] } } }); }
  });

  it.each<WriteName>(["scheduleDeletion", "archiveActiveListings"])(
    "rolls back both writes when %s fails, and a retry then completes",
    async (failing) => {
      await expect(
        deleteMe(failingAfter(unitOfWork, failing)).execute({ userId: USER_ID }),
      ).rejects.toThrow(`${failing} failed`);
      expect(await readState()).toEqual(untouched);

      await deleteMe().execute({ userId: USER_ID });

      expect(await readState()).toEqual(scheduled);
    },
  );
});
