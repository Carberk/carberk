import { describe, it, expect, beforeEach } from "vitest";
import type { SignInMethods } from "../domain/SignInMethods";
import type { User } from "../domain/User";
import type { UserRepository } from "../domain/ports/UserRepository";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type {
  AccountDeletionUnitOfWork,
  AccountDeletionWrites,
} from "../domain/ports/AccountDeletionUnitOfWork";
import type { ClockPort } from "../domain/ports/ClockPort";
import { DeleteMe } from "./DeleteMe";

const NOW = new Date("2026-05-14T12:00:00Z");
const GRACE_30D = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
const PUBLISHED_AT = new Date("2026-05-01T12:00:00Z");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    phone: "+99361234567",
    phoneVerifiedAt: new Date("2026-05-01T00:00:00Z"),
    email: null,
    emailVerifiedAt: null,
    displayName: "Bagtyyar",
    nameNumber: 4821,
    avatarIndex: 7,
    avatarKey: null,
    avatarUrl: "https://example.com/avatar.jpg",
    locale: "ru",
    role: "buyer",
    createdAt: new Date("2026-05-14T12:00:00Z"),
    updatedAt: new Date("2026-05-14T12:00:00Z"),
    deletionScheduledAt: null,
    ...overrides,
  };
}

interface StoredListing {
  id: string;
  sellerId: string;
  status: "active" | "archived";
  archivedByDeletion: boolean;
  publishedAt: Date | null;
}

interface StoreSnapshot {
  users: Map<string, User>;
  listings: StoredListing[];
  sessionUserIds: string[];
}

/** The rows the deletion touches, so a rollback can be observed across them. */
class InMemoryAccountStore {
  users = new Map<string, User>();
  listings: StoredListing[] = [];
  sessionUserIds: string[] = [];

  snapshot(): StoreSnapshot {
    return {
      users: new Map(this.users),
      listings: this.listings.map((listing) => ({ ...listing })),
      sessionUserIds: [...this.sessionUserIds],
    };
  }

  restore(snapshot: StoreSnapshot): void {
    this.users = snapshot.users;
    this.listings = snapshot.listings;
    this.sessionUserIds = snapshot.sessionUserIds;
  }

  listing(id: string): StoredListing {
    const found = this.listings.find((listing) => listing.id === id);
    if (!found) throw new Error(`no listing ${id}`);
    return found;
  }
}

class FakeUserRepository implements UserRepository {
  constructor(private readonly store: InMemoryAccountStore) {}

  async findByPhone(_phone: string): Promise<User | null> { return null; }
  async findByEmail(_email: string): Promise<User | null> { return null; }
  async create(_signInMethods: SignInMethods): Promise<User> { return makeUser(); }
  async findById(id: string): Promise<User | null> {
    return this.store.users.get(id) ?? null;
  }
  async delete(id: string): Promise<void> {
    this.store.users.delete(id);
  }
  async updateDisplayName(): Promise<void> {}
  async findUsersWithExpiredDeletionGrace(_now: Date): Promise<User[]> { return []; }
  async purgePersonalData(_userId: string): Promise<void> {}
}

/** Session rows live outside the deletion's unit of work, as in the database adapter. */
class FakeSessionRepository implements SessionRepository {
  failures = 0;

  constructor(private readonly store: InMemoryAccountStore) {}

  async create(): Promise<never> { throw new Error("not implemented"); }
  async countByUserId(): Promise<number> { return 0; }
  async deleteExpiredByUserId(): Promise<number> { return 0; }
  async deleteOldestByUserId(): Promise<void> {}
  async findByRefreshToken(): Promise<null> { return null; }
  async rotateRefreshToken(): Promise<boolean> { return false; }
  async findById(): Promise<null> { return null; }
  async updateAdminTotpExpiresAt(): Promise<void> {}
  async delete(): Promise<void> {}
  async deleteAllByUserId(userId: string): Promise<number> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("sessions unavailable");
    }
    const before = this.store.sessionUserIds.length;
    this.store.sessionUserIds = this.store.sessionUserIds.filter((id) => id !== userId);
    return before - this.store.sessionUserIds.length;
  }
}

type WriteName = keyof AccountDeletionWrites;

/**
 * Stands in for the database transaction: the work's writes land in the
 * store, and a thrown error puts the User and Listing rows back as they were
 * before the work. A write named in `failAfter` is applied and then throws
 * once, the worst case for a write that is not in the same transaction as
 * the other.
 */
class FakeAccountDeletionUnitOfWork implements AccountDeletionUnitOfWork {
  runs = 0;
  failAfter = new Set<WriteName>();

  constructor(private readonly store: InMemoryAccountStore) {}

  async run<T>(command: { readonly userId: string; readonly deletionScheduledAt: Date }, work: (writes: AccountDeletionWrites) => Promise<T>): Promise<T> {
    this.runs += 1;
    const before = this.store.snapshot();
    let scheduled = false;
    let archived = false;
    try {
      const result = await work({
        scheduleDeletion: async (userId, deletionScheduledAt) => {
          if (userId !== command.userId || deletionScheduledAt.getTime() !== command.deletionScheduledAt.getTime() || scheduled || archived) throw new Error("account_deletion_target");
          const user = this.store.users.get(userId);
          if (user) {
            this.store.users.set(userId, { ...user, deletionScheduledAt });
          }
          scheduled = true;
          this.failIfAsked("scheduleDeletion");
        },
        archiveActiveListings: async (sellerId) => {
          if (sellerId !== command.userId || !scheduled || archived) throw new Error("account_deletion_target");
          for (const listing of this.store.listings) {
            if (listing.sellerId === sellerId && listing.status === "active") {
              listing.status = "archived";
              listing.archivedByDeletion = true;
            }
          }
          archived = true;
          this.failIfAsked("archiveActiveListings");
        },
      });
      if (!scheduled || !archived) throw new Error("account_deletion_incomplete");
      return result;
    } catch (error) {
      // Session rows are not part of this transaction, so they keep whatever
      // happened to them before the work ran.
      this.store.restore({ ...before, sessionUserIds: this.store.sessionUserIds });
      throw error;
    }
  }

  private failIfAsked(write: WriteName): void {
    if (this.failAfter.delete(write)) {
      throw new Error(`${write} failed`);
    }
  }
}

class FakeClock implements ClockPort {
  now(): Date {
    return NOW;
  }
}

describe("DeleteMe", () => {
  let store: InMemoryAccountStore;
  let sessionRepo: FakeSessionRepository;
  let unitOfWork: FakeAccountDeletionUnitOfWork;
  let uc: DeleteMe;

  beforeEach(() => {
    store = new InMemoryAccountStore();
    store.users.set("user-1", makeUser());
    store.listings = [
      {
        id: "active",
        sellerId: "user-1",
        status: "active",
        archivedByDeletion: false,
        publishedAt: PUBLISHED_AT,
      },
      {
        id: "self-archived",
        sellerId: "user-1",
        status: "archived",
        archivedByDeletion: false,
        publishedAt: PUBLISHED_AT,
      },
      {
        id: "other-seller",
        sellerId: "user-2",
        status: "active",
        archivedByDeletion: false,
        publishedAt: PUBLISHED_AT,
      },
    ];
    store.sessionUserIds = ["user-1", "user-1", "user-2"];
    sessionRepo = new FakeSessionRepository(store);
    unitOfWork = new FakeAccountDeletionUnitOfWork(store);
    uc = new DeleteMe(
      new FakeUserRepository(store),
      sessionRepo,
      unitOfWork,
      new FakeClock(),
    );
  });

  function expectDeletionScheduled(): void {
    expect(store.users.get("user-1")?.deletionScheduledAt).toEqual(GRACE_30D);
    expect(store.listing("active")).toMatchObject({
      status: "archived",
      archivedByDeletion: true,
    });
  }

  function expectNothingScheduled(): void {
    expect(store.users.get("user-1")?.deletionScheduledAt).toBeNull();
    expect(store.listing("active")).toMatchObject({
      status: "active",
      archivedByDeletion: false,
      publishedAt: PUBLISHED_AT,
    });
  }

  it("schedules deletion 30 days ahead and archives only the seller's active Listings", async () => {
    await uc.execute({ userId: "user-1" });

    expectDeletionScheduled();
    expect(store.listing("self-archived")).toMatchObject({
      status: "archived",
      archivedByDeletion: false,
    });
    expect(store.listing("other-seller").status).toBe("active");
    expect(unitOfWork.runs).toBe(1);
  });

  it("revokes all of the User's sessions and no one else's", async () => {
    await uc.execute({ userId: "user-1" });

    expect(store.sessionUserIds).toEqual(["user-2"]);
  });

  it("does not delete the user row", async () => {
    await uc.execute({ userId: "user-1" });

    expect(store.users.has("user-1")).toBe(true);
  });

  it("rolls back both writes when scheduling the deletion fails", async () => {
    unitOfWork.failAfter.add("scheduleDeletion");

    await expect(uc.execute({ userId: "user-1" })).rejects.toThrow(
      "scheduleDeletion failed",
    );

    expectNothingScheduled();
  });

  it("rolls back both writes when archiving the Listings fails", async () => {
    unitOfWork.failAfter.add("archiveActiveListings");

    await expect(uc.execute({ userId: "user-1" })).rejects.toThrow(
      "archiveActiveListings failed",
    );

    expectNothingScheduled();
  });

  it.each<WriteName>(["scheduleDeletion", "archiveActiveListings"])(
    "completes the deletion when retried after %s failed",
    async (failing) => {
      unitOfWork.failAfter.add(failing);
      await expect(uc.execute({ userId: "user-1" })).rejects.toThrow();

      await uc.execute({ userId: "user-1" });

      expectDeletionScheduled();
      expect(store.sessionUserIds).toEqual(["user-2"]);
    },
  );

  it("revokes the sessions before the deletion writes, so a failed revocation writes nothing", async () => {
    sessionRepo.failures = 1;

    await expect(uc.execute({ userId: "user-1" })).rejects.toThrow(
      "sessions unavailable",
    );

    expect(unitOfWork.runs).toBe(0);
    expectNothingScheduled();

    await uc.execute({ userId: "user-1" });

    expectDeletionScheduled();
    expect(store.sessionUserIds).toEqual(["user-2"]);
  });

  it("throws 'User not found' and writes nothing when the user does not exist", async () => {
    await expect(uc.execute({ userId: "nonexistent" })).rejects.toThrow(
      "User not found",
    );

    expect(unitOfWork.runs).toBe(0);
    expect(store.sessionUserIds).toEqual(["user-1", "user-1", "user-2"]);
  });

  it("re-schedules the deletion for a purged user", async () => {
    store.users.set("user-1", makeUser({ phone: null, phoneVerifiedAt: null }));

    await expect(uc.execute({ userId: "user-1" })).resolves.toBeUndefined();

    expect(store.users.get("user-1")?.deletionScheduledAt).toEqual(GRACE_30D);
  });
});
