import { beforeEach, describe, expect, it } from "vitest";

import { UserSuspendedError } from "../domain/UserSuspendedError";
import { InMemoryIdentityCheck } from "./testing/InMemoryIdentityCheck";
import { InMemoryProfilePhotos } from "./testing/InMemoryProfilePhotos";
import { InMemoryUsers } from "./testing/InMemoryUsers";
import { SetProfilePhoto } from "./SetProfilePhoto";

const KEY = "pending/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.webp";
const SECOND_KEY = "pending/1c0a4d2f-3e5b-4d7c-9f20-4b6c8d0e2f3a/original.webp";

describe("SetProfilePhoto", () => {
  let users: InMemoryUsers;
  let identityCheck: InMemoryIdentityCheck;
  let photos: InMemoryProfilePhotos;
  let useCase: SetProfilePhoto;

  beforeEach(() => {
    users = new InMemoryUsers();
    identityCheck = new InMemoryIdentityCheck();
    photos = new InMemoryProfilePhotos(users);
    useCase = new SetProfilePhoto(users, identityCheck, photos);
    users.seed({ id: "user-1", nameNumber: 4821, avatarIndex: 7 });
  });

  it("adopts the User's upload as their Profile Photo through the port", async () => {
    await useCase.execute({ userId: "user-1", key: KEY });

    expect(photos.adopted).toEqual([{ userId: "user-1", key: KEY }]);
    expect((await users.findById("user-1"))?.avatarKey).toBe(KEY);
  });

  it("leaves the Assigned Avatar index, name number and name as they were", async () => {
    await useCase.execute({ userId: "user-1", key: KEY });

    expect(await users.findById("user-1")).toMatchObject({
      avatarIndex: 7,
      nameNumber: 4821,
      displayName: null,
    });
  });

  it("succeeds and asks for nothing when the key is already the current photo", async () => {
    await useCase.execute({ userId: "user-1", key: KEY });

    await useCase.execute({ userId: "user-1", key: KEY });

    expect(photos.adopted).toHaveLength(1);
    expect((await users.findById("user-1"))?.avatarKey).toBe(KEY);
  });

  it("replaces the current photo with a second upload", async () => {
    await useCase.execute({ userId: "user-1", key: KEY });

    await useCase.execute({ userId: "user-1", key: SECOND_KEY });

    expect((await users.findById("user-1"))?.avatarKey).toBe(SECOND_KEY);
  });

  it("refuses a suspended User and adopts nothing", async () => {
    identityCheck.suspend("user-1");

    await expect(useCase.execute({ userId: "user-1", key: KEY })).rejects.toBeInstanceOf(
      UserSuspendedError,
    );
    expect(photos.adopted).toEqual([]);
    expect((await users.findById("user-1"))?.avatarKey).toBeNull();
  });

  it("passes the upload boundary's refusal on and keeps the current photo", async () => {
    await useCase.execute({ userId: "user-1", key: KEY });
    photos.refusal = new Error("Upload is not available for this User");

    await expect(useCase.execute({ userId: "user-1", key: SECOND_KEY })).rejects.toThrow(
      "Upload is not available for this User",
    );
    expect((await users.findById("user-1"))?.avatarKey).toBe(KEY);
  });

  it("answers 'User not found' for a User that no longer exists", async () => {
    await expect(useCase.execute({ userId: "gone", key: KEY })).rejects.toThrow("User not found");
    expect(photos.adopted).toEqual([]);
  });
});
