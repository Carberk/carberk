import { describe, expect, it } from "vitest";

import {
  parseReviewerScenarioAccounts,
  reviewerScenarioSeedIds,
  runReviewerScenarioSeed,
  type ReviewerScenarioSeedOptions,
  type ReviewerScenarioSeedStore,
  type ReviewerScenarioUser,
} from "./reviewer-scenario-seed";

const NOW = new Date("2026-08-09T12:00:00.000Z");

function account(
  phone: string,
  code = "123456",
  email = `${phone.slice(-4)}@autotm.bagtyyar.dev`,
): { phone: string; email: string; code: string } {
  return { phone, email, code };
}

function reviewerJson(phones = ["+99365000001", "+99365000002", "+99365000003"]): string {
  return JSON.stringify(phones.map((phone, index) => account(phone, `${index + 1}`.repeat(6))));
}

function seedOptions(overrides: Partial<ReviewerScenarioSeedOptions> = {}): ReviewerScenarioSeedOptions {
  return {
    mode: "seed",
    reviewDemoAccountsJson: reviewerJson(),
    env: {
      appEnv: "production",
      authorization: "seed-reviewer-scenario",
      signupsEnabled: "false",
      reviewDemoAccountEnabled: "true",
    },
    now: NOW,
    ...overrides,
  };
}

interface ListingRow {
  contactPhone?: string;
  id: string;
  sellerId: string;
  damaged: boolean;
  knownIssuesText: string | null;
}

interface ConversationRow {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  lastMessageId: string;
}

interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  kind: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
}

class FakeReviewerScenarioSeedStore implements ReviewerScenarioSeedStore {
  users = new Map<string, ReviewerScenarioUser>();
  usersByPhone = new Map<string, string>();
  usersByEmail = new Map<string, string>();
  listings = new Map<string, ListingRow>();
  conversations = new Map<string, ConversationRow>();
  participants = new Map<string, { id: string; conversationId: string; userId: string }>();
  messages = new Map<string, MessageRow>();
  reports = new Map<string, { id: string; reporterUserId: string; targetId: string }>();
  auditLogs: Array<{
    action: string;
    targetType: string;
    targetId: string;
    details: Record<string, unknown>;
  }> = [];
  deletedSessionUserIds: string[] = [];
  invalidatedDeviceUserIds: string[] = [];
  catalogSeeded = false;
  media = new Map<string, { id: string; listingId: string; key: string; sortOrder: number }>();
  async upsertListingMedia(input: { id: string; listingId: string; key: string; sortOrder: number }): Promise<void> { this.media.set(input.id, input); }

  async findUserById(id: string): Promise<ReviewerScenarioUser | null> {
    return this.users.get(id) ?? null;
  }

  async findUserByPhone(phone: string): Promise<ReviewerScenarioUser | null> {
    const id = this.usersByPhone.get(phone);
    return id ? (this.users.get(id) ?? null) : null;
  }

  async findUserByEmail(email: string): Promise<ReviewerScenarioUser | null> {
    const id = this.usersByEmail.get(email);
    return id ? (this.users.get(id) ?? null) : null;
  }

  async upsertUser(input: {
    id: string;
    phone: string;
    email: string;
    displayName: string;
    role: "buyer" | "seller";
  }): Promise<ReviewerScenarioUser> {
    const existing = this.users.get(input.id);
    if (existing) {
      if (existing.phone) this.usersByPhone.delete(existing.phone);
      if (existing.email) this.usersByEmail.delete(existing.email);
    }
    const row = {
      id: input.id,
      phone: input.phone,
      email: input.email,
      role: input.role,
      displayName: input.displayName, phoneVerifiedAt: new Date("2026-10-26T00:00:00Z"),
      emailVerifiedAt: new Date("2026-10-26T00:00:00Z"), deletionScheduledAt: null,
    };
    this.users.set(input.id, row);
    this.usersByPhone.set(input.phone, input.id);
    this.usersByEmail.set(input.email, input.id);
    return row;
  }

  async revokeUser(input: {
    id: string;
    revokedPhone: string;
    displayName: string;
  }): Promise<void> {
    const existing = this.users.get(input.id);
    if (!existing) return;
    if (existing.phone) this.usersByPhone.delete(existing.phone);
    if (existing.email) this.usersByEmail.delete(existing.email);
    const row = { ...existing, phone: input.revokedPhone, email: null };
    this.users.set(input.id, row);
    this.usersByPhone.set(input.revokedPhone, input.id);
  }

  async deleteSessionsByUserIds(userIds: string[]): Promise<number> {
    this.deletedSessionUserIds.push(...userIds);
    return userIds.length;
  }

  async invalidatePushDevicesByUserIds(userIds: string[]): Promise<number> {
    this.invalidatedDeviceUserIds.push(...userIds);
    return userIds.length;
  }

  async preflightSeed(input: { catalog: unknown; listings: { id: string; sellerId: string }[] }): Promise<string | null> {
    return input.listings.some(target => {
      const row = this.listings.get(target.id);
      return row && row.sellerId !== target.sellerId;
    }) ? "foreign Listing association" : null;
  }

  async upsertCatalog(): Promise<void> {
    this.catalogSeeded = true;
  }

  async upsertListing(input: {
    contactPhone?: string;
    id: string;
    sellerId: string;
    priceAmount: number;
    description: string;
    publishedAt: Date;
    damaged: boolean;
    knownIssuesText: string | null;
  }): Promise<void> {
    this.listings.set(input.id, {
      contactPhone: input.contactPhone,
      id: input.id,
      sellerId: input.sellerId,
      damaged: input.damaged,
      knownIssuesText: input.knownIssuesText,
    });
  }

  async upsertConversation(input: {
    id: string;
    listingId: string;
    buyerId: string;
    sellerId: string;
    lastMessageAt: Date;
    lastMessageId: string;
  }): Promise<void> {
    this.conversations.set(input.id, {
      id: input.id,
      listingId: input.listingId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      lastMessageId: input.lastMessageId,
    });
  }

  async upsertConversationParticipant(input: {
    id: string;
    conversationId: string;
    userId: string;
  }): Promise<void> {
    this.participants.set(input.id, {
      id: input.id,
      conversationId: input.conversationId,
      userId: input.userId,
    });
  }

  async upsertMessage(input: {
    id: string;
    conversationId: string;
    senderId: string;
    kind: "text" | "post_ref";
    body: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }): Promise<void> {
    this.messages.set(input.id, {
      id: input.id,
      conversationId: input.conversationId,
      senderId: input.senderId,
      kind: input.kind,
      body: input.body,
      metadata: input.metadata,
    });
  }

  async upsertContentReport(input: {
    id: string;
    reporterUserId: string;
    targetType: "listing";
    targetId: string;
    reason: "misleading";
    details: string;
  }): Promise<void> {
    this.reports.set(input.id, {
      id: input.id,
      reporterUserId: input.reporterUserId,
      targetId: input.targetId,
    });
  }

  async createAuditLog(input: {
    action: string;
    targetType: string;
    targetId: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    this.auditLogs.push(input);
  }
}

describe("parseReviewerScenarioAccounts", () => {
  it("maps 3 to 5 secret-managed accounts to deterministic buyer/seller slots without exposing codes", () => {
    const parsed = parseReviewerScenarioAccounts(
      reviewerJson([
        "+99365000001",
        "+99365000002",
        "+99365000003",
        "+99365000004",
      ]),
    );

    expect(parsed.map((entry) => ({ id: entry.id, role: entry.role }))).toEqual([
      { id: reviewerScenarioSeedIds.buyerIds[0], role: "buyer" },
      { id: reviewerScenarioSeedIds.sellerIds[0], role: "seller" },
      { id: reviewerScenarioSeedIds.buyerIds[1], role: "buyer" },
      { id: reviewerScenarioSeedIds.sellerIds[1], role: "seller" },
    ]);
    expect(JSON.stringify(parsed)).not.toContain("123456");
  });

  it("rejects malformed or duplicate phone and email input", () => {
    expect(() => parseReviewerScenarioAccounts("not-json")).toThrow(/invalid/);
    expect(() => parseReviewerScenarioAccounts(JSON.stringify([account("+99365000001")]))).toThrow(/3 to 5/);
    expect(() =>
      parseReviewerScenarioAccounts(
        JSON.stringify([
          account("+99365000001"),
          account("+99365000001"),
          account("+99365000003"),
        ]),
      ),
    ).toThrow(/unique/);
    expect(() =>
      parseReviewerScenarioAccounts(
        JSON.stringify([
          account("+99365000001", "12345"),
          account("+99365000002", "222222"),
          account("+99365000003", "333333"),
        ]),
      ),
    ).toThrow(/exactly 6 digits/);
    expect(() =>
      parseReviewerScenarioAccounts(
        JSON.stringify([
          account("+99365000001", "111111", "shared@autotm.bagtyyar.dev"),
          account("+99365000002", "222222", "shared@autotm.bagtyyar.dev"),
          account("+99365000003", "333333"),
        ]),
      ),
    ).toThrow(/unique/);
  });
});

describe("reviewerScenarioSeedIds", () => {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // The API validates brandId, modelId, regionId, cityId, listingId, and
  // conversationId with z.string().uuid(). A slug id seeded straight into
  // Postgres is accepted by the database and then rejected by every request
  // that names it, so the scenario is only usable if every id is a UUID.
  it("uses UUIDs for every identifier the API validates", () => {
    const ids = [
      ...reviewerScenarioSeedIds.userIds,
      reviewerScenarioSeedIds.brandId,
      reviewerScenarioSeedIds.modelId,
      reviewerScenarioSeedIds.regionId,
      reviewerScenarioSeedIds.cityId,
      reviewerScenarioSeedIds.primaryListingId,
      reviewerScenarioSeedIds.reportableListingId,
      reviewerScenarioSeedIds.conversationId,
      reviewerScenarioSeedIds.buyerParticipantId,
      reviewerScenarioSeedIds.sellerParticipantId,
      reviewerScenarioSeedIds.firstMessageId,
      reviewerScenarioSeedIds.secondMessageId,
      reviewerScenarioSeedIds.reportId,
    ];

    for (const id of ids) {
      expect(id).toMatch(UUID_RE);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("runReviewerScenarioSeed", () => {
  it("refuses unsafe environments unless the narrow authorization and reviewer-era guards are present", async () => {
    const store = new FakeReviewerScenarioSeedStore();

    await expect(
      runReviewerScenarioSeed(store, seedOptions({ env: { ...seedOptions().env, authorization: undefined } })),
    ).resolves.toMatchObject({ exitCode: 1, message: expect.stringContaining("AUTHORIZATION") });

    await expect(
      runReviewerScenarioSeed(store, seedOptions({ env: { ...seedOptions().env, signupsEnabled: "true" } })),
    ).resolves.toMatchObject({ exitCode: 1, message: expect.stringContaining("SIGNUPS_ENABLED") });

    await expect(
      runReviewerScenarioSeed(store, seedOptions({ env: { ...seedOptions().env, appEnv: "development" } })),
    ).resolves.toMatchObject({ exitCode: 1, message: expect.stringContaining("APP_ENV") });

    expect(store.users.size).toBe(0);
    expect(store.auditLogs).toHaveLength(0);
  });

  it("creates deterministic buyer/seller users, listings, chat starting point, and reportable content", async () => {
    const store = new FakeReviewerScenarioSeedStore();

    const result = await runReviewerScenarioSeed(store, seedOptions());

    expect(result.exitCode).toBe(0);
    expect(store.users.size).toBe(3);
    expect(store.users.get(reviewerScenarioSeedIds.buyerIds[0])?.role).toBe("buyer");
    expect(store.users.get(reviewerScenarioSeedIds.sellerIds[0])?.role).toBe("seller");
    expect(store.listings.size).toBe(2);
    const listings = [...store.listings.values()];
    expect(listings.every((l) => typeof l.damaged === "boolean")).toBe(true);
    expect(listings.some((l) => l.damaged && l.knownIssuesText)).toBe(true);
    expect(store.conversations.get(reviewerScenarioSeedIds.conversationId)).toMatchObject({
      buyerId: reviewerScenarioSeedIds.buyerIds[0],
      sellerId: reviewerScenarioSeedIds.sellerIds[0],
      lastMessageId: reviewerScenarioSeedIds.secondMessageId,
    });
    expect(store.participants.size).toBe(2);
    expect(store.messages.size).toBe(2);
    expect(store.reports.get(reviewerScenarioSeedIds.reportId)).toMatchObject({
      reporterUserId: reviewerScenarioSeedIds.buyerIds[1],
      targetId: reviewerScenarioSeedIds.reportableListingId,
    });
  });

  it("converges on rerun without duplicating users, listings, conversations, messages, or reports", async () => {
    const store = new FakeReviewerScenarioSeedStore();

    await runReviewerScenarioSeed(store, seedOptions());
    await runReviewerScenarioSeed(store, seedOptions());

    expect(store.users.size).toBe(3);
    expect(store.listings.size).toBe(2);
    expect(store.conversations.size).toBe(1);
    expect(store.participants.size).toBe(2);
    expect(store.messages.size).toBe(2);
    expect(store.reports.size).toBe(1);
  });

  it("refuses to create or reuse privileged reviewer accounts", async () => {
    const store = new FakeReviewerScenarioSeedStore();
    store.users.set(reviewerScenarioSeedIds.buyerIds[0], {
      id: reviewerScenarioSeedIds.buyerIds[0],
      phone: "+99365000001",
      email: "0001@autotm.bagtyyar.dev",
      role: "admin",
      displayName: "Privileged", phoneVerifiedAt: null, emailVerifiedAt: null, deletionScheduledAt: null,
    });
    store.usersByPhone.set("+99365000001", reviewerScenarioSeedIds.buyerIds[0]);

    const result = await runReviewerScenarioSeed(store, seedOptions());

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("privileged");
    expect(store.listings.size).toBe(0);
    expect(store.auditLogs).toHaveLength(0);
  });

  it("rotates sign-in destinations on stable users and revokes existing sessions without logging credential values", async () => {
    const store = new FakeReviewerScenarioSeedStore();

    await runReviewerScenarioSeed(store, seedOptions());
    const result = await runReviewerScenarioSeed(
      store,
      seedOptions({
        reviewDemoAccountsJson: reviewerJson([
          "+99365000901",
          "+99365000902",
          "+99365000903",
        ]),
      }),
    );

    expect(result.rotatedUserIds).toEqual([
      reviewerScenarioSeedIds.buyerIds[0],
      reviewerScenarioSeedIds.sellerIds[0],
      reviewerScenarioSeedIds.buyerIds[1],
    ]);
    expect(store.deletedSessionUserIds).toEqual(result.rotatedUserIds);
    expect(store.invalidatedDeviceUserIds).toEqual(result.rotatedUserIds);
    const auditJson = JSON.stringify(store.auditLogs);
    expect(auditJson).toContain("REVIEWER_SCENARIO_ROTATE");
    expect(auditJson).not.toContain("+99365000901");
    expect(auditJson).not.toContain("0901@autotm.bagtyyar.dev");
    expect(auditJson).not.toContain("111111");
  });

  it("revokes reviewer accounts while preserving stable user ids for audit history", async () => {
    const store = new FakeReviewerScenarioSeedStore();

    await runReviewerScenarioSeed(store, seedOptions());
    const photosBeforeRevoke = [...store.media.values()];
    const result = await runReviewerScenarioSeed(store, seedOptions({ mode: "revoke" }));
    expect([...store.media.values()]).toEqual(photosBeforeRevoke);

    expect(result.exitCode).toBe(0);
    expect(result.revokedUserIds).toEqual(reviewerScenarioSeedIds.userIds.slice(0, 3));
    expect(store.users.get(reviewerScenarioSeedIds.buyerIds[0])?.phone).toBe(
      `revoked:${reviewerScenarioSeedIds.buyerIds[0]}`,
    );
    expect(store.users.get(reviewerScenarioSeedIds.buyerIds[0])?.email).toBeNull();
    expect(store.deletedSessionUserIds).toEqual(result.revokedUserIds);
    expect(store.auditLogs.at(-1)?.action).toBe("REVIEWER_SCENARIO_REVOKE");
  });
});

it("gives each fixed reviewer Listing three ordered fixture images and keeps them on rerun", async () => {
  const store = new FakeReviewerScenarioSeedStore();
  await runReviewerScenarioSeed(store, seedOptions());
  for (const listingId of [reviewerScenarioSeedIds.primaryListingId, reviewerScenarioSeedIds.reportableListingId]) {
    const photos = [...store.media.values()].filter((m) => m.listingId === listingId);
    expect(photos).toHaveLength(3);
    expect(photos.map((m) => m.sortOrder)).toEqual([0, 1, 2]);
    expect(new Set(photos.map((m) => m.key)).size).toBe(3);
  }
  await runReviewerScenarioSeed(store, seedOptions());
  expect(store.media.size).toBe(6);
});

it("stores the seller's own sign-in phone so archived reviewer Listings can republish", async () => {
  const store = new FakeReviewerScenarioSeedStore();
  await runReviewerScenarioSeed(store, seedOptions());
  for (const listing of store.listings.values()) expect(listing.contactPhone).toBe("+99365000002");
});

it.each(["seed", "revoke"] as const)("refuses the entire unsupported reviewer %s plan before any scenario effect", async (mode) => {
  const store = new FakeReviewerScenarioSeedStore();
  await runReviewerScenarioSeed(store, seedOptions());
  const before = structuredClone(store);
  const result = await runReviewerScenarioSeed(store, seedOptions({
    mode,
    // The final account changes, so an implementation that mutates earlier slots fails equality.
    reviewDemoAccountsJson: reviewerJson(["+99365000001", "+99365000002", "+99365000903"]),
  }));
  expect(result.exitCode).toBe(1);
  expect(result.message).toContain("unsupported");
  expect(structuredClone(store)).toEqual(before);
});


it.each(["displayName", "role", "deletionScheduledAt", "emailVerifiedAt"] as const)("preflights an unsupported final reviewer %s before changing earlier accounts", async field => {
  const store = new FakeReviewerScenarioSeedStore();
  await runReviewerScenarioSeed(store, seedOptions());
  const user = store.users.get(reviewerScenarioSeedIds.buyerIds[1]);
  if (!user) throw new Error("Missing reviewer");
  if (field === "role") user.role = "seller";
  else if (field === "displayName") user.displayName = "Changed name";
  else if (field === "deletionScheduledAt") user.deletionScheduledAt = new Date("2026-10-26T00:00:00Z");
  else user.emailVerifiedAt = null;
  const before = structuredClone(store);
  expect(await runReviewerScenarioSeed(store, seedOptions())).toMatchObject({ exitCode: 1, message: expect.stringContaining("unsupported") });
  expect(structuredClone(store)).toEqual(before);
});


it("refuses a foreign fixed Listing before creating accounts, catalog or media", async () => {
  const store = new FakeReviewerScenarioSeedStore();
  const foreign = { id: reviewerScenarioSeedIds.primaryListingId, sellerId: "foreign", damaged: false, knownIssuesText: null };
  store.listings.set(foreign.id, foreign);
  expect(await runReviewerScenarioSeed(store, seedOptions())).toMatchObject({ exitCode: 1, message: expect.stringContaining("Listing association") });
  expect([...store.users]).toEqual([]);
  expect(store.catalogSeeded).toBe(false);
  expect([...store.media]).toEqual([]);
  expect([...store.listings.values()]).toEqual([foreign]);
  expect(store.auditLogs).toEqual([]);
});

it("converges displayName-only drift while preserving verified contacts and ownership", async () => {
  const store = new FakeReviewerScenarioSeedStore();
  expect(await runReviewerScenarioSeed(store, seedOptions())).toMatchObject({ exitCode: 0 });
  const before = structuredClone([...store.users.values()]);
  for (const user of store.users.values()) user.displayName = "Presentation drift";
  expect(await runReviewerScenarioSeed(store, seedOptions())).toMatchObject({ exitCode: 0, rotatedUserIds: [] });
  expect([...store.users.values()]).toEqual(before);
});
