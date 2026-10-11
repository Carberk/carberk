import { AccessibilityInfo } from "react-native";
import { onlineManager } from "@tanstack/react-query";
import type { AuthSchemas } from "@auto-tm/contracts";
import * as Linking from "expo-linking";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { profilePhotoUploadStore, resetProfilePhotoUpload } from "../../src/identity/useProfilePhotoUpload";
import { profileNoticeStore } from "../../src/identity/profileNotice";
import ProfileScreen from "../../app/profile";
import { clearAuthSession, storeAuthSession } from "../../src/auth/session";
import { server } from "../msw";
import { profilePhotoCopy } from "../profile-photo-copy";
import { choosePhoto, photoDevice as picker, resetPhotoDevice } from "../profile-photo-device";
import CabinetScreen from "../../app/(tabs)/services";
import { act, fireEvent, renderMobile } from "../render";

import { ToastProvider } from "@/components/ui/toast";

vi.mock("expo-linking", () => ({ openSettings: vi.fn(async () => {}) }));

const theme = vi.hoisted(() => ({ colorScheme: "light" as "light" | "dark" }));
vi.mock("nativewind", () => ({ cssInterop: vi.fn(), remapProps: vi.fn(), useColorScheme: () => ({ colorScheme: theme.colorScheme }) }));

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { storage.set(key, value); },
  deleteItemAsync: async (key: string) => { storage.delete(key); },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock("expo-image-picker", async () => {
  const { photoDevice } = await import("../profile-photo-device");
  return { launchImageLibraryAsync: photoDevice.library, launchCameraAsync: photoDevice.camera,
    requestCameraPermissionsAsync: photoDevice.permission, requestMediaLibraryPermissionsAsync: photoDevice.libraryPermission };
});
vi.mock("expo-file-system/legacy", async () => (await import("../profile-photo-device")).fileSystemFake);
vi.mock("expo-image-manipulator", async () => (await import("../profile-photo-device")).imageManipulatorFake);

const me = {
  id: "00000000-0000-4000-8000-00000000000a", phone: "+99365123456", email: null,
  phoneVerified: true, displayName: "Aman", nameNumber: 4821, avatarIndex: 7,
  avatarKey: null, avatarUrl: null, role: "buyer", locale: "ru",
  createdAt: "2026-01-15T00:00:00.000Z", deletionScheduledAt: null,
} satisfies AuthSchemas.MeResponse;
let currentMe: AuthSchemas.MeResponse = me;
const requests = { presigns: [] as unknown[], sets: [] as unknown[] };

beforeEach(async () => {
  await resetProfilePhotoUpload();
  storage.clear();
  resetPhotoDevice();
  theme.colorScheme = "light";
  currentMe = me;
  requests.presigns = [];
  requests.sets = [];
  onlineManager.setOnline(true);
  profilePhotoUploadStore.setState({ state: { status: "idle" } });
  profileNoticeStore.getState().clear();
  server.use(
    http.get("*/me", () => HttpResponse.json(currentMe)),
    http.post("*/uploads/presign", async ({ request }) => {
      requests.presigns.push(await request.json());
      return HttpResponse.json({ uploadUrl: "https://storage.example/photo", key: `pending/new${requests.presigns.length}/original.webp`, expiresIn: 600, maxSizeBytes: 5242880, headers: { "if-match": '"etag"', "content-type": "image/webp" } });
    }),
    http.put("*/me/photo", async ({ request }) => {
      const body = await request.json() as { key: string };
      requests.sets.push(body);
      currentMe = { ...currentMe, avatarKey: body.key };
      return HttpResponse.json(currentMe);
    }),
  );
  await storeAuthSession({
    accessToken: "aman", refreshToken: "refresh-aman",
    user: { id: me.id, phone: me.phone, email: null, displayName: me.displayName, role: "buyer" },
  });
});

afterEach(async () => { await resetProfilePhotoUpload(); await clearAuthSession(); vi.useRealTimers(); });

describe("Profile photo", () => {
  it.each([
    ["en", "Uploading photo", "Uploading photo... 25%"],
    ["ru", "Загрузка фото", "Загрузка фото... 25%"],
    ["tk", "Surat ýüklenýär", "Surat ýüklenýär... 25%"],
  ])("uses photo-specific indeterminate text and measured percentages in %s", async (locale, indeterminate, measured) => {
    const announce = vi.spyOn(AccessibilityInfo, "announceForAccessibility");
    choosePhoto();
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>, { locale });
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: profilePhotoCopy[locale as keyof typeof profilePhotoCopy].changePhoto }));
    fireEvent.press(view.getByRole("button", { name: profilePhotoCopy[locale as keyof typeof profilePhotoCopy].chooseLib }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    expect(view.getByRole("progressbar").props.children).toBe(indeterminate);
    expect(announce.mock.calls.map(([message]) => message)).toEqual([indeterminate]);
    act(() => { picker.progress({ totalBytesSent: 512, totalBytesExpectedToSend: 2048 }); });
    expect(view.getByText(measured)).toBeTruthy();
    expect(announce.mock.calls.map(([message]) => message)).toEqual([indeterminate]);
    await act(async () => { picker.finish(); });
  });

  it.each(["no events", "unknown total"])("shows an indeterminate ring when upload byte progress has %s", async (progress) => {
    choosePhoto();
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    if (progress === "unknown total") act(() => { picker.progress({ totalBytesSent: 512, totalBytesExpectedToSend: 0 }); });
    expect(view.getByRole("progressbar").props.accessibilityValue?.now).toBeUndefined();
    expect(view.UNSAFE_queryAllByType("ActivityIndicator" as never)).toHaveLength(1);
    expect(view.queryByText("Uploading photo... 0%")).toBeNull();
    await act(async () => { picker.finish(); });
    expect(await view.findByText("Photo updated")).toBeTruthy();
  });

  it.each(["retry", "new photo"])("recovers through %s after a native transfer failure and cancelling the Log out dialog", async (recovery) => {
    choosePhoto();
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    fireEvent.press(view.getByRole("button", { name: "Log out" }));
    fireEvent.press(view.getByText("Cancel"));
    await act(async () => { picker.fail(new Error("Connection reset")); });
    await view.findByText("Couldn't upload the photo.");
    expect(picker.cancelUpload).toHaveBeenCalledOnce();
    if (recovery === "retry") fireEvent.press(view.getByRole("button", { name: "Retry" }));
    else {
      fireEvent.press(view.getByRole("button", { name: "Cancel" }));
      fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
      fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    }
    await vi.waitFor(() => expect(picker.sent).toHaveLength(2));
    await act(async () => { picker.finish(); });
    expect(await view.findByText("Photo updated")).toBeTruthy();
  });

  it.each(["upload", "remove"])("retries %s with refreshed credentials without reopening the picker", async (operation) => {
    choosePhoto();
    if (operation === "remove") currentMe = { ...me, avatarKey: "pending/old/original.webp" };
    let refreshes = 0;
    const sent: string[] = [];
    const respond = ({ request }: { request: Request }) => {
      const auth = request.headers.get("authorization") ?? "";
      sent.push(auth);
      if (auth !== "Bearer fresh") return HttpResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
      if (sent.filter((value) => value === "Bearer fresh").length === 1) return HttpResponse.json({ code: "INTERNAL" }, { status: 500 });
      currentMe = { ...me, avatarKey: operation === "remove" ? null : "pending/new2/original.webp" };
      return HttpResponse.json(currentMe);
    };
    server.use(http.post("*/auth/refresh", () => {
      refreshes += 1;
      return HttpResponse.json({ accessToken: "fresh", refreshToken: "fresh-refresh" });
    }), operation === "remove" ? http.delete("*/me/photo", respond) : http.put("*/me/photo", respond));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: operation === "remove" ? "Remove photo" : "Choose from library" }));
    if (operation === "upload") {
      await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
      await act(async () => { picker.finish(); });
    }
    expect(await view.findByText(operation === "remove" ? "Couldn't remove the photo." : "Couldn't upload the photo.")).toBeTruthy();
    expect(refreshes).toBe(1);
    fireEvent.press(view.getByRole("button", { name: "Retry" }));
    if (operation === "upload") {
      await vi.waitFor(() => expect(picker.sent).toHaveLength(2));
      expect(picker.sent[0]?.uri).toBe(picker.sent[1]?.uri);
      await act(async () => { picker.finish(); });
    }
    expect(await view.findByText(operation === "remove" ? "Photo removed" : "Photo updated")).toBeTruthy();
    expect(sent).toEqual(["Bearer aman", "Bearer fresh", "Bearer fresh"]);
    expect(picker.library).toHaveBeenCalledTimes(operation === "remove" ? 0 : 1);
  });

  it("opens the photo sheet from the labelled avatar and can close without a change", async () => {
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    expect(view.getByText("Profile photo")).toBeTruthy();
    expect(view.getByRole("button", { name: "Take photo" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Choose from library" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Remove photo" })).toBeNull();
    fireEvent.press(view.getByRole("button", { name: "Close" }));
    expect(view.queryByText("Profile photo")).toBeNull();
    expect(view.getByText("Aman")).toBeTruthy();
  });
  it("opens the library with square crop, no permission prompt, and cancellation changes nothing", async () => {
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    await act(async () => { fireEvent.press(view.getByRole("button", { name: "Choose from library" })); });
    expect(picker.library).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true, aspect: [1, 1], mediaTypes: ["images"] }));
    expect(picker.libraryPermission).not.toHaveBeenCalled();
    expect(view.queryByText("Profile photo")).toBeNull();
    expect(view.getByRole("button", { name: "Change profile photo" }).props.disabled).not.toBe(true);
    expect(view.queryByRole("alert")).toBeNull();
  });

  it("explains denied camera permission and opens system settings", async () => {
    const settings = vi.spyOn(Linking, "openSettings");
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    await act(async () => { fireEvent.press(view.getByRole("button", { name: "Take photo" })); });
    expect(view.getByText("Camera access is off")).toBeTruthy();
    expect(view.getByText("To take a photo, allow camera access for Carberk in system settings.")).toBeTruthy();
    expect(picker.camera).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(view.getByRole("button", { name: "Open settings" })); });
    expect(settings).toHaveBeenCalledOnce();
    expect(view.queryByText("Camera access is off")).toBeNull();
  });

  it("uploads a small WebP with real byte progress, disables the avatar, and updates Profile and Cabinet", async () => {
    choosePhoto();
    let presign: unknown;
    let attached: unknown;
    server.use(
      http.post("*/uploads/presign", async ({ request }) => {
        presign = await request.json();
        return HttpResponse.json({ uploadUrl: "https://storage.example/photo", key: "pending/new/original.webp", expiresIn: 600, maxSizeBytes: 5242880, headers: { "if-match": '"etag"', "content-type": "image/webp" } });
      }),
      http.put("*/me/photo", async ({ request }) => {
        attached = await request.json();
        currentMe = { ...me, avatarKey: "pending/new/original.webp" };
        return HttpResponse.json(currentMe);
      }),
      http.get("*/me/listings/counts", () => HttpResponse.json({ active: 0, sold: 0, archived: 0, banned: 0, drafts: 0, total: 0 })),
    );
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    expect(await view.findByText("Uploading photo")).toBeTruthy();
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    expect(presign).toEqual({ kind: "image", writeProtocol: "conditional-v1", contentType: "image/webp", sizeBytes: 2048 });
    expect(picker.sent[0]).toMatchObject({ url: "https://storage.example/photo", options: { httpMethod: "PUT", uploadType: 0, headers: { "if-match": '"etag"', "content-type": "image/webp" } } });
    expect(picker.saves).toContainEqual({ format: "webp", compress: 0.8 });
    act(() => { picker.progress({ totalBytesSent: 512, totalBytesExpectedToSend: 2048 }); });
    expect(view.getByRole("progressbar").props.accessibilityValue).toEqual({ min: 0, max: 100, now: 25 });
    expect(view.getByText("Uploading photo... 25%").props.accessibilityLiveRegion).toBe("polite");
    const button = view.getByRole("button", { name: "Change profile photo" });
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
    expect(view.queryByText("Profile photo")).toBeNull();
    act(() => { picker.progress({ totalBytesSent: 1536, totalBytesExpectedToSend: 2048 }); });
    expect(view.getByText("Uploading photo... 75%")).toBeTruthy();
    await act(async () => { picker.finish(); });
    expect(await view.findByText("Photo updated")).toBeTruthy();
    expect(attached).toEqual({ key: "pending/new/original.webp" });
    const photos = view.UNSAFE_queryAllByType("Image" as never);
    expect(photos[0]?.props.source).toEqual({ uri: "https://media.autotm.tm/listing-photos/pending/new/thumbnail.webp" });
    view.rerender(<ToastProvider><CabinetScreen /></ToastProvider>);
    await view.findByRole("button", { name: "Aman, +993 65 XX-XX-56" });
    expect(view.UNSAFE_queryAllByType("Image" as never)[0]?.props.source).toEqual({ uri: "https://media.autotm.tm/listing-photos/pending/new/thumbnail.webp" });
  });

  it("falls back to the assigned car mark when the local preview fails while preserving upload progress", async () => {
    choosePhoto();
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    act(() => { picker.progress({ totalBytesSent: 512, totalBytesExpectedToSend: 2048 }); });
    fireEvent(view.UNSAFE_getByType("Image" as never), "error");
    expect(view.UNSAFE_queryAllByType("Image" as never)).toHaveLength(0);
    expect(view.UNSAFE_queryAllByType("Path" as never)[0]?.props.d).toBe("M11.5 12H21M17 12v3M20 12v2.4M6.5 12h.01");
    expect(view.getByRole("progressbar").props.accessibilityValue.now).toBe(25);
    await act(async () => { picker.finish(); });
    expect(await view.findByText("Photo updated")).toBeTruthy();
  });

  it.each(["storage", "attachment"])("keeps the earlier avatar on %s failure, retries the same photo and can cancel", async (phase) => {
    currentMe = { ...me, avatarKey: "pending/old/original.webp" };
    choosePhoto();
    if (phase === "attachment") server.use(http.put("*/me/photo", () => HttpResponse.json({ code: "INTERNAL" }, { status: 500 })));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    await act(async () => { picker.finish(phase === "storage" ? 500 : 200); });
    const error = await view.findByText("Couldn't upload the photo.");
    expect(error.props.accessibilityLiveRegion).toBe("assertive");
    expect(view.UNSAFE_queryAllByType("Image" as never)[0]?.props.source).toEqual({ uri: "https://media.autotm.tm/listing-photos/pending/old/thumbnail.webp" });
    fireEvent.press(view.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(2));
    expect(picker.library).toHaveBeenCalledOnce();
    expect(picker.sent[1]?.uri).toBe(picker.sent[0]?.uri);
    await act(async () => { picker.finish(500); });
    await view.findByText("Couldn't upload the photo.");
    fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    expect(view.queryByText("Couldn't upload the photo.")).toBeNull();
    expect(view.getByRole("button", { name: "Change profile photo" }).props.accessibilityState.disabled).toBe(false);
  });

  it("shows the offline sentence without a request and retries when online", async () => {
    choosePhoto();
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    onlineManager.setOnline(false);
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    expect(await view.findByText("No internet connection. Try again when you are online.")).toBeTruthy();
    expect(requests.presigns).toEqual([]);
    expect(picker.sent).toEqual([]);
    onlineManager.setOnline(true);
    fireEvent.press(view.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    await act(async () => { picker.finish(); });
    expect(await view.findByText("Photo updated")).toBeTruthy();
    expect(picker.library).toHaveBeenCalledOnce();
  });

  it.each([
    ["oversize", "This photo is too large. Choose one up to 5 MB."],
    ["unreadable", "This file can't be used. Choose a JPEG, PNG or WebP photo."],
    ["unreadable alternate format", "This file can't be used. Choose a JPEG, PNG or WebP photo."],
  ])("refuses %s before requests and offers another photo or cancel", async (problem, message) => {
    choosePhoto(problem === "unreadable alternate format" ? { mimeType: "image/gif" } : {});
    if (problem === "oversize") picker.size = 5242881;
    if (problem === "unreadable" || problem === "unreadable alternate format") picker.readable = false;
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    expect(await view.findByText(message)).toBeTruthy();
    expect(requests.presigns).toEqual([]);
    expect(requests.sets).toEqual([]);
    expect(view.queryByRole("button", { name: "Retry" })).toBeNull();
    fireEvent.press(view.getByRole("button", { name: "Choose another photo" }));
    expect(view.getByText("Profile photo")).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: "Close" }));
    expect(view.queryByText(message)).toBeNull();
  });

  it("removes a photo immediately without confirmation and restores the same assigned car mark", async () => {
    currentMe = { ...me, avatarKey: "pending/old/original.webp" };
    let deleted = false;
    server.use(http.delete("*/me/photo", () => {
      deleted = true;
      currentMe = { ...me };
      return HttpResponse.json(currentMe);
    }));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Remove photo" }));
    expect(await view.findByText("Photo removed")).toBeTruthy();
    expect(deleted).toBe(true);
    expect(view.UNSAFE_queryAllByType("Image" as never)).toHaveLength(0);
    expect(view.UNSAFE_queryAllByType("Path" as never)[0]?.props.d).toBe("M11.5 12H21M17 12v3M20 12v2.4M6.5 12h.01");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    expect(view.queryByRole("button", { name: "Remove photo" })).toBeNull();
  });

  it("keeps the photo if removal fails and Retry removes it without a picker", async () => {
    currentMe = { ...me, avatarKey: "pending/old/original.webp" };
    let removes = 0;
    server.use(http.delete("*/me/photo", () => {
      removes += 1;
      if (removes === 1) return HttpResponse.json({ code: "INTERNAL" }, { status: 500 });
      currentMe = { ...me };
      return HttpResponse.json(currentMe);
    }));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Remove photo" }));
    expect(await view.findByText("Couldn't remove the photo.")).toBeTruthy();
    expect(view.UNSAFE_queryAllByType("Image" as never)[0]?.props.source).toEqual({ uri: "https://media.autotm.tm/listing-photos/pending/old/thumbnail.webp" });
    fireEvent.press(view.getByRole("button", { name: "Retry" }));
    expect(await view.findByText("Photo removed")).toBeTruthy();
    expect(removes).toBe(2);
    expect(picker.library).not.toHaveBeenCalled();
  });

  it("waits for a preparing upload and retries the same key without failing or uploading again", async () => {
    choosePhoto();
    server.use(http.put("*/me/photo", async ({ request }) => {
      const body = await request.json();
      requests.sets.push(body);
      if (requests.sets.length === 1) return HttpResponse.json({ code: "UPLOAD_ALREADY_ATTACHED", details: { reason: "UPLOAD_PREPARING" } }, { status: 409 });
      currentMe = { ...me, avatarKey: "pending/new1/original.webp" };
      return HttpResponse.json(currentMe);
    }));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    await act(async () => { picker.finish(); });
    await vi.waitFor(() => expect(view.getByText("Preparing photo...")).toBeTruthy());
    expect(view.queryByText("Couldn't upload the photo.")).toBeNull();
    expect(view.getByRole("progressbar").props.accessibilityValue.now).toBe(100);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await vi.waitFor(() => expect(view.getByText("Photo updated")).toBeTruthy());
    expect(requests.sets).toEqual([{ key: "pending/new1/original.webp" }, { key: "pending/new1/original.webp" }]);
    expect(picker.sent).toHaveLength(1);
    expect(picker.library).toHaveBeenCalledOnce();
  });

  it.each([
    [400, "UPLOAD_NOT_AVAILABLE", undefined, "Couldn't upload the photo."],
    [400, "UPLOAD_OBJECT_INVALID", undefined, "Couldn't upload the photo."],
    [409, "UPLOAD_ALREADY_ATTACHED", "UPLOAD_ATTACHED_TO_LISTING", "This upload belongs to a listing. Retry to upload a new copy."],
  ])("freshly presigns after %s %s %s, keeping the chosen photo", async (status, code, reason, message) => {
    choosePhoto();
    server.use(http.put("*/me/photo", async ({ request }) => {
      const body = await request.json() as { key: string };
      requests.sets.push(body);
      if (requests.sets.length === 1) return HttpResponse.json({ code, details: reason ? { reason } : undefined }, { status });
      currentMe = { ...me, avatarKey: body.key };
      return HttpResponse.json(currentMe);
    }));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    await act(async () => { picker.finish(); });
    expect(await view.findByText(message)).toBeTruthy();
    expect(view.queryByText("Photo updated")).toBeNull();
    fireEvent.press(view.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(2));
    await act(async () => { picker.finish(); });
    expect(await view.findByText("Photo updated")).toBeTruthy();
    expect(requests.presigns).toHaveLength(2);
    expect(requests.sets).toEqual([{ key: "pending/new1/original.webp" }, { key: "pending/new2/original.webp" }]);
    expect(picker.library).toHaveBeenCalledOnce();
  });

  it.each(["USER_SUSPENDED", "FORBIDDEN"])("keeps the earlier photo for 403 %s and offers no futile retry", async (code) => {
    choosePhoto();
    currentMe = { ...me, avatarKey: "pending/old/original.webp" };
    server.use(http.put("*/me/photo", () => HttpResponse.json({ code, details: { reason: "USER_SUSPENDED" } }, { status: 403 })));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    await act(async () => { picker.finish(); });
    expect(await view.findByText("Your account is restricted. Contact support if you think this is a mistake.")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(view.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(view.UNSAFE_queryAllByType("Image" as never)[0]?.props.source).toEqual({ uri: "https://media.autotm.tm/listing-photos/pending/old/thumbnail.webp" });
  });

  it("finishes after leaving Profile and shows the result on return", async () => {
    choosePhoto();
    server.use(http.get("*/me/listings/counts", () => HttpResponse.json({ active: 0, sold: 0, archived: 0, banned: 0, drafts: 0, total: 0 })));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    view.rerender(<ToastProvider><CabinetScreen /></ToastProvider>);
    await view.findByText("Account");
    await act(async () => { picker.finish(); });
    await vi.waitFor(() => expect(requests.sets).toHaveLength(1));
    view.rerender(<ToastProvider><ProfileScreen /></ToastProvider>);
    expect(await view.findByText("Photo updated")).toBeTruthy();
    expect(view.UNSAFE_queryAllByType("Image" as never)[0]?.props.source).toEqual({ uri: "https://media.autotm.tm/listing-photos/pending/new1/thumbnail.webp" });
  });

  it.each(["storage", "attachment"])("never attaches or caches the previous User's photo when signing out during %s", async (phase) => {
    choosePhoto();
    let complete: ((response: Response) => void) | undefined;
    const sentTo: string[] = [];
    server.use(http.put("*/me/photo", ({ request }) => {
      sentTo.push(request.headers.get("authorization") ?? "");
      if (phase === "attachment") return new Promise<Response>((resolve) => { complete = resolve; });
      return HttpResponse.json({ ...me, avatarKey: "pending/new1/original.webp" });
    }));
    const content = <ToastProvider><ProfileScreen /></ToastProvider>;
    const view = renderMobile(content);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    if (phase === "attachment") {
      await act(async () => { picker.finish(); });
      await vi.waitFor(() => expect(complete).toBeDefined());
    }
    // Log out clears the QueryClient in the root session flow.
    await act(async () => { await clearAuthSession(); view.queryClient.clear(); });
    currentMe = { ...me, id: "00000000-0000-4000-8000-00000000000b", displayName: "Merdan", avatarIndex: 2 };
    await act(async () => { await storeAuthSession({ accessToken: "merdan", refreshToken: "refresh-merdan", user: { id: currentMe.id, phone: me.phone, email: null, displayName: "Merdan", role: "buyer" } }); });
    await view.findByText("Merdan");
    expect(view.queryByText("Uploading photo")).toBeNull();
    expect(view.UNSAFE_queryAllByType("Image" as never)).toHaveLength(0);
    await act(async () => {
      if (phase === "attachment") complete?.(HttpResponse.json({ ...me, avatarKey: "pending/new1/original.webp" }));
      else picker.finish();
    });
    await vi.waitFor(() => expect(view.queryByText("Uploading photo")).toBeNull());
    expect(sentTo).toEqual(phase === "attachment" ? ["Bearer aman"] : []);
    expect(view.getByText("Merdan")).toBeTruthy();
    expect(view.queryByText("Photo updated")).toBeNull();
    expect(view.UNSAFE_queryAllByType("Image" as never)).toHaveLength(0);
  });

  it("discards compression after sign-out without leaking validation errors to the next User", async () => {
    choosePhoto();
    let complete!: () => void;
    picker.renderWait = new Promise<void>((resolve) => { complete = resolve; });
    picker.size = 6 * 1024 * 1024;
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.renderStarted).toHaveBeenCalledOnce());
    await act(async () => { await clearAuthSession(); view.queryClient.clear(); });
    currentMe = { ...me, id: "00000000-0000-4000-8000-00000000000b", displayName: "Merdan" };
    await act(async () => { await storeAuthSession({ accessToken: "merdan", refreshToken: "refresh-merdan", user: { id: currentMe.id, phone: me.phone, email: null, displayName: "Merdan", role: "buyer" } }); });
    await view.findByText("Merdan");
    await act(async () => { complete(); });
    expect(view.queryByRole("alert")).toBeNull();
    expect(picker.deletes).toContainEqual(expect.stringMatching(/^file:\/\/\/cache\/profile-photo-\d+\.webp$/));
    expect(requests.presigns).toHaveLength(0);
    expect(requests.sets).toHaveLength(0);
    expect(view.getByText("Merdan")).toBeTruthy();
  });

  it("ignores a late preparing conflict after sign-out without locking the next User", async () => {
    choosePhoto();
    let complete!: (response: Response) => void;
    let started = false;
    let attempts = 0;
    server.use(http.put("*/me/photo", () => {
      attempts += 1;
      started = true;
      return new Promise<Response>((resolve) => { complete = resolve; });
    }));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    await act(async () => { picker.finish(); });
    await vi.waitFor(() => expect(started).toBe(true));
    await act(async () => { await clearAuthSession(); view.queryClient.clear(); });
    currentMe = { ...me, id: "00000000-0000-4000-8000-00000000000b", displayName: "Merdan" };
    await act(async () => { await storeAuthSession({ accessToken: "merdan", refreshToken: "refresh-merdan", user: { id: currentMe.id, phone: me.phone, email: null, displayName: "Merdan", role: "buyer" } }); });
    await view.findByText("Merdan");
    await act(async () => { complete(HttpResponse.json({ code: "UPLOAD_ALREADY_ATTACHED", details: { reason: "UPLOAD_PREPARING" } }, { status: 409 })); });
    expect(view.queryByText("Preparing photo...")).toBeNull();
    expect(view.queryByRole("progressbar")).toBeNull();
    expect(view.getByRole("button", { name: "Change profile photo" }).props.disabled).not.toBe(true);
    expect(view.queryByRole("alert")).toBeNull();
    expect(attempts).toBe(1);
  });

  it.each(["exhaust", "cancel"])("can %s a preparing wait without another storage upload", async (ending) => {
    choosePhoto();
    let attempts = 0;
    server.use(http.put("*/me/photo", () => {
      attempts += 1;
      return HttpResponse.json({ code: "UPLOAD_ALREADY_ATTACHED", details: { reason: "UPLOAD_PREPARING" } }, { status: 409 });
    }));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    await act(async () => { picker.finish(); });
    await vi.waitFor(() => expect(view.getByText("Preparing photo...")).toBeTruthy());
    if (ending === "cancel") {
      fireEvent.press(view.getByRole("button", { name: "Cancel" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(attempts).toBe(1);
      expect(view.queryByRole("progressbar")).toBeNull();
      expect(view.queryByRole("alert")).toBeNull();
    } else {
      for (let i = 0; i < 30; i += 1) {
        await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      }
      expect(view.getByText("Couldn't upload the photo.")).toBeTruthy();
      expect(attempts).toBe(30);
      expect(view.getByRole("button", { name: "Retry" })).toBeTruthy();
      fireEvent.press(view.getByRole("button", { name: "Retry" }));
      await vi.waitFor(() => expect(picker.sent).toHaveLength(2));
      expect(picker.sent[0]?.uri).toBe(picker.sent[1]?.uri);
      expect(picker.library).toHaveBeenCalledOnce();
      server.use(http.put("*/me/photo", () => HttpResponse.json({ ...me, avatarKey: "pending/new2/original.webp" })));
      await act(async () => { picker.finish(); });
      await vi.waitFor(() => expect(view.getByText("Photo updated")).toBeTruthy());
    }
    expect(picker.sent).toHaveLength(ending === "cancel" ? 1 : 2);
  });

  it.each(["library", "camera", "permission"])("ignores a late %s rejection after the next User signs in", async (boundary) => {
    picker.cameraGranted = true;
    let reject!: (error: Error) => void;
    const nativeCall = boundary === "library" ? picker.library : boundary === "camera" ? picker.camera : picker.permission;
    nativeCall.mockImplementationOnce(() => new Promise<never>((_resolve, fail) => { reject = fail; }));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: boundary === "library" ? "Choose from library" : "Take photo" }));
    await vi.waitFor(() => expect(reject).toBeDefined());
    await act(async () => { await clearAuthSession(); view.queryClient.clear(); });
    currentMe = { ...me, id: "00000000-0000-4000-8000-00000000000b", displayName: "Merdan" };
    await act(async () => { await storeAuthSession({ accessToken: "merdan", refreshToken: "refresh-merdan", user: { id: currentMe.id, phone: me.phone, email: null, displayName: "Merdan", role: "buyer" } }); });
    await view.findByText("Merdan");
    await act(async () => { reject(new Error("Native picker unavailable")); });
    expect(view.queryByRole("alert")).toBeNull();
    expect(view.queryByText("Camera access is off")).toBeNull();
    expect(view.getByRole("button", { name: "Change profile photo" }).props.disabled).not.toBe(true);
    expect(requests.presigns).toHaveLength(0);
  });

  it("times out a stalled storage PUT, ignores late events and retries the same photo", async () => {
    choosePhoto();
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    const lateProgress = picker.progress;
    const lateFinish = picker.finish;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(view.getByText("Couldn't upload the photo.")).toBeTruthy();
    expect(picker.cancelUpload).toHaveBeenCalledOnce();
    await act(async () => {
      lateProgress({ totalBytesSent: 2048, totalBytesExpectedToSend: 2048 });
      lateFinish();
    });
    expect(view.queryByRole("progressbar")).toBeNull();
    expect(requests.sets).toHaveLength(0);
    fireEvent.press(view.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(2));
    expect(picker.sent[0]?.uri).toBe(picker.sent[1]?.uri);
    await act(async () => { picker.finish(); });
    await vi.waitFor(() => expect(view.getByText("Photo updated")).toBeTruthy());
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(picker.cancelUpload).toHaveBeenCalledOnce();
    expect(view.queryByRole("alert")).toBeNull();
    expect(picker.library).toHaveBeenCalledOnce();
  });

  it.each(["failed", "success", "preparing"])("announces start and %s result without speaking every percent on iOS", async (ending) => {
    const announce = vi.spyOn(AccessibilityInfo, "announceForAccessibility");
    choosePhoto();
    let attempts = 0;
    if (ending === "preparing") server.use(http.put("*/me/photo", () => {
      attempts += 1;
      if (attempts === 1) return HttpResponse.json({ code: "UPLOAD_ALREADY_ATTACHED", details: { reason: "UPLOAD_PREPARING" } }, { status: 409 });
      return HttpResponse.json({ ...me, avatarKey: "pending/new1/original.webp" });
    }));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    for (const bytes of [512, 1024, 1536, 2048]) act(() => { picker.progress({ totalBytesSent: bytes, totalBytesExpectedToSend: 2048 }); });
    expect(announce.mock.calls.map(([message]) => message)).toEqual(["Uploading photo"]);
    await act(async () => { picker.finish(ending === "failed" ? 500 : 200); });
    if (ending === "preparing") {
      await vi.waitFor(() => expect(view.getByText("Preparing photo...")).toBeTruthy());
      expect(announce.mock.calls.map(([message]) => message)).toEqual(["Uploading photo", "Preparing photo..."]);
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    }
    await vi.waitFor(() => expect(view.getByText(ending === "failed" ? "Couldn't upload the photo." : "Photo updated")).toBeTruthy());
    expect(announce.mock.calls.map(([message]) => message)).toEqual(["Uploading photo", ...(ending === "preparing" ? ["Preparing photo..."] : []), ending === "failed" ? "Couldn't upload the photo." : "Photo updated"]);
  });

  it("announces removal start and result once on iOS", async () => {
    const announce = vi.spyOn(AccessibilityInfo, "announceForAccessibility");
    currentMe = { ...me, avatarKey: "pending/old/original.webp" };
    server.use(http.delete("*/me/photo", () => HttpResponse.json(me)));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Remove photo" }));
    await view.findByText("Photo removed");
    expect(announce.mock.calls.map(([message]) => message)).toEqual(["Removing photo...", "Photo removed"]);
  });

  it("ignores a late removal failure after another User signs in", async () => {
    currentMe = { ...me, avatarKey: "pending/old/original.webp" };
    let complete: ((response: Response) => void) | undefined;
    server.use(http.delete("*/me/photo", () => new Promise<Response>((resolve) => { complete = resolve; })));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Remove photo" }));
    await vi.waitFor(() => expect(complete).toBeDefined());
    await act(async () => { await clearAuthSession(); view.queryClient.clear(); });
    currentMe = { ...me, id: "00000000-0000-4000-8000-00000000000b", displayName: "Merdan" };
    await act(async () => { await storeAuthSession({ accessToken: "merdan", refreshToken: "refresh-merdan", user: { id: currentMe.id, phone: me.phone, email: null, displayName: "Merdan", role: "buyer" } }); });
    await view.findByText("Merdan");
    expect(view.getByRole("button", { name: "Change profile photo" }).props.accessibilityState.disabled).toBe(false);
    await act(async () => { complete?.(HttpResponse.json({ code: "INTERNAL" }, { status: 500 })); });
    expect(view.queryByText("Couldn't remove the photo.")).toBeNull();
    expect(view.queryByText("Photo removed")).toBeNull();
  });

  it("never moves progress backwards when native byte events arrive out of order", async () => {
    choosePhoto();
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    act(() => { picker.progress({ totalBytesSent: 1536, totalBytesExpectedToSend: 2048 }); });
    act(() => { picker.progress({ totalBytesSent: 1536, totalBytesExpectedToSend: 0 }); });
    expect(view.getByRole("progressbar").props.accessibilityValue?.now).toBe(75);
    expect(view.getByText("Uploading photo... 75%")).toBeTruthy();
    act(() => { picker.progress({ totalBytesSent: 512, totalBytesExpectedToSend: 2048 }); });
    expect(view.getByRole("progressbar").props.accessibilityValue.now).toBe(75);
    await act(async () => { picker.finish(); });
    await view.findByText("Photo updated");
  });

  it("does not upload if a legacy server omits the conditional write headers", async () => {
    choosePhoto();
    server.use(http.post("*/uploads/presign", () => HttpResponse.json({ uploadUrl: "https://storage.example/photo", key: "pending/new/original.webp", expiresIn: 600, maxSizeBytes: 5242880 })));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>);
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: "Change profile photo" }));
    fireEvent.press(view.getByRole("button", { name: "Choose from library" }));
    expect(await view.findByText("Couldn't upload the photo.")).toBeTruthy();
    expect(picker.sent).toEqual([]);
    expect(requests.sets).toEqual([]);
  });

  const states = ["idle", "camera denied", "uploading", "failed", "offline", "too large", "unsupported", "success", "removed", "remove failed", "preparing", "attached to listing"] as const;
  const matrix = (["en", "ru", "tk"] as const).flatMap((locale) => states.map((state) => ({ locale, state })));
  it.each(matrix)("renders $state in $locale with translated controls", async ({ locale, state }) => {
    const copy = profilePhotoCopy[locale];
    choosePhoto();
    if (state === "too large") picker.size = 5242881;
    if (state === "unsupported") picker.readable = false;
    const removing = state === "removed" || state === "remove failed";
    if (removing) {
      currentMe = { ...me, avatarKey: "pending/old/original.webp" };
      server.use(http.delete("*/me/photo", () => {
        if (state === "remove failed") return HttpResponse.json({ code: "INTERNAL" }, { status: 500 });
        currentMe = { ...me };
        return HttpResponse.json(currentMe);
      }));
    }
    let attachAttempts = 0;
    if (state === "preparing" || state === "attached to listing") server.use(http.put("*/me/photo", () => {
      attachAttempts += 1;
      if (attachAttempts > 1) return HttpResponse.json({ ...me, avatarKey: "pending/new1/original.webp" });
      return HttpResponse.json({ code: "UPLOAD_ALREADY_ATTACHED", details: { reason: state === "preparing" ? "UPLOAD_PREPARING" : "UPLOAD_ATTACHED_TO_LISTING" } }, { status: 409 });
    }));
    const view = renderMobile(<ToastProvider><ProfileScreen /></ToastProvider>, { locale });
    await view.findByText("Aman");
    fireEvent.press(view.getByRole("button", { name: copy.changePhoto }));
    if (state === "idle") {
      expect(view.getByText(copy.photoT)).toBeTruthy();
      expect(view.getByRole("button", { name: copy.takePhoto })).toBeTruthy();
      expect(view.getByRole("button", { name: copy.chooseLib })).toBeTruthy();
      expect(view.queryByRole("button", { name: copy.removePhoto })).toBeNull();
      return;
    }
    if (state === "camera denied") {
      fireEvent.press(view.getByRole("button", { name: copy.takePhoto }));
      expect(await view.findByText(copy.permT)).toBeTruthy();
      expect(view.getByText(copy.permD)).toBeTruthy();
      expect(view.getByRole("button", { name: copy.openSettings })).toBeTruthy();
      fireEvent.press(view.getByRole("button", { name: copy.cancel }));
      expect(view.queryByText(copy.permT)).toBeNull();
      return;
    }
    if (removing) {
      fireEvent.press(view.getByRole("button", { name: copy.removePhoto }));
      expect(await view.findByText(state === "removed" ? copy.photoRemoved : copy.photoRmFail)).toBeTruthy();
      if (state === "remove failed") expect(view.getByRole("button", { name: copy.retry })).toBeTruthy();
      return;
    }
    if (state === "offline") onlineManager.setOnline(false);
    if (state === "preparing") vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.press(view.getByRole("button", { name: copy.chooseLib }));
    if (state === "too large" || state === "unsupported" || state === "offline") {
      expect(await view.findByText(state === "too large" ? copy.photoBig : state === "unsupported" ? copy.photoType : copy.offline)).toBeTruthy();
      expect(view.getByRole("button", { name: state === "offline" ? copy.retry : copy.chooseOther })).toBeTruthy();
      fireEvent.press(view.getByRole("button", { name: copy.cancel }));
      return;
    }
    await vi.waitFor(() => expect(picker.sent).toHaveLength(1));
    if (state === "uploading") {
      act(() => { picker.progress({ totalBytesSent: 512, totalBytesExpectedToSend: 2048 }); });
      expect(view.getByText(copy.uploading)).toBeTruthy();
      expect(view.getByRole("button", { name: copy.changePhoto }).props.accessibilityState.disabled).toBe(true);
    }
    await act(async () => { picker.finish(state === "failed" ? 500 : 200); });
    if (state === "failed" || state === "attached to listing") {
      expect(await view.findByText(state === "failed" ? copy.photoFail : copy.attached)).toBeTruthy();
      expect(view.getByRole("button", { name: copy.retry })).toBeTruthy();
      fireEvent.press(view.getByRole("button", { name: copy.cancel }));
    } else {
      if (state === "preparing") {
        await vi.waitFor(() => expect(view.getByText(copy.preparing)).toBeTruthy());
        await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      }
      await vi.waitFor(() => expect(view.getByText(copy.photoSaved)).toBeTruthy());
    }
  });

});
