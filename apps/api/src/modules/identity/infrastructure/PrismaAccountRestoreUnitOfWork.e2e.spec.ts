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
    run: (command, work) =>
      real.run(command, (writes) => {
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
    await guards(false);
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await guards(false);
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
    await guards(true);
  });

  async function guards(enabled: boolean) {
    const rows = await prisma.$queryRaw<{ table: string; name: string }[]>`SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')`;
    for (const row of rows) await prisma.$executeRawUnsafe(`ALTER TABLE public."${row.table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER "${row.name}"`);
  }

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
    try{await unitOfWork.run({ userId: USER_ID }, async writes=>{await writes.republishListingsArchivedByDeletion(USER_ID);await writes.clearDeletionSchedule(USER_ID);});expect(await prisma.measurementState.findUnique({where:{key}})).toBeNull();}
    finally{await guards(false);await prisma.measurementState.deleteMany({where:{key:{in:[key,"collector"]}}});}
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

  it("rechecks a competing restore after the application's stale read and skips all callback writes", async () => {
    let competed = false;
    const staleReader = prisma.$extends({ query: { user: { async findUnique({ args, query }) {
      const result = await query(args);
      if (!competed && args.where.id === USER_ID) {
        competed = true;
        await new RecoverAccount(userRepo, unitOfWork).execute({ userId: USER_ID });
      }
      return result;
    } } } });
    const noWrites: AccountRestoreUnitOfWork = { run: (command, work) => unitOfWork.run(command, async writes => {
      await work(writes);
      throw new Error("already-clear callback ran");
    }) };
    await new RecoverAccount(new PrismaUserRepository(staleReader as unknown as PrismaService), noWrites).execute({ userId: USER_ID });
    expect(await readState()).toEqual({ deletionScheduledAt: null, listing: { status: "active", archivedByDeletion: false, publishedAt: ARCHIVED_PUBLISHED_AT } });
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });

  it("does not repair an orphan marked Listing or remove a new baseline for an already-clear User", async () => {
    await guards(false);
    await prisma.user.update({ where: { id: USER_ID }, data: { deletionScheduledAt: null } });
    const epoch = randomUUID(), key = `inventory_baseline:${epoch}`;
    await prisma.measurementState.createMany({ data: [{ key: "collector", epoch }, { key, epoch: SCHEDULED_AT.toISOString() }] });
    await guards(true);
    try {
      await unitOfWork.run({ userId: USER_ID }, async () => { throw new Error("no-op callback ran"); });
      expect(await readState()).toEqual({ ...untouched, deletionScheduledAt: null });
      expect(await prisma.measurementState.findUnique({ where: { key } })).not.toBeNull();
      expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
    } finally {
      await guards(false);
      await prisma.measurementState.deleteMany({ where: { key: { in: [key, "collector"] } } });
    }
  });

  it("refuses incomplete restore and foreign callback targets with no committed effects or receipt", async () => {
    await expect(unitOfWork.run({ userId: USER_ID }, writes => writes.republishListingsArchivedByDeletion(USER_ID))).rejects.toThrow("account_restore_incomplete");
    expect(await readState()).toEqual(untouched);
    await expect(unitOfWork.run({ userId: USER_ID }, writes => writes.republishListingsArchivedByDeletion("foreign"))).rejects.toThrow("account_restore_target");
    expect(await readState()).toEqual(untouched);
    expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
  });


  it("refuses a competing restore whose complete discovery changes while waiting, with no residue or implicit retry", async () => {
    let entered!: () => void, release!: () => void;
    const held = new Promise<void>(resolve => { entered = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const holding: AccountRestoreUnitOfWork = { run: (command, work) => unitOfWork.run(command, async writes => {
      entered(); await released; return work(writes);
    }) };
    const first = new RecoverAccount(userRepo, holding).execute({ userId: USER_ID });
    let second: Promise<void> | undefined;
    try {
      await held;
      second = new RecoverAccount(userRepo, unitOfWork).execute({ userId: USER_ID });
      const deadline = Date.now() + 750;
      let blocked = false;
      while (Date.now() < deadline) {
        const [row] = await prisma.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND cardinality(pg_blocking_pids(pid))>0 AND query LIKE '%diagnostic_prepare_source%') AS blocked`;
        if (row?.blocked) { blocked = true; break; }
      }
      expect(blocked).toBe(true);
      release();
      const outcomes = await Promise.allSettled([first, second]);
      expect(outcomes[0]?.status).toBe("fulfilled");
      expect(outcomes[1]?.status).toBe("rejected");
      const loser = outcomes[1];
      if (loser?.status === "rejected") expect(String(loser.reason)).toContain("diagnostic_source_graph_changed");
      expect(await readState()).toEqual({ deletionScheduledAt: null, listing: { status: "active", archivedByDeletion: false, publishedAt: ARCHIVED_PUBLISHED_AT } });
      expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
      // A later explicit call observes the clear schedule and is a no-op.
      const restored = await readState();
      await new RecoverAccount(userRepo, unitOfWork).execute({ userId: USER_ID });
      expect(await readState()).toEqual(restored);
    } finally {
      release(); await Promise.allSettled([first, second]);
    }
  });


  it("keeps marked archived Business stock and succeeds with a collector whose baseline is absent", async () => {
    await guards(false);
    const business = await prisma.dealership.create({ data: { slug: suite.slugFor("restore-stock"), name: "Synthetic retained stock" } });
    const personal = await prisma.listing.findUniqueOrThrow({ where: { id: deletionArchivedId } });
    const stock = await prisma.listing.create({ data: { sellerId: USER_ID, businessId: business.id, brandId: personal.brandId, modelId: personal.modelId, cityId: personal.cityId, status: "archived", archivedByDeletion: true, publishedAt: ARCHIVED_PUBLISHED_AT, priceAmount: 100000, priceCurrency: "TMT" } });
    const collector = await prisma.measurementState.create({ data: { key: "collector", epoch: randomUUID() } });
    await guards(true);
    try {
      await new RecoverAccount(userRepo, unitOfWork).execute({ userId: USER_ID });
      expect(await prisma.listing.findUniqueOrThrow({ where: { id: stock.id } })).toEqual(stock);
      expect(await readState()).toEqual({ deletionScheduledAt: null, listing: { status: "active", archivedByDeletion: false, publishedAt: ARCHIVED_PUBLISHED_AT } });
      expect(await prisma.measurementState.findUniqueOrThrow({ where: { key: "collector" } })).toEqual(collector);
      expect(await prisma.measurementState.findUnique({ where: { key: `inventory_baseline:${collector.epoch}` } })).toBeNull();
      expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
    } finally {
      await guards(false);
      await prisma.listing.delete({ where: { id: stock.id } });
      await prisma.dealership.delete({ where: { id: business.id } });
      await prisma.measurementState.delete({ where: { key: "collector" } });
    }
  });


  // UNEXECUTED, KNOWN KERNEL MISMATCH. Parent accepted this finite effect
  // correction after the account checkpoint. The required outcome is a real
  // no-op, not an artificial User UPDATE to cause an enquiry requeue.
  it("KNOWN KERNEL MISMATCH: direct already-clear suspended restore leaves a persisted Business assignment and audits untouched", async () => {
    await guards(false);
    const foreignId = suite.id("noop-foreign");
    await prisma.user.create({ data: { id: foreignId, email: `${foreignId}@restore.invalid`, emailVerifiedAt: SCHEDULED_AT } });
    await prisma.user.update({ where: { id: USER_ID }, data: { deletionScheduledAt: null, suspendedAt: SCHEDULED_AT, suspendedById: foreignId, suspensionReason: "Synthetic direct no-op counterexample" } });
    const business = await prisma.dealership.create({ data: { slug: suite.slugFor("noop-assignment"), name: "Synthetic persisted assignment" } });
    const personal = await prisma.listing.findUniqueOrThrow({ where: { id: deletionArchivedId } });
    const stock = await prisma.listing.create({ data: { sellerId: foreignId, businessId: business.id, brandId: personal.brandId, modelId: personal.modelId, cityId: personal.cityId, status: "active", priceAmount: 100000, priceCurrency: "TMT" } });
    // Establish the persisted edge after suspension while guards are dormant.
    // No ordinary assignment authority is claimed by this explicit fixture.
    const conversation = await prisma.conversation.create({ data: { listingId: stock.id, buyerId: USER_ID, sellerId: foreignId, businessId: business.id, assigneeId: USER_ID, version: 7 } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: USER_ID } });
    await guards(true);
    try {
      // Current kernel derives mandatory user_inactive effects for this
      // unchanged User tuple, then finish refuses diagnostic_source_final_effect.
      // Capture that error so untouched-row assertions still run. The final
      // expectation deliberately states the intended success after correction.
      const outcome: unknown = await unitOfWork.run({ userId: USER_ID }, async () => {
        throw new Error("already-clear callback ran");
      }).catch((error: unknown) => error);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: USER_ID } })).toEqual(user);
      expect(await prisma.listing.findUniqueOrThrow({ where: { id: deletionArchivedId } })).toEqual(personal);
      expect(await prisma.listing.findUniqueOrThrow({ where: { id: stock.id } })).toEqual(stock);
      expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).toEqual(conversation);
      expect(await prisma.businessEnquiryAudit.findMany({ where: { conversationId: conversation.id } })).toEqual([]);
      expect(await prisma.auditLog.findMany({ where: { actorId: USER_ID } })).toEqual([]);
      expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
      expect(outcome, "known current kernel mismatch; parent-owned correction pending").toBeUndefined();
    } finally {
      await guards(false);
      await prisma.listing.delete({ where: { id: stock.id } });
      await prisma.dealership.delete({ where: { id: business.id } });
      await prisma.user.update({ where: { id: USER_ID }, data: { suspendedAt: null, suspendedById: null, suspensionReason: null } });
      await prisma.user.delete({ where: { id: foreignId } });
    }
  });

});
