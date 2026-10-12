import { http, HttpResponse } from "msw";
import { IdentitySchemas } from "@auto-tm/contracts";
import { act } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../../test/msw";
import { PHOTO_ME, setupPhotoHook, signInPhotoUser } from "../../../test/profile-photo-api";
import { capturePhotoSession } from "../../identity/profilePhotoSession";
import { queryKeys } from "../queryKeys";

import { useSetProfilePhoto } from "./useSetProfilePhoto";

vi.mock("expo-secure-store", async () => {
  const { photoApiStorage } = await import("../../../test/profile-photo-storage");
  return { getItemAsync: async (key: string) => photoApiStorage.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { photoApiStorage.set(key, value); },
    deleteItemAsync: async (key: string) => { photoApiStorage.delete(key); } };
});

beforeEach(signInPhotoUser);
const request: IdentitySchemas.SetProfilePhotoRequest = { key: "pending/new/original.webp" };

describe("useSetProfilePhoto", () => {
  it("sends the shared request schema and caches the full updated me response", async () => {
    let sent: unknown;
    server.use(http.put("*/me/photo", async ({ request: incoming }) => {
      sent = { body: IdentitySchemas.SetProfilePhotoRequestSchema.parse(await incoming.json()), auth: incoming.headers.get("authorization") };
      return HttpResponse.json({ ...PHOTO_ME, avatarKey: request.key });
    }));
    const session = await capturePhotoSession();
    const { client, result } = setupPhotoHook(useSetProfilePhoto);
    await act(() => result.current.mutateAsync({ request, session }));
    expect(sent).toEqual({ body: { key: "pending/new/original.webp" }, auth: "Bearer aman" });
    expect(client.getQueryData(queryKeys.me())).toEqual({ ...PHOTO_ME, avatarKey: "pending/new/original.webp" });
    session.dispose();
  });

  it.each([
    ["malformed", { avatarKey: "pending/new/original.webp" }],
    ["another User", { ...PHOTO_ME, id: "00000000-0000-4000-8000-00000000000b", avatarKey: "pending/new/original.webp" }],
  ])("rejects a %s answer and keeps the prior me", async (_kind, response) => {
    server.use(http.put("*/me/photo", () => HttpResponse.json(response)));
    const session = await capturePhotoSession();
    const { client, result } = setupPhotoHook(useSetProfilePhoto);
    const error = await act(() => result.current.mutateAsync({ request, session }).catch((e: unknown) => e));
    expect(error).toMatchObject({ code: "CONTRACT_VIOLATION" });
    expect(client.getQueryData(queryKeys.me())).toEqual(PHOTO_ME);
    session.dispose();
  });

  it.each([
    [400, "UPLOAD_NOT_AVAILABLE", undefined], [400, "UPLOAD_OBJECT_INVALID", undefined],
    [409, "UPLOAD_ALREADY_ATTACHED", "UPLOAD_PREPARING"],
    [409, "UPLOAD_ALREADY_ATTACHED", "UPLOAD_ATTACHED_TO_LISTING"],
    [403, "FORBIDDEN", "USER_SUSPENDED"],
  ])("preserves the server refusal %s %s %s and the old photo", async (status, code, reason) => {
    server.use(http.put("*/me/photo", () => HttpResponse.json({ code, details: reason ? { reason } : undefined }, { status })));
    const session = await capturePhotoSession();
    const { client, result } = setupPhotoHook(useSetProfilePhoto);
    const error = await act(() => result.current.mutateAsync({ request, session }).catch((e: unknown) => e));
    expect(error).toMatchObject({ code, status });
    if (reason) expect(error).toMatchObject({ details: { reason } });
    expect(client.getQueryData(queryKeys.me())).toEqual(PHOTO_ME);
    session.dispose();
  });
});
