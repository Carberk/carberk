import { execSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { PrismaService, accountSourceCommand, businessSourceCommand, withDiagnosticSourceCommand, withCampaignPreparation, type Prisma, type DiagnosticSourceCommand, type DiagnosticSourceTuple } from "@auto-tm/db";
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
    const configured = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, IdentityModule) as Provider[];
    const authorityProviders = configured.filter(provider => typeof provider === "function"
      ? ["CheckBusinessAuthority", "SystemClockAdapter"].includes(provider.name)
      : typeof provider === "object" && provider !== null && "provide" in provider &&
        [BUSINESS_AUTHORITY_PORT, IDENTITY_CLOCK_PORT, "IDENTITY_BUSINESS_AUTHORITY_REPOSITORY"].includes(String(provider.provide)));
    expect(authorityProviders).toHaveLength(5);
    authorityModule = await Test.createTestingModule({ providers: [{ provide: PrismaService, useValue: prisma }, ...authorityProviders] }).compile();
    ownership = new ListingOwnership(authorityModule.get<BusinessAuthorityPort>(BUSINESS_AUTHORITY_PORT));
    repo = new PrismaListingDraftRepository(prisma, ownership);
  }, 120_000);

  afterAll(async () => {
    await authorityModule?.close();
    await prisma.onModuleDestroy();
    await container.stop();
  });

  beforeEach(async () => {
    await prisma.videoGeneration.deleteMany({ where: { id: "r7a-video-generation" } });
    await prisma.videoUploadSession.deleteMany({ where: { id: "r7a-video-session" } });
    await prisma.mediaUpload.deleteMany({ where: { id: "r7a-video-upload" } });
    await prisma.listingDraft.deleteMany();
    await prisma.dealershipMember.deleteMany({ where: { dealershipId: "r7a-business" } });
    await prisma.dealership.deleteMany({ where: { id: "r7a-business" } });
    await prisma.user.deleteMany();
  });

  async function seedUser(userId: string): Promise<void> {
    await prisma.user.create({
      data: { id: userId, phone: `+9936${userId.slice(-8)}`, phoneVerifiedAt: new Date(), role: "buyer" },
    });
  }

  it("saves and retrieves a draft", async () => {
    await seedUser("user-1");
    const draft = ListingDraft.create({
      id: "draft-1",
      userId: "user-1",
      payload: { vin: "WBA123" },
    });

    const saved = await repo.save(draft);
    expect(saved.id).toBe("draft-1");
    expect(saved.userId).toBe("user-1");

    await expect(repo.save(draft)).rejects.toMatchObject({ code: "P2002" });
    const found = await repo.findById("draft-1");
    expect(found).not.toBeNull();
    expect(found!.payload).toEqual({ vin: "WBA123" });
  });

  it("returns null for non-existent draft", async () => {
    const found = await repo.findById("non-existent");
    expect(found).toBeNull();
  });

  it("updates a draft payload", async () => {
    await seedUser("user-1");
    const draft = ListingDraft.create({
      id: "draft-1",
      userId: "user-1",
      payload: { step: 1 },
    });
    await repo.save(draft);

    const updated = draft.updatePayload({ step: 2 }, new Date());
    const saved = await repo.update(updated);

    expect(saved.payload).toEqual({ step: 2 });

    const found = await repo.findById("draft-1");
    expect(found!.payload).toEqual({ step: 2 });
  });

  it("deletes a draft", async () => {
    await seedUser("user-1");
    const draft = ListingDraft.create({ id: "draft-1", userId: "user-1" });
    await repo.save(draft);

    await repo.delete("draft-1");
    const found = await repo.findById("draft-1");
    expect(found).toBeNull();
  });

  it("lists drafts by user with pagination", async () => {
    await seedUser("user-1");
    await seedUser("user-2");
    await repo.save(ListingDraft.create({ id: "d1", userId: "user-1", payload: { a: 1 } }));
    // Small delay to ensure different updatedAt
    await new Promise((r) => setTimeout(r, 10));
    await repo.save(ListingDraft.create({ id: "d2", userId: "user-1", payload: { a: 2 } }));
    await new Promise((r) => setTimeout(r, 10));
    await repo.save(ListingDraft.create({ id: "d3", userId: "user-2", payload: { a: 3 } }));

    const result = await repo.findByUserId("user-1", { limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.userId).toBe("user-1");
    expect(result.nextCursor).toBeDefined();

    const page2 = await repo.findByUserId("user-1", {
      limit: 1,
      cursor: result.nextCursor!,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]!.id).not.toBe(result.items[0]!.id);
    expect(page2.nextCursor).toBeUndefined();
  });

  it("orders drafts by updatedAt DESC", async () => {
    await seedUser("user-1");
    const d1 = ListingDraft.create({ id: "d1", userId: "user-1" });
    await repo.save(d1);
    await new Promise((r) => setTimeout(r, 50));

    const d2 = ListingDraft.create({ id: "d2", userId: "user-1" });
    await repo.save(d2);
    await new Promise((r) => setTimeout(r, 50));

    const d3 = ListingDraft.create({ id: "d3", userId: "user-1" });
    await repo.save(d3);

    const result = await repo.findByUserId("user-1", { limit: 10 });
    expect(result.items.map((d) => d.id)).toEqual(["d3", "d2", "d1"]);
  });

  describe("saveWithinLimit", () => {
    it("saves while the User is under the limit", async () => {
      await seedUser("user-1");
      await repo.save(ListingDraft.create({ id: "d1", userId: "user-1" }));

      const saved = await repo.saveWithinLimit(ListingDraft.create({ id: "d2", userId: "user-1" }), 2);

      expect(saved?.id).toBe("d2");
      expect(await prisma.listingDraft.count({ where: { userId: "user-1" } })).toBe(2);
    });

    it("returns null and saves nothing at the limit", async () => {
      await seedUser("user-1");
      await seedUser("user-2");
      await repo.save(ListingDraft.create({ id: "d1", userId: "user-1" }));
      await repo.save(ListingDraft.create({ id: "d2", userId: "user-1" }));
      await repo.save(ListingDraft.create({ id: "other", userId: "user-2" }));

      const saved = await repo.saveWithinLimit(ListingDraft.create({ id: "d3", userId: "user-1" }), 2);

      expect(saved).toBeNull();
      expect(await repo.findById("d3")).toBeNull();
    });

    it("serializes concurrent saves for one User", async () => {
      await seedUser("user-1");

      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          repo.saveWithinLimit(ListingDraft.create({ id: `c${i}`, userId: "user-1" }), 5),
        ),
      );

      expect(results.filter((r) => r !== null)).toHaveLength(5);
      expect(await prisma.listingDraft.count({ where: { userId: "user-1" } })).toBe(5);
    });
  });
  // These scenarios are authored PostgreSQL cases, not offline SQL claims.
  // The parent owns guard/profile readiness and execution after shared bootstrap
  // is repaired. The repository itself owns its preparation in every case.
  const businessId = "r7a-business";
  const actor = { userId: "r7a-sales", sessionId: "r7a-session", businessId };
  const owner = { userId: "r7a-owner", sessionId: "r7a-owner-session", businessId };
  const at = new Date("2026-10-25T00:00:00.000Z");
  let authorityModule: TestingModule;
  let ownership: ListingOwnership;

  async function businessFixture(member = true) {
    for (const userId of [owner.userId, actor.userId, "r7a-other"]) await seedUser(userId);
    await prisma.dealership.create({ data: { id: businessId, slug: businessId, name: "Draft test Business", status: "active" } });
    await prisma.dealershipMember.create({ data: { id: "r7a-owner-member", dealershipId: businessId, userId: owner.userId, role: "owner" } });
    if (member) await prisma.dealershipMember.create({ data: { id: "r7a-sales-member", dealershipId: businessId, userId: actor.userId, role: "sales" } });
    for (const current of [owner, actor]) await prisma.session.create({ data: {
      id: current.sessionId, userId: current.userId, refreshTokenHash: current.sessionId,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    } });
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
    const wrapped = new Proxy(client, { get(target, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { maxWait?: number; timeout?: number }) => target.$transaction(async tx => {
        const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int pid`;
        entered.resolve(row!.pid);
        const transaction = pauseDiscovery ? new Proxy(tx, { get(target, property) {
          if (property === "$queryRaw") return async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
            const result = await target.$queryRaw(query, ...values);
            const sql = Array.isArray(query) ? query.join("?") : (query as Prisma.Sql).sql;
            if (!paused && sql.includes("WITH RECURSIVE")) {
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
    return { client: wrapped, entered, completed, release, discovered };
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
    const draft = businessDraft("r7a-draft");
    const saved = await repo.saveWithinLimit(draft, 1, actor);
    expect(saved).toMatchObject({ userId: actor.userId, businessId, createdAt: at, updatedAt: at, payload: { step: 1, photos: [] } });
    expect(await repo.saveWithinLimit(businessDraft("r7a-limit", owner.userId), 1, owner)).toBeNull();
    expect(await repo.update(draft, actor)).toEqual(draft);
    const edited = draft.updatePayload({ step: 2 }, new Date("2026-10-25T01:00:00.000Z"));
    await repo.update(edited, owner);
    expect(await repo.findById(draft.id)).toMatchObject({ payload: { step: 2 }, userId: actor.userId, createdAt: at, updatedAt: edited.updatedAt });
    await repo.delete(draft.id, owner);
    expect(await repo.findById(draft.id)).toBeNull();
    await noReceipts();
  });

  it("retains missing update/delete P2025 and missing User/Business FK refusal", async () => {
    await seedUser("user-1");
    await expect(repo.update(ListingDraft.create({ id: "absent", userId: "user-1" }))).rejects.toMatchObject({ code: "P2025" });
    await expect(repo.delete("absent")).rejects.toMatchObject({ code: "P2025" });
    await expect(repo.save(ListingDraft.create({ id: "absent-user", userId: "missing" }))).rejects.toMatchObject({ code: "P2003" });
    await expect(repo.saveWithinLimit(businessDraft("absent-business", "user-1"), 5, { userId: "user-1", sessionId: "absent", businessId })).rejects.toThrow();
    expect(await prisma.listingDraft.count()).toBe(0);
    await noReceipts();
  });

  for (const refusal of ["missing actor", "wrong Business", "wrong Session", "expired Session", "inactive member", "missing member", "inactive User", "inactive Business"] as const) {
    it(`refuses Business create/update/delete atomically for ${refusal}`, async () => {
      await businessFixture();
      const draft = businessDraft("r7a-draft");
      await repo.saveWithinLimit(draft, 5, actor);
      let supplied: ListingActor | undefined = actor;
      if (refusal === "missing actor") supplied = undefined;
      if (refusal === "wrong Business") supplied = { ...actor, businessId: "other-business" };
      if (refusal === "wrong Session") supplied = { ...actor, sessionId: owner.sessionId };
      if (refusal === "expired Session") await prisma.session.update({ where: { id: actor.sessionId }, data: { expiresAt: new Date("2000-01-01") } });
      if (refusal === "inactive member") await prisma.dealershipMember.update({ where: { id: "r7a-sales-member" }, data: { status: "suspended" } });
      if (refusal === "missing member") await prisma.dealershipMember.delete({ where: { id: "r7a-sales-member" } });
      if (refusal === "inactive User") await prisma.user.update({ where: { id: actor.userId }, data: { suspendedAt: at } });
      if (refusal === "inactive Business") await prisma.dealership.update({ where: { id: businessId }, data: { status: "suspended" } });
      await expect(repo.saveWithinLimit(businessDraft("r7a-refused"), 5, supplied)).rejects.toThrow();
      await expect(repo.update(draft.updatePayload({ step: 99 }, new Date()), supplied)).rejects.toThrow();
      await expect(repo.delete(draft.id, supplied)).rejects.toThrow();
      expect(await repo.findById("r7a-refused")).toBeNull();
      expect(await repo.findById(draft.id)).toMatchObject({ payload: { step: 1, photos: [] }, createdAt: at, updatedAt: at });
      expect(await prisma.listingDraft.count()).toBe(1);
      await noReceipts();
    });
  }

  it("closes raw Business save and refuses a proposed owner that differs from the stored owner", async () => {
    await businessFixture();
    const draft = businessDraft("r7a-draft");
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
        if (business) await businessFixture(); else await seedUser("user-1");
        const draft = business ? businessDraft("r7a-draft") : new ListingDraft("r7a-draft", "user-1", { step: 1 }, at, at);
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
      if (business) await businessFixture(); else await seedUser("user-1");
      const a = new PrismaService(), b = new PrismaService();
      const first = connection(a, true), second = connection(b);
      const firstDraft = business ? businessDraft("r7a-first", owner.userId) : ListingDraft.create({ id: "r7a-first", userId: "user-1" });
      const secondDraft = business ? businessDraft("r7a-second") : ListingDraft.create({ id: "r7a-second", userId: "user-1" });
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
        expect(await prisma.listingDraft.count()).toBe(1);
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
        if (business) await businessFixture(opposing !== "membership admission"); else await seedUser("user-1");
        const userId = business ? actor.userId : "user-1";
        if (opposing === "account purge") await prisma.user.update({ where: { id: userId }, data: { deletionScheduledAt: new Date("2026-10-01") } });
        const draft = business ? businessDraft("r7a-race") : ListingDraft.create({ id: "r7a-race", userId });
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
                roots: [{ table: "users", key: { id: actor.userId } }], member: { id: "r7a-sales-member", userId: actor.userId, role: "sales" } })
              : await businessSourceCommand(tx, { operation, businessId, actorUserId: owner.userId, sessionId: owner.sessionId,
                roots: [{ table: "users", key: { id: actor.userId } }], memberId: "r7a-sales-member", status: "suspended" });
            return withDiagnosticSourceCommand(tx, command, async () => {
              await ownership.authorize(owner, { businessId }, tx);
              if (opposing === "membership admission") await tx.dealershipMember.create({ data: { id: "r7a-sales-member", userId: actor.userId, dealershipId: businessId, role: "sales" } });
              else if (operation === "member_remove") await tx.dealershipMember.delete({ where: { id: "r7a-sales-member" } });
              else await tx.dealershipMember.update({ where: { id: "r7a-sales-member" }, data: { status: "suspended" } });
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
            expect(user.phone).toEqual(draftFirst ? "+9936user-1" : null);
          } else if (!business) expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletionScheduledAt).toEqual(draftFirst ? null : new Date("2026-10-01"));
          else if (opposing === "membership admission") expect(await prisma.dealershipMember.findUnique({ where: { id: "r7a-sales-member" } })).toMatchObject({ userId: actor.userId, status: "active" });
          else if (draftFirst || opposing === "membership suspension") expect(await prisma.dealershipMember.findUnique({ where: { id: "r7a-sales-member" } })).toMatchObject(
            { status: draftFirst ? "active" : "suspended" },
          );
          if (business && !draftFirst && opposing === "membership removal") expect(await prisma.dealershipMember.findUnique({ where: { id: "r7a-sales-member" } })).toBeNull();
        } finally {
          first.release.resolve(undefined); await Promise.allSettled([one, two]);
          await a.$disconnect(); await b.$disconnect();
        }
        await noReceipts();
      });
    }
  }

  it("refuses a stored owner changed after discovery without applying the proposed payload", async () => {
    await seedUser("user-1"); await seedUser("user-2");
    const draft = new ListingDraft("r7a-owner-race", "user-1", { step: 1 }, at, at);
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
      await b.$transaction(tx => withCampaignPreparation(tx, [{ table: "listing_drafts", key: { id: draft.id }, verb: "update", next: { userId: "user-2" } }], async () => {
        const keys = await tx.$queryRaw<{ key: number }[]>`
          SELECT hashtext(jsonb_build_array('pk',jsonb_build_object('id',id))::text) key
          FROM (VALUES ('user-1'),('user-2')) users(id) ORDER BY key
        `;
        for (const key of keys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(897100,${key.key}::int)`;
        await tx.$queryRaw`SELECT id FROM public.users WHERE id IN ('user-1','user-2') ORDER BY id FOR UPDATE`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(897401,hashtext(jsonb_build_array('pk',jsonb_build_object('id',${draft.id}::text))::text))`;
        await tx.listingDraft.update({ where: { id: draft.id }, data: { userId: "user-2" } });
      }));
      paused.release.resolve(undefined);
      const result = await outcome;
      expect(result.ok).toBe(false);
      if (!result.ok && "error" in result) expect(String(result.error)).toContain("draft_dependencies_changed");
      expect(await repo.findById(draft.id)).toMatchObject({ userId: "user-2", payload: { step: 1 }, createdAt: at });
    } finally {
      paused.release.resolve(undefined); await Promise.allSettled([writing]); await a.$disconnect(); await b.$disconnect();
    }
    await noReceipts();
  });

  it("uses draft video references as dependencies and leaves video state unchanged", async () => {
    await seedUser("user-1");
    const sourceKey = "video/v1/r7a-video-upload/r7a-video-session/source.mp4";
    await prisma.mediaUpload.create({ data: { id: "r7a-video-upload", userId: "user-1", key: sourceKey, kind: "video", contentType: "video/mp4", sizeBytes: 1024, writeProtocol: "video-v1", state: "PREPARING" } });
    await prisma.videoUploadSession.create({ data: { id: "r7a-video-session", uploadId: "r7a-video-upload", userId: "user-1", sourceKey, protocolVersion: 1, targetKind: "draft", targetId: "r7a-video-draft", targetRevision: 1, state: "PROCESSING", expiresAt: new Date("2099-01-01") } });
    await prisma.videoGeneration.create({ data: { id: "r7a-video-generation", sessionId: "r7a-video-session", listingId: "r7a-video-draft", uploadId: "r7a-video-upload", state: "PROCESSING", targetRevision: 1 } });
    const session = await prisma.videoUploadSession.findUniqueOrThrow({ where: { id: "r7a-video-session" } });
    const generation = await prisma.videoGeneration.findUniqueOrThrow({ where: { id: "r7a-video-generation" } });
    const upload = await prisma.mediaUpload.findUniqueOrThrow({ where: { id: "r7a-video-upload" } });
    const draft = new ListingDraft("r7a-video-draft", "user-1", { video: { sessionId: session.id, generationId: generation.id }, step: 1 }, at, at);
    await repo.save(draft);
    await repo.update(draft.updatePayload({ step: 2 }, new Date()));
    await repo.delete(draft.id);
    expect(await repo.findById(draft.id)).toBeNull();
    expect(await prisma.videoUploadSession.findUnique({ where: { id: session.id } })).toEqual(session);
    expect(await prisma.videoGeneration.findUnique({ where: { id: generation.id } })).toEqual(generation);
    expect(await prisma.mediaUpload.findUnique({ where: { id: upload.id } })).toEqual(upload);
    await noReceipts();
  });

});
