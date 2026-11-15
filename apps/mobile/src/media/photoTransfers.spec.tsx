import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as FileSystem from "expo-file-system/legacy";

import { act } from "../../test/render";
import { server } from "../../test/msw";
import { setupPhotoHook, signInPhotoUser } from "../../test/profile-photo-api";
import { captureRouteSnapshot, provisionGatewayKey, selectTesterRoute } from "../api/routes";
import { clearAuthSession } from "../auth/session";
import { useChatImageTransfer } from "../conversations/upload/useChatImageTransfer";
import { useUploadQueue } from "../listings/uploadStaging/useUploadQueue";

vi.mock("expo-secure-store", async () => {
  const { photoApiStorage } = await import("../../test/profile-photo-storage");
  return { getItemAsync: async (key: string) => photoApiStorage.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { photoApiStorage.set(key, value); },
    deleteItemAsync: async (key: string) => { photoApiStorage.delete(key); } };
});
vi.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///doc/", FileSystemUploadType: { BINARY_CONTENT: 0 },
  getInfoAsync: async () => ({ exists: true, size: 2048 }), readDirectoryAsync: async () => ["one.webp"], deleteAsync: async () => {},
  uploadAsync: vi.fn(async () => ({ status: 200, headers: {}, body: "" })),
}));
vi.mock("expo-image-manipulator", async () => (await import("../../test/profile-photo-device")).imageManipulatorFake);
vi.mock("@react-native-community/netinfo", () => ({ default: { addEventListener: () => () => {}, fetch: async () => ({ isConnected: true }) } }));
const origin = "https://minio-staging-5795.up.railway.app";
const key = "pending/00000000-0000-4000-8000-000000000001/original.webp";
const grant = { key, uploadUrl: `${origin}/listing-photos/${key}?x=1+2&x=%2F`, expiresIn: 600, maxSizeBytes: 5242880, headers: { "if-match": '"empty"', "content-type": "image/webp" } };
const puts = vi.mocked(FileSystem.uploadAsync);
beforeEach(async () => {
  vi.stubGlobal("__DEV__", true);
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://api-staging-2861.up.railway.app/api/v1");
  vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", "true"); vi.stubEnv("EXPO_PUBLIC_ENV", "staging");
  await signInPhotoUser(); await provisionGatewayKey("synthetic-photo-gateway-access-key"); selectTesterRoute("tm"); puts.mockClear();
});
afterEach(() => { selectTesterRoute("global"); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("keeps the Listing photo key uncompleted until retry uploads its renewed capability on the newly selected entry", async () => {
  let issues = 0;
  const renewals: unknown[] = [];
  server.use(http.post("*/uploads/presign", () => { issues++; return HttpResponse.json(grant); }),
    http.post("*/uploads/renew", async ({ request }) => { renewals.push(await request.json()); return HttpResponse.json(grant); }));
  puts.mockResolvedValueOnce({ status: 403, headers: {}, body: "" });
  const { result } = await setupPhotoHook(() => useUploadQueue("owned-photo", { photos: [] }));
  await vi.waitFor(() => expect(result.current.photos[0]?.state).toBe("failed"));
  expect(result.current.photos[0]?.key).toBeUndefined();
  selectTesterRoute("global"); await act(() => result.current.retryPhoto("one"));
  await vi.waitFor(() => expect(result.current.photos[0]).toMatchObject({ state: "uploaded", key }));
  expect(issues).toBe(1); expect(renewals).toEqual([{ key, contentType: "image/webp", sizeBytes: 2048 }]);
  expect(puts.mock.calls.map(([url]) => url)).toEqual([`https://tm-staging.bagtyyar.dev/photos/listing-photos/${key}?x=1+2&x=%2F`, grant.uploadUrl]);
  expect(puts.mock.calls[1]?.[2]?.headers).toEqual(grant.headers);
});

it.each(["upload_required", "present", "committed refusal"])("retries one chat issuance as %s without replacing the key or granting overwrite authority", async (state) => {
  const key = "chat-attachments/conversation-one/00000000-0000-4000-8000-000000000001/original.webp";
  const chatGrant = { ...grant, key, uploadUrl: `${origin}/chat-attachments/${key}?x=1+2&x=%2F` };
  let issues = 0;
  const renewals: unknown[] = [];
  server.use(http.post("*/attachments/presign", () => { issues++; return HttpResponse.json(chatGrant); }),
    http.post("*/attachments/renew", async ({ request }) => {
      renewals.push(await request.json());
      if (state === "committed refusal") return HttpResponse.json({ code: "UPLOAD_NOT_AVAILABLE" }, { status: 400 });
      return HttpResponse.json(state === "present" ? { state, key } : { ...chatGrant, state, headers: { "if-none-match": "*", "content-type": "image/webp" } });
    }));
  const attachment = { uri: "file:///chat.webp", width: 100, height: 100, fileSize: 2048 };
  const { result } = await setupPhotoHook(() => useChatImageTransfer("conversation-one"));
  puts.mockResolvedValueOnce({ status: 403, headers: {}, body: "" });
  await act(async () => { await expect(result.current.prepare("same-message", attachment)).rejects.toThrow(); });
  selectTesterRoute("global");
  await act(async () => { expect(await result.current.prepare("same-message", attachment)).toEqual({ key, width: 100, height: 100 }); });
  expect(issues).toBe(1); expect(renewals).toEqual([{ key, contentType: "image/webp", sizeBytes: 2048 }]);
  expect(puts).toHaveBeenCalledTimes(state === "upload_required" ? 2 : 1);
  if (state === "upload_required") expect(puts.mock.calls[1]?.[2]?.headers).toEqual({ "if-none-match": "*", "content-type": "image/webp" });
  await act(() => clearAuthSession());
  await act(async () => { await expect(result.current.prepare("same-message", attachment)).rejects.toThrow(); });
  expect(captureRouteSnapshot().entry).toBe("global");
});

it("refuses a Listing transfer when the API omits the conditional fence", async () => {
  server.use(http.post("*/uploads/presign", () => HttpResponse.json({ ...grant, headers: {} })));
  const { result } = await setupPhotoHook(() => useUploadQueue("missing-fence", { photos: [] }));
  await vi.waitFor(() => expect(result.current.photos[0]?.state).toBe("failed"));
  expect(puts).not.toHaveBeenCalled();
});
