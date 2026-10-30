import type * as NextNavigation from "next/navigation";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import * as actions from "./actions";

// Only Next request storage/navigation and the external fetch boundary are substituted.
const state = vi.hoisted(() => ({ token: "current-session", headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => state.headers, cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }) }));
vi.mock("next/navigation", async original => ({ ...await original<typeof NextNavigation>(), redirect: (url: string) => { const error = new Error(url); Object.assign(error, { digest: `NEXT_REDIRECT;replace;${url};307;` }); throw error; } }));
const order = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const proofId = "33333333-3333-4333-8333-333333333333";
const reportId = "44444444-4444-4444-8444-444444444444";
const pending = { requestId, kind: "consume", state: "pending_input" };
const completed = { requestId, kind: "consume", state: "completed", result: { proofId, reportId } };
const historical = { requestId, kind: "issue", state: "completed", proofId, usability: "historical" };
const consume = { kind: "consume", command: { reportId, expectedOrderVersion: 3, reason: "Explicit synthetic B link", proofId } };
const issue = { kind: "issue", command: { predecessorId: reportId, expectedPredecessorVersion: 2, expectedOrderVersion: 3, predecessorIdentityRecordId: proofId, candidateIdentityRecordId: order, linkingTechnicianId: order, method: "comparative_attestation", rationale: "Explicit synthetic comparison", provenanceRecordIds: [proofId] } };
const denied = { ok: false, error: "denied", code: "DIAGNOSTIC_NO_ACCESS" };
const invalid = { ok: false, error: "error", code: "DIAGNOSTIC_INVALID_INPUT" };
const basePath = `/diagnostics/orders/${order}/continuity-requests`;
const operations = ["prepare", "discover", "recover", "execute"] as const;
type Operation = typeof operations[number];
function invoke(operation: Operation, b = order, input: unknown = undefined, request = requestId) {
 switch (operation) {
  case "prepare": return actions.diagnosticPrepareContinuityRequest(b, input === undefined ? { kind: "consume" } : input);
  case "discover": return actions.diagnosticContinuityRequests(b, input === undefined ? {} : input);
  case "recover": return actions.diagnosticRecoverContinuityRequest(b, request);
  case "execute": return actions.diagnosticExecuteContinuityRequest(b, request, input === undefined ? consume : input);
 }
}
function response(operation: Operation) { return operation === "discover" ? { requests: [pending, completed, historical], nextCursor: null } : operation === "prepare" ? pending : completed; }
beforeEach(() => { vi.stubEnv("ADMIN_ORIGIN", "https://admin.example.invalid"); state.token = "current-session"; state.headers = new Headers({ origin: "https://admin.example.invalid", host: "admin.example.invalid" }); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(operations)("%s uses the exact protected route, method and current bearer once", async operation => {
 const fetcher = vi.fn<typeof fetch>(async () => Response.json(response(operation))); vi.stubGlobal("fetch", fetcher);
 expect(await invoke(operation)).toEqual({ ok: true, data: response(operation) });
 const suffix = { prepare: "", discover: "?", recover: `/${requestId}`, execute: `/${requestId}/execute` }[operation];
 expect(fetcher).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(basePath + suffix), expect.objectContaining({
  method: operation === "prepare" || operation === "execute" ? "POST" : "GET", cache: "no-store", redirect: "manual",
  headers: expect.objectContaining({ Authorization: "Bearer current-session" }),
  ...(operation === "prepare" ? { body: JSON.stringify({ kind: "consume" }) } : operation === "execute" ? { body: JSON.stringify(consume) } : {}),
 }));
 if (operation === "discover" || operation === "recover") expect(fetcher.mock.calls[0]?.[1]?.body).toBeUndefined();
});
it("forwards issue commands separately and returns only the original historical proof handle", async () => {
 const fetcher = vi.fn(async () => Response.json(historical)); vi.stubGlobal("fetch", fetcher);
 expect(await actions.diagnosticExecuteContinuityRequest(order, requestId, issue)).toEqual({ ok: true, data: historical });
 expect(fetcher).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(`${basePath}/${requestId}/execute`), expect.objectContaining({ body: JSON.stringify(issue), method: "POST" }));
});
it("prepares issue identity without command text or any claim of saved input", async () => {
 const data = { ...pending, kind: "issue" }; const fetcher = vi.fn(async () => Response.json(data)); vi.stubGlobal("fetch", fetcher);
 expect(await actions.diagnosticPrepareContinuityRequest(order, { kind: "issue" })).toEqual({ ok: true, data });
 expect(fetcher).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(basePath), expect.objectContaining({ body: '{"kind":"issue"}' }));
});
it("encodes only the bounded discovery cursor and reads fresh authority on every invocation", async () => {
 const data = { requests: [], nextCursor: "next" }; const fetcher = vi.fn(async () => Response.json(data)); vi.stubGlobal("fetch", fetcher);
 await actions.diagnosticContinuityRequests(order, { cursor: "opaque+/=&" }); state.token = "rotated-same-session";
 await actions.diagnosticContinuityRequests(order, { cursor: "next" });
 expect(fetcher).toHaveBeenNthCalledWith(1, expect.stringContaining(`${basePath}?cursor=opaque%2B%2F%3D%26`), expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer current-session" }) }));
 expect(fetcher).toHaveBeenNthCalledWith(2, expect.stringContaining(`${basePath}?cursor=next`), expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer rotated-same-session" }) }));
});
it.each(operations)("%s rejects expired Session before invalid input, cookie authority or dispatch", async operation => {
 state.headers.set("x-admin-session-expired", "1"); state.token = ""; const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
 await expect(invoke(operation, "bad", null, "bad")).rejects.toThrow("/login?reason=session-expired"); expect(fetcher).not.toHaveBeenCalled();
});
it.each(operations)("%s requires a current token, including opaque ID reads", async operation => {
 state.token = ""; const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
 expect(await invoke(operation)).toEqual(denied); expect(fetcher).not.toHaveBeenCalled();
});
for (const operation of ["prepare", "execute"] as const) {
 it.each([null, "https://other.invalid", "bad-origin", "https://admin.example.invalid/path"])(`${operation} refuses origin %s before validation`, async origin => {
  if (origin === null) state.headers.delete("origin"); else state.headers.set("origin", origin);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(await invoke(operation, "bad", null, "bad")).toEqual(denied); expect(fetcher).not.toHaveBeenCalled();
 });
}
for (const operation of operations) {
 it.each(["bad", `${order}/../${reportId}`, `${order}?actor=other`])(`${operation} refuses invalid B %s before dispatch`, async b => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect(await invoke(operation, b)).toEqual(invalid); expect(fetcher).not.toHaveBeenCalled();
 });
 it.each([401, 403, 404, 409, 302, 307, 500])(`${operation} sanitizes status %s without following redirects`, async status => {
  const fetcher = vi.fn(async () => Response.json({ reason: "secret", accessToken: "private-token", url: "https://storage.invalid/private" }, { status, headers: { Location: "https://storage.invalid/private" } })); vi.stubGlobal("fetch", fetcher);
  state.token = "wrong-token";
  expect(await invoke(operation)).toEqual(status === 401 || status === 403 ? denied : status === 409 ? { ok: false, error: "conflict", code: "DIAGNOSTIC_CONFLICT" } : invalid);
  expect(fetcher).toHaveBeenCalledOnce();
 });
 it.each(["html", "malformed", "oversize", "unknown"])(`${operation} refuses %s upstream representations`, async kind => {
  const data = response(operation);
  const fetcher = vi.fn(async () => kind === "html" ? new Response("private", { headers: { "Content-Type": "text/html" } }) : kind === "malformed" ? new Response("{secret", { headers: { "Content-Type": "application/json" } }) : kind === "oversize" ? new Response("private", { headers: { "Content-Type": "application/json", "Content-Length": "8388609" } }) : Response.json({ ...data, privateIdentity: "A" })); vi.stubGlobal("fetch", fetcher);
  expect(await invoke(operation)).toEqual(invalid); expect(fetcher).toHaveBeenCalledOnce();
 });
 it("rejects wrong B or request authority at the API without fallback reads: " + operation, async () => {
  const fetcher = vi.fn(async () => Response.json({ predecessor: "secret" }, { status: 403 })); vi.stubGlobal("fetch", fetcher);
  expect(await invoke(operation, reportId, undefined, proofId)).toEqual(denied); expect(fetcher).toHaveBeenCalledOnce();
 });
}
for (const operation of ["recover", "execute"] as const) {
 it.each(["bad", `${requestId}?kind=issue`, `${requestId}/../${proofId}`])(`${operation} refuses malformed request ID %s`, async request => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect(await invoke(operation, order, undefined, request)).toEqual(invalid); expect(fetcher).not.toHaveBeenCalled();
 });
}
it.each([null, {}, { kind: "other" }, { kind: "issue", command: issue.command }, { kind: "consume", requestId }, { kind: "consume", actorId: order }])("prepare rejects non-opaque or malformed input %j", async input => {
 const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect(await actions.diagnosticPrepareContinuityRequest(order, input)).toEqual(invalid); expect(fetcher).not.toHaveBeenCalled();
});
it.each([null, { cursor: "" }, { cursor: "x".repeat(2049) }, { kind: "consume" }, { cursor: "safe", sessionId: order }, { requestId }])("discovery rejects non-page query %j", async query => {
 const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect(await actions.diagnosticContinuityRequests(order, query)).toEqual(invalid); expect(fetcher).not.toHaveBeenCalled();
});
it.each([null, {}, { kind: "consume" }, { kind: "issue", command: consume.command }, { kind: "consume", command: issue.command }, { ...consume, requestId }, { ...consume, command: { ...consume.command, predecessorId: reportId } }, { ...issue, command: { ...issue.command, actorId: order } }, { kind: "consume", command: { ...consume.command, proofId: "bad" } }])("execute requires explicit strict kind and complete command %j", async input => {
 const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect(await actions.diagnosticExecuteContinuityRequest(order, requestId, input)).toEqual(invalid); expect(fetcher).not.toHaveBeenCalled();
});
for (const field of ["predecessor", "customer", "identity", "reason", "reviewer", "notes", "evidence", "hashes"]) {
 it(`refuses B completion with forbidden ${field}, including discovery entries`, async () => {
  const data = { ...completed, result: { ...completed.result, [field]: "private" } }; vi.stubGlobal("fetch", async () => Response.json(data));
  expect(await actions.diagnosticRecoverContinuityRequest(order, requestId)).toEqual(invalid);
  vi.stubGlobal("fetch", async () => Response.json({ requests: [data], nextCursor: null })); expect(await actions.diagnosticContinuityRequests(order, {})).toEqual(invalid);
 });
}
it.each([{ ...historical, usability: "usable" }, { ...pending, command: consume.command }, { ...completed, requestId: "bad" }, { ...historical, proof: issue.command }])("refuses broadened or invalid recovery projection %j", async data => {
 vi.stubGlobal("fetch", async () => Response.json(data)); expect(await actions.diagnosticRecoverContinuityRequest(order, requestId)).toEqual(invalid);
});
it("refuses mismatched request/kind outcomes and completed preparation", async () => {
 vi.stubGlobal("fetch", async () => Response.json({ ...completed, requestId: proofId })); expect(await actions.diagnosticRecoverContinuityRequest(order, requestId)).toEqual(invalid);
 vi.stubGlobal("fetch", async () => Response.json(historical)); expect(await actions.diagnosticExecuteContinuityRequest(order, requestId, consume)).toEqual(invalid);
 vi.stubGlobal("fetch", async () => Response.json(completed)); expect(await actions.diagnosticPrepareContinuityRequest(order, { kind: "consume" })).toEqual(invalid);
 vi.stubGlobal("fetch", async () => Response.json({ ...pending, kind: "issue" })); expect(await actions.diagnosticPrepareContinuityRequest(order, { kind: "consume" })).toEqual(invalid);
});
it.each(["issue", "consume"] as const)("lost %s reply dispatches once, then explicit GET discovery/recovery returns the original outcome without command replay", async kind => {
 const outcome = kind === "issue" ? historical : completed;
 const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("private lost reply"))
  .mockResolvedValueOnce(Response.json({ requests: [outcome], nextCursor: null })).mockResolvedValueOnce(Response.json(outcome)); vi.stubGlobal("fetch", fetcher);
 expect(await actions.diagnosticExecuteContinuityRequest(order, requestId, kind === "issue" ? issue : consume)).toEqual(invalid);
 expect(fetcher).toHaveBeenCalledOnce();
 expect(await actions.diagnosticContinuityRequests(order, {})).toEqual({ ok: true, data: { requests: [outcome], nextCursor: null } });
 expect(await actions.diagnosticRecoverContinuityRequest(order, requestId)).toEqual({ ok: true, data: outcome });
 expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "GET"]);
 expect(fetcher.mock.calls.slice(1).map(([, init]) => init?.body)).toEqual([undefined, undefined]);
 expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([expect.stringContaining(`${basePath}/${requestId}/execute`), expect.stringContaining(`${basePath}?`), expect.stringContaining(`${basePath}/${requestId}`)]);
});
it("returns pending without a cached command, proof admission or automatic execution", async () => {
 state.headers.delete("origin"); const fetcher = vi.fn(async () => Response.json(pending)); vi.stubGlobal("fetch", fetcher);
 expect(await actions.diagnosticRecoverContinuityRequest(order, requestId)).toEqual({ ok: true, data: pending }); expect(fetcher).toHaveBeenCalledOnce();
});
it("bounds chunked recovery JSON and cancels before exposing protected data", async () => {
 let chunks = 0; const cancel = vi.fn(); vi.stubGlobal("fetch", async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(4 * 1024 * 1024)); }, cancel }, { highWaterMark: 0 }), { headers: { "Content-Type": "application/json" } }));
 expect(await actions.diagnosticRecoverContinuityRequest(order, requestId)).toEqual(invalid); expect(chunks).toBe(3); expect(cancel).toHaveBeenCalledOnce();
});
