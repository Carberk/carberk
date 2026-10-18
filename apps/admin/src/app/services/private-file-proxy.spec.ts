import { afterEach, expect, it, vi } from "vitest";

import { proxyPrivateFile } from "./private-file-proxy";

vi.mock("@/lib/cookies", () => ({ getAccessToken: async () => "current-session" }));
vi.mock("@/lib/api-config", () => ({ getApiBaseUrl: () => "https://api.example.invalid" }));
vi.mock("@/lib/validators", () => ({ validateOrigin: () => true }));
const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id, file: id }) };
afterEach(() => { vi.unstubAllGlobals(); });
it("cancels oversized unknown-length uploads before buffering the whole stream or contacting the API", async () => {
 const cancel = vi.fn(), fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
 let chunks = 0;
 const body = new ReadableStream<Uint8Array>({ pull(controller) { chunks++; if (chunks <= 8) controller.enqueue(new Uint8Array(4*1024*1024)); else controller.close(); }, cancel }, { highWaterMark: 0 });
 const request = new Request("https://admin.example.invalid/upload", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body, duplex: "half" } as RequestInit);
 expect((await proxyPrivateFile(request, context, true, "history/artifacts")).status).toBe(400);
 expect(cancel).toHaveBeenCalledOnce(); expect(chunks).toBeLessThanOrEqual(6); expect(fetch).not.toHaveBeenCalled();
});
it("forwards bounded exact bytes through current authorization with no-store", async () => {
 const fetch = vi.fn(async () => new Response(null, { status: 201 })); vi.stubGlobal("fetch", fetch);
 const request = new Request("https://admin.example.invalid/upload", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array([1,2,3]) });
 const response = await proxyPrivateFile(request, context, true, "attachments"); expect(response.status).toBe(201); expect(response.headers.get("Cache-Control")).toContain("no-store");
 expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/attachments/"), expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer current-session" }), body: new Uint8Array([1,2,3]), cache: "no-store" }));
});
