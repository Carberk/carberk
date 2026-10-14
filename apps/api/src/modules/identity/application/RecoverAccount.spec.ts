import { describe, it, expect, beforeEach } from "vitest";
import type { SignInMethods } from "../domain/SignInMethods";
import type { User } from "../domain/User";
import type { UserRepository } from "../domain/ports/UserRepository";
import type {
  AccountRestoreUnitOfWork,
  AccountRestoreWrites,
} from "../domain/ports/AccountRestoreUnitOfWork";
import { RecoverAccount } from "./RecoverAccount";

const SCHEDULED_AT = new Date("2026-06-14T12:00:00Z");
const ARCHIVED_AT = new Date("2026-05-15T12:00:00Z");

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
    deletionScheduledAt: SCHEDULED_AT,
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

/** The rows both writes touch, so a rollback can be observed across them. */
class InMemoryAccountStore {
  users = new Map<string, User>();
  listings: StoredListing[] = [];

  snapshot(): { users: Map<string, User>; listings: StoredListing[] } {
    return {
      users: new Map(this.users),
      listings: this.listings.map((listing) => ({ ...listing })),
    };
  }

  restore(snapshot: { users: Map<string, User>; listings: StoredListing[] }): void {
    this.users = snapshot.users;
    this.listings = snapshot.listings;
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
  async delete(_id: string): Promise<void> {}
  async updateDisplayName(): Promise<void> {}
  async findUsersWithExpiredDeletionGrace(_now: Date): Promise<User[]> { return []; }
  async purgePersonalData(_userId: string): Promise<void> {}
}

type WriteName = keyof AccountRestoreWrites;

/**
 * Stands in for the database transaction: the work's writes land in the
 * store, and a thrown error puts the store back as it was before the work.
 * A write named in `failAfter` is applied and then throws once, the worst
 * case for a write that is not in the same transaction as the other.
 */
class FakeAccountRestoreUnitOfWork implements AccountRestoreUnitOfWork {
  runs = 0;
  failAfter = new Set<WriteName>();

  constructor(private readonly store: InMemoryAccountStore) {}

  async run<T>(work: (writes: AccountRestoreWrites) => Promise<T>): Promise<T> {
    this.runs += 1;
    const before = this.store.snapshot();
    try {
      return await work({
        republishListingsArchivedByDeletion: async (sellerId) => {
          for (const listing of this.store.listings) {
            if (
              listing.sellerId === sellerId &&
              listing.status === "archived" &&
              listing.archivedByDeletion
            ) {
              listing.status = "active";
              listing.archivedByDeletion = false;
            }
          }
          this.failIfAsked("republishListingsArchivedByDeletion");
        },
        clearDeletionSchedule: async (userId) => {
          const user = this.store.users.get(userId);
          if (user) {
            this.store.users.set(userId, { ...user, deletionScheduledAt: null });
          }
          this.failIfAsked("clearDeletionSchedule");
        },
      });
    } catch (error) {
      this.store.restore(before);
      throw error;
    }
  }

  private failIfAsked(write: WriteName): void {
    if (this.failAfter.delete(write)) {
      throw new Error(`${write} failed`);
    }
  }
}

describe("RecoverAccount", () => {
  let store: InMemoryAccountStore;
  let unitOfWork: FakeAccountRestoreUnitOfWork;
  let uc: RecoverAccount;

  beforeEach(() => {
    store = new InMemoryAccountStore();
    store.users.set("user-1", makeUser());
    store.listings = [
      {
        id: "deletion-archived",
        sellerId: "user-1",
        status: "archived",
        archivedByDeletion: true,
        publishedAt: ARCHIVED_AT,
      },
      {
        id: "self-archived",
        sellerId: "user-1",
        status: "archived",
        archivedByDeletion: false,
        publishedAt: ARCHIVED_AT,
      },
    ];
    unitOfWork = new FakeAccountRestoreUnitOfWork(store);
    uc = new RecoverAccount(new FakeUserRepository(store), unitOfWork);
  });

  function expectNothingRestored(): void {
    expect(store.users.get("user-1")?.deletionScheduledAt).toEqual(SCHEDULED_AT);
    expect(store.listing("deletion-archived")).toMatchObject({
      status: "archived",
      archivedByDeletion: true,
      publishedAt: ARCHIVED_AT,
    });
  }

  it("clears the schedule and republishes only the Listings the deletion archived", async () => {
    await uc.execute({ userId: "user-1" });

    expect(store.users.get("user-1")?.deletionScheduledAt).toBeNull();
    expect(store.listing("deletion-archived")).toMatchObject({
      status: "active",
      archivedByDeletion: false,
      publishedAt: ARCHIVED_AT,
    });
    expect(store.listing("self-archived").status).toBe("archived");
  });

  it("rolls back both writes when republishing the Listings fails", async () => {
    unitOfWork.failAfter.add("republishListingsArchivedByDeletion");

    await expect(uc.execute({ userId: "user-1" })).rejects.toThrow(
      "republishListingsArchivedByDeletion failed",
    );

    expectNothingRestored();
  });

  it("rolls back both writes when clearing the schedule fails", async () => {
    unitOfWork.failAfter.add("clearDeletionSchedule");

    await expect(uc.execute({ userId: "user-1" })).rejects.toThrow(
      "clearDeletionSchedule failed",
    );

    expectNothingRestored();
  });

  it("completes the restore when retried after a failure", async () => {
    unitOfWork.failAfter.add("clearDeletionSchedule");
    await expect(uc.execute({ userId: "user-1" })).rejects.toThrow();

    await uc.execute({ userId: "user-1" });

    expect(store.users.get("user-1")?.deletionScheduledAt).toBeNull();
    expect(store.listing("deletion-archived")).toMatchObject({
      status: "active",
      archivedByDeletion: false,
    });
  });

  it("changes nothing when the account is already restored", async () => {
    await uc.execute({ userId: "user-1" });
    const restored = store.snapshot();

    await expect(uc.execute({ userId: "user-1" })).resolves.toBeUndefined();

    expect(unitOfWork.runs).toBe(1);
    expect(store.snapshot()).toEqual(restored);
  });

  it("changes nothing for a User who never scheduled a deletion", async () => {
    store.users.set("user-1", makeUser({ deletionScheduledAt: null }));

    await expect(uc.execute({ userId: "user-1" })).resolves.toBeUndefined();

    expect(unitOfWork.runs).toBe(0);
    expect(store.listing("deletion-archived").status).toBe("archived");
  });

  it("refuses an unknown User", async () => {
    await expect(uc.execute({ userId: "nonexistent" })).rejects.toThrow(
      "User not found",
    );
    expect(unitOfWork.runs).toBe(0);
  });
});
