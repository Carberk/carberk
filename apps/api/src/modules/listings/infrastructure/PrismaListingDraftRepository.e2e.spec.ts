import { execSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { PrismaService, userEligibilitySourceCommand, accountSourceCommand, businessSourceCommand, withDiagnosticSourceCommand, withCampaignPreparation, type Prisma, type DiagnosticSourceCommand, type DiagnosticSourceTuple, type CampaignMutation } from "@auto-tm/db";
import { Test, type TestingModule } from "@nestjs/testing";
import { MODULE_METADATA } from "@nestjs/common/constants";
import type { Provider } from "@nestjs/common";
import { IdentityModule } from "../../identity/identity.module";
import { BUSINESS_AUTHORITY_PORT, IDENTITY_CLOCK_PORT, type BusinessAuthorityPort } from "../../identity/identity.public";
import { ListingOwnership, type ListingActor } from "../application/ListingOwnership";

import { PrismaListingDraftRepository } from "./PrismaListingDraftRepository";
import { ListingDraft } from "../domain/ListingDraft";

describe("PrismaListingDraftRepository — Testcontainers", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let repo: PrismaListingDraftRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withUsername("auto_tm")
      .withPassword("auto_tm_pass")
      .withDatabase("auto_tm_test")
      .start();

    const dbUrl = container.getConnectionUri();
    const dbPackagePath = resolve(__dirname, "../../../../../../packages/db");

    execSync("pnpm prisma migrate deploy", {
      cwd: dbPackagePath,
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: "pipe",
    });

    process.env["DATABASE_URL"] = dbUrl;
    prisma = new PrismaService();
    const guards = await prisma.$queryRaw<{ table: string; name: string }[]>`
      SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%'
        OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')
    `;
    for (const guard of guards) {
      const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
      await prisma.$executeRawUnsafe(`ALTER TABLE public.${quote(guard.table)} ENABLE TRIGGER ${quote(guard.name)}`);
    }
    expect(await prisma.$queryRaw`SELECT public.diagnostic_source_guards_ready() AS source,
      public.campaign_preparation_ready() AS campaign`).toEqual([{ source: true, campaign: true }]);

    const configured = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, IdentityModule) as Provider[];
    const authorityProviders = configured.filter(provider => typeof provider === "function"
      ? ["CheckBusinessAuthority", "SystemClockAdapter"].includes(provider.name)
      : typeof provider === "object" && provider !== null && "provide" in provider &&
        [BUSINESS_AUTHORITY_PORT, IDENTITY_CLOCK_PORT, "IDENTITY_BUSINESS_AUTHORITY_REPOSITORY"].includes(String(provider.provide)));
    expect(authorityProviders).toHaveLength(5);
    authorityModule = await Test.createTestingModule({ providers: [{ provide: PrismaService, useValue: prisma }, ...authorityProviders] }).compile();
    ownership = new ListingOwnership(authorityModule.get<BusinessAuthorityPort>(BUSINESS_AUTHORITY_PORT));
    repo = new PrismaListingDraftRepository(prisma, ownership);
    await seedUser(`${suite}-foreign-user`); // Ordinary User INSERT needs no source receipt.
    foreignUser = await prisma.user.findUnique({ where: { id: `${suite}-foreign-user` } });
    foreignDraft = await repo.save(ListingDraft.create({ id: `${suite}-foreign-draft`, userId: `${suite}-foreign-user`, payload: { step: 1 } }));
  }, 120_000);

  afterAll(async () => {
    await authorityModule?.close();
    await prisma?.onModuleDestroy();
    await container?.stop();
  });

  // Retain scoped fixtures until disposable-container teardown. Hard User
  // DELETE is not a supported cleanup operation and must never be smuggled
  // through an empty protected DELETE or a disabled guard.
  const suite = `r7a-${randomUUID()}`;
  let caseNumber = 0, scope: string;
  const sid = (label: string) => `${scope}-${label}`;
  const phones = new Map<string, string>();
  function phone(userId: string) {
    const existing = phones.get(userId);
    if (existing) return existing;
    const value = `+9936${String(phones.size + 1).padStart(7, "0")}`;
    phones.set(userId, value);
    return value;
  }
  beforeEach(() => {
    scope = `${suite}-${++caseNumber}`;
    businessId = sid("business");
    actor = { userId: sid("sales"), sessionId: sid("session"), businessId };
    owner = { userId: sid("owner"), sessionId: sid("owner-session"), businessId };
  });
  afterEach(async () => {
    if (!prisma) return;
    expect(await prisma.user.findUnique({ where: { id: `${suite}-foreign-user` } })).toEqual(foreignUser);
    expect(await repo.findById(`${suite}-foreign-draft`)).toEqual(foreignDraft);
    await noReceipts();
  });
  let foreignUser: Awaited<ReturnType<PrismaService["user"]["findUnique"]>>;
  let foreignDraft: ListingDraft;

  async function seedUser(userId: string): Promise<void> {
    await prisma.user.create({
      data: { id: userId, phone: phone(userId), phoneVerifiedAt: new Date(), role: "buyer" },
    });
  }

  it("saves and retrieves a draft", async () => {
    await seedUser(sid("user-1"));
    const draft = ListingDraft.create({
      id: sid("draft-1"),
      userId: sid("user-1"),
      payload: { vin: "WBA123" },
    });

    const saved = await repo.save(draft);
    expect(saved.id).toBe(sid("draft-1"));
    expect(saved.userId).toBe(sid("user-1"));

    await expect(repo.save(draft)).rejects.toMatchObject({ code: "P2002" });
    const found = await repo.findById(sid("draft-1"));
    expect(found).not.toBeNull();
    expect(found!.payload).toEqual({ vin: "WBA123" });
  });

  it("returns null for non-existent draft", async () => {
    const found = await repo.findById(sid("non-existent"));
    expect(found).toBeNull();
  });

  it("updates a draft payload", async () => {
    await seedUser(sid("user-1"));
    const draft = ListingDraft.create({
      id: sid("draft-1"),
      userId: sid("user-1"),
      payload: { step: 1 },
    });
    await repo.save(draft);

    const updated = draft.updatePayload({ step: 2 }, new Date());
    const saved = await repo.update(updated);

    expect(saved.payload).toEqual({ step: 2 });

    const found = await repo.findById(sid("draft-1"));
    expect(found!.payload).toEqual({ step: 2 });
  });

  it("deletes a draft", async () => {
    await seedUser(sid("user-1"));
    const draft = ListingDraft.create({ id: sid("draft-1"), userId: sid("user-1") });
    await repo.save(draft);

    await repo.delete(sid("draft-1"));
    const found = await repo.findById(sid("draft-1"));
    expect(found).toBeNull();
  });

  it("lists drafts by user with pagination", async () => {
    await seedUser(sid("user-1"));
    await seedUser(sid("user-2"));
    await repo.save(ListingDraft.create({ id: sid("d1"), userId: sid("user-1"), payload: { a: 1 } }));
    // Small delay to ensure different updatedAt
    await new Promise((r) => setTimeout(r, 10));
    await repo.save(ListingDraft.create({ id: sid("d2"), userId: sid("user-1"), payload: { a: 2 } }));
    await new Promise((r) => setTimeout(r, 10));
    await repo.save(ListingDraft.create({ id: sid("d3"), userId: sid("user-2"), payload: { a: 3 } }));

    const result = await repo.findByUserId(sid("user-1"), { limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.userId).toBe(sid("user-1"));
    expect(result.nextCursor).toBeDefined();

    const page2 = await repo.findByUserId(sid("user-1"), {
      limit: 1,
      cursor: result.nextCursor!,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]!.id).not.toBe(result.items[0]!.id);
    expect(page2.nextCursor).toBeUndefined();
  });

  it("orders drafts by updatedAt DESC", async () => {
    await seedUser(sid("user-1"));
    const d1 = ListingDraft.create({ id: sid("d1"), userId: sid("user-1") });
    await repo.save(d1);
    await new Promise((r) => setTimeout(r, 50));

    const d2 = ListingDraft.create({ id: sid("d2"), userId: sid("user-1") });
    await repo.save(d2);
    await new Promise((r) => setTimeout(r, 50));

    const d3 = ListingDraft.create({ id: sid("d3"), userId: sid("user-1") });
    await repo.save(d3);

    const result = await repo.findByUserId(sid("user-1"), { limit: 10 });
    expect(result.items.map((d) => d.id)).toEqual([sid("d3"), sid("d2"), sid("d1")]);
  });

  describe("saveWithinLimit", () => {
    it("saves while the User is under the limit", async () => {
      await seedUser(sid("user-1"));
      await repo.save(ListingDraft.create({ id: sid("d1"), userId: sid("user-1") }));

      const saved = await repo.saveWithinLimit(ListingDraft.create({ id: sid("d2"), userId: sid("user-1") }), 2);

      expect(saved?.id).toBe(sid("d2"));
      expect(await prisma.listingDraft.count({ where: { userId: sid("user-1") } })).toBe(2);
    });

    it("returns null and saves nothing at the limit", async () => {
      await seedUser(sid("user-1"));
      await seedUser(sid("user-2"));
      await repo.save(ListingDraft.create({ id: sid("d1"), userId: sid("user-1") }));
      await repo.save(ListingDraft.create({ id: sid("d2"), userId: sid("user-1") }));
      await repo.save(ListingDraft.create({ id: sid("other"), userId: sid("user-2") }));

      const saved = await repo.saveWithinLimit(ListingDraft.create({ id: sid("d3"), userId: sid("user-1") }), 2);

      expect(saved).toBeNull();
      expect(await repo.findById(sid("d3"))).toBeNull();
    });

    it("serializes concurrent saves for one User", async () => {
      await seedUser(sid("user-1"));

      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          repo.saveWithinLimit(ListingDraft.create({ id: sid(`c${i}`), userId: sid("user-1") }), 5),
        ),
      );

      expect(results.filter((r) => r !== null)).toHaveLength(5);
      expect(await prisma.listingDraft.count({ where: { userId: sid("user-1") } })).toBe(5);
    });
  });
  // These scenarios are authored PostgreSQL cases, not offline SQL claims.
  // This disposable suite enables and asserts the existing guard profile.
  // The parent owns execution after shared bootstrap is repaired.
  // The repository itself owns its preparation in every case.
  let businessId: string;
  let actor: { userId: string; sessionId: string; businessId: string };
  let owner: typeof actor;
  const at = new Date("2026-10-25T00:00:00.000Z");
  let authorityModule: TestingModule;
  let ownership: ListingOwnership;

  async function businessFixture(member = true) {
    for (const userId of [owner.userId, actor.userId, sid("r7a-other")]) await seedUser(userId);
    await prisma.dealership.create({ data: { id: businessId, slug: businessId, name: "Draft test Business", status: "active" } });
    for (const current of [owner, actor]) await prisma.session.create({ data: {
      id: current.sessionId, userId: current.userId, refreshTokenHash: current.sessionId,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    } }); // Ordinary Session INSERT, no protected update/delete.
    await createMember(sid("r7a-owner-member"), owner.userId, "owner");
    if (member) await createMember(sid("r7a-sales-member"), actor.userId, "sales");
  }
  async function createMember(id: string, userId: string, role: "owner" | "sales") {
    await prisma.$transaction(async tx => {
      const command = await businessSourceCommand(tx, { operation: "member_create", businessId,
        actorUserId: owner.userId, sessionId: owner.sessionId,
        roots: [{ table: "users", key: { id: userId } }], member: { id, userId, role } });
      await withDiagnosticSourceCommand(tx, command, () => tx.dealershipMember.create({ data: { id, userId, dealershipId: businessId, role } }));
    });
  }
  async function changeBusiness(operation: "member_remove" | "member_eligibility" | "business_eligibility") {
    await prisma.$transaction(async tx => {
      const common = { businessId, actorUserId: owner.userId, sessionId: owner.sessionId,
        roots: [{ table: "users" as const, key: { id: actor.userId } }] };
      const command = await businessSourceCommand(tx, operation === "business_eligibility"
        ? { ...common, operation, status: "suspended" }
        : { ...common, operation, memberId: sid("r7a-sales-member"), status: "suspended" });
      await withDiagnosticSourceCommand(tx, command, async () => {
        await ownership.authorize(owner, { businessId }, tx);
        if (operation === "member_remove") await tx.dealershipMember.delete({ where: { id: sid("r7a-sales-member") } });
        else if (operation === "member_eligibility") await tx.dealershipMember.update({ where: { id: sid("r7a-sales-member") }, data: { status: "suspended" } });
        else await tx.dealership.update({ where: { id: businessId }, data: { status: "suspended" } });
      });
    });
  }
  async function expireSession() {
    await prisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw<{ source: DiagnosticSourceTuple; next: DiagnosticSourceTuple }[]>`
        WITH old AS (SELECT public.diagnostic_source_project(public.diagnostic_source_read('sessions',
          jsonb_build_object('id',${actor.sessionId}::text)),public.diagnostic_source_meta('sessions')->'fields') source)
        SELECT source,public.diagnostic_source_normalize('sessions',source||jsonb_build_object('expiresAt','2000-01-01T00:00:00.000Z')) next FROM old
      `;
      if (!row) throw new Error("missing fixture Session");
      await withDiagnosticSourceCommand(tx, { operation: "session_change", roots: [{ table: "sessions", key: { id: actor.sessionId } }],
        rows: [{ table: "sessions", key: { id: actor.sessionId }, verb: "update", expected: { source: row.source }, next: row.next }],
        actorUserId: actor.userId, sessionId: actor.sessionId, cutoff: null, campaign: null }, () =>
        tx.session.update({ where: { id: actor.sessionId }, data: { expiresAt: new Date("2000-01-01") } }));
    });
  }
  async function schedule(userId: string) {
    await prisma.$transaction(async tx => {
      const prepared = await accountSourceCommand(tx, { operation: "account_schedule", userId, deletionScheduledAt: new Date("2026-10-01") });
      await withDiagnosticSourceCommand(tx, prepared.command, async () => {
        await tx.user.update({ where: { id: userId }, data: { deletionScheduledAt: new Date("2026-10-01") } });
        await tx.listing.updateMany({ where: { sellerId: userId, businessId: null, status: "active" }, data: { status: "archived", archivedByDeletion: true } });
      });
    });
  }
  function businessDraft(id: string, userId = actor.userId) {
    return new ListingDraft(id, userId, { step: 1, photos: [] }, at, at, businessId);
  }
  function gate<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
  }
  // Intercept only the database transaction boundary. All reads, SQL preparation,
  // writes and commits use a real separate client/connection.
  function connection(client: PrismaService, hold = false, fail = false, pauseDiscovery = false) {
    const entered = gate<number>(), completed = gate<undefined>(), release = gate<undefined>(), discovered = gate<undefined>();
    let paused = false;
    let discovery: unknown;
    const wrapped = new Proxy(client, { get(target, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { maxWait?: number; timeout?: number }) => target.$transaction(async tx => {
        const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int pid`;
        entered.resolve(row!.pid);
        const transaction = pauseDiscovery ? new Proxy(tx, { get(target, property) {
          if (property === "$queryRaw") return async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
            const result = await target.$queryRaw(query, ...values);
            const sql = Array.isArray(query) ? query.join("?") : (query as Prisma.Sql).sql;
            if (!paused && sql.includes("WITH RECURSIVE")) {
              discovery = (result as unknown[])[0];
              paused = true; discovered.resolve(undefined); await release.promise;
            }
            return result;
          };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        } }) : tx;
        const result = await work(transaction);
        if (fail) throw new Error("r7a after complete draft work");
        completed.resolve(undefined);
        if (hold) await release.promise;
        return result;
      }, options);
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    return { client: wrapped, entered, completed, release, discovered, discovery: () => discovery };
  }
  async function blocked(waiter: number, blocker: number) {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const [row] = await prisma.$queryRaw<{ blocked: boolean }[]>`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) blocked`;
      if (row?.blocked) return;
      await new Promise(done => setTimeout(done, 10));
    }
    throw new Error(`Backend ${waiter} did not block on ${blocker}`);
  }
  async function noReceipts() {
    expect(await prisma.$queryRaw`SELECT id FROM public.campaign_preparations`).toEqual([]);
    expect(await prisma.$queryRaw`SELECT id FROM public.diagnostic_source_commands`).toEqual([]);
  }

  it("creates, updates and deletes Business drafts with current configured Session authority", async () => {
    await businessFixture();
    const draft = businessDraft(sid("r7a-draft"));
    const saved = await repo.saveWithinLimit(draft, 1, actor);
    expect(saved).toMatchObject({ userId: actor.userId, businessId, createdAt: at, updatedAt: at, payload: { step: 1, photos: [] } });
    expect(await repo.saveWithinLimit(businessDraft(sid("r7a-limit"), owner.userId), 1, owner)).toBeNull();
    expect(await repo.update(draft, actor)).toEqual(draft);
    const edited = draft.updatePayload({ step: 2 }, new Date("2026-10-25T01:00:00.000Z"));
    await repo.update(edited, owner);
    expect(await repo.findById(draft.id)).toMatchObject({ payload: { step: 2 }, userId: actor.userId, createdAt: at, updatedAt: edited.updatedAt });
    await repo.delete(draft.id, owner);
    expect(await repo.findById(draft.id)).toBeNull();
    await noReceipts();
  });

  it("retains missing update/delete P2025, missing User FK and absent Business authority refusal", async () => {
    await seedUser(sid("user-1"));
    await expect(repo.update(ListingDraft.create({ id: sid("absent"), userId: sid("user-1") }))).rejects.toMatchObject({ code: "P2025" });
    await expect(repo.delete(sid("absent"))).rejects.toMatchObject({ code: "P2025" });
    await expect(repo.save(ListingDraft.create({ id: sid("absent-user"), userId: sid("missing") }))).rejects.toMatchObject({ code: "P2003" });
    await expect(repo.saveWithinLimit(businessDraft(sid("absent-business"), sid("user-1")), 5, { userId: sid("user-1"), sessionId: sid("absent"), businessId })).rejects.toMatchObject({ response: { code: "FORBIDDEN", details: { reason: "SESSION_REQUIRED" } } });
    expect(await prisma.listingDraft.count({ where: { id: { startsWith: scope } } })).toBe(0);
    await noReceipts();
  });

  for (const refusal of ["missing actor", "wrong Business", "wrong Session", "expired Session", "inactive member", "missing member", "inactive User", "inactive Business"] as const) {
    it(`refuses Business create/update/delete atomically for ${refusal}`, async () => {
      await businessFixture();
      const draft = businessDraft(sid("r7a-draft"));
      await repo.saveWithinLimit(draft, 5, actor);
      let supplied: ListingActor | undefined = actor;
      if (refusal === "missing actor") supplied = undefined;
      if (refusal === "wrong Business") supplied = { ...actor, businessId: sid("other-business") };
      if (refusal === "wrong Session") supplied = { ...actor, sessionId: owner.sessionId };
      if (refusal === "expired Session") await expireSession();
      if (refusal === "inactive member") await changeBusiness("member_eligibility");
      if (refusal === "missing member") await changeBusiness("member_remove");
      if (refusal === "inactive User") {
        await prisma.$transaction(async tx => {
          const command = await userEligibilitySourceCommand(tx, { userId: actor.userId, actorUserId: owner.userId, suspendedAt: at, reason: "fixture suspension" });
          await withDiagnosticSourceCommand(tx, command, async () => {
            await tx.user.update({ where: { id: actor.userId }, data: { suspendedAt: at, suspendedById: owner.userId, suspensionReason: "fixture suspension" } });
            await tx.session.deleteMany({ where: { userId: actor.userId } });
          });
        });
        // Suspension revokes Sessions. Retain that real outcome and pin its
        // current refusal, rather than inventing an active suspended Session.
        expect(await prisma.session.findUnique({ where: { id: actor.sessionId } })).toBeNull();
      }
      const reason = refusal === "wrong Business" ? "BUSINESS_CONTEXT_CHANGED"
        : refusal === "inactive Business" ? "BUSINESS_INACTIVE"
        : refusal === "inactive member" || refusal === "missing member" ? "MEMBERSHIP_REQUIRED" : "SESSION_REQUIRED";
      const denied = (result: Promise<unknown>) => refusal === "missing actor"
        ? expect(result).rejects.toThrow("Business draft requires current actor")
        : expect(result).rejects.toMatchObject({ response: { code: "FORBIDDEN", details: { reason } } });
      if (refusal === "inactive Business") await changeBusiness("business_eligibility");
      await denied(repo.saveWithinLimit(businessDraft(sid("r7a-refused")), 5, supplied));
      await denied(repo.update(draft.updatePayload({ step: 99 }, new Date()), supplied));
      await denied(repo.delete(draft.id, supplied));
      expect(await repo.findById(sid("r7a-refused"))).toBeNull();
      expect(await repo.findById(draft.id)).toMatchObject({ payload: { step: 1, photos: [] }, createdAt: at, updatedAt: at });
      expect(await prisma.listingDraft.count({ where: { id: { startsWith: scope } } })).toBe(1);
      await noReceipts();
    });
  }

  it("closes raw Business save and refuses a proposed owner that differs from the stored owner", async () => {
    await businessFixture();
    const draft = businessDraft(sid("r7a-draft"));
    await expect(repo.save(draft)).rejects.toThrow("Business draft requires current actor");
    await repo.saveWithinLimit(draft, 5, actor);
    await expect(repo.update(new ListingDraft(draft.id, owner.userId, {}, at, at, businessId), owner)).rejects.toThrow("draft_owner_changed");
    await expect(repo.update(new ListingDraft(draft.id, actor.userId, {}, at, at), actor)).rejects.toThrow("draft_owner_changed");
    expect(await repo.findById(draft.id)).toMatchObject({ userId: actor.userId, businessId, payload: { step: 1, photos: [] } });
  });

  for (const business of [false, true]) {
    for (const operation of ["save", "saveWithinLimit", "update", "delete"] as const) {
      if (business && operation === "save") continue; // Business save has no actor argument and is explicitly refused above.
      it(`rolls back complete ${business ? "Business" : "personal"} ${operation} work before commit`, async () => {
        if (business) await businessFixture(); else await seedUser(sid("user-1"));
        const draft = business ? businessDraft(sid("r7a-draft")) : new ListingDraft(sid("r7a-draft"), sid("user-1"), { step: 1 }, at, at);
        if (operation === "update" || operation === "delete") await repo.saveWithinLimit(draft, 5, business ? actor : undefined);
        const failing = connection(prisma, false, true);
        const repository = new PrismaListingDraftRepository(failing.client, ownership);
        const result = operation === "delete" ? repository.delete(draft.id, business ? actor : undefined)
          : operation === "save" ? repository.save(draft)
          : operation === "saveWithinLimit" ? repository.saveWithinLimit(draft, 5, business ? actor : undefined)
          : repository.update(draft.updatePayload({ step: 2 }, new Date()), business ? actor : undefined);
        await expect(result).rejects.toThrow("r7a after complete draft work");
        expect(await repo.findById(draft.id)).toEqual(operation === "update" || operation === "delete" ? draft : null);
        await noReceipts();
      });
    }
    it(`serializes ${business ? "shared Business" : "personal"} limit creates on distinct backends`, async () => {
      if (business) await businessFixture(); else await seedUser(sid("user-1"));
      const a = new PrismaService(), b = new PrismaService();
      const first = connection(a, true), second = connection(b);
      const firstDraft = business ? businessDraft(sid("r7a-first"), owner.userId) : ListingDraft.create({ id: sid("r7a-first"), userId: sid("user-1") });
      const secondDraft = business ? businessDraft(sid("r7a-second")) : ListingDraft.create({ id: sid("r7a-second"), userId: sid("user-1") });
      let one: Promise<ListingDraft | null> | undefined, two: Promise<ListingDraft | null> | undefined;
      try {
        one = new PrismaListingDraftRepository(first.client, ownership).saveWithinLimit(firstDraft, 1, business ? owner : undefined);
        await Promise.race([first.completed.promise, one]);
        two = new PrismaListingDraftRepository(second.client, ownership).saveWithinLimit(secondDraft, 1, business ? actor : undefined);
        const [pid1, pid2] = await Promise.all([first.entered.promise, second.entered.promise]);
        expect(pid1).not.toBe(pid2);
        await blocked(pid2, pid1);
        first.release.resolve(undefined);
        expect((await one)?.id).toBe(firstDraft.id);
        expect(await two).toBeNull();
        expect(await repo.findById(secondDraft.id)).toBeNull();
        expect(await prisma.listingDraft.count({ where: { id: { startsWith: scope } } })).toBe(1);
      } finally {
        first.release.resolve(undefined);
        await Promise.allSettled([one, two]);
        await a.$disconnect(); await b.$disconnect();
      }
      await noReceipts();
    });
  }

  // Narrow accepted source cases deliberately reuse the real source command
  // instead of copying a purge worker or changing any excluded caller.
  for (const opposing of ["account deletion", "account purge", "membership admission", "membership suspension", "membership removal"] as const) {
    for (const draftFirst of opposing === "membership admission" ? [false] : [false, true]) {
      it(`refuses stale discovery for ${opposing}, ${draftFirst ? "draft" : "source"} first, with observed blocking`, async () => {
        const business = opposing.startsWith("membership");
        if (business) await businessFixture(opposing !== "membership admission"); else await seedUser(sid("user-1"));
        const userId = business ? actor.userId : sid("user-1");
        if (opposing === "account purge") await schedule(userId);
        const draft = business ? businessDraft(sid("r7a-race")) : ListingDraft.create({ id: sid("r7a-race"), userId });
        const a = new PrismaService(), b = new PrismaService();
        const first = connection(a, true), second = connection(b);
        async function source(client: PrismaService) {
          return client.$transaction(async tx => {
            if (opposing === "account purge") {
              // Narrow real SQL purge case: this fixture has only a User and
              // personal drafts. SQL derives the exact tombstone and child union.
              // This is not a claim about the excluded full worker composition.
              const seed = { operation: "account_purge", roots: [{ table: "users", key: { id: userId } }], rows: [],
                actorUserId: null, sessionId: null, cutoff: at, campaign: null };
              const [tuple] = await tx.$queryRaw<{ source: DiagnosticSourceTuple; next: DiagnosticSourceTuple }[]>`
                SELECT e->'expected'->'source' source,e->'next' next
                FROM jsonb_array_elements(public.diagnostic_account_purge_effects(${JSON.stringify(seed)}::jsonb)) e
                WHERE e->>'table'='users' AND e->'key'->>'id'=${userId}
              `;
              if (!tuple) throw new Error("missing purge tuple");
              const command: DiagnosticSourceCommand = { ...seed, operation: "account_purge", roots: [{ table: "users", key: { id: userId } }],
                rows: [{ table: "users", key: { id: userId }, verb: "update", expected: { source: tuple.source }, next: tuple.next }] };
              return withDiagnosticSourceCommand(tx, command, async () => {
                await tx.user.update({ where: { id: userId }, data: { phone: null, phoneVerifiedAt: null, email: null, emailVerifiedAt: null,
                  displayName: null, avatarKey: null, avatarUploadId: null, avatarUrl: null, deletionScheduledAt: null } });
                await tx.listingDraft.deleteMany({ where: { userId, businessId: null } });
              });
            }
            if (!business) {
              const prepared = await accountSourceCommand(tx, { operation: "account_schedule", userId, deletionScheduledAt: new Date("2026-10-01") });
              return withDiagnosticSourceCommand(tx, prepared.command, async () => {
                await tx.user.update({ where: { id: userId }, data: { deletionScheduledAt: new Date("2026-10-01") } });
                await tx.listing.updateMany({ where: { sellerId: userId, businessId: null, status: "active" }, data: { status: "archived", archivedByDeletion: true } });
              });
            }
            const operation = opposing === "membership removal" ? "member_remove" : "member_eligibility";
            const command = opposing === "membership admission"
              ? await businessSourceCommand(tx, { operation: "member_create", businessId, actorUserId: owner.userId, sessionId: owner.sessionId,
                roots: [{ table: "users", key: { id: actor.userId } }], member: { id: sid("r7a-sales-member"), userId: actor.userId, role: "sales" } })
              : await businessSourceCommand(tx, { operation, businessId, actorUserId: owner.userId, sessionId: owner.sessionId,
                roots: [{ table: "users", key: { id: actor.userId } }], memberId: sid("r7a-sales-member"), status: "suspended" });
            return withDiagnosticSourceCommand(tx, command, async () => {
              await ownership.authorize(owner, { businessId }, tx);
              if (opposing === "membership admission") await tx.dealershipMember.create({ data: { id: sid("r7a-sales-member"), userId: actor.userId, dealershipId: businessId, role: "sales" } });
              else if (operation === "member_remove") await tx.dealershipMember.delete({ where: { id: sid("r7a-sales-member") } });
              else await tx.dealershipMember.update({ where: { id: sid("r7a-sales-member") }, data: { status: "suspended" } });
            });
          });
        }
        const write = (client: PrismaService) => new PrismaListingDraftRepository(client, ownership).saveWithinLimit(draft, 5, business ? actor : undefined);
        let one: Promise<unknown> | undefined, two: Promise<unknown> | undefined;
        try {
          one = draftFirst ? write(first.client) : source(first.client);
          await Promise.race([first.completed.promise, one]);
          two = draftFirst ? source(second.client) : write(second.client);
          // Register rejection before releasing the blocker.
          const secondOutcome = two.then(value => ({ ok: true, value }), error => ({ ok: false, error }));
          const [pid1, pid2] = await Promise.all([first.entered.promise, second.entered.promise]);
          expect(pid1).not.toBe(pid2); await blocked(pid2, pid1);
          first.release.resolve(undefined);
          await one;
          const result = await secondOutcome;
          expect(result.ok).toBe(false);
          if (!result.ok && "error" in result) expect(String(result.error)).toMatch(/draft_dependencies_changed|diagnostic_source_graph_changed|diagnostic_source_stale/);
          expect(await repo.findById(draft.id)).toEqual(draftFirst ? draft : null);
          if (opposing === "account purge") {
            const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
            expect(user.deletionScheduledAt).toEqual(draftFirst ? new Date("2026-10-01") : null);
            expect(user.phone).toEqual(draftFirst ? phone(userId) : null);
          } else if (!business) expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletionScheduledAt).toEqual(draftFirst ? null : new Date("2026-10-01"));
          else if (opposing === "membership admission") expect(await prisma.dealershipMember.findUnique({ where: { id: sid("r7a-sales-member") } })).toMatchObject({ userId: actor.userId, status: "active" });
          else if (draftFirst || opposing === "membership suspension") expect(await prisma.dealershipMember.findUnique({ where: { id: sid("r7a-sales-member") } })).toMatchObject(
            { status: draftFirst ? "active" : "suspended" },
          );
          if (business && !draftFirst && opposing === "membership removal") expect(await prisma.dealershipMember.findUnique({ where: { id: sid("r7a-sales-member") } })).toBeNull();
        } finally {
          first.release.resolve(undefined); await Promise.allSettled([one, two]);
          await a.$disconnect(); await b.$disconnect();
        }
        await noReceipts();
      });
    }
  }

  it("refuses a stored owner changed after discovery without applying the proposed payload", async () => {
    await seedUser(sid("user-1")); await seedUser(sid("user-2"));
    const draft = new ListingDraft(sid("r7a-owner-race"), sid("user-1"), { step: 1 }, at, at);
    await repo.save(draft);
    const a = new PrismaService(), b = new PrismaService();
    const paused = connection(a, false, false, true);
    const writing = new PrismaListingDraftRepository(paused.client).update(draft.updatePayload({ step: 2 }, new Date()));
    const outcome = writing.then(value => ({ ok: true, value }), error => ({ ok: false, error }));
    try {
      await Promise.race([paused.discovered.promise, writing]);
      // A fixture-only ordinary draft owner transition. Its campaign prefix
      // and both User keys precede the draft row/FK write. No source operation
      // is invented for this ordinary table mutation.
      await b.$transaction(tx => withCampaignPreparation(tx, [{ table: "listing_drafts", key: { id: draft.id }, verb: "update", next: { userId: sid("user-2") } }], async () => {
        const keys = await tx.$queryRaw<{ key: number }[]>`
          SELECT hashtext(jsonb_build_array('pk',jsonb_build_object('id',id))::text) key
          FROM (VALUES (${sid("user-1")}::text),(${sid("user-2")}::text)) users(id) ORDER BY key
        `;
        for (const key of keys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(897100,${key.key}::int)`;
        await tx.$queryRaw`SELECT id FROM public.users WHERE id IN (${sid("user-1")},${sid("user-2")}) ORDER BY id FOR UPDATE`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(897401,hashtext(jsonb_build_array('pk',jsonb_build_object('id',${draft.id}::text))::text))`;
        await tx.listingDraft.update({ where: { id: draft.id }, data: { userId: sid("user-2") } });
      }));
      paused.release.resolve(undefined);
      const result = await outcome;
      expect(result.ok).toBe(false);
      if (!result.ok && "error" in result) expect(String(result.error)).toContain("draft_dependencies_changed");
      expect(await repo.findById(draft.id)).toMatchObject({ userId: sid("user-2"), payload: { step: 1 }, createdAt: at });
    } finally {
      paused.release.resolve(undefined); await Promise.allSettled([writing]); await a.$disconnect(); await b.$disconnect();
    }
    await noReceipts();
  });

  // Deterministic UUIDs per suite/test, matching the V1 private source layout.
  function videoIds() {
    const uuid = (label: string) => {
      const hex = createHash("sha256").update(sid(label)).digest("hex");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    };
    return { uploadId: uuid("upload"), sessionId: uuid("video-session") };
  }
  function generationData() {
    const { uploadId, sessionId } = videoIds();
    return { id: sessionId, sessionId, listingId: sid("r7a-video-draft"), uploadId,
      state: "UPLOADING", targetRevision: 1, processingVersion: "ffmpeg-debian-5.1.9-v1" };
  }
  async function videoFixture(generation = true) {
    const { uploadId, sessionId } = videoIds();
    const sourceKey = `video/v1/${uploadId}/${sessionId}/source.mp4`;
    const expiresAt = new Date("2099-01-01T00:00:00.000Z");
    const upload = { id: uploadId, userId: sid("user-1"), key: sourceKey, kind: "video" as const, contentType: "video/mp4", sizeBytes: 1024,
      writeProtocol: "video-v1", objectKeys: [sourceKey], state: "PREPARING", claimToken: sessionId,
      claimTargetType: "video_session", claimTargetId: sessionId, claimDeadline: expiresAt };
    const session = { id: sessionId, uploadId, userId: sid("user-1"), sourceKey, sizeBytes: 1024, sha256: "a".repeat(64),
      protocolVersion: 1, targetKind: "draft", targetId: sid("r7a-video-draft"), targetRevision: 1,
      idempotencyKey: sid("video-reserve"), idempotencyHash: "b".repeat(64), state: "INITIALIZING", expiresAt };
    const mutations: CampaignMutation[] = [
      { table: "media_uploads", key: { id: uploadId }, verb: "insert", next: { ...upload, claimDeadline: expiresAt.toISOString() } },
      { table: "video_upload_sessions", key: { id: sessionId }, verb: "insert", next: { ...session, expiresAt: expiresAt.toISOString() } },
      ...(generation ? [{ table: "video_generations", key: { id: sessionId }, verb: "insert" as const, next: generationData() }] : []),
    ];
    await prisma.$transaction(tx => withCampaignPreparation(tx, mutations, async () => {
      await tx.mediaUpload.create({ data: upload });
      await tx.videoUploadSession.create({ data: session });
      if (generation) await tx.videoGeneration.create({ data: generationData() });
    }));
    return { uploadId, sessionId };
  }
  async function videoState() {
    const { uploadId, sessionId } = videoIds();
    return {
      user: await prisma.user.findUnique({ where: { id: sid("user-1") } }),
      sessions: await prisma.session.findMany({ where: { userId: sid("user-1") }, orderBy: { id: "asc" } }),
      upload: await prisma.mediaUpload.findUnique({ where: { id: uploadId } }),
      session: await prisma.videoUploadSession.findUnique({ where: { id: sessionId } }),
      generations: await prisma.videoGeneration.findMany({ where: { OR: [{ id: sessionId }, { sessionId }, { listingId: sid("r7a-video-draft") }] }, orderBy: { id: "asc" } }),
      process: await prisma.videoProcessWork.findMany({ where: { OR: [{ uploadId }, { sessionId }, { generationId: sessionId }] }, orderBy: { generationId: "asc" } }),
      cleanup: await prisma.videoCleanupWork.findMany({ where: { OR: [{ uploadId }, { sessionId }, { generationId: sessionId }] }, orderBy: { id: "asc" } }),
      uploadCleanup: await prisma.mediaUploadCleanup.findMany({ where: { uploadId }, orderBy: { uploadId: "asc" } }),
      grants: await prisma.videoGrant.findMany({ where: { generationId: sessionId }, orderBy: { id: "asc" } }),
    };
  }
  it("uses actual draft-target V1 sessions without treating public payload as video authority", async () => {
    await seedUser(sid("user-1"));
    const draft = new ListingDraft(sid("r7a-video-draft"), sid("user-1"), { step: 1, photos: [] }, at, at);
    await repo.save(draft); // A real draft target exists before the private V1 session.
    const { uploadId, sessionId } = await videoFixture();
    const before = await videoState();
    expect(before.upload).toMatchObject({ id: uploadId, objectKeys: [`video/v1/${uploadId}/${sessionId}/source.mp4`],
      claimTargetType: "video_session", claimTargetId: sessionId, claimToken: sessionId, claimDeadline: new Date("2099-01-01T00:00:00.000Z") });
    expect(before.generations).toHaveLength(1);
    expect(before.generations[0]).toMatchObject({ id: sessionId, sessionId });
    expect(before.process).toEqual([]); expect(before.cleanup).toEqual([]);
    expect(before.uploadCleanup).toEqual([]); expect(before.grants).toEqual([]);
    await repo.delete(draft.id);
    expect(await videoState()).toEqual(before);
    expect(await repo.save(draft)).toEqual(draft);
    expect(await videoState()).toEqual(before);
    const changed = draft.updatePayload({ step: 2 }, new Date("2026-10-25T01:00:00.000Z"));
    expect(await repo.update(changed)).toEqual(changed);
    expect(await videoState()).toEqual(before);
    await repo.delete(draft.id);
    expect(await repo.findById(draft.id)).toBeNull();
    expect(await videoState()).toEqual(before);
    await noReceipts();
  });

  it("refuses a V1 generation appearing after discovery and preserves the separately committed generation", async () => {
    await seedUser(sid("user-1"));
    const draft = new ListingDraft(sid("r7a-video-draft"), sid("user-1"), { step: 1 }, at, at);
    await repo.save(draft);
    const { sessionId } = await videoFixture(false);
    const before = await videoState();
    expect(before.generations).toEqual([]);
    const a = new PrismaService(), b = new PrismaService();
    const paused = connection(a, false, false, true);
    const writing = new PrismaListingDraftRepository(paused.client).update(draft.updatePayload({ step: 2 }, new Date()));
    const outcome = writing.then(value => ({ ok: true, value }), error => ({ ok: false, error }));
    try {
      await Promise.race([paused.discovered.promise, writing]);
      // The repository has completed real unlocked discovery, including the
      // null generation row and PK key, before this separate commit.
      expect(paused.discovery()).toMatchObject({ scope: expect.arrayContaining([
        { table: "video_generations", key: { id: sessionId }, row: null },
      ]) });
      const [key] = await b.$queryRaw<{ key: number }[]>`SELECT hashtext(jsonb_build_array('pk',jsonb_build_object('id',${sessionId}::text))::text) key`;
      expect(paused.discovery()).toMatchObject({ keys: expect.arrayContaining([{ namespace: 898102, key: key!.key }]) });
      const committed = await b.$transaction(tx => withCampaignPreparation(tx,
        [{ table: "video_generations", key: { id: sessionId }, verb: "insert", next: generationData() }],
        () => tx.videoGeneration.create({ data: generationData() })));
      paused.release.resolve(undefined);
      const result = await outcome;
      expect(result.ok).toBe(false);
      if (!result.ok && "error" in result) expect(String(result.error)).toContain("draft_dependencies_changed");
      expect(await repo.findById(draft.id)).toEqual(draft);
      expect(await videoState()).toEqual({ ...before, generations: [committed] });
    } finally {
      paused.release.resolve(undefined); await Promise.allSettled([writing]); await a.$disconnect(); await b.$disconnect();
    }
    await noReceipts();
  });
});
