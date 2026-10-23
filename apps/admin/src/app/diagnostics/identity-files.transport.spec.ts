import { beforeEach, afterEach, expect, it, vi } from "vitest";

import { GET, PUT } from "./orders/[id]/identity-provenance/[file]/route";
import { GET as PAIR } from "./orders/[id]/reinspection-comparison/provenance/[file]/route";

const state = vi.hoisted(() => ({ token: "current-session" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }) }));
const id = "11111111-1111-4111-8111-111111111111", file = "22222222-2222-4222-8222-222222222222", predecessor = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ id, file }) };
const base = `https://admin.example.invalid/diagnostics/orders/${id}/identity-provenance/${file}`;
const uploadHeaders = { Origin: "https://admin.example.invalid", "Content-Type": "application/octet-stream", "X-Evidence-Type": "image/jpeg" };
const verified = { id: file, state: "verified", mime: "image/webp", sizeBytes: 3, sha256: "a".repeat(64) };
function put(query = "?expectedOrderVersion=3", headers: Record<string, string> = uploadHeaders) { return new Request(base + query, { method: "PUT", headers, body: new Uint8Array([1, 2, 3]) }); }
async function protectedError(result: Response, status: number) {
 expect(result.status).toBe(status); expect(result.headers.get("Cache-Control")).toBe("no-store, private"); expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
 expect(result.headers.get("Location")).toBeNull(); expect(await result.text()).not.toMatch(/secret|storage.invalid|private-key|Bearer/);
}
beforeEach(() => { state.token = "current-session"; });
afterEach(() => vi.unstubAllGlobals());
it("forwards exact order bytes and version with current authority to the classified endpoint", async () => {
 const fetcher = vi.fn(async () => Response.json(verified, { status: 201 })); vi.stubGlobal("fetch", fetcher);
 const result = await PUT(put(), context); expect(result.status).toBe(201); expect(await result.json()).toEqual(verified);
 expect(result.headers.get("Cache-Control")).toBe("no-store, private"); expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
 expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(`/orders/${id}/identity-provenance/${file}?expectedOrderVersion=3`), expect.objectContaining({ method: "PUT", body: new Uint8Array([1, 2, 3]), headers: { Authorization: "Bearer current-session", "Content-Type": "application/octet-stream", "X-Evidence-Type": "image/jpeg" }, cache: "no-store", redirect: "manual" }));
});
it("reads only sanitized bytes through exact independently guarded order and pair paths", async () => {
 const fetcher = vi.fn(async () => new Response(new Uint8Array([4, 5, 6]), { headers: { "Content-Type": "image/webp", "Content-Length": "3", "Location": "https://storage.invalid", "X-Storage-Key": "private-key" } })); vi.stubGlobal("fetch", fetcher);
 const read = await GET(new Request(base), context); expect([...new Uint8Array(await read.arrayBuffer())]).toEqual([4, 5, 6]); expect(read.headers.get("Content-Type")).toBe("image/webp"); expect(read.headers.get("X-Storage-Key")).toBeNull(); expect(read.headers.get("Location")).toBeNull();
 state.token = "rotated-session";
 const pair = await PAIR(new Request(base + `?predecessorId=${predecessor}`), context); expect(pair.status).toBe(200);
 expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining(`/orders/${id}/reinspection-comparison/provenance/${file}?predecessorId=${predecessor}`), expect.objectContaining({ headers: { Authorization: "Bearer rotated-session" }, cache: "no-store", redirect: "manual" }));
});
it.each(["?expectedOrderVersion=3&extra=x", "?expectedOrderVersion=3&expectedOrderVersion=4", "?expectedOrderVersion=", "?expectedOrderVersion=-1", "?expectedOrderVersion=1.5", "?expectedOrderVersion=9007199254740992", ""])("rejects malformed upload query %s before reading bytes", async query => {
 const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await protectedError(await PUT(put(query), context), 400); expect(fetcher).not.toHaveBeenCalled();
});
it.each(["?predecessorId=bad", `?predecessorId=${predecessor}&extra=x`, `?predecessorId=${predecessor}&predecessorId=${predecessor}`, ""])("refuses nonexact pair query %s without a fallback read", async query => {
 const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await protectedError(await PAIR(new Request(base + query), context), 400); expect(fetcher).not.toHaveBeenCalled();
});
it("refuses extra order-read queries and malformed order/file identifiers", async () => {
 const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
 await protectedError(await GET(new Request(base + "?extra=x"), context), 400);
 for (const params of [{ id: "bad", file }, { id, file: "bad" }]) await protectedError(await GET(new Request(base), { params: Promise.resolve(params) }), 400);
 expect(fetcher).not.toHaveBeenCalled();
});
it.each(["application/pdf", "image/svg+xml", "image/jpeg;evil=x", ""])("refuses unsupported upload MIME %s", async mime => {
 const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await protectedError(await PUT(put(undefined, { ...uploadHeaders, "X-Evidence-Type": mime }), context), 400); expect(fetcher).not.toHaveBeenCalled();
});
it("refuses browser mutations without a valid origin or binary content type", async () => {
 const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
 for (const origin of ["", "https://attacker.invalid"]) await protectedError(await PUT(put(undefined, { ...uploadHeaders, Origin: origin }), context), 403);
 await protectedError(await PUT(put(undefined, { ...uploadHeaders, "Content-Type": "image/jpeg" }), context), 400); expect(fetcher).not.toHaveBeenCalled();
});
it("refuses expired or missing current sessions before consuming upload bodies", async () => {
 const fetcher = vi.fn(), pull = vi.fn(); vi.stubGlobal("fetch", fetcher);
 const request = new Request(base + "?expectedOrderVersion=3", { method: "PUT", headers: { ...uploadHeaders, "x-admin-session-expired": "1" }, body: new ReadableStream({ pull }, { highWaterMark: 0 }), duplex: "half" } as RequestInit);
 await protectedError(await PUT(request, context), 403); expect(pull).not.toHaveBeenCalled();
 state.token = ""; await protectedError(await GET(new Request(base), context), 403); expect(fetcher).not.toHaveBeenCalled();
});
it.each(["10485761", "-1", "NaN", "3.5", "9007199254740992"])("refuses invalid declared upload length %s before collecting", async length => {
 const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await protectedError(await PUT(put(undefined, { ...uploadHeaders, "Content-Length": length }), context), 400); expect(fetcher).not.toHaveBeenCalled();
});
it("cancels a chunked upload as soon as the configured byte bound is crossed", async () => {
 const fetcher = vi.fn(), cancel = vi.fn(); vi.stubGlobal("fetch", fetcher); let chunks = 0;
 const body = new ReadableStream<Uint8Array>({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(4 * 1024 * 1024)); }, cancel }, { highWaterMark: 0 });
 const request = new Request(base + "?expectedOrderVersion=3", { method: "PUT", headers: uploadHeaders, body, duplex: "half" } as RequestInit);
 await protectedError(await PUT(request, context), 400); expect(chunks).toBe(3); expect(cancel).toHaveBeenCalledOnce(); expect(fetcher).not.toHaveBeenCalled();
});
it.each([GET, PAIR])("buffers no partial protected image when chunked upstream bytes exceed the limit", async route => {
 let chunks = 0; const cancel = vi.fn();
 vi.stubGlobal("fetch", async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(4 * 1024 * 1024)); }, cancel }, { highWaterMark: 0 }), { headers: { "Content-Type": "image/webp" } }));
 await protectedError(await route(new Request(route === PAIR ? base + `?predecessorId=${predecessor}` : base), context), 400); expect(chunks).toBe(3); expect(cancel).toHaveBeenCalledOnce();
});
it.each(["text/html", "image/svg+xml", "image/jpeg", "application/octet-stream"])("rejects unsanitized upstream type %s without exposing bytes", async mime => {
 vi.stubGlobal("fetch", async () => new Response("secret private-key", { headers: { "Content-Type": mime } })); await protectedError(await GET(new Request(base), context), 502);
});
it.each([302, 400, 401, 403, 409, 500])("sanitizes upstream status %s for reads and uploads", async status => {
 vi.stubGlobal("fetch", async () => Response.json({ code: "secret", storageKey: "private-key" }, { status, headers: { Location: "https://storage.invalid" } }));
 const expected = [400, 401, 403, 409].includes(status) ? status : 502;
 await protectedError(await GET(new Request(base), context), expected); await protectedError(await PUT(put(), context), expected);
});
it("returns protected errors for network, malformed JSON, or broadened upload responses", async () => {
 vi.stubGlobal("fetch", async () => { throw new Error("secret https://storage.invalid/private-key"); }); await protectedError(await GET(new Request(base), context), 502);
 vi.stubGlobal("fetch", async () => Response.json({ ...verified, storageUrl: "https://storage.invalid" })); await protectedError(await PUT(put(), context), 502);
 vi.stubGlobal("fetch", async () => new Response("secret", { headers: { "Content-Type": "application/json" } })); await protectedError(await PUT(put(), context), 502);
});
it.each(["image/jpeg", "image/png", "image/webp"])("supports classified upload type %s without changing the supplied MIME", async mime => {
 const fetcher = vi.fn(async () => Response.json(verified)); vi.stubGlobal("fetch", fetcher);
 const response = await PUT(put(undefined, { ...uploadHeaders, "X-Evidence-Type": mime }), context); expect(response.status).toBe(200);
 expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ "X-Evidence-Type": mime }) }));
});
it("accepts the exact 10 MiB bound and refuses empty or truncated declared uploads", async () => {
 vi.stubGlobal("fetch", async () => Response.json(verified));
 const bytes = new Uint8Array(10 * 1024 * 1024);
 const request = new Request(base + "?expectedOrderVersion=3", { method: "PUT", headers: { ...uploadHeaders, "Content-Length": "10485760" }, body: bytes });
 expect((await PUT(request, context)).status).toBe(200);
 for (const length of ["0", "4"]) await protectedError(await PUT(put(undefined, { ...uploadHeaders, "Content-Length": length }), context), 400);
});
it("refuses oversized declared upstream images before reading and protects stream failures", async () => {
 let chunks = 0; const cancel = vi.fn();
 vi.stubGlobal("fetch", async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) { chunks++; controller.enqueue(new Uint8Array([1])); }, cancel }, { highWaterMark: 0 }), { headers: { "Content-Type": "image/webp", "Content-Length": "10485761" } }));
 await protectedError(await GET(new Request(base), context), 400); expect(chunks).toBe(0); expect(cancel).toHaveBeenCalledOnce();
 vi.stubGlobal("fetch", async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error("secret storage.invalid/private-key")); } }), { headers: { "Content-Type": "image/webp" } }));
 await protectedError(await GET(new Request(base), context), 502);
});
