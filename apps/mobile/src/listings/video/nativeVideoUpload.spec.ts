import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "expo-file-system/legacy";

import { nativeVideoUploadTransport } from "./nativeVideoUpload";

const native = vi.hoisted(() => ({
  files: new Map<string, string>(),
  requests: [] as { uri: string; body: string; options: unknown }[],
  upload: vi.fn(async () => ({ status: 200 })),
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
  createUploadTask: (_url: string, uri: string, options: unknown) => ({
    uploadAsync: async () => { native.requests.push({ uri, body: native.files.get(uri) ?? "", options }); return native.upload(); },
    cancelAsync: async () => { native.cancelled = true; },
  }),
}));
afterEach(() => { vi.useRealTimers(); native.files.clear(); native.requests.length = 0; native.cancelled = false; });

describe("native byte-range upload adapter", () => {
  it("uploads only the requested bytes through a native part file and removes that file", async () => {
    native.files.set("file:///prepared.mp4", "0123456789abcdef");
    await nativeVideoUploadTransport.put("https://bucket/part3", { uri: "file:///prepared.mp4", offset: 10, sizeBytes: 5 }, new AbortController().signal);
    expect(native.requests).toEqual([{ uri: expect.stringMatching(/^file:\/\/\/cache\/listing-video-part-/), body: "abcde", options: {
      httpMethod: "PUT", uploadType: 0, sessionType: 1, headers: { "Content-Type": "video/mp4" },
    } }]);
    expect([...native.files]).toEqual([["file:///prepared.mp4", "0123456789abcdef"]]);
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
