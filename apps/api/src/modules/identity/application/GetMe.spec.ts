import type { Env } from "../../../env.schema";
import { InMemoryIdentityCheck } from "./testing/InMemoryIdentityCheck";
import { ConfigService } from "@nestjs/config";
import { ConfigListingVideoAccess } from "../../../common/ConfigListingVideoAccess";
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { SignInMethods } from "../domain/SignInMethods";
import type { User } from "../domain/User";
import type { UserRepository } from "../domain/ports/UserRepository";
import { GetMe } from "./GetMe";

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

class FakeUserRepository implements UserRepository {
  users: Map<string, User> = new Map();

  async findByPhone(_phone: string): Promise<User | null> { return null; }
  async findByEmail(_email: string): Promise<User | null> { return null; }
  async create(_signInMethods: SignInMethods): Promise<User> {
    return makeUser();
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async delete(_id: string): Promise<void> {}
  async updateDisplayName(): Promise<void> {}
  async findUsersWithExpiredDeletionGrace(_now: Date): Promise<User[]> { return []; }
  async purgePersonalData(_userId: string): Promise<void> {}
}

function makeUseCase(userRepo?: FakeUserRepository) {
  return new GetMe(userRepo ?? new FakeUserRepository(), new ConfigListingVideoAccess(new ConfigService<Env, true>({ LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: "", LISTING_VIDEO_VIEW_TESTER_USER_IDS: "", LISTING_VIDEO_UPLOADS_ENABLED: false })), new InMemoryIdentityCheck());
}

describe("GetMe", () => {
  let userRepo: FakeUserRepository;

  beforeEach(() => {
    userRepo = new FakeUserRepository();
  });

  it("reports membership separately from the switch and removes capabilities from ineligible accounts", async () => {
    userRepo.users.set("user-1", makeUser());
    const config = new ConfigService<Env, true>({ LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: " user-1, user-2 ", LISTING_VIDEO_VIEW_TESTER_USER_IDS: "", LISTING_VIDEO_UPLOADS_ENABLED: true });
    const identity = new InMemoryIdentityCheck();
    const me = new GetMe(userRepo, new ConfigListingVideoAccess(config), identity);
    expect(await me.execute({ userId: "user-1" })).toMatchObject({ isVideoUploadTester: true, canUploadVideo: true });
    config.set("LISTING_VIDEO_UPLOADS_ENABLED", false);
    expect(await me.execute({ userId: "user-1" })).toMatchObject({ isVideoUploadTester: true, canUploadVideo: false });
    config.set("LISTING_VIDEO_UPLOADS_ENABLED", true);
    identity.suspend("user-1");
    expect(await me.execute({ userId: "user-1" })).toMatchObject({ isVideoUploadTester: false, canUploadVideo: false });
    identity.unsuspend("user-1");
    userRepo.users.set("user-1", makeUser({ deletionScheduledAt: new Date() }));
    expect(await me.execute({ userId: "user-1" })).toMatchObject({ isVideoUploadTester: false, canUploadVideo: false });
  });

  it("returns the contract user shape for an existing user", async () => {
    const user = makeUser();
    userRepo.users.set(user.id, user);

    const uc = makeUseCase(userRepo);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.id).toBe("user-1");
    expect(result.phone).toBe("+99361234567");
    expect(result.email).toBeNull();
    expect(result.phoneVerified).toBe(true);
    expect(result.displayName).toBe("Bagtyyar");
    expect(result.role).toBe("buyer");
    expect(result.avatarUrl).toBe("https://example.com/avatar.jpg");
    expect(result.locale).toBe("ru");
    expect(result.createdAt).toBe("2026-05-14T12:00:00.000Z");
  });

  it("returns nullable fields as null when not set", async () => {
    const user = makeUser({ displayName: null, avatarUrl: null });
    userRepo.users.set(user.id, user);

    const uc = makeUseCase(userRepo);
    const result = await uc.execute({ userId: "user-1" });

    expect(result.displayName).toBeNull();
    expect(result.avatarUrl).toBeNull();
  });

  it("returns the name number, the avatar index and a null avatar key, with no name set", async () => {
    const user = makeUser({ displayName: null, nameNumber: 1000, avatarIndex: 11 });
    userRepo.users.set(user.id, user);

    const result = await makeUseCase(userRepo).execute({ userId: "user-1" });

    expect(result).toMatchObject({
      displayName: null,
      nameNumber: 1000,
      avatarIndex: 11,
      avatarKey: null,
    });
  });

  it("returns an email-only User with a null phone and phoneVerified false", async () => {
    const user = makeUser({
      phone: null,
      phoneVerifiedAt: null,
      email: "me@example.com",
      emailVerifiedAt: new Date("2026-09-22T10:00:00Z"),
    });
    userRepo.users.set(user.id, user);

    const result = await makeUseCase(userRepo).execute({ userId: "user-1" });

    expect(result.phone).toBeNull();
    expect(result.email).toBe("me@example.com");
    expect(result.phoneVerified).toBe(false);
  });

  it("throws 'User not found' when the user does not exist", async () => {
    const uc = makeUseCase(userRepo);

    await expect(
      uc.execute({ userId: "nonexistent" }),
    ).rejects.toThrow("User not found");
  });

  it("returns the correct role for non-buyer users", async () => {
    const user = makeUser({ id: "admin-1", role: "admin" });
    userRepo.users.set(user.id, user);

    const uc = makeUseCase(userRepo);
    const result = await uc.execute({ userId: "admin-1" });

    expect(result.role).toBe("admin");
  });
});
