import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { http, HttpResponse } from "msw";

import { server } from "../../../test/msw";
import { clearAuthSession, storeAuthSession } from "../../auth/session";
import { provisionGatewayKey, selectTesterRoute } from "../../api/routes";

import { nativeVideoUploadTransport } from "./nativeVideoUpload";
import { VideoUploadController } from "./videoUpload";
import { InMemoryVideoUploadPersistence } from "./application/testing/InMemoryVideoUploadPersistence";

const native = vi.hoisted(() => ({
  files: new Map<string, string>(),
  requests: [] as { url: string; uri: string; body: string; options: unknown }[],
  upload: vi.fn(async (_url: string, _body: string, _options: { headers: Record<string, string> }) => ({ status: 200 })),
  cancelled: false,
}));
vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  FileSystemSessionType: { FOREGROUND: 1 },
  readAsStringAsync: async (uri: string, options: { position: number; length: number }) =>
    Buffer.from(native.files.get(uri) ?? "").subarray(options.position, options.position + options.length).toString("base64"),
  writeAsStringAsync: async (uri: string, body: string) => { native.files.set(uri, Buffer.from(body, "base64").toString()); },
  deleteAsync: async (uri: string) => { native.files.delete(uri); },
  createUploadTask: (url: string, uri: string, options: { headers: Record<string, string> }) => ({
    uploadAsync: async () => { const body = native.files.get(uri) ?? ""; native.requests.push({ url, uri, body, options }); return native.upload(url, body, options); },
    cancelAsync: async () => { native.cancelled = true; },
  }),
}));
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); native.files.clear(); native.requests.length = 0; native.cancelled = false; });

describe("native byte-range upload adapter", () => {
  it("uploads only the requested bytes through a native part file and removes that file", async () => {
    native.files.set("file:///prepared.mp4", "0123456789abcdef");
    await nativeVideoUploadTransport.put("https://bucket/part3", { uri: "file:///prepared.mp4", offset: 10, sizeBytes: 5 }, new AbortController().signal);
    expect(native.requests).toEqual([{ url: "https://bucket/part3", uri: expect.stringMatching(/^file:\/\/\/cache\/listing-video-part-/), body: "abcde", options: {
      httpMethod: "PUT", uploadType: 0, sessionType: 1, headers: { "Content-Type": "video/mp4" },
    } }]);
    expect([...native.files]).toEqual([["file:///prepared.mp4", "0123456789abcdef"]]);
  });

  it("pins each signed part to its entry before native file work and switches only later parts", async () => {
    vi.stubGlobal("__DEV__", true);
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://api-staging-2861.up.railway.app/api/v1");
    vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", "true");
    vi.stubEnv("EXPO_PUBLIC_ENV", "staging");
    await provisionGatewayKey("synthetic-test-key-never-a-real-secret");
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue("synthetic-test-key-never-a-real-secret");
    selectTesterRoute("tm");
    native.files.set("file:///prepared.mp4", "0123456789");
    const suffix = "/synthetic-bucket/video-sources/10000000-0000-4000-8000-000000000001/source.mp4?partNumber=1&uploadId=a%2Fb%2Bc&X-Amz-Signature=synthetic&x=1+2&x=%2f";
    const pending = nativeVideoUploadTransport.put(`https://t3.storageapi.dev${suffix}`, { uri: "file:///prepared.mp4", offset: 0, sizeBytes: 5 }, new AbortController().signal);
    selectTesterRoute("global");
    await pending;
    await nativeVideoUploadTransport.put(`https://t3.storageapi.dev${suffix}`, { uri: "file:///prepared.mp4", offset: 5, sizeBytes: 5 }, new AbortController().signal);
    expect(native.requests.map(request => ({ url: request.url, body: request.body, options: request.options }))).toEqual([
      { url: `https://tm-staging.bagtyyar.dev/video-uploads${suffix}`, body: "01234", options: {
        httpMethod: "PUT", uploadType: 0, sessionType: 1, headers: { "Content-Type": "video/mp4", "X-Carberk-Gateway-Key": "synthetic-test-key-never-a-real-secret" },
      } },
      { url: `https://t3.storageapi.dev${suffix}`, body: "56789", options: {
        httpMethod: "PUT", uploadType: 0, sessionType: 1, headers: { "Content-Type": "video/mp4" },
      } },
    ]);
  });

  it.each([0, 5_242_881, -1, 1.5])("refuses an unbounded or invalid part of %s bytes before allocating a file", async (sizeBytes) => {
    native.files.set("file:///prepared.mp4", "0123456789");
    await expect(nativeVideoUploadTransport.put("https://bucket/1", { uri: "file:///prepared.mp4", offset: 0, sizeBytes }, new AbortController().signal)).rejects.toThrow("Invalid video part");
    expect(native.requests).toEqual([]);
    expect([...native.files.keys()]).toEqual(["file:///prepared.mp4"]);
  });

  it.each([
    "https://other.test/bucket/video-sources/10000000-0000-4000-8000-000000000001/source.mp4?uploadId=secret",
    "https://t3.storageapi.dev.other.test/bucket/video-sources/10000000-0000-4000-8000-000000000001/source.mp4?uploadId=secret",
    "https://t3.storageapi.dev@other.test/bucket/video-sources/10000000-0000-4000-8000-000000000001/source.mp4?uploadId=secret",
    "https://t3.storageapi.dev/bucket/private-history/source.mp4?uploadId=secret",
    "https://t3.storageapi.dev/bucket/../video-sources/10000000-0000-4000-8000-000000000001/source.mp4?uploadId=secret",
    "http://127.0.0.1:9000/listing-videos/video-sources/10000000-0000-4000-8000-000000000001/source.mp4?uploadId=secret",
  ])("refuses an unapproved TM upload without allocating or sending its part: %s", async url => {
    vi.stubGlobal("__DEV__", true);
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://api-staging-2861.up.railway.app/api/v1");
    vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", "true");
    vi.stubEnv("EXPO_PUBLIC_ENV", "staging");
    selectTesterRoute("tm");
    await expect(nativeVideoUploadTransport.put(url, { uri: "file:///prepared.mp4", offset: 0, sizeBytes: 5 }, new AbortController().signal)).rejects.toThrow("Unapproved video upload destination");
    expect(native.requests).toEqual([]);
    expect(native.files.size).toBe(0);
    selectTesterRoute("global");
  });

  it("reconciles lost part and completion responses through the newly selected entry using the same session", async () => {
    vi.stubGlobal("__DEV__", true);
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://api-staging-2861.up.railway.app/api/v1");
    vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", "true");
    vi.stubEnv("EXPO_PUBLIC_ENV", "staging");
    const secure = new Map<string, string>();
    vi.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
    vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
    vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
    const id = "10000000-0000-4000-8000-000000000001";
    await storeAuthSession({ user: { id, phone: null, email: "synthetic@example.test", displayName: null, role: "seller" }, accessToken: "synthetic-access", refreshToken: "synthetic-refresh" });
    await provisionGatewayKey("synthetic-test-key-never-a-real-secret");
    selectTesterRoute("global");
    const globalApi = "https://api-staging-2861.up.railway.app/api/v1/listings/video-uploads";
    const tmApi = "https://tm-staging.bagtyyar.dev/api/v1/listings/video-uploads";
    const partSize = 5_242_880;
    native.files.set("file:///prepared.mp4", "a".repeat(partSize) + "final");
    const confirmed: { partNumber: number; sizeBytes: number }[] = [];
    const sends: string[] = [];
    let processing = false;
    const status = () => ({ sessionId: id, generationId: id, target: { type: "draft", id }, state: processing ? "PROCESSING" : "UPLOADING",
      partSizeBytes: partSize, expiresAt: "2030-01-01T00:00:00.000Z", confirmedParts: confirmed,
      parts: processing ? [] : [1, 2].filter(number => !confirmed.some(part => part.partNumber === number)).map(partNumber => ({ partNumber, sizeBytes: partNumber === 1 ? partSize : 5,
        uploadUrl: `https://t3.storageapi.dev/synthetic-bucket/video-sources/${id}/source.mp4?partNumber=${partNumber}&uploadId=same-session&X-Amz-Signature=synthetic`, expiresAt: "2030-01-01T00:00:00.000Z" })),
    });
    server.use(
      http.post(globalApi, () => { sends.push("open:global"); return HttpResponse.json(status()); }),
      ...[globalApi, tmApi].map(base => http.get(`${base}/${id}`, ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer synthetic-access");
        sends.push(`status:${base === tmApi ? "tm" : "global"}`); return HttpResponse.json(status());
      })),
      http.put("https://t3.storageapi.dev/*", async ({ request }) => {
        expect(request.headers.get("authorization")).toBeNull();
        expect(request.headers.get("x-carberk-gateway-key")).toBeNull();
        expect((await request.text()).length).toBe(partSize);
        sends.push("part1:global"); confirmed.push({ partNumber: 1, sizeBytes: partSize }); selectTesterRoute("tm"); return HttpResponse.error();
      }),
      http.put("https://tm-staging.bagtyyar.dev/video-uploads/*", async ({ request }) => {
        expect(request.headers.get("authorization")).toBeNull();
        expect(request.headers.get("x-carberk-gateway-key")).toBe("synthetic-test-key-never-a-real-secret");
        expect(await request.text()).toBe("final");
        sends.push("part2:tm"); confirmed.push({ partNumber: 2, sizeBytes: 5 }); return new HttpResponse(null, { status: 200 });
      }),
      http.post(`${tmApi}/${id}/complete`, () => { sends.push("complete:tm"); processing = true; selectTesterRoute("global"); return HttpResponse.error(); }),
    );
    native.upload.mockImplementation(async (url, body, options) => ({ status: (await fetch(url, { method: "PUT", headers: options.headers, body })).status }));
    const controller = new VideoUploadController({ target: { type: "draft", id }, storageKey: "synthetic-upload", localUri: "file:///prepared.mp4", sizeBytes: partSize + 5, coverOffsetMs: 0,
      persistence: new InMemoryVideoUploadPersistence(), fileSystem: { exists: async uri => native.files.has(uri), remove: async uri => { native.files.delete(uri); } }, telemetry: () => {},
    });
    await controller.start();
    expect(controller.state).toMatchObject({ phase: "processing", sessionId: id, generationId: id, confirmedBytes: 5_242_885 });
    expect(sends).toEqual(["open:global", "status:global", "part1:global", "status:tm", "status:tm", "part2:tm", "status:tm", "status:tm", "complete:tm", "status:global"]);
    expect(native.files.size).toBe(0);
    controller.dispose();
    native.upload.mockImplementation(async () => ({ status: 200 }));
    await clearAuthSession();
  });

  it.each(["abort", "timeout"])("cancels the native network task and cleans its part after %s", async (reason) => {
    vi.useFakeTimers();
    native.files.set("file:///prepared.mp4", "0123456789");
    native.upload.mockImplementationOnce(() => new Promise(() => {}));
    const abort = new AbortController();
    const sent = nativeVideoUploadTransport.put("https://bucket/1", { uri: "file:///prepared.mp4", offset: 0, sizeBytes: 5 }, abort.signal);
    const result = expect(sent).rejects.toThrow(reason === "timeout" ? "Upload timed out" : "Upload interrupted");
    await vi.waitFor(() => expect(native.requests).toHaveLength(1));
    if (reason === "abort") abort.abort();
    else await vi.advanceTimersByTimeAsync(60_000);
    await result;
    expect(native.cancelled).toBe(true);
    expect([...native.files.keys()]).toEqual(["file:///prepared.mp4"]);
  });

  it("cleans its private file when the provider refuses the part", async () => {
    native.files.set("file:///prepared.mp4", "0123456789");
    native.upload.mockResolvedValueOnce({ status: 500 });
    await expect(nativeVideoUploadTransport.put("https://bucket/1", { uri: "file:///prepared.mp4", offset: 0, sizeBytes: 5 }, new AbortController().signal)).rejects.toMatchObject({ status: 500 });
    expect([...native.files.keys()]).toEqual(["file:///prepared.mp4"]);
  });

  it("cleans a partial temporary write if native storage fills up", async () => {
    native.files.set("file:///prepared.mp4", "0123456789");
    const write = vi.spyOn(fs, "writeAsStringAsync").mockRejectedValueOnce(new Error("ENOSPC"));
    await expect(nativeVideoUploadTransport.put("https://bucket/1", { uri: "file:///prepared.mp4", offset: 0, sizeBytes: 5 }, new AbortController().signal)).rejects.toThrow("ENOSPC");
    expect([...native.files.keys()]).toEqual(["file:///prepared.mp4"]);
    write.mockRestore();
  });
});
