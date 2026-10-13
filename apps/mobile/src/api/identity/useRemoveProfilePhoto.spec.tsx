import { http, HttpResponse } from "msw";
import { act } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onlineManager } from "@tanstack/react-query";

import { server } from "../../../test/msw";
import { PHOTO_ME, setupPhotoHook, signInPhotoUser } from "../../../test/profile-photo-api";
import { capturePhotoSession } from "../../identity/profilePhotoSession";
import { queryKeys } from "../queryKeys";

import { useRemoveProfilePhoto } from "./useRemoveProfilePhoto";

vi.mock("expo-secure-store", async () => {
  const { photoApiStorage } = await import("../../../test/profile-photo-storage");
  return { getItemAsync: async (key: string) => photoApiStorage.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { photoApiStorage.set(key, value); },
    deleteItemAsync: async (key: string) => { photoApiStorage.delete(key); } };
});
beforeEach(signInPhotoUser);

describe("useRemoveProfilePhoto", () => {
  it("deletes without a body and caches the unchanged assigned avatar", async () => {
    let sent: unknown;
    server.use(http.delete("*/me/photo", async ({ request }) => {
      sent = { body: await request.text(), auth: request.headers.get("authorization") };
      return HttpResponse.json(PHOTO_ME);
    }));
    const session = await capturePhotoSession();
    const { client, result } = await setupPhotoHook(useRemoveProfilePhoto);
    client.setQueryData(queryKeys.me(), { ...PHOTO_ME, avatarKey: "pending/old/original.webp" });
    await act(() => result.current.mutateAsync(session));
    expect(sent).toEqual({ body: "", auth: "Bearer aman" });
    expect(client.getQueryData(queryKeys.me())).toEqual(PHOTO_ME);
    session.dispose();
  });

  it("fails without pausing offline and preserves the existing photo", async () => {
    server.use(http.delete("*/me/photo", () => HttpResponse.error()));
    const session = await capturePhotoSession();
    const { client, result } = await setupPhotoHook(useRemoveProfilePhoto);
    client.setQueryData(queryKeys.me(), { ...PHOTO_ME, avatarKey: "pending/old/original.webp" });
    onlineManager.setOnline(false);
    let error: unknown;
    await act(() => { void result.current.mutateAsync(session).catch((e: unknown) => { error = e; }); });
    await vi.waitFor(() => expect(error).toBeDefined(), { timeout: 500 });
    expect(result.current.isPaused).toBe(false);
    expect(client.getQueryData(queryKeys.me())).toEqual({ ...PHOTO_ME, avatarKey: "pending/old/original.webp" });
    session.dispose();
  });

  it("rejects another User's successful answer instead of reporting removal", async () => {
    server.use(http.delete("*/me/photo", () => HttpResponse.json({ ...PHOTO_ME, id: "00000000-0000-4000-8000-00000000000b" })));
    const session = await capturePhotoSession();
    const { client, result } = await setupPhotoHook(useRemoveProfilePhoto);
    const error = await act(() => result.current.mutateAsync(session).catch((e: unknown) => e));
    expect(error).toMatchObject({ code: "CONTRACT_VIOLATION" });
    expect(client.getQueryData(queryKeys.me())).toEqual(PHOTO_ME);
    session.dispose();
  });
});
