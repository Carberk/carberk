import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaService } from "@auto-tm/db";

import { PurgeExpiredAccounts } from "./PurgeExpiredAccounts";

const NOW = new Date("2026-06-09T12:00:00Z");

function makeFakePrisma() {
  const state = {
    users: [] as Array<{
      id: string;
      phone: string | null;
      phoneVerifiedAt?: Date | null;
      email?: string | null;
      emailVerifiedAt?: Date | null;
      displayName: string | null;
      avatarUrl: string | null;
      nameNumber?: number;
      avatarIndex?: number;
      avatarKey?: string | null;
      avatarUploadId?: string | null;
      deletionScheduledAt: Date | null;
    }>,
    /** Upload records, as far as the purge touches them. */
    uploads: [] as Array<{ id: string; state: string }>,
    /** Upload ids with recorded deletion work. */
    cleanups: [] as string[],
    /** Raw statements in the order they were issued: their SQL and bound values. */
    raw: [] as Array<{ sql: string; values: unknown[] }>,
    sessions: [] as Array<{ id: string; userId: string }>,
    totpEnrollments: [] as Array<{ id: string; userId: string }>,
    fcmDevices: [] as Array<{ id: string; userId: string }>,
    notificationHistory: [] as Array<{ id: string; userId: string }>,
    notificationPreferences: [] as Array<{ id: string; userId: string }>,
    savedSearches: [] as Array<{ id: string; userId: string }>,
    favorites: [] as Array<{ id: string; userId: string }>,
    measurementPrincipals: [] as Array<{ id: string; userId: string | null }>,
    measurementVisits: [] as Array<{ id: string; principalId: string; linkedAccountId: string | null }>,
    measurementRecords: [] as Array<{ id: string; principalId: string; visitId: string | null }>,
    measurementOutbox: [] as Array<{ id: string; principalId: string }>,
    measurementExports: [] as Array<{ id: string; actorId: string }>,
    ownedVehicles: [] as Array<{ id: string; userId: string }>,
    blockedUsers: [] as Array<{ id: string; blockerId: string; blockedId: string }>,
    dealershipMembers: [] as Array<{ id: string; userId: string }>,
    listingDrafts: [] as Array<{ id: string; userId: string; businessId?: string | null }>,
    verifiedContactPhones: [] as Array<{ id: string; sellerId: string }>,
    otpRequests: [] as Array<{ id: string; userId: string | null; destination: string; phone: string | null; createdAt: Date }>,
    listings: [] as Array<{ id: string; sellerId: string; contactPhone: string | null; businessId?: string | null }>,
    /** Operations passed to each `$transaction`, by the label their delegate gave them. */
    transactions: [] as string[][],
    activeTransaction: null as string[] | null,
    beforeRediscovery: null as (() => void) | null,
  };

  /** Labels a pending operation so a test can see which transaction carried it. */
  function labelled<T>(label: string, op: Promise<T>): Promise<T> {
    if (state.activeTransaction && label !== "raw.query") state.activeTransaction.push(label);
    return Object.assign(op, { label });
  }

  const prismaLike = {
    user: {
      findMany: async (args: { where: { deletionScheduledAt?: { lte?: Date } } }) => {
        const lte = args.where.deletionScheduledAt?.lte;
        if (lte) {
          return state.users.filter((u) => u.deletionScheduledAt && u.deletionScheduledAt <= lte).map((u) => ({ ...u }));
        }
        return state.users;
      },
      update: (args: { where: { id: string }; data: Partial<typeof state.users[number]> }) =>
        labelled("user.update", (async () => {
          const idx = state.users.findIndex((u) => u.id === args.where.id);
          if (idx !== -1) {
            const existing = state.users[idx];
            if (existing) {
              state.users[idx] = { ...existing, ...args.data };
            }
          }
          return state.users[idx];
        })()),
    },

    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      state.raw.push({ sql, values });
      if (sql.includes("AS row FROM users")) {
        state.beforeRediscovery?.();
        const userId = values[0];
        const user = state.users.find((candidate) => candidate.id === userId);
        const cutoff = values[1] as Date | undefined;
        const due = !cutoff || (user?.deletionScheduledAt != null && user.deletionScheduledAt <= cutoff);
        // PostgreSQL to_jsonb(timestamp without time zone) has no trailing Z.
        return labelled("raw.query", Promise.resolve(user && due ? [{ row: { ...user,
          deletionScheduledAt: user.deletionScheduledAt?.toISOString().replace(/Z$/, "") ?? null,
        } }] : []));
      }
      if (sql.includes("diagnostic_prepare_source")) {
        return labelled("raw.query", Promise.resolve([{ receipt: "00000000-0000-0000-0000-000000000001" }]));
      }
      return labelled(/FROM users[\s\S]*FOR UPDATE/.test(sql) ? "user.lock" : "raw.query", Promise.resolve([]));
    },

    // Stands in for the one statement that retires the photo's upload and
    // records its deletion work. The real SQL runs in the hosted suite.
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      state.raw.push({ sql, values });
      const retires = sql.includes("media_uploads") && sql.includes("media_upload_cleanups");
      return labelled(retires ? "profilePhoto.retire" : "raw.execute", (async () => {
        if (!retires) return 0;
        const user = state.users.find((u) => values.includes(u.id));
        const upload = state.uploads.find(
          (u) => u.id === user?.avatarUploadId && u.state !== "RETIRED" && u.state !== "DELETED",
        );
        if (!upload) return 0;
        upload.state = "RETIRED";
        state.cleanups.push(upload.id);
        return 1;
      })());
    },

    session: {
      deleteMany: async (args: { where: { userId: string } }) => {
        const before = state.sessions.length;
        const kept = state.sessions.filter((s) => s.userId !== args.where.userId);
        state.sessions.splice(0, state.sessions.length, ...kept);
        return { count: before - state.sessions.length };
      },
    },

    totpEnrollment: {
      deleteMany: async (args: { where: { userId: string } }) => {
        const before = state.totpEnrollments.length;
        const kept = state.totpEnrollments.filter((e) => e.userId !== args.where.userId);
        state.totpEnrollments.splice(0, state.totpEnrollments.length, ...kept);
        return { count: before - state.totpEnrollments.length };
      },
    },

    fcmDevice: {
      deleteMany: async (args: { where: { userId: string } }) => {
        const before = state.fcmDevices.length;
        const kept = state.fcmDevices.filter((d) => d.userId !== args.where.userId);
        state.fcmDevices.splice(0, state.fcmDevices.length, ...kept);
        return { count: before - state.fcmDevices.length };
      },
    },

    notificationHistory: {
      deleteMany: async (args: { where: { userId: string } }) => {
        const before = state.notificationHistory.length;
        const kept = state.notificationHistory.filter((n) => n.userId !== args.where.userId);
        state.notificationHistory.splice(0, state.notificationHistory.length, ...kept);
        return { count: before - state.notificationHistory.length };
      },
    },

    notificationPreference: {
      deleteMany: async (args: { where: { userId: string } }) => {
        const before = state.notificationPreferences.length;
        const kept = state.notificationPreferences.filter((n) => n.userId !== args.where.userId);
        state.notificationPreferences.splice(0, state.notificationPreferences.length, ...kept);
        return { count: before - state.notificationPreferences.length };
      },
    },

    savedSearch: {
      deleteMany: async (args: { where: { userId: string } }) => {
        const before = state.savedSearches.length;
        const kept = state.savedSearches.filter((s) => s.userId !== args.where.userId);
        state.savedSearches.splice(0, state.savedSearches.length, ...kept);
        return { count: before - state.savedSearches.length };
      },
    },

    favorite: {
      deleteMany: async (args: { where: { userId: string } }) => {
        const before = state.favorites.length;
        const kept = state.favorites.filter((f) => f.userId !== args.where.userId);
        state.favorites.splice(0, state.favorites.length, ...kept);
        return { count: before - state.favorites.length };
      },
    },

    ownedVehicle: {
      deleteMany: async (args: { where: { userId: string } }) => {
        const before = state.ownedVehicles.length;
        const kept = state.ownedVehicles.filter((v) => v.userId !== args.where.userId);
        state.ownedVehicles.splice(0, state.ownedVehicles.length, ...kept);
        return { count: before - state.ownedVehicles.length };
      },
    },

    blockedUser: {
      deleteMany: async (args: { where: { OR?: Array<{ blockerId: string } | { blockedId: string }> } }) => {
        const before = state.blockedUsers.length;
        const ors = args.where.OR ?? [];
        const userId = ors.find((o): o is { blockerId: string } => "blockerId" in o)?.blockerId;
        const kept = state.blockedUsers.filter((b) => !(b.blockerId === userId || b.blockedId === userId));
        state.blockedUsers.splice(0, state.blockedUsers.length, ...kept);
        return { count: before - state.blockedUsers.length };
      },
    },

    dealershipMember: {
      deleteMany: async (args: { where: { userId: string } }) => {
        const before = state.dealershipMembers.length;
        const kept = state.dealershipMembers.filter((d) => d.userId !== args.where.userId);
        state.dealershipMembers.splice(0, state.dealershipMembers.length, ...kept);
        return { count: before - state.dealershipMembers.length };
      },
    },

    listingDraft: {
      deleteMany: async (args: { where: { userId: string; businessId?: null } }) => {
        const before = state.listingDrafts.length;
        const kept = state.listingDrafts.filter((d) => !(d.userId === args.where.userId && (args.where.businessId === undefined || (d.businessId ?? null) === args.where.businessId)));
        state.listingDrafts.splice(0, state.listingDrafts.length, ...kept);
        return { count: before - state.listingDrafts.length };
      },
    },

    otpRequest: {
      deleteMany: (args: {
        where: {
          OR?: Array<{ userId?: string | null; destination?: { in: string[] } }>;
          createdAt?: { lt: Date };
        };
      }) =>
        labelled("otpRequest.deleteMany", (async () => {
          const before = state.otpRequests.length;
          const matches = (r: (typeof state.otpRequests)[number]) => {
            if (args.where.createdAt) return r.createdAt < args.where.createdAt.lt;
            return (args.where.OR ?? []).some(
              (c) =>
                (c.userId === undefined || r.userId === c.userId) &&
                (c.destination === undefined || c.destination.in.includes(r.destination)),
            );
          };
          const kept = state.otpRequests.filter((r) => !matches(r));
          state.otpRequests.splice(0, state.otpRequests.length, ...kept);
          return { count: before - state.otpRequests.length };
        })()),
    },

    listing: {
      updateMany: (args: { where: { sellerId: string; businessId?: null }; data: { contactPhone: null } }) =>
        labelled("listing.updateMany", (async () => {
          let count = 0;
          for (const l of state.listings) {
            if (l.sellerId === args.where.sellerId && (args.where.businessId === undefined || (l.businessId ?? null) === args.where.businessId)) {
              l.contactPhone = args.data.contactPhone;
              count += 1;
            }
          }
          return { count };
        })()),
    },

    verifiedContactPhone: {
      deleteMany: (args: { where: { sellerId: string } }) =>
        labelled("verifiedContactPhone.deleteMany", (async () => {
          const before = state.verifiedContactPhones.length;
          const kept = state.verifiedContactPhones.filter((v) => v.sellerId !== args.where.sellerId);
          state.verifiedContactPhones.splice(0, state.verifiedContactPhones.length, ...kept);
          return { count: before - state.verifiedContactPhones.length };
        })()),
    },

    measurementInvestigationExport: {
      deleteMany: () => labelled("measurementInvestigationExport.deleteMany", (async () => {
        const count = state.measurementExports.length;
        state.measurementExports.splice(0);
        return { count };
      })()),
    },
    measurementPrincipal: {
      deleteMany: (args: { where: { userId: string } }) => labelled("measurementPrincipal.deleteMany", (async () => {
        const removed = state.measurementPrincipals.filter(row => row.userId === args.where.userId).map(row => row.id);
        const visits = state.measurementVisits.filter(row => removed.includes(row.principalId) || (row.linkedAccountId !== null && removed.includes(row.linkedAccountId))).map(row => row.id);
        const keep = <T>(rows: T[], predicate: (row: T) => boolean) => { const retained = rows.filter(predicate); rows.splice(0, rows.length, ...retained); };
        keep(state.measurementRecords, row => !removed.includes(row.principalId) && (row.visitId === null || !visits.includes(row.visitId)));
        keep(state.measurementVisits, row => !visits.includes(row.id));
        keep(state.measurementOutbox, row => !removed.includes(row.principalId));
        keep(state.measurementPrincipals, row => !removed.includes(row.id));
        return { count: removed.length };
      })()),
    },

    $transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
      const operations: string[] = [];
      state.transactions.push(operations);
      state.activeTransaction = operations;
      try {
        return await callback(prismaLike);
      } finally {
        state.activeTransaction = null;
      }
    },
  };

  return Object.assign(state, { prisma: prismaLike as unknown as PrismaService });
}

describe("PurgeExpiredAccounts", () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let job: PurgeExpiredAccounts;

  beforeEach(() => {
    fake = makeFakePrisma();
    job = new PurgeExpiredAccounts(fake.prisma);
  });

  it("purges the exact UTC boundary from timezone-free database JSON and sends only consumed command fields", async () => {
    fake.users.push({ id: "exact-due", phone: null, email: null, displayName: "Exact due", avatarUrl: null, deletionScheduledAt: NOW });

    expect(await job.execute({ now: NOW })).toEqual({ purgedCount: 1 });

    const preparation = fake.raw.find((statement) => statement.sql.includes("diagnostic_prepare_source"));
    const command = JSON.parse(String(preparation?.values[0])) as Record<string, unknown>;
    expect(Object.keys(command).sort()).toEqual(["actorUserId", "campaign", "cutoff", "operation", "roots", "rows", "sessionId"]);
    expect(command).toMatchObject({ operation: "account_purge", cutoff: NOW.toISOString(),
      roots: [{ table: "users", key: { id: "exact-due" } }],
      rows: [{ expected: { source: { deletionScheduledAt: NOW.toISOString().replace(/Z$/, "") } }, next: { deletionScheduledAt: null } }],
    });
    expect(fake.users[0]?.displayName).toBeNull();
  });

  it.each(["future", "cleared", "phone", "email"])("refuses a scheduler snapshot after %s changes before rediscovery", async change => {
    fake.users.push({ id: "stale", phone: "+99360000000", email: "original@example.com", displayName: "Keep", avatarUrl: null, deletionScheduledAt: NOW });
    fake.sessions.push({ id: "keep-session", userId: "stale" });
    fake.beforeRediscovery = () => {
      const user = fake.users[0];
      if (!user) throw new Error("Missing stale scheduler fixture");
      if (change === "future") user.deletionScheduledAt = new Date(NOW.getTime() + 1);
      if (change === "cleared") user.deletionScheduledAt = null;
      if (change === "phone") user.phone = "+99361111111";
      if (change === "email") user.email = "changed@example.com";
    };

    expect(await job.execute({ now: NOW })).toEqual({ purgedCount: 0 });

    expect(fake.users[0]?.displayName).toBe("Keep");
    expect(fake.sessions).toEqual([{ id: "keep-session", userId: "stale" }]);
    expect(fake.raw.some((statement) => statement.sql.includes("diagnostic_prepare_source"))).toBe(false);
  });

  it("does not send unused intent metadata to the seven-field account purge parser", async () => {
    fake.users.push({ id: "overdue", phone: null, email: null, displayName: "Overdue", avatarUrl: null,
      deletionScheduledAt: new Date(NOW.getTime() - 86400000) });

    expect(await job.execute({ now: NOW })).toEqual({ purgedCount: 1 });

    const preparation = fake.raw.find((statement) => statement.sql.includes("diagnostic_prepare_source"));
    expect(Object.keys(JSON.parse(String(preparation?.values[0])) as object).sort())
      .toEqual(["actorUserId", "campaign", "cutoff", "operation", "roots", "rows", "sessionId"]);
  });

  it("erases account measurement and all restricted exports, preserving independent guest and foreign data", async () => {
    fake.users.push({ id: "due", phone: null, email: null, displayName: "Due", avatarUrl: null, deletionScheduledAt: NOW });
    fake.measurementPrincipals.push({ id: "account", userId: "due" }, { id: "guest", userId: null }, { id: "foreign", userId: "other" });
    fake.measurementVisits.push({ id: "account-visit", principalId: "account", linkedAccountId: null },
      { id: "linked", principalId: "guest", linkedAccountId: "account" }, { id: "independent", principalId: "guest", linkedAccountId: null },
      { id: "foreign-visit", principalId: "foreign", linkedAccountId: null });
    fake.measurementRecords.push(...fake.measurementVisits.map(row => ({ id: row.id, principalId: row.principalId, visitId: row.id })));
    fake.measurementOutbox.push({ id: "own", principalId: "account" }, { id: "guest-queue", principalId: "guest" }, { id: "foreign-queue", principalId: "foreign" });
    fake.measurementExports.push({ id: "own-export", actorId: "due" }, { id: "foreign-export", actorId: "other" });

    expect(await job.execute({ now: NOW })).toEqual({ purgedCount: 1 });

    expect(fake.measurementPrincipals.map(row => row.id)).toEqual(["guest", "foreign"]);
    expect(fake.measurementVisits.map(row => row.id)).toEqual(["independent", "foreign-visit"]);
    expect(fake.measurementRecords.map(row => row.id)).toEqual(["independent", "foreign-visit"]);
    expect(fake.measurementOutbox.map(row => row.id)).toEqual(["guest-queue", "foreign-queue"]);
    expect(fake.measurementExports).toEqual([]);
    expect(fake.transactions).toHaveLength(1);
    expect(fake.transactions[0]).toEqual(expect.arrayContaining(["measurementInvestigationExport.deleteMany", "measurementPrincipal.deleteMany", "user.update"]));
  });

  it("uses one interactive prepared-source transaction and asserts the live receipt", async () => {
    fake.users.push({ id: "receipt-user", phone: "+99360000000", displayName: "Name", avatarUrl: null, deletionScheduledAt: new Date(NOW.getTime() - 1) });

    const result = await job.execute({ now: NOW });

    expect(result.purgedCount).toBe(1);
    expect(fake.transactions).toHaveLength(1);
    expect(fake.raw.filter((statement) => statement.sql.includes("diagnostic_prepare_source"))).toHaveLength(1);
    expect(fake.raw.filter((statement) => statement.sql.includes("diagnostic_assert_source"))).toHaveLength(3);
    expect(fake.raw.filter((statement) => statement.sql.includes("diagnostic_finish_source"))).toHaveLength(1);
  });

  it("preserves business-owned drafts and contact while purging the creator's personal inventory data", async () => {
    fake.users.push({ id: "departed", phone: "+99365123456", displayName: "Former staff", avatarUrl: null, deletionScheduledAt: new Date(NOW.getTime() - 1) });
    fake.listingDrafts.push({ id: "personal-draft", userId: "departed", businessId: null }, { id: "business-draft", userId: "departed", businessId: "business" });
    fake.listings.push({ id: "personal-car", sellerId: "departed", contactPhone: "+99365123456", businessId: null }, { id: "business-car", sellerId: "departed", contactPhone: "+99365111222", businessId: "business" });
    await job.execute({ now: NOW });
    expect(fake.listingDrafts).toEqual([{ id: "business-draft", userId: "departed", businessId: "business" }]);
    expect(fake.listings).toEqual([{ id: "personal-car", sellerId: "departed", contactPhone: null, businessId: null }, { id: "business-car", sellerId: "departed", contactPhone: "+99365111222", businessId: "business" }]);
    expect(fake.users[0]?.phone).toBeNull();
  });

  it("frees both Sign-in Methods and clears PII for users whose deletion grace has expired", async () => {
    fake.users.push({
      id: "user-expired",
      phone: "+99361234567",
      phoneVerifiedAt: new Date("2026-01-01T00:00:00Z"),
      email: "expired@example.com",
      emailVerifiedAt: new Date("2026-02-01T00:00:00Z"),
      displayName: "Expired",
      avatarUrl: "https://example.com/avatar.jpg",
      deletionScheduledAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    });
    fake.users.push({
      id: "user-future",
      phone: "+99361234568",
      displayName: "Future",
      avatarUrl: null,
      deletionScheduledAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });
    fake.sessions.push({ id: "sess-1", userId: "user-expired" });
    fake.favorites.push({ id: "fav-1", userId: "user-expired" });

    const result = await job.execute({ now: NOW });

    expect(result.purgedCount).toBe(1);

    const purged = fake.users.find((u) => u.id === "user-expired");
    expect(purged).toBeDefined();
    expect(purged?.phone).toBeNull();
    expect(purged?.phoneVerifiedAt).toBeNull();
    expect(purged?.email).toBeNull();
    expect(purged?.emailVerifiedAt).toBeNull();
    expect(purged?.displayName).toBeNull();
    expect(purged?.avatarUrl).toBeNull();
    expect(purged?.deletionScheduledAt).toBeNull();

    const kept = fake.users.find((u) => u.id === "user-future");
    expect(kept).toBeDefined();
    expect(kept?.phone).toBe("+99361234568");
    expect(kept?.deletionScheduledAt).not.toBeNull();
  });

  it("clears the name and the photo key and keeps the name number and avatar index (#638)", async () => {
    fake.users.push({
      id: "user-expired",
      phone: "+99361234567",
      displayName: "Expired",
      avatarUrl: null,
      nameNumber: 4821,
      avatarIndex: 7,
      avatarKey: "avatars/user-expired/photo.jpg",
      deletionScheduledAt: new Date(NOW.getTime() - 1000),
    });

    await job.execute({ now: NOW });

    expect(fake.users[0]).toMatchObject({
      displayName: null,
      avatarKey: null,
      nameNumber: 4821,
      avatarIndex: 7,
    });
  });

  describe("Profile Photo (#642)", () => {
    const photoOwner = {
      id: "user-expired",
      phone: "+99361234567",
      displayName: "Expired",
      avatarUrl: null,
      nameNumber: 4821,
      avatarIndex: 7,
      avatarKey: "pending/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.jpg",
      avatarUploadId: "upload-1",
      deletionScheduledAt: new Date(NOW.getTime() - 1000),
    };

    it("retires the photo's upload, records its storage deletion and clears the link", async () => {
      fake.users.push({ ...photoOwner });
      fake.uploads.push({ id: "upload-1", state: "ADOPTED" });

      await job.execute({ now: NOW });

      expect(fake.uploads).toEqual([{ id: "upload-1", state: "RETIRED" }]);
      expect(fake.cleanups).toEqual(["upload-1"]);
      expect(fake.users[0]).toMatchObject({
        avatarKey: null,
        avatarUploadId: null,
        avatarIndex: 7,
        nameNumber: 4821,
      });
    });

    it("does it in the purge transaction: the User row lock first, the retirement before the link is cleared", async () => {
      fake.users.push({ ...photoOwner });
      fake.uploads.push({ id: "upload-1", state: "ADOPTED" });

      await job.execute({ now: NOW });

      expect(fake.transactions).toHaveLength(1);
      const operations = fake.transactions[0] ?? [];
      expect(operations[0]).toBe("user.lock");
      expect(operations.indexOf("profilePhoto.retire")).toBeGreaterThan(0);
      expect(operations.indexOf("profilePhoto.retire")).toBeLessThan(operations.indexOf("user.update"));
    });

    it("retires at the purge's own time, for this User only", async () => {
      fake.users.push({ ...photoOwner });
      fake.uploads.push({ id: "upload-1", state: "ADOPTED" });

      await job.execute({ now: NOW });

      const retirement = fake.raw.find((statement) => statement.sql.includes("media_upload_cleanups"));
      expect(retirement?.values).toContain("user-expired");
      expect(retirement?.values).toContain(NOW);
      // Legacy bytes are recorded but never deleted; only fenced work is due.
      expect(retirement?.sql).toContain("LEGACY_PENDING");
    });

    it("purges a User with no photo without retiring anything", async () => {
      fake.users.push({ ...photoOwner, avatarKey: null, avatarUploadId: null });
      fake.uploads.push({ id: "someone-elses", state: "ADOPTED" });

      const result = await job.execute({ now: NOW });

      expect(result.purgedCount).toBe(1);
      expect(fake.uploads).toEqual([{ id: "someone-elses", state: "ADOPTED" }]);
      expect(fake.cleanups).toEqual([]);
    });
  });

  it("prunes private rows for purged users", async () => {
    fake.users.push({
      id: "user-1",
      phone: "+99361234567",
      displayName: "Name",
      avatarUrl: null,
      deletionScheduledAt: new Date(NOW.getTime() - 1000),
    });
    fake.sessions.push({ id: "s1", userId: "user-1" });
    fake.totpEnrollments.push({ id: "t1", userId: "user-1" });
    fake.fcmDevices.push({ id: "f1", userId: "user-1" });
    fake.notificationHistory.push({ id: "n1", userId: "user-1" });
    fake.notificationPreferences.push({ id: "np1", userId: "user-1" });
    fake.savedSearches.push({ id: "ss1", userId: "user-1" });
    fake.favorites.push({ id: "fav1", userId: "user-1" });
    fake.ownedVehicles.push({ id: "ov1", userId: "user-1" });
    fake.blockedUsers.push({ id: "bu1", blockerId: "user-1", blockedId: "other" });
    fake.dealershipMembers.push({ id: "dm1", userId: "user-1" });
    fake.listingDrafts.push({ id: "ld1", userId: "user-1" });

    await job.execute({ now: NOW });

    expect(fake.sessions).toHaveLength(0);
    expect(fake.totpEnrollments).toHaveLength(0);
    expect(fake.fcmDevices).toHaveLength(0);
    expect(fake.notificationHistory).toHaveLength(0);
    expect(fake.notificationPreferences).toHaveLength(0);
    expect(fake.savedSearches).toHaveLength(0);
    expect(fake.favorites).toHaveLength(0);
    expect(fake.ownedVehicles).toHaveLength(0);
    expect(fake.blockedUsers).toHaveLength(0);
    expect(fake.dealershipMembers).toHaveLength(0);
    expect(fake.listingDrafts).toHaveLength(0);
  });

  it("deletes the purged User's verified contact phones in the same transaction as the other rows", async () => {
    fake.users.push({
      id: "user-1",
      phone: "+99361234567",
      displayName: "Name",
      avatarUrl: null,
      deletionScheduledAt: new Date(NOW.getTime() - 1000),
    });
    fake.verifiedContactPhones.push(
      { id: "v1", sellerId: "user-1" },
      { id: "v2", sellerId: "user-1" },
      { id: "v3", sellerId: "someone-else" },
    );

    await job.execute({ now: NOW });

    expect(fake.verifiedContactPhones).toEqual([{ id: "v3", sellerId: "someone-else" }]);
    expect(fake.transactions).toHaveLength(1);
    expect(fake.transactions[0]).toContain("verifiedContactPhone.deleteMany");
    expect(fake.transactions[0]?.length).toBeGreaterThan(1);
  });

  it("deletes the purged User's sign-in code records and clears the contact phone on their kept Listings, in the same transaction", async () => {
    fake.users.push({
      id: "user-1",
      phone: "+99361234567",
      email: "aman@example.com",
      displayName: "Name",
      avatarUrl: null,
      deletionScheduledAt: new Date(NOW.getTime() - 1000),
    });
    const recent = new Date(NOW.getTime() - 60_000);
    fake.otpRequests.push(
      { id: "o1", userId: "user-1", destination: "+99361234567", phone: "+99361234567", createdAt: recent },
      { id: "o2", userId: null, destination: "+99361234567", phone: "+99361234567", createdAt: recent },
      { id: "o3", userId: null, destination: "aman@example.com", phone: null, createdAt: recent },
      { id: "o4", userId: null, destination: "+99365000000", phone: "+99365000000", createdAt: recent },
    );
    fake.listings.push(
      { id: "l1", sellerId: "user-1", contactPhone: "+99361234567" },
      { id: "l2", sellerId: "someone-else", contactPhone: "+99365000000" },
    );

    await job.execute({ now: NOW });

    expect(fake.otpRequests.map((r) => r.id)).toEqual(["o4"]);
    expect(fake.listings).toEqual([
      { id: "l1", sellerId: "user-1", contactPhone: null },
      { id: "l2", sellerId: "someone-else", contactPhone: "+99365000000" },
    ]);
    expect(fake.transactions[0]).toEqual(
      expect.arrayContaining(["otpRequest.deleteMany", "listing.updateMany", "verifiedContactPhone.deleteMany"]),
    );
  });

  it("keeps a code record another User requested to the purged User's number", async () => {
    fake.users.push({
      id: "user-1",
      phone: "+99361234567",
      email: null,
      displayName: null,
      avatarUrl: null,
      deletionScheduledAt: new Date(NOW.getTime() - 1000),
    });
    const recent = new Date(NOW.getTime() - 60_000);
    fake.otpRequests.push(
      { id: "mine", userId: "user-1", destination: "+99361234567", phone: "+99361234567", createdAt: recent },
      { id: "signed-out", userId: null, destination: "+99361234567", phone: "+99361234567", createdAt: recent },
      { id: "other-seller", userId: "seller-b", destination: "+99361234567", phone: "+99361234567", createdAt: recent },
    );

    await job.execute({ now: NOW });

    expect(fake.otpRequests.map((r) => r.id)).toEqual(["other-seller"]);
  });

  it("still deletes code records older than 30 days when a User's purge fails", async () => {
    const day = 24 * 60 * 60 * 1000;
    fake.users.push({
      id: "user-1",
      phone: "+99361234567",
      email: null,
      displayName: null,
      avatarUrl: null,
      deletionScheduledAt: new Date(NOW.getTime() - 1000),
    });
    fake.otpRequests.push({
      id: "old",
      userId: null,
      destination: "+99365000000",
      phone: "+99365000000",
      createdAt: new Date(NOW.getTime() - 31 * day),
    });
    (fake.prisma as unknown as { $transaction: () => Promise<never> }).$transaction = async () => {
      throw new Error("purge failed");
    };

    await expect(job.execute({ now: NOW })).rejects.toThrow("purge failed");

    expect(fake.otpRequests).toEqual([]);
  });

  it("deletes every sign-in code record older than 30 days on each run, even with no User to purge", async () => {
    const day = 24 * 60 * 60 * 1000;
    fake.otpRequests.push(
      { id: "old", userId: null, destination: "+99361234567", phone: "+99361234567", createdAt: new Date(NOW.getTime() - 31 * day) },
      { id: "new", userId: null, destination: "+99361234567", phone: "+99361234567", createdAt: new Date(NOW.getTime() - 29 * day) },
    );

    await job.execute({ now: NOW });

    expect(fake.otpRequests.map((r) => r.id)).toEqual(["new"]);
  });

  it("keeps verified contact phones during the grace period", async () => {
    fake.users.push({
      id: "user-1",
      phone: "+99361234567",
      displayName: "Name",
      avatarUrl: null,
      deletionScheduledAt: new Date(NOW.getTime() + 1000),
    });
    fake.verifiedContactPhones.push({ id: "v1", sellerId: "user-1" });

    await job.execute({ now: NOW });

    expect(fake.verifiedContactPhones).toHaveLength(1);
  });

  it("returns zero when no users have expired grace", async () => {
    fake.users.push({
      id: "user-1",
      phone: "+99361234567",
      displayName: "Name",
      avatarUrl: null,
      deletionScheduledAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });

    const result = await job.execute({ now: NOW });

    expect(result.purgedCount).toBe(0);
    const first = fake.users[0];
    expect(first?.phone).toBe("+99361234567");
  });
});
