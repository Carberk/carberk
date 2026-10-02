import { describe, it, expect, beforeEach } from "vitest";
import type { SignInMethods } from "../domain/SignInMethods";
import type { User } from "../domain/User";
import type { UserRepository } from "../domain/ports/UserRepository";
import type { AccountDeletionListingsPort } from "../domain/ports/AccountDeletionListingsPort";
import { RecoverAccount } from "./RecoverAccount";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    phone: "+99361234567",
    phoneVerifiedAt: new Date("2026-05-01T00:00:00Z"),
    email: null,
    emailVerifiedAt: null,
    displayName: "Bagtyyar",
    avatarUrl: "https://example.com/avatar.jpg",
    locale: "ru",
    role: "buyer",
    createdAt: new Date("2026-05-14T12:00:00Z"),
    updatedAt: new Date("2026-05-14T12:00:00Z"),
    deletionScheduledAt: new Date("2026-06-14T12:00:00Z"),
    ...overrides,
  };
}

class FakeUserRepository implements UserRepository {
  users: Map<string, User> = new Map();
  clearedForUserId: string | null = null;

  async findByPhone(_phone: string): Promise<User | null> { return null; }
  async findByEmail(_email: string): Promise<User | null> { return null; }
  async create(_signInMethods: SignInMethods): Promise<User> { return makeUser(); }
  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }
  async delete(_id: string): Promise<void> {}
  async scheduleDeletion(_userId: string, _deletionScheduledAt: Date): Promise<void> {}
  async clearDeletionSchedule(userId: string): Promise<void> {
    this.clearedForUserId = userId;
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, { ...user, deletionScheduledAt: null });
    }
  }
  async findUsersWithExpiredDeletionGrace(_now: Date): Promise<User[]> { return []; }
  async purgePersonalData(_userId: string): Promise<void> {}
}

class FakeListingsPort implements AccountDeletionListingsPort {
  republishedSellerId: string | null = null;

  async archiveActiveListingsBySeller(_sellerId: string): Promise<void> {}
  async republishArchivedByDeletionListingsBySeller(sellerId: string): Promise<void> {
    this.republishedSellerId = sellerId;
  }
}

function makeUseCase(
  userRepo?: FakeUserRepository,
  listingsPort?: FakeListingsPort,
) {
  return new RecoverAccount(
    userRepo ?? new FakeUserRepository(),
    listingsPort ?? new FakeListingsPort(),
  );
}

describe("RecoverAccount", () => {
  let userRepo: FakeUserRepository;
  let listingsPort: FakeListingsPort;

  beforeEach(() => {
    userRepo = new FakeUserRepository();
    listingsPort = new FakeListingsPort();
  });

  it("clears deletionScheduledAt for the user", async () => {
    const user = makeUser();
    userRepo.users.set(user.id, user);

    const uc = makeUseCase(userRepo, listingsPort);
    await uc.execute({ userId: "user-1" });

    expect(userRepo.clearedForUserId).toBe("user-1");
    expect(userRepo.users.get("user-1")?.deletionScheduledAt).toBeNull();
  });

  it("republishes archivedByDeletion listings for the user", async () => {
    const user = makeUser();
    userRepo.users.set(user.id, user);

    const uc = makeUseCase(userRepo, listingsPort);
    await uc.execute({ userId: "user-1" });

    expect(listingsPort.republishedSellerId).toBe("user-1");
  });

  it("changes nothing for a User with no scheduled deletion", async () => {
    const user = makeUser({ deletionScheduledAt: null });
    userRepo.users.set(user.id, user);

    const uc = makeUseCase(userRepo, listingsPort);
    await expect(uc.execute({ userId: "user-1" })).resolves.toBeUndefined();

    expect(userRepo.clearedForUserId).toBeNull();
    expect(listingsPort.republishedSellerId).toBeNull();
  });

  it("refuses an unknown User", async () => {
    const uc = makeUseCase(userRepo, listingsPort);

    await expect(uc.execute({ userId: "nonexistent" })).rejects.toThrow(
      "User not found",
    );
    expect(listingsPort.republishedSellerId).toBeNull();
  });
});
