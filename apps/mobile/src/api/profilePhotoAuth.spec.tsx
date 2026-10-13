import { act } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../test/msw";
import { PHOTO_ME, photoApiStorage, setupPhotoHook, signInPhotoUser } from "../../test/profile-photo-api";
import { choosePhoto, photoDevice, resetPhotoDevice } from "../../test/profile-photo-device";
import { clearAuthSession, loadAuthSession, storeAuthSession } from "../auth/session";
import { capturePhotoSession, PhotoSessionEnded } from "../identity/profilePhotoSession";
import { resetProfilePhotoUpload, useProfilePhotoUpload } from "../identity/useProfilePhotoUpload";

import { useRemoveProfilePhoto } from "./identity/useRemoveProfilePhoto";
import { useSetProfilePhoto } from "./identity/useSetProfilePhoto";
import { apiClient } from "./client";
import { queryKeys } from "./queryKeys";

vi.mock("expo-secure-store", async () => {
  const { photoApiStorage } = await import("../../test/profile-photo-storage");
  return { getItemAsync: async (key: string) => photoApiStorage.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { photoApiStorage.set(key, value); },
    deleteItemAsync: async (key: string) => { photoApiStorage.delete(key); } };
});
vi.mock("expo-image-picker", async () => {
  const { photoDevice } = await import("../../test/profile-photo-device");
  return { launchImageLibraryAsync: photoDevice.library, launchCameraAsync: photoDevice.camera, requestCameraPermissionsAsync: photoDevice.permission };
});
vi.mock("expo-file-system/legacy", async () => (await import("../../test/profile-photo-device")).fileSystemFake);
vi.mock("expo-image-manipulator", async () => (await import("../../test/profile-photo-device")).imageManipulatorFake);

const expired = `header.${btoa(JSON.stringify({ iat: 1000, exp: 1900 }))}.signature`;
beforeEach(async () => { await resetProfilePhotoUpload(); resetPhotoDevice(); await clearAuthSession(); await signInPhotoUser(); });

afterEach(resetProfilePhotoUpload);

async function expireToken() {
  const session = await loadAuthSession();
  photoApiStorage.set("auto_tm_auth_session", JSON.stringify({ ...session, accessToken: expired, storedAt: new Date(Date.now() - 16 * 60_000).toISOString() }));
}

const cases = (["presign", "set", "remove"] as const).flatMap((operation) => (["expired", "401"] as const).map((trigger) => ({ operation, trigger })));
describe("Profile photo uses the shared authentication lifecycle", () => {
  it.each(["expired", "401"])("stores rotated tokens for unrelated callers after a photo session is disposed during %s refresh", async (trigger) => {
    if (trigger === "expired") await expireToken();
    let complete!: (response: Response) => void;
    let refreshes = 0;
    let writes = 0;
    server.use(
      http.post("*/auth/refresh", () => {
        if (++refreshes > 1) return HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
        return new Promise<Response>((resolve) => { complete = resolve; });
      }),
      http.get("*/probe", ({ request }) => request.headers.get("authorization") === "Bearer fresh"
        ? HttpResponse.json({ ok: true }) : HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 })),
      http.put("*/me/photo", ({ request }) => {
        if (request.headers.get("authorization") !== "Bearer fresh") return HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
        writes += 1;
        return HttpResponse.json({ ...PHOTO_ME, avatarKey: "pending/new/original.jpg" });
      }),
    );
    const session = await capturePhotoSession();
    const { result, client } = await setupPhotoHook(useSetProfilePhoto);
    let photoRequest!: Promise<unknown>;
    await act(() => { photoRequest = result.current.mutateAsync({ request: { key: "pending/new/original.jpg" }, session }).catch((error: unknown) => error); });
    await vi.waitFor(() => expect(refreshes).toBe(1));
    const unrelatedRequest = apiClient.get("/probe").catch((error: unknown) => error);
    // Let the unrelated request join the same pending refresh before disposal.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    session.dispose();
    await act(async () => { complete(HttpResponse.json({ accessToken: "fresh", refreshToken: "fresh-refresh" })); });
    const unrelatedResult = await unrelatedRequest;
    const photoResult = await photoRequest;
    expect.soft(unrelatedResult).toEqual({ ok: true });
    expect.soft(await loadAuthSession()).toMatchObject({ accessToken: "fresh", refreshToken: "fresh-refresh", user: { id: PHOTO_ME.id } });
    expect.soft(refreshes).toBe(1);
    expect(photoResult).toBeInstanceOf(PhotoSessionEnded);
    expect(writes).toBe(0);
    expect(client.getQueryData(queryKeys.me())).toEqual(PHOTO_ME);
  });

  it("keeps the User signed in and the cache unchanged when a photo upload is cancelled during refresh", async () => {
    await expireToken();
    let complete!: (response: Response) => void;
    let started = false;
    let presigns = 0;
    server.use(
      http.post("*/auth/refresh", () => { started = true; return new Promise<Response>((resolve) => { complete = resolve; }); }),
      http.post("*/uploads/presign", () => { presigns += 1; return HttpResponse.json({ code: "UNAUTHORIZED" }, { status: 401 }); }),
    );
    choosePhoto();
    const { result, client } = await setupPhotoHook(useProfilePhotoUpload);
    let picking!: Promise<void>;
    await act(() => { picking = result.current.pick("library"); });
    await vi.waitFor(() => expect(started).toBe(true));
    await act(async () => { result.current.cancel(); });
    await act(async () => { complete(HttpResponse.json({ accessToken: "fresh", refreshToken: "fresh-refresh" })); await picking; });
    expect(await loadAuthSession()).toMatchObject({ accessToken: "fresh", refreshToken: "fresh-refresh", user: { id: PHOTO_ME.id } });
    expect(result.current.state.status).toBe("idle");
    expect(presigns).toBe(0);
    expect(photoDevice.sent).toHaveLength(0);
    expect(client.getQueryData(queryKeys.me())).toEqual(PHOTO_ME);
  });

  it("fences a photo mutation that joins another request's refresh before sign-out", async () => {
    await expireToken();
    let complete!: (response: Response) => void;
    let started = false;
    let sets = 0;
    server.use(
      http.post("*/auth/refresh", () => { started = true; return new Promise<Response>((resolve) => { complete = resolve; }); }),
      http.get("*/probe", () => HttpResponse.json({ ok: true })),
      http.put("*/me/photo", () => { sets += 1; return HttpResponse.json({ ...PHOTO_ME, avatarKey: "pending/new/original.jpg" }); }),
    );
    const publicRequest = apiClient.get("/probe");
    await vi.waitFor(() => expect(started).toBe(true));
    const session = await capturePhotoSession();
    const { result } = await setupPhotoHook(useSetProfilePhoto);
    let photoRequest!: Promise<unknown>;
    await act(async () => {
      photoRequest = result.current.mutateAsync({ request: { key: "pending/new/original.jpg" }, session }).catch((error: unknown) => error);
      // Drain native-storage microtasks so this request joins the pending refresh.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await clearAuthSession();
    const next = { accessToken: "merdan", refreshToken: "merdan-refresh", user: { id: "00000000-0000-4000-8000-00000000000b", phone: PHOTO_ME.phone, email: null, displayName: "Merdan", role: "buyer" as const } };
    await storeAuthSession(next);
    await act(async () => { complete(HttpResponse.json({ accessToken: "old-fresh", refreshToken: "old-refresh" })); });
    expect(await photoRequest).toBeInstanceOf(PhotoSessionEnded);
    expect(await publicRequest).toEqual({ ok: true });
    expect(sets).toBe(0);
    expect((await loadAuthSession())?.user.id).toBe(next.user.id);
    session.dispose();
  });

  it.each(cases)("refreshes $trigger credentials for $operation", async ({ operation, trigger }) => {
    if (trigger === "expired") await expireToken();
    const events: string[] = [];
    server.use(
      http.post("*/auth/refresh", async ({ request }) => {
        events.push("refresh");
        expect(await request.json()).toEqual({ refreshToken: "refresh-aman" });
        return HttpResponse.json({ accessToken: "fresh", refreshToken: "fresh-refresh" });
      }),
      http.post("*/uploads/presign", ({ request }) => {
        const auth = request.headers.get("authorization");
        events.push(`presign:${auth}`);
        if (operation === "presign" && auth !== "Bearer fresh") return HttpResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
        return HttpResponse.json({ uploadUrl: "https://storage.example/photo", key: "pending/new/original.jpg", expiresIn: 600, maxSizeBytes: 5242880, headers: { "if-match": '"etag"' } });
      }),
      http.put("*/me/photo", ({ request }) => {
        const auth = request.headers.get("authorization"); events.push(`set:${auth}`);
        if (operation === "set" && auth !== "Bearer fresh") return HttpResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
        return HttpResponse.json({ ...PHOTO_ME, avatarKey: "pending/new/original.jpg" });
      }),
      http.delete("*/me/photo", ({ request }) => {
        const auth = request.headers.get("authorization"); events.push(`remove:${auth}`);
        if (auth !== "Bearer fresh") return HttpResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
        return HttpResponse.json(PHOTO_ME);
      }),
    );
    if (operation === "presign") {
      choosePhoto();
      const { result } = await setupPhotoHook(useProfilePhotoUpload);
      await act(() => { void result.current.pick("library"); });
      await vi.waitFor(() => expect(events).toContain("refresh"));
      await vi.waitFor(() => expect(photoDevice.sent).toHaveLength(1));
      await act(async () => { photoDevice.finish(); });
      await vi.waitFor(() => expect(result.current.state.status).toBe("idle"));
    } else {
      const session = await capturePhotoSession();
      const { result } = await setupPhotoHook(() => ({ set: useSetProfilePhoto(), remove: useRemoveProfilePhoto() }));
      let error: unknown;
      await act(async () => { await (operation === "set" ? result.current.set.mutateAsync({ request: { key: "pending/new/original.jpg" }, session }) : result.current.remove.mutateAsync(session)).catch((e: unknown) => { error = e; }); });
      expect(error).toBeUndefined();
      session.dispose();
    }
    expect(events.filter((event) => event === "refresh")).toHaveLength(1);
    expect(events).toContain(`${operation}:Bearer fresh`);
    if (trigger === "expired") expect(events[0]).toBe("refresh");
  });

  it.each(["success", "rejected", "malformed"])("ignores an old %s refresh after the next User signs in", async (response) => {
    await expireToken();
    let complete!: (response: Response) => void;
    let started = false;
    let presigns = 0;
    server.use(
      http.post("*/auth/refresh", () => { started = true; return new Promise<Response>((resolve) => { complete = resolve; }); }),
      http.post("*/uploads/presign", () => { presigns += 1; return HttpResponse.json({ code: "UNAUTHORIZED" }, { status: 401 }); }),
    );
    choosePhoto();
    const { result } = await setupPhotoHook(useProfilePhotoUpload);
    await act(() => { void result.current.pick("library"); });
    await vi.waitFor(() => expect(started).toBe(true));
    await clearAuthSession();
    const next = { accessToken: "merdan", refreshToken: "merdan-refresh", user: { id: "00000000-0000-4000-8000-00000000000b", phone: PHOTO_ME.phone, email: null, displayName: "Merdan", role: "buyer" as const } };
    await storeAuthSession(next);
    await act(async () => { complete(response === "success" ? HttpResponse.json({ accessToken: "old-fresh", refreshToken: "old-refresh" }) : response === "rejected" ? HttpResponse.json({ code: "UNAUTHORIZED" }, { status: 401 }) : HttpResponse.json({ wrong: true })); });
    await vi.waitFor(() => expect(result.current.state.status).toBe("idle"));
    expect((await loadAuthSession())?.user.id).toBe(next.user.id);
    expect(presigns).toBe(0);
  });
});

describe("Shared refresh belongs to the stored auth session, independently of photo callers", () => {
  const races = (["signed-out", "different-user", "same-user-new-token"] as const).flatMap((transition) =>
    (["success", "rejected", "malformed"] as const).map((response) => ({ transition, response })));
  it.each(races)("does not overwrite or clear $transition after an old $response refresh", async ({ transition, response }) => {
    await expireToken();
    let complete!: (response: Response) => void;
    let started = false;
    server.use(
      http.post("*/auth/refresh", () => { started = true; return new Promise<Response>((resolve) => { complete = resolve; }); }),
      http.get("*/probe", () => HttpResponse.json({ ok: true })),
    );
    const request = apiClient.get("/probe");
    await vi.waitFor(() => expect(started).toBe(true));
    await clearAuthSession();
    if (transition !== "signed-out") {
      await storeAuthSession({ accessToken: "new-sign-in", refreshToken: "new-sign-in-refresh", user: {
        id: transition === "different-user" ? "00000000-0000-4000-8000-00000000000b" : PHOTO_ME.id,
        phone: PHOTO_ME.phone, email: null, displayName: "Signed in again", role: "buyer",
      } });
    }
    const expectedSession = await loadAuthSession();
    complete(response === "success" ? HttpResponse.json({ accessToken: "old-fresh", refreshToken: "old-refresh" })
      : response === "rejected" ? HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 }) : HttpResponse.json({ wrong: true }));
    expect(await request).toEqual({ ok: true });
    expect(await loadAuthSession()).toEqual(expectedSession);
  });
});
