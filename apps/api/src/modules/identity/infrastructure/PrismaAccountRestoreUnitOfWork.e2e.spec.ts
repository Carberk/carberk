import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaService } from "@auto-tm/db";

import { RecoverAccount } from "../application/RecoverAccount";
import type {
  AccountRestoreUnitOfWork,
  AccountRestoreWrites,
} from "../domain/ports/AccountRestoreUnitOfWork";
import { PrismaAccountRestoreUnitOfWork } from "./PrismaAccountRestoreUnitOfWork";
import { PrismaUserRepository } from "./PrismaUserRepository";
import {
  cleanSuiteFixtures,
  defineE2eSuite,
  seedSuiteCatalog,
} from "../../../../test/helpers/e2eSuite";

const suite = defineE2eSuite("account-restore-atomicity");
const SUITE_USERS = ["member"] as const;
const USER_ID = suite.id("member");
const SCHEDULED_AT = new Date("2026-11-04T12:00:00Z");
const ARCHIVED_PUBLISHED_AT = new Date("2026-09-01T12:00:00Z");

type WriteName = keyof AccountRestoreWrites;

/**
 * Wraps the real unit of work so that one write runs against the database and
 * then throws, inside the same transaction as the other write.
 */
function failingAfter(
  real: AccountRestoreUnitOfWork,
  failing: WriteName,
): AccountRestoreUnitOfWork {
  return {
    run: (work) =>
      real.run((writes) => {
        const fail = async (name: WriteName, id: string) => {
          await writes[name](id);
          if (name === failing) throw new Error(`${name} failed`);
        };
        return work({
          republishListingsArchivedByDeletion: (sellerId) =>
            fail("republishListingsArchivedByDeletion", sellerId),
          clearDeletionSchedule: (userId) => fail("clearDeletionSchedule", userId),
        });
      }),
  };
}

describe("PrismaAccountRestoreUnitOfWork e2e", () => {
  let prisma: PrismaService;
  let unitOfWork: PrismaAccountRestoreUnitOfWork;
  let userRepo: PrismaUserRepository;
  let deletionArchivedId: string;
  let selfArchivedId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    unitOfWork = new PrismaAccountRestoreUnitOfWork(prisma);
    userRepo = new PrismaUserRepository(prisma);
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
        deletionScheduledAt: SCHEDULED_AT,
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
      status: "archived" as const,
      publishedAt: ARCHIVED_PUBLISHED_AT,
    };
    deletionArchivedId = randomUUID();
    selfArchivedId = randomUUID();
    await prisma.listing.create({
      data: { id: deletionArchivedId, ...base, archivedByDeletion: true },
    });
    await prisma.listing.create({
      data: { id: selfArchivedId, ...base, archivedByDeletion: false },
    });
  });

  async function readState() {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: USER_ID } });
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: deletionArchivedId },
    });
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
    deletionScheduledAt: SCHEDULED_AT,
    listing: {
      status: "archived",
      archivedByDeletion: true,
      publishedAt: ARCHIVED_PUBLISHED_AT,
    },
  };

  it("withholds fresh inventory after restore until an authoritative rebaseline",async()=>{
    const epoch=suite.id("restore-baseline"),key=`inventory_baseline:${epoch}`;
    await prisma.measurementState.create({data:{key:"collector",epoch}});await prisma.measurementState.create({data:{key,epoch:new Date().toISOString()}});
    try{await unitOfWork.run(async writes=>{await writes.republishListingsArchivedByDeletion(USER_ID);await writes.clearDeletionSchedule(USER_ID);});expect(await prisma.measurementState.findUnique({where:{key}})).toBeNull();}
    finally{await prisma.measurementState.deleteMany({where:{key:{in:[key,"collector"]}}});}
  });

  it("commits both writes together", async () => {
    await new RecoverAccount(userRepo, unitOfWork).execute({ userId: USER_ID });

    const state = await readState();
    expect(state.deletionScheduledAt).toBeNull();
    // Restore is no bump: the Listing keeps its first publish date (#871).
    expect(state.listing).toEqual({
      status: "active",
      archivedByDeletion: false,
      publishedAt: ARCHIVED_PUBLISHED_AT,
    });
    const selfArchived = await prisma.listing.findUniqueOrThrow({
      where: { id: selfArchivedId },
    });
    expect(selfArchived.status).toBe("archived");
  });

  it.each<WriteName>(["republishListingsArchivedByDeletion", "clearDeletionSchedule"])(
    "rolls back both writes when %s fails, and a retry then completes",
    async (failing) => {
      const failingRestore = new RecoverAccount(
        userRepo,
        failingAfter(unitOfWork, failing),
      );

      await expect(failingRestore.execute({ userId: USER_ID })).rejects.toThrow(
        `${failing} failed`,
      );
      expect(await readState()).toEqual(untouched);

      await new RecoverAccount(userRepo, unitOfWork).execute({ userId: USER_ID });

      const state = await readState();
      expect(state.deletionScheduledAt).toBeNull();
      expect(state.listing).toEqual({
        status: "active",
        archivedByDeletion: false,
        publishedAt: ARCHIVED_PUBLISHED_AT,
      });
    },
  );

  it("writes nothing when the account is already restored", async () => {
    const restore = new RecoverAccount(userRepo, unitOfWork);
    await restore.execute({ userId: USER_ID });
    const restored = await readState();

    await restore.execute({ userId: USER_ID });

    expect(await readState()).toEqual(restored);
  });
});
