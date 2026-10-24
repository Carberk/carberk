import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaService } from "@auto-tm/db";

import { PrismaMeasurementStore } from "../../measurement/infrastructure/PrismaMeasurementStore";
import { RecoverAccount } from "../application/RecoverAccount";
import { PrismaAccountRestoreUnitOfWork } from "./PrismaAccountRestoreUnitOfWork";
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
    run: (command, work) =>
      real.run(command, (writes) => {
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
    await guards(true);
  });

  async function guards(enabled: boolean) {
    const rows = await prisma.$queryRaw<{ table: string; name: string }[]>`SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')`;
    for (const row of rows) await prisma.$executeRawUnsafe(`ALTER TABLE public."${row.table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER "${row.name}"`);
  }

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
    await guards(false);
    const epoch=suite.id("baseline-epoch"),key=`inventory_baseline:${epoch}`;
    await prisma.measurementState.create({data:{key:"collector",epoch}});await prisma.measurementState.create({data:{key,epoch:NOW.toISOString()}});
    await guards(true);
    try{
      await expect(deleteMe(failingAfter(unitOfWork,"archiveActiveListings")).execute({userId:USER_ID})).rejects.toThrow("archiveActiveListings failed");expect(await prisma.measurementState.findUnique({where:{key}})).not.toBeNull();
      await deleteMe().execute({userId:USER_ID});expect(await prisma.measurementState.findUnique({where:{key}})).toBeNull();
    }finally{await guards(false);await prisma.measurementState.deleteMany({where:{key:{in:[key,"collector"]}}});}
  });

  it("erases telemetry immediately and rolls its erase back with a failed core deletion", async () => {
    await guards(false);
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
    await guards(true);
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
    } finally { await guards(false); await prisma.measurementPrincipal.deleteMany({ where: { id: { in: [guestId, principalId] } } }); }
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

  // Authored only. Fixture-local DDL below is never run by this implementation.
  // This complete graph exercises the real DeleteMe/UoW, SQL-derived effects,
  // mandatory audits and actual User/member enquiry triggers together.
  it.each([
    ["owner", "active", "recovery"],
    ["owner", "suspended", "suspended"],
    ["sales", "active", "active"],
    ["none", "active", "active"],
  ] as const)("schedules %s of %s with complete effects, rollback and foreign retention", async (role, status, expectedStatus) => {
    await guards(false);
    const foreignId = suite.id("session-foreign");
    await prisma.user.create({ data: { id: foreignId, phone: suite.phone("session-foreign") } });
    const business = await prisma.dealership.create({ data: { slug: suite.slugFor("account-business"), name: "Synthetic account Business", status } });
    const membership = role === "none" ? null : await prisma.dealershipMember.create({ data: { userId: USER_ID, dealershipId: business.id, role } });
    const personal = await prisma.listing.findUniqueOrThrow({ where: { id: activeId } });
    const stock = await prisma.listing.create({ data: { id: randomUUID(), sellerId: USER_ID, businessId: business.id, brandId: personal.brandId, modelId: personal.modelId, cityId: personal.cityId, status: "active", publishedAt: PUBLISHED_AT, priceAmount: 100000, priceCurrency: "TMT" } });
    // No member relation connects this second Business to the target. Its
    // assignment is nevertheless in the account User trigger's effect union.
    const otherBusiness = await prisma.dealership.create({ data: { slug: suite.slugFor("assignee-business"), name: "Foreign synthetic Business" } });
    const foreignStock = await prisma.listing.create({ data: { id: randomUUID(), sellerId: foreignId, businessId: otherBusiness.id, brandId: personal.brandId, modelId: personal.modelId, cityId: personal.cityId, status: "active", priceAmount: 100000, priceCurrency: "TMT" } });
    const assigned = await prisma.conversation.create({ data: { listingId: foreignStock.id, buyerId: USER_ID, sellerId: foreignId, businessId: otherBusiness.id, assigneeId: USER_ID, version: 4 } });
    const foreignConversation = await prisma.conversation.create({ data: { listingId: stock.id, buyerId: foreignId, sellerId: USER_ID, businessId: business.id, assigneeId: foreignId } });
    const invite = await prisma.dealershipInvitation.create({ data: { dealershipId: business.id, recipientUserId: USER_ID, tokenHash: randomUUID(), expiresAt: SCHEDULED_AT } });
    const foreignInvite = await prisma.dealershipInvitation.create({ data: { dealershipId: otherBusiness.id, recipientUserId: foreignId, tokenHash: randomUUID(), expiresAt: SCHEDULED_AT } });
    await prisma.staffGrant.createMany({ data: ["staff.manage", "diagnostics.reception"].map(capability => ({ userId: USER_ID, capability })) });
    const alreadyRevoked = await prisma.staffGrant.create({ data: { userId: USER_ID, capability: "diagnostics.reviewer", revokedAt: NOW } });
    const foreignGrant = await prisma.staffGrant.create({ data: { userId: foreignId, capability: "staff.manage" } });
    const session = await prisma.session.create({ data: { userId: USER_ID, refreshTokenHash: randomUUID(), expiresAt: SCHEDULED_AT } });
    const foreignSession = await prisma.session.create({ data: { userId: foreignId, refreshTokenHash: randomUUID(), expiresAt: SCHEDULED_AT } });
    const epoch = randomUUID(), key = `inventory_baseline:${epoch}`;
    await prisma.measurementState.createMany({ data: [{ key: "collector", epoch }, { key, epoch: NOW.toISOString() }] });
    const priorBaseline = await prisma.measurementState.create({ data: { key: `inventory_baseline:${randomUUID()}`, epoch: NOW.toISOString() } });
    const exportId = randomUUID();
    await prisma.measurementInvestigationExport.create({ data: { id: exportId, actorId: foreignId, sessionId: foreignSession.id, epoch, reason: "Synthetic investigation", auditId: randomUUID(), scope: {}, evidence: {}, expiresAt: SCHEDULED_AT } });
    const principal = await prisma.measurementPrincipal.create({ data: { id: randomUUID(), pseudonym: randomUUID(), generation: randomUUID(), epoch, kind: "account", userId: USER_ID } });
    const guest = await prisma.measurementPrincipal.create({ data: { id: randomUUID(), pseudonym: randomUUID(), generation: randomUUID(), epoch, kind: "guest", capabilityHash: randomUUID(), expiresAt: SCHEDULED_AT } });
    const foreignPrincipal = await prisma.measurementPrincipal.create({ data: { id: randomUUID(), pseudonym: randomUUID(), generation: randomUUID(), epoch, kind: "account", userId: foreignId } });
    const priorVisit = await prisma.measurementVisit.create({ data: { id: randomUUID(), principalId: guest.id, startedAt: NOW, foregroundAt: NOW } });
    const currentVisit = await prisma.measurementVisit.create({ data: { id: randomUUID(), principalId: guest.id, linkedAccountId: principal.id, startedAt: NOW, foregroundAt: NOW } });
    const accountVisit = await prisma.measurementVisit.create({ data: { id: randomUUID(), principalId: principal.id, startedAt: NOW, foregroundAt: NOW } });
    const record = (principalId: string, visitId: string) => prisma.measurementRecord.create({ data: { id: randomUUID(), principalId, visitId, event: {}, origin: "client", environment: "test", population: "synthetic", occurredAt: NOW, receivedAt: NOW, expiresAt: SCHEDULED_AT } });
    const priorRecord = await record(guest.id, priorVisit.id), currentRecord = await record(guest.id, currentVisit.id), accountRecord = await record(principal.id, accountVisit.id);
    const outbox = await prisma.measurementOutbox.create({ data: { id: randomUUID(), principalId: principal.id, generation: principal.generation, epoch, environment: "test", population: "synthetic", event: {}, expiresAt: SCHEDULED_AT } });
    const foreignOutbox = await prisma.measurementOutbox.create({ data: { id: randomUUID(), principalId: foreignPrincipal.id, generation: foreignPrincipal.generation, epoch, environment: "test", population: "synthetic", event: {}, expiresAt: SCHEDULED_AT } });
    const fullState = async () => ({
      core: await readState(), membership: membership ? await prisma.dealershipMember.findUnique({ where: { id: membership.id } }) : null, business: await prisma.dealership.findUnique({ where: { id: business.id } }),
      assignment: await prisma.conversation.findUnique({ where: { id: assigned.id } }), enquiries: await prisma.businessEnquiryAudit.findMany({ where: { conversationId: assigned.id } }),
      audits: await prisma.auditLog.findMany({ where: { actorId: USER_ID }, orderBy: { id: "asc" } }), grants: await prisma.staffGrant.findMany({ where: { userId: USER_ID }, orderBy: { capability: "asc" } }),
      invite: await prisma.dealershipInvitation.findUnique({ where: { id: invite.id } }), baseline: await prisma.measurementState.findUnique({ where: { key } }), export: await prisma.measurementInvestigationExport.findUnique({ where: { id: exportId } }),
      principal: await prisma.measurementPrincipal.findUnique({ where: { id: principal.id } }), visits: await prisma.measurementVisit.findMany({ where: { id: { in: [priorVisit.id, currentVisit.id, accountVisit.id] } }, orderBy: { id: "asc" } }),
      records: await prisma.measurementRecord.findMany({ where: { id: { in: [priorRecord.id, currentRecord.id, accountRecord.id] } }, orderBy: { id: "asc" } }), outbox: await prisma.measurementOutbox.findUnique({ where: { id: outbox.id } }),
    });
    const before = await fullState();
    let exact: { membership: string; staff: string; timestamp: Date } | undefined;
    const inspect = prisma.$extends({ query: { $queryRaw: async ({ args, query }) => {
      const result: unknown = await query(args);
      if (Array.isArray(result) && result[0] && typeof result[0] === "object" && "membershipAuditId" in result[0]) {
        const row = result[0] as { membershipAuditId: string; staffAuditId: string; timestamp: Date };
        exact = { membership: row.membershipAuditId, staff: row.staffAuditId, timestamp: row.timestamp };
      }
      return result;
    } } });
    const inspectedWork = new PrismaAccountDeletionUnitOfWork(inspect as unknown as PrismaService);
    try {
      await guards(true);
      for (const failing of ["scheduleDeletion", "archiveActiveListings"] as const) {
        await expect(deleteMe(failingAfter(unitOfWork, failing)).execute({ userId: USER_ID })).rejects.toThrow(`${failing} failed`);
        expect(await fullState()).toEqual(before);
        expect(await prisma.session.findUnique({ where: { id: session.id } })).toBeNull();
        expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
      }
      await deleteMe(inspectedWork).execute({ userId: USER_ID });
      expect(await readState()).toEqual(scheduled);
      expect(await prisma.dealershipMember.findUnique({ where: { userId: USER_ID } })).toBeNull();
      expect((await prisma.dealership.findUniqueOrThrow({ where: { id: business.id } })).status).toBe(expectedStatus);
      expect(await prisma.listing.findUniqueOrThrow({ where: { id: stock.id } })).toEqual(stock);
      expect(await prisma.listing.findUniqueOrThrow({ where: { id: foreignStock.id } })).toEqual(foreignStock);
      expect(await prisma.conversation.findUniqueOrThrow({ where: { id: assigned.id } })).toMatchObject({ assigneeId: null, version: 5 });
      expect(await prisma.businessEnquiryAudit.findMany({ where: { conversationId: assigned.id } })).toMatchObject([{ action: "user_inactive", version: 5, previousAssigneeId: USER_ID, actorId: null }]);
      expect(await prisma.conversation.findUniqueOrThrow({ where: { id: foreignConversation.id } })).toEqual(foreignConversation);
      expect(exact).toBeDefined();
      const audits = await prisma.auditLog.findMany({ where: { actorId: USER_ID }, orderBy: { action: "asc" } });
      expect(audits).toMatchObject([
        ...(membership ? [{ id: exact!.membership, createdAt: exact!.timestamp, action: "BUSINESS_MEMBERSHIP_ENDED_FOR_DELETION", details: { role, recoveryRequired: role === "owner" } }] : []),
        { id: exact!.staff, createdAt: exact!.timestamp, action: "STAFF_AUTHORITY_REVOKED_FOR_DELETION", details: { reason: "Account deletion scheduled", capabilities: ["diagnostics.reception", "staff.manage"] } },
      ]);
      expect(await prisma.staffGrant.findMany({ where: { userId: USER_ID, revokedAt: null } })).toEqual([]);
      expect(await prisma.staffGrant.findMany({ where: { userId: USER_ID, capability: { in: ["diagnostics.reception", "staff.manage"] } } })).toMatchObject([
        { revokedAt: exact!.timestamp }, { revokedAt: exact!.timestamp },
      ]);
      expect(await prisma.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId: USER_ID, capability: alreadyRevoked.capability } } })).toEqual(alreadyRevoked);
      for (const id of [currentVisit.id, accountVisit.id]) expect(await prisma.measurementVisit.findUnique({ where: { id } })).toBeNull();
      for (const id of [currentRecord.id, accountRecord.id]) expect(await prisma.measurementRecord.findUnique({ where: { id } })).toBeNull();
      expect(await prisma.measurementRecord.findUniqueOrThrow({ where: { id: priorRecord.id } })).toEqual(priorRecord);
      expect(await prisma.measurementVisit.findUniqueOrThrow({ where: { id: priorVisit.id } })).toEqual(priorVisit);
      expect(await prisma.measurementPrincipal.findUnique({ where: { id: principal.id } })).toBeNull();
      expect(await prisma.measurementOutbox.findUnique({ where: { id: outbox.id } })).toBeNull();
      expect(await prisma.measurementState.findUnique({ where: { key } })).toBeNull();
      expect(await prisma.measurementState.findUniqueOrThrow({ where: { key: priorBaseline.key } })).toEqual(priorBaseline);
      expect(await prisma.measurementInvestigationExport.findUnique({ where: { id: exportId } })).toBeNull();
      expect(await prisma.dealershipInvitation.findUnique({ where: { id: invite.id } })).toBeNull();
      expect(await prisma.dealershipInvitation.findUniqueOrThrow({ where: { id: foreignInvite.id } })).toEqual(foreignInvite);
      expect(await prisma.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId: foreignId, capability: foreignGrant.capability } } })).toEqual(foreignGrant);
      expect(await prisma.session.findUniqueOrThrow({ where: { id: foreignSession.id } })).toEqual(foreignSession);
      expect(await prisma.measurementPrincipal.findUniqueOrThrow({ where: { id: foreignPrincipal.id } })).toEqual(foreignPrincipal);
      expect(await prisma.measurementOutbox.findUniqueOrThrow({ where: { id: foreignOutbox.id } })).toEqual(foreignOutbox);
      expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
      await new RecoverAccount(userRepo, new PrismaAccountRestoreUnitOfWork(prisma)).execute({ userId: USER_ID });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: USER_ID } })).deletionScheduledAt).toBeNull();
      expect(await prisma.listing.findUniqueOrThrow({ where: { id: activeId } })).toMatchObject({ status: "active", archivedByDeletion: false, publishedAt: PUBLISHED_AT });
      expect(await prisma.listing.findUniqueOrThrow({ where: { id: stock.id } })).toEqual(stock);
      expect(await prisma.dealershipMember.findUnique({ where: { userId: USER_ID } })).toBeNull();
      expect(await prisma.session.count({ where: { userId: USER_ID } })).toBe(0);
      expect(await prisma.measurementPrincipal.findUnique({ where: { id: principal.id } })).toBeNull();
      expect(await prisma.staffGrant.count({ where: { userId: USER_ID, revokedAt: null } })).toBe(0);
      expect(await prisma.auditLog.findMany({ where: { actorId: USER_ID }, orderBy: { action: "asc" } })).toEqual(audits);
      expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
    } finally {
      await guards(false);
      await prisma.measurementPrincipal.deleteMany({ where: { id: { in: [principal.id, guest.id, foreignPrincipal.id] } } });
      await prisma.measurementState.deleteMany({ where: { key: { in: [key, "collector", priorBaseline.key] } } });
      await prisma.measurementInvestigationExport.deleteMany({ where: { id: exportId } });
      await prisma.listing.deleteMany({ where: { id: { in: [stock.id, foreignStock.id] } } });
      await prisma.dealershipMember.deleteMany({ where: { dealershipId: business.id } });
      await prisma.dealership.deleteMany({ where: { id: { in: [business.id, otherBusiness.id] } } });
    }
  });


  it.each(["deletion", "bootstrap"] as const)("opposes real account scheduling and measurement bootstrap with %s holding User first", async first => {
    const epoch = randomUUID();
    await prisma.measurementState.create({ data: { key: "collector", epoch } });
    let entered!: () => void, release!: () => void;
    const held = new Promise<void>(resolve => { entered = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    // Boundary interception only pauses after the real first owner's SQL lock.
    // Both actual production transactions and PostgreSQL waits remain real.
    const bootstrapDb = prisma.$extends({ query: { $queryRaw: async ({ args, query }) => {
      const result: unknown = await query(args);
      if (first === "bootstrap" && Array.isArray(result) && result.length === 1 && result[0] && typeof result[0] === "object" && "deletionScheduledAt" in result[0]) {
        entered(); await released;
      }
      return result;
    } } });
    const store = new PrismaMeasurementStore(bootstrapDb as unknown as PrismaService, { epoch, environment: "test", population: "synthetic" }, () => NOW);
    const holdingDeletion: AccountDeletionUnitOfWork = { run: (command, work) => unitOfWork.run(command, async writes => {
      if (first === "deletion") { entered(); await released; }
      return work(writes);
    }) };
    const callDeletion = () => deleteMe(holdingDeletion).execute({ userId: USER_ID });
    const callBootstrap = () => store.bootstrap({ authenticatedUserId: USER_ID });
    let deletion: Promise<void> | undefined;
    let bootstrap: ReturnType<typeof callBootstrap> | undefined;
    try {
      if (first === "deletion") deletion = callDeletion(); else bootstrap = callBootstrap();
      await held;
      if (first === "deletion") bootstrap = callBootstrap(); else deletion = callDeletion();
      // Observe the real wait, not a sleep claimed as a concurrency proof.
      const deadline = Date.now() + 750;
      let blocked = false;
      while (Date.now() < deadline) {
        const [row] = await prisma.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND cardinality(pg_blocking_pids(pid))>0 AND (query LIKE '%diagnostic_prepare_source%' OR query LIKE '%"users"%')) AS blocked`;
        if (row?.blocked) { blocked = true; break; }
      }
      expect(blocked).toBe(true);
      release();
      const [deleted, bootstrapped] = await Promise.allSettled([deletion!, bootstrap!]);
      if (first === "deletion") {
        expect(deleted.status).toBe("fulfilled");
        expect(bootstrapped).toEqual({ status: "fulfilled", value: null });
      } else {
        expect(bootstrapped.status).toBe("fulfilled");
        if (bootstrapped.status === "fulfilled") expect(bootstrapped.value).not.toBeNull();
        // Bootstrap changed the prepared discovery while the account waited.
        // Refuse the whole stale command, then demonstrate an explicit retry.
        expect(deleted.status).toBe("rejected");
        if (deleted.status === "rejected") expect(String(deleted.reason)).toContain("diagnostic_source_graph_changed");
        expect(await readState()).toEqual(untouched);
        expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
        await deleteMe().execute({ userId: USER_ID });
      }
      expect(await readState()).toEqual(scheduled);
      expect(await prisma.measurementPrincipal.findUnique({ where: { userId: USER_ID } })).toBeNull();
      expect(await store.resolve({ authenticatedUserId: USER_ID })).toBeNull();
      expect(await store.bootstrap({ authenticatedUserId: USER_ID })).toBeNull();
      expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
    } finally {
      release();
      await Promise.allSettled([deletion, bootstrap]);
      await guards(false);
      await prisma.measurementPrincipal.deleteMany({ where: { userId: USER_ID } });
      await prisma.measurementState.deleteMany({ where: { key: "collector" } });
    }
  });

});
