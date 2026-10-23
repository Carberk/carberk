import { beforeEach, afterEach, expect, it, vi } from "vitest";
import * as actions from "./actions";

const state = vi.hoisted(() => ({ token: "current-session", headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => state.headers, cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }) }));
vi.mock("next/navigation", async original => ({ ...await original<typeof import("next/navigation")>(), redirect: (url: string) => { const error = new Error(url); Object.assign(error, { digest: `NEXT_REDIRECT;replace;${url};307;` }); throw error; } }));
const order = "11111111-1111-4111-8111-111111111111", predecessor = "22222222-2222-4222-8222-222222222222";
const rights = { category: "vehicle_observation", purpose: "Compare physical identity", basis: "Authorized synthetic fixture", provenance: "Synthetic capture", identifiability: "pseudonymous", use: ["service"], schedule: { kind: "until", until: "2026-12-01T00:00:00.000Z", reason: "Explicit fixture authorization" }, supplierRestrictions: "", hold: null };
const stage = { id: predecessor, expectedOrderVersion: 3, contentType: "image/jpeg", sizeBytes: 3, rights };
const denied = { ok: false, error: "denied", code: "DIAGNOSTIC_NO_ACCESS" };
beforeEach(() => { state.token = "current-session"; state.headers = new Headers({ origin: "http://localhost:3001", host: "localhost:3001" }); });
afterEach(() => vi.unstubAllGlobals());
it("reads identity history using current cookie authority every time without caching", async () => {
 const fetcher = vi.fn(async () => Response.json([])); vi.stubGlobal("fetch", fetcher);
 expect(await actions.diagnosticIdentityRecords(order)).toEqual({ ok: true, data: [] });
 state.token = "rotated-session";
 expect(await actions.diagnosticIdentityRecords(order)).toEqual({ ok: true, data: [] });
 expect(fetcher.mock.calls.map(call => (call as unknown as [string, RequestInit])[1])).toMatchObject([
  { cache: "no-store", redirect: "manual", headers: { Authorization: "Bearer current-session" } },
  { cache: "no-store", redirect: "manual", headers: { Authorization: "Bearer rotated-session" } },
 ]);
});
it("rejects an expired session before validation, cookies or network work", async () => {
 state.headers.set("x-admin-session-expired", "1"); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
 await expect(actions.diagnosticIdentityRecords("bad")).rejects.toThrow("/login?reason=session-expired"); expect(fetcher).not.toHaveBeenCalled();
});
it("refuses absent authority locally and current upstream authority loss without protected details", async () => {
 const fetcher = vi.fn(async () => Response.json({ code: "private/storage/key", accessToken: "secret", message: "https://storage.invalid/private" }, { status: 403 })); vi.stubGlobal("fetch", fetcher);
 state.token = ""; expect(await actions.diagnosticIdentityRecords(order)).toEqual(denied); expect(fetcher).not.toHaveBeenCalled();
 state.token = "current-session"; expect(await actions.diagnosticIdentityRecords(order)).toEqual(denied);
});
it.each(["bad", `${order}/../other`])("refuses malformed order %s before HTTP", async id => {
 const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect(await actions.diagnosticIdentityRecords(id)).toMatchObject({ ok: false }); expect(fetcher).not.toHaveBeenCalled();
});
it("stages exact supplied rights before any upload and returns only the staged handle", async () => {
 const fetcher = vi.fn(async () => Response.json({ id: predecessor, state: "staged" })); vi.stubGlobal("fetch", fetcher);
 expect(await actions.diagnosticStageIdentityProvenance(order, stage)).toEqual({ ok: true, data: { id: predecessor, state: "staged" } });
 expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(`/orders/${order}/identity-provenance`), expect.objectContaining({ method: "POST", body: JSON.stringify(stage), cache: "no-store" }));
});
it.each([{ ...stage, rights: { ...rights, hold: { reason: "invented" } } }, { ...stage, rights: { ...rights, schedule: undefined } }, { ...stage, storageKey: "private" }, { ...stage, sizeBytes: 10485761 }])("refuses invalid rights or staging body before HTTP", async input => {
 const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect(await actions.diagnosticStageIdentityProvenance(order, input)).toMatchObject({ ok: false }); expect(fetcher).not.toHaveBeenCalled();
});
it.each([undefined, "https://attacker.invalid"])("protects browser mutations against origin %s", async origin => {
 if (origin) state.headers.set("origin", origin); else state.headers.delete("origin");
 const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect(await actions.diagnosticStageIdentityProvenance(order, stage)).toEqual(denied); expect(fetcher).not.toHaveBeenCalled();
});
it("rejects unknown cursor fields and forwards only the exact bounded discovery query", async () => {
 const page = { candidates: [], nextCursor: "opaque-continuation", exhausted: false, scope: "currently_authorized_retained_predecessors" };
 const fetcher = vi.fn(async () => Response.json(page)); vi.stubGlobal("fetch", fetcher);
 expect(await actions.diagnosticPredecessors(order, { cursor: "abc", count: 100 })).toMatchObject({ ok: false }); expect(fetcher).not.toHaveBeenCalled();
 expect(await actions.diagnosticPredecessors(order, { cursor: "opaque /&" })).toEqual({ ok: true, data: page });
 expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("?cursor=opaque+%2F%26"), expect.anything());
});
it("keeps B-only handoffs separate from full proof material and rejects a broadened upstream projection", async () => {
 const safe = { handoffs: [{ proofId: predecessor, status: "usable", expectedOrderVersion: 3 }], result: null, nextCursor: null, scope: "current_b_owned_handoffs" };
 vi.stubGlobal("fetch", async () => Response.json(safe)); expect(await actions.diagnosticContinuityHandoffs(order, {})).toEqual({ ok: true, data: safe });
 vi.stubGlobal("fetch", async () => Response.json({ ...safe, predecessor: { privateIdentity: "A" } })); expect(await actions.diagnosticContinuityHandoffs(order, {})).toMatchObject({ ok: false });
});
it.each([302, 400, 401, 409, 500])("sanitizes upstream status %s and never returns its body or locator", async status => {
 vi.stubGlobal("fetch", async () => Response.json({ code: "secret-token", message: "storage-key", url: "https://storage.invalid" }, { status, headers: { Location: "https://storage.invalid" } }));
 const result = await actions.diagnosticIdentityRecords(order); expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toMatch(/secret-token|storage-key|storage.invalid/);
});
it("refuses unbounded or non-JSON upstream data without decoding it", async () => {
 vi.stubGlobal("fetch", async () => new Response("private", { headers: { "Content-Type": "application/json", "Content-Length": "8388609" } }));
 expect(await actions.diagnosticIdentityRecords(order)).toMatchObject({ ok: false });
 vi.stubGlobal("fetch", async () => new Response("private", { headers: { "Content-Type": "text/html" } }));
 expect(await actions.diagnosticIdentityRecords(order)).toMatchObject({ ok: false });
});
