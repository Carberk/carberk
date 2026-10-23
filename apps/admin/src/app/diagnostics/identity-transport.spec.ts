import type * as NextNavigation from "next/navigation";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

import * as actions from "./actions";

const state = vi.hoisted(() => ({ token: "current-session", headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => state.headers, cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }) }));
vi.mock("next/navigation", async original => ({ ...await original<typeof NextNavigation>(), redirect: (url: string) => { const error = new Error(url); Object.assign(error, { digest: `NEXT_REDIRECT;replace;${url};307;` }); throw error; } }));
const order = "11111111-1111-4111-8111-111111111111", predecessor = "22222222-2222-4222-8222-222222222222";
const rights = { category: "vehicle_observation", purpose: "Compare physical identity", basis: "Authorized synthetic fixture", provenance: "Synthetic capture", identifiability: "pseudonymous", use: ["service"], schedule: { kind: "until", until: "2026-12-01T00:00:00.000Z", reason: "Explicit fixture authorization" }, supplierRestrictions: "", hold: null };
const stage = { id: predecessor, expectedOrderVersion: 3, contentType: "image/jpeg", sizeBytes: 3, rights };
const denied = { ok: false, error: "denied", code: "DIAGNOSTIC_NO_ACCESS" };
beforeEach(() => { vi.stubEnv("ADMIN_ORIGIN", "http://localhost:3001"); state.token = "current-session"; state.headers = new Headers({ origin: "http://localhost:3001", host: "localhost:3001" }); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
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
it("uniformly denies malformed browser origins before validation or transport", async () => {
 state.headers.set("origin", "invalid-origin-private-value"); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
 expect(await actions.diagnosticStageIdentityProvenance(order, stage)).toEqual(denied); expect(fetcher).not.toHaveBeenCalled();
});
const observation = { observedAt: "2026-10-23T00:00:00.000Z", mileageKm: 1000, method: "manual", vin: null, manualReference: "Physical chassis observation" };
const raw = { id: predecessor, orderId: order, orderVersion: 3, observationHash: "a".repeat(64), observation, recordedBy: order, recordedAt: "2026-10-23T00:00:00.000Z" };
const capture = { id: order, expectedOrderVersion: 3, identityRecordId: predecessor, identifiers: [{ kind: "chassis_stamp", location: "Frame", value: "SYNTHETIC-01", provenanceIds: [predecessor] }], rights, correction: { supersedesId: predecessor, explanation: "Supported recording correction" } };
const evidence = { id: order, orderId: order, orderVersion: 3, identityRecordId: predecessor, observationHash: "a".repeat(64), observation, identifiers: capture.identifiers, provenance: [{ id: predecessor, sha256: "b".repeat(64), mime: "image/webp", sizeBytes: 3 }], rights, correction: capture.correction, recordHash: "c".repeat(64), recordedBy: order, recordedAt: "2026-10-23T00:00:00.000Z" };
const identity = { observation, evidence, corrections: [evidence], evidenceGeneration: 2, correctionHeadHash: "c".repeat(64) };
const comparison = { predecessor: { reportId: predecessor, reportVersion: 2, snapshotHash: "d".repeat(64), identityRecordId: predecessor, identityRecordHash: "a".repeat(64), identity }, candidate: { orderId: order, orderVersion: 3, identityRecordId: order, identityRecordHash: "a".repeat(64), identity } };
const issuance = { predecessorId: predecessor, expectedPredecessorVersion: 2, expectedOrderVersion: 3, predecessorIdentityRecordId: predecessor, candidateIdentityRecordId: order, linkingTechnicianId: order, method: "comparative_attestation", rationale: "Supported pair comparison", provenanceRecordIds: [predecessor] };
const proof = { proofId: predecessor, policyVersion: "ADR-0108", predecessor: { reportId: predecessor, reportVersion: 2, snapshotHash: "d".repeat(64), identityRecordId: predecessor, identityRecordHash: "a".repeat(64) }, candidate: { orderId: order, orderVersion: 3, identityRecordId: order, identityRecordHash: "a".repeat(64) }, linkingTechnicianId: order, method: "comparative_attestation", result: "same_vehicle", rationale: issuance.rationale, provenanceRecordIds: [predecessor], issuedBy: predecessor, issuedAt: "2026-10-23T00:00:00.000Z" };
it("preserves raw history and explicit correction records without rewriting observations", async () => {
 vi.stubGlobal("fetch", async () => Response.json([raw])); expect(await actions.diagnosticIdentityRecords(order)).toEqual({ ok: true, data: [raw] });
 vi.stubGlobal("fetch", async () => Response.json(evidence)); expect(await actions.diagnosticAppendIdentityEvidence(order, capture)).toEqual({ ok: true, data: evidence });
 vi.stubGlobal("fetch", async () => Response.json([evidence])); expect(await actions.diagnosticIdentityEvidence(order)).toEqual({ ok: true, data: [evidence] });
});
it("reads the exact pair with pins and complete correction material or refuses the whole projection", async () => {
 const fetcher = vi.fn(async () => Response.json(comparison)); vi.stubGlobal("fetch", fetcher);
 expect(await actions.diagnosticReinspectionComparison(order, { predecessorId: predecessor })).toEqual({ ok: true, data: comparison });
 expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(`/orders/${order}/reinspection-comparison?predecessorId=${predecessor}`), expect.objectContaining({ method: "GET" }));
 vi.stubGlobal("fetch", async () => Response.json({ ...comparison, candidate: null })); expect(await actions.diagnosticReinspectionComparison(order, { predecessorId: predecessor })).toMatchObject({ ok: false });
});
it("forwards strict proof issuance and full proof reads separately from B-only consumption", async () => {
 const fetcher = vi.fn(async () => Response.json(proof)); vi.stubGlobal("fetch", fetcher);
 expect(await actions.diagnosticIssueContinuityProof(order, issuance)).toEqual({ ok: true, data: proof });
 expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining(`/orders/${order}/continuity-proofs`), expect.objectContaining({ method: "POST", body: JSON.stringify(issuance) }));
 expect(await actions.diagnosticContinuityProof(order, predecessor)).toEqual({ ok: true, data: proof });
 expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining(`/orders/${order}/continuity-proofs/${predecessor}`), expect.objectContaining({ method: "GET" }));
 const command = { reportId: order, expectedOrderVersion: 3, reason: "Explicit B linking operation" };
 fetcher.mockImplementation(async () => Response.json({ reportId: order }));
 expect(await actions.diagnosticConsumeContinuityHandoff(order, predecessor, command)).toEqual({ ok: true, data: { reportId: order } });
 expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining(`/orders/${order}/continuity-handoffs/${predecessor}/consume`), expect.objectContaining({ method: "POST", body: JSON.stringify(command) }));
});
it("does not add A bindings to B commands or retry a failed mutation", async () => {
 const fetcher = vi.fn(async () => { throw new Error("secret lost reply"); }); vi.stubGlobal("fetch", fetcher);
 const command = { reportId: order, expectedOrderVersion: 3, reason: "Explicit B linking operation" };
 expect(await actions.diagnosticConsumeContinuityHandoff(order, predecessor, { ...command, predecessorId: predecessor })).toMatchObject({ ok: false }); expect(fetcher).not.toHaveBeenCalled();
 expect(await actions.diagnosticConsumeContinuityHandoff(order, predecessor, command)).toMatchObject({ ok: false }); expect(fetcher).toHaveBeenCalledOnce();
});
it("reads only the current B technician selector without using a general staff directory", async () => {
 const data = { technicians: [{ userId: order, name: "Synthetic technician" }] };
 const fetcher = vi.fn(async () => Response.json(data)); vi.stubGlobal("fetch", fetcher);
 expect(await actions.diagnosticLinkingTechnicians(order)).toEqual({ ok: true, data });
 expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(`/orders/${order}/linking-technicians`), expect.anything());
});
it("cancels oversized chunked JSON before returning any protected projection", async () => {
 let chunks = 0; const cancel = vi.fn();
 vi.stubGlobal("fetch", async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(4 * 1024 * 1024)); }, cancel }, { highWaterMark: 0 }), { headers: { "Content-Type": "application/json" } }));
 expect(await actions.diagnosticIdentityRecords(order)).toMatchObject({ ok: false }); expect(chunks).toBe(3); expect(cancel).toHaveBeenCalledOnce();
});
it.each(["stage", "append", "issue", "consume"] as const)("rejects expired sessions before %s mutation validation", async name => {
 state.headers.set("x-admin-session-expired", "1"); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
 const work = { stage: () => actions.diagnosticStageIdentityProvenance("bad", null), append: () => actions.diagnosticAppendIdentityEvidence("bad", null), issue: () => actions.diagnosticIssueContinuityProof("bad", null), consume: () => actions.diagnosticConsumeContinuityHandoff("bad", "bad", null) }[name];
 await expect(work()).rejects.toThrow("/login?reason=session-expired"); expect(fetcher).not.toHaveBeenCalled();
});
