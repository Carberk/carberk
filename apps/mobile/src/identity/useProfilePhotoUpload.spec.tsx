import { Platform } from "react-native";
import { act } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../test/msw";
import { PHOTO_ME, setupPhotoHook, signInPhotoUser } from "../../test/profile-photo-api";
import { choosePhoto, photoDevice, resetPhotoDevice } from "../../test/profile-photo-device";

import { profilePhotoUploadStore, resetProfilePhotoUpload, useProfilePhotoUpload } from "./useProfilePhotoUpload";

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

beforeEach(async () => {
  await resetProfilePhotoUpload();
  resetPhotoDevice();

  profilePhotoUploadStore.setState({ state: { status: "idle" } });
  await signInPhotoUser();
});

afterEach(resetProfilePhotoUpload);

describe("useProfilePhotoUpload", () => {
  it.each(["image/heic", "image/heif", "image/avif", "image/gif", "image/bmp"])("re-encodes a readable Android %s library photo instead of refusing its source type", async (mimeType) => {
    const previousPlatform = Platform.OS;
    Platform.OS = "android";
    server.use(http.post("*/uploads/presign", () => HttpResponse.json({ uploadUrl: "https://storage.example/photo", key: "pending/new/original.webp", expiresIn: 600, maxSizeBytes: 5242880, headers: { "if-match": '"etag"' } })),
      http.put("*/me/photo", () => HttpResponse.json({ ...PHOTO_ME, avatarKey: "pending/new/original.webp" })));
    choosePhoto({ mimeType });
    try {
      const { result } = await setupPhotoHook(useProfilePhotoUpload);
      let picking!: Promise<void>;
      await act(() => { picking = result.current.pick("library"); });
      await vi.waitFor(() => expect(photoDevice.sent).toHaveLength(1));
      expect(photoDevice.saves).toContainEqual({ format: "webp", compress: 0.8 });
      await act(async () => { photoDevice.finish(); await picking; });
      expect(result.current.state.status).toBe("idle");
    } finally { Platform.OS = previousPlatform; }
  });

  it.each([
    ["android", "library", false], ["android", "camera", false],
    ["ios", "library", true], ["ios", "camera", true],
  ] as const)("uses the approved crop policy for %s %s picks", async (platform, source, allowsEditing) => {
    const previousPlatform = Platform.OS;
    Platform.OS = platform;
    photoDevice.cameraGranted = true;
    try {
      const { result } = await setupPhotoHook(useProfilePhotoUpload);
      await act(() => result.current.pick(source));
      expect(source === "library" ? photoDevice.library : photoDevice.camera).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing }));
      expect(result.current.state.status).toBe("idle");
    } finally { Platform.OS = previousPlatform; }
  });

  it.each([
    ["landscape", 1920, 1080, 1920, 1080, 199, 0],
    ["portrait", 1080, 1920, 1080, 1920, 0, 199],
    ["square", 1024, 1024, 1024, 1024, 0, 0],
    ["EXIF-rotated portrait", 1920, 1080, 1080, 1920, 0, 199],
  ])("uploads a full 512-square centre crop for a %s pick", async (_shape, pickedWidth, pickedHeight, decodedWidth, decodedHeight, originX, originY) => {
    server.use(http.post("*/uploads/presign", () => HttpResponse.json({ uploadUrl: "https://storage.example/photo", key: "pending/new/original.webp", expiresIn: 600, maxSizeBytes: 5242880, headers: { "if-match": '"etag"' } })),
      http.put("*/me/photo", () => HttpResponse.json({ ...PHOTO_ME, avatarKey: "pending/new/original.webp" })));
    choosePhoto({ width: Number(pickedWidth), height: Number(pickedHeight) });
    photoDevice.dimensions = { width: Number(decodedWidth), height: Number(decodedHeight) };
    const { result } = await setupPhotoHook(useProfilePhotoUpload);
    let picking!: Promise<void>;
    await act(() => { picking = result.current.pick("library"); });
    await vi.waitFor(() => expect(photoDevice.sent).toHaveLength(1));
    expect(photoDevice.savedImages.at(-1)).toMatchObject({ width: 512, height: 512 });
    expect(photoDevice.crops).toContainEqual({ originX, originY, width: 512, height: 512 });
    await act(async () => { photoDevice.finish(); await picking; });
    expect(result.current.state.status).toBe("idle");
  });

  it("rejects an unreadable Android library image without entering the native crop contract", async () => {
    const previousPlatform = Platform.OS;
    Platform.OS = "android";
    choosePhoto({ width: -1, height: -1 });
    photoDevice.library.mockImplementationOnce(async (options) => {
      if ((options as { allowsEditing?: boolean }).allowsEditing) throw new Error("CropImageContract returned no URI");
      return photoDevice.result;
    });
    try {
      const { result } = await setupPhotoHook(useProfilePhotoUpload);
      await act(() => result.current.pick("library"));
      expect(result.current.state.status).toBe("unsupported");
      expect(photoDevice.sent).toHaveLength(0);
    } finally { Platform.OS = previousPlatform; }
  });

  it("offers another photo when native image reading rejects before returning an asset", async () => {
    photoDevice.library.mockRejectedValueOnce(Object.assign(new Error("Cannot read selected file"), { code: "ERR_FAILED_TO_READ_FILE" }));
    const { result } = await setupPhotoHook(useProfilePhotoUpload);
    await act(() => result.current.pick("library"));
    expect(result.current.state.status).toBe("unsupported");
  });

  it("releases a rejected native transfer before retrying the retained photo", async () => {
    server.use(http.post("*/uploads/presign", () => HttpResponse.json({ uploadUrl: "https://storage.example/photo", key: "pending/new/original.webp", expiresIn: 600, maxSizeBytes: 5242880, headers: { "if-match": '"etag"' } })),
      http.put("*/me/photo", () => HttpResponse.json({ ...PHOTO_ME, avatarKey: "pending/new/original.webp" })));
    choosePhoto();
    const { result } = await setupPhotoHook(useProfilePhotoUpload);
    let picking!: Promise<void>;
    await act(() => { picking = result.current.pick("library"); });
    await vi.waitFor(() => expect(photoDevice.sent).toHaveLength(1));
    await act(async () => { photoDevice.fail(new Error("Connection reset")); await picking; });
    expect(result.current.state.status).toBe("failed");
    expect(photoDevice.cancelUpload).toHaveBeenCalledOnce();
    let retrying!: Promise<void>;
    await act(() => { retrying = result.current.retry(); });
    await vi.waitFor(() => expect(photoDevice.sent).toHaveLength(2));
    await act(async () => { photoDevice.finish(); await retrying; });
    expect(result.current.state.status).toBe("idle");
  });

  it("keeps rapid Retry taps in one transfer instead of sharing a selection across competing jobs", async () => {
    server.use(http.post("*/uploads/presign", () => HttpResponse.json({ uploadUrl: "https://storage.example/photo", key: "pending/new/original.webp", expiresIn: 600, maxSizeBytes: 5242880, headers: { "if-match": '"etag"' } })),
      http.put("*/me/photo", () => HttpResponse.json({ ...PHOTO_ME, avatarKey: "pending/new/original.webp" })));
    choosePhoto();
    const { result } = await setupPhotoHook(useProfilePhotoUpload);
    let picking!: Promise<void>;
    await act(() => { picking = result.current.pick("library"); });
    await vi.waitFor(() => expect(photoDevice.sent).toHaveLength(1));
    await act(async () => { photoDevice.finish(500); await picking; });
    let retries!: Promise<unknown>;
    await act(() => { retries = Promise.all([result.current.retry(), result.current.retry()]); });
    await vi.waitFor(() => expect(photoDevice.sent.length).toBeGreaterThanOrEqual(2));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
    expect(photoDevice.sent).toHaveLength(2);
    await act(async () => { photoDevice.finish(); await retries; });
    expect(result.current.state.status).toBe("idle");
  });

  it.each(["picker", "upload", "removal"])("forgets the retained %s operation when the fixture resets", async (operation) => {
    let presigns = 0;
    let removals = 0;
    server.use(
      http.post("*/uploads/presign", () => {
        presigns += 1;
        return HttpResponse.json({ uploadUrl: "https://storage.example/photo", key: "pending/new/original.webp", expiresIn: 600, maxSizeBytes: 5242880, headers: { "if-match": '"etag"' } });
      }),
      http.delete("*/me/photo", () => { removals += 1; return HttpResponse.json({ code: "INTERNAL" }, { status: 500 }); }),
    );
    const { result } = await setupPhotoHook(useProfilePhotoUpload);
    if (operation === "picker") {
      photoDevice.permission.mockRejectedValueOnce(new Error("Camera unavailable"));
      await act(() => result.current.pick("camera"));
    } else if (operation === "upload") {
      choosePhoto();
      await act(() => { void result.current.pick("library"); });
      await vi.waitFor(() => expect(photoDevice.sent).toHaveLength(1));
      await act(async () => { photoDevice.finish(500); });
    } else await act(() => result.current.remove());
    expect(result.current.state.status).toBe("failed");
    const previousCalls = { presigns, removals, picks: photoDevice.library.mock.calls.length, permissions: photoDevice.permission.mock.calls.length };
    await act(resetProfilePhotoUpload);
    const next = await setupPhotoHook(useProfilePhotoUpload);
    await act(() => next.result.current.retry());
    expect(next.result.current.state.status).toBe("idle");
    expect({ presigns, removals, picks: photoDevice.library.mock.calls.length, permissions: photoDevice.permission.mock.calls.length }).toEqual(previousCalls);
    if (operation === "upload") expect(photoDevice.deletes).toContainEqual(expect.stringMatching(/^file:\/\/\/cache\/profile-photo-\d+\.webp$/));
  });

  it("requests camera access and opens a square crop when permission is granted", async () => {
    photoDevice.cameraGranted = true;
    const { result } = await setupPhotoHook(useProfilePhotoUpload);
    await act(() => result.current.pick("camera"));
    expect(photoDevice.permission).toHaveBeenCalledOnce();
    expect(photoDevice.camera).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1] }));
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("contains a native permission request failure instead of rejecting a press handler", async () => {
    photoDevice.permission.mockRejectedValueOnce(new Error("Camera unavailable"));
    const { result } = await setupPhotoHook(useProfilePhotoUpload);
    await act(async () => { await result.current.pick("camera"); });
    expect(result.current.state.status).toBe("failed");
  });
});
