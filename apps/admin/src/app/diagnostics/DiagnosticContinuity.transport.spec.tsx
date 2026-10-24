// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

import { DiagnosticWorkspace } from "./DiagnosticWorkspace";
import { continuityCopy } from "./continuity-copy";
import { diagnosticCopy } from "./copy";

import { AdminLanguageSwitch, AdminLocaleProvider } from "@/lib/i18n";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-access" }) }), headers: async () => new Headers({ origin: "http://localhost", host: "localhost" }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); }, unstable_rethrow: () => {} }));
const uuid = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const orderId = uuid(1), actor = uuid(2), proofId = uuid(3), reportId = uuid(4), requestId = uuid(5), predecessorId = uuid(6), technicianId = uuid(7), hash = "a".repeat(64);
const text = { en: "Synthetic template", ru: "Синтетический шаблон", tk: "Emeli nusga" };
const observation = { observedAt: "2026-10-24T10:00:00.000Z", mileageKm: 129000, method: "manual" as const, vin: null, manualReference: "Authorized physical visit B" };
const rights: D.DiagnosticIdentityRights = { category: "vehicle_observation", purpose: "Synthetic review", basis: "Synthetic authority", provenance: "Synthetic physical observation", identifiability: "personal", use: ["service"], schedule: { kind: "until", until: "2027-10-24T10:00:00.000Z", reason: "Synthetic retention" }, supplierRestrictions: "", hold: null };
const definition = { title: text, limitations: text, syntheticNotice: text, checks: [{ id: "brakes", label: text, required: true, evidenceRequired: false, measurement: null }], panels: [] };
function contextFixture(): D.DiagnosticWorkspace { return { actorId: actor, order: { id: orderId, centerId: uuid(10), templateVersionId: uuid(11), audience: "buyer_private", listingId: null, status: "arrived", version: 7, synthetic: true, createdAt: observation.observedAt, physicalAuthorized: true, publicationAuthorized: false, vehicleMatched: false, physicalAuthorization: { authorityReference: "Synthetic", recordedBy: actor, recordedAt: observation.observedAt }, publicationAuthorization: null, observedVehicle: observation, events: [] }, template: { id: uuid(11), centerId: uuid(10), version: 2, definition, synthetic: true, publishedAt: observation.observedAt }, capabilities: ["diagnostics.technician", "diagnostics.reviewer"], assignments: [], staffChoices: [] }; }
function evidenceFixture(id: string, imageIds: string[]): D.DiagnosticIdentityEvidence { return { id, orderId, orderVersion: 7, identityRecordId: uuid(21), observationHash: hash, observation, identifiers: Array.from({length: Math.ceil(imageIds.length / 20)}, (_, n) => ({ kind: "manufacturer_plate", location: `Physical plate ${n}`, value: "Observed B value", provenanceIds: imageIds.slice(n * 20, n * 20 + 20) })), provenance: imageIds.map(imageId => ({ id: imageId, sha256: hash, mime: "image/webp", sizeBytes: 4 })), rights, correction: null, recordHash: hash, recordedBy: actor, recordedAt: observation.observedAt }; }
let context: D.DiagnosticWorkspace, materials: number, pages: number, denied: boolean, writes: { path: string; body: unknown }[], receipt: D.DiagnosticContinuityRequest, loseExecute: boolean, proofReadDenied: boolean, names: { userId: string; name: string }[], fetches: string[];
function comparison() { return { predecessor: { reportId: predecessorId, reportVersion: 3, snapshotHash: hash, identityRecordId: uuid(20), identityRecordHash: hash, identity: { observation: { ...observation, manualReference: "Restricted A identity" }, evidence: evidenceFixture(uuid(30), Array.from({ length: materials }, (_, n) => uuid(100 + n))), corrections: [], evidenceGeneration: 1, correctionHeadHash: hash } }, candidate: { orderId, orderVersion: 7, identityRecordId: uuid(21), identityRecordHash: hash, identity: { observation, evidence: evidenceFixture(uuid(31), [uuid(100)]), corrections: [], evidenceGeneration: 1, correctionHeadHash: hash } } }; }
function setup(handoff?: string, locale: "en" | "ru" | "tk" = "en") { return render(<AdminLocaleProvider initialLocale={locale}><AdminLanguageSwitch/><DiagnosticWorkspace initialOrder={orderId} {...(handoff ? { handoff } : {})}/></AdminLocaleProvider>); }
const c = continuityCopy.en, base = diagnosticCopy.en;
async function link() { fireEvent.click(await screen.findByRole("button", { name: c.link })); }
async function compare() { await link(); fireEvent.click(screen.getByRole("button", { name: c.search })); fireEvent.click(await screen.findByRole("button", { name: c.compare })); await screen.findByRole("button", { name: c.technicians }); }
beforeEach(() => {
 context = contextFixture(); materials = 1; pages = 0; denied = false; writes = []; loseExecute = false; proofReadDenied = false; fetches = []; names = [{ userId: technicianId, name: "Distinct Technician" }]; receipt = { requestId, kind: "consume", state: "pending_input" };
 vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const parsed = new URL(String(url), "http://localhost"), path = parsed.pathname; fetches.push(path);
  if (denied) return Response.json({}, { status: 403 });
  if (init?.method === "POST") writes.push({ path, body: JSON.parse(String(init.body)) });
  if (path.endsWith("/workspace")) return Response.json(context);
  if (path.endsWith("/reports")) return Response.json([]);
  if (path.endsWith("/continuity-handoffs")) { pages++; return Response.json({ handoffs: pages === 5 ? [{ proofId, status: "usable", expectedOrderVersion: 7 }] : pages === 2 ? [] : Array.from({ length: 20 }, (_, n) => ({ proofId: uuid(300 + pages * 20 + n), status: "usable", expectedOrderVersion: 7 })), result: null, nextCursor: pages < 5 ? `page-${pages}` : null, scope: "current_b_owned_handoffs" }); }
  if (path.endsWith("/predecessor-candidates")) return Response.json({ candidates: [{ reportId: predecessorId, observedAt: observation.observedAt, mileageKm: 120000 }], nextCursor: null, exhausted: true, scope: "currently_authorized_retained_predecessors" });
  if (path.endsWith("/reinspection-comparison")) return Response.json(comparison());
  if (path.endsWith("/linking-technicians")) return Response.json({ technicians: names });
  if (path.endsWith("/continuity-requests") && init?.method === "POST") { const kind = JSON.parse(String(init.body)).kind; receipt = { requestId, kind, state: "pending_input" }; return Response.json(receipt); }
  if (path.endsWith("/execute")) { const input = JSON.parse(String(init?.body)) as D.DiagnosticContinuityRequestExecute; if (loseExecute) { loseExecute = false; throw new TypeError("Connection lost"); } receipt = input.kind === "issue" ? { requestId, kind: "issue", state: "completed", proofId, usability: "historical" } : { requestId, kind: "consume", state: "completed", result: { proofId, reportId } }; return Response.json(receipt); }
  if (path.endsWith(`/continuity-requests/${requestId}`)) return Response.json(receipt);
  if (path.endsWith("/continuity-requests")) return Response.json({ requests: [receipt], nextCursor: null });
  if (path.endsWith(`/continuity-proofs/${proofId}`)) { if (proofReadDenied) return Response.json({}, { status: 403 }); return Response.json({ proofId, policyVersion: "ADR-0108", predecessor: { reportId: predecessorId, reportVersion: 3, snapshotHash: hash, identityRecordId: uuid(20), identityRecordHash: hash }, candidate: { orderId, orderVersion: 7, identityRecordId: uuid(21), identityRecordHash: hash }, linkingTechnicianId: technicianId, method: "comparative_attestation", result: "same_vehicle", rationale: "Restricted recorded rationale", provenanceRecordIds: [uuid(100)], issuedBy: actor, issuedAt: observation.observedAt }); }
  if (path.endsWith("/identity-records")) return Response.json([{ id: uuid(21), orderId, orderVersion: 7, observationHash: hash, observation, recordedBy: actor, recordedAt: observation.observedAt }]);
  if (path.endsWith("/identity-evidence") && init?.method === "POST") { const input = JSON.parse(String(init.body)); return Response.json({ ...evidenceFixture(input.id, input.identifiers.flatMap((item: {provenanceIds: string[]}) => item.provenanceIds)), identifiers: input.identifiers, rights: input.rights, correction: input.correction }); }
  if (path.endsWith("/identity-evidence") && init?.method !== "POST") return Response.json([evidenceFixture(uuid(31), [uuid(100)])]);
  if (path.endsWith("/identity-provenance") && init?.method === "POST") { const input = JSON.parse(String(init.body)); return Response.json({ id: input.id, state: "staged" }); }
  if (init?.method === "PUT") return Response.json({ id: path.split("/").at(-1), state: "verified", sha256: hash, sizeBytes: 4, mime: "image/webp" });
  if (path.includes("/provenance/") || path.includes("/identity-provenance/")) return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "Content-Type": "image/webp" } });
  return Response.json(null);
 });
 vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:protected-synthetic"); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(["en", "ru", "tk"] as const)("opens the exact B handoff across empty and 61+ handles without mutation or A disclosure in %s", async locale => {
 context.capabilities = ["diagnostics.technician"];
 setup(proofId, locale); const copy = continuityCopy[locale];
 expect(await screen.findByRole("button", { name: copy.reviewB })).toBeTruthy();
 expect(pages).toBe(5); expect(writes).toEqual([]); expect(fetches.some(path => path.includes("comparison") || path.includes("continuity-proofs"))).toBe(false);
 expect(screen.queryByText("Restricted A identity")).toBeNull(); expect(screen.queryByText(proofId)).toBeNull();
});
it("requires B intention review and sends only the explicit B command", async () => {
 setup(proofId); const review = await screen.findByRole("button", { name: c.reviewB }); expect(review.getAttribute("aria-disabled")==="true").toBe(true);
 fireEvent.change(screen.getByRole("textbox", { name: `${base.reason} · ${c.required}` }), { target: { value: "My intended physical visit" } }); fireEvent.click(review);
 const final = screen.getByRole("button", { name: c.consume }).closest("section") as HTMLElement;
 expect(final.textContent).toContain("Authorized physical visit B"); expect(final.textContent).toContain("129,000"); expect(final.textContent).toContain("Synthetic template"); expect(final.textContent).toContain("Buyer private"); expect(writes).toEqual([]);
 fireEvent.click(within(final).getByRole("button", { name: c.consume })); await screen.findAllByRole("button", { name: c.result });
 expect(writes.at(-1)?.body).toEqual({ kind: "consume", command: { proofId, reportId: expect.any(String), expectedOrderVersion: 7, reason: "My intended physical visit" } });
});
it("checks uncertain execution status before enabling exact unchanged retry", async () => {
 loseExecute = true; setup(proofId); fireEvent.change(await screen.findByRole("textbox", { name: `${base.reason} · ${c.required}` }), { target: { value: "Original exact reason" } }); fireEvent.click(screen.getByRole("button", { name: c.reviewB })); fireEvent.click(screen.getByRole("button", { name: c.consume }));
 await screen.findByText(c.uncertain); expect(screen.queryByRole("button", { name: c.retryExact })).toBeNull();
 await waitFor(() => expect(screen.getByRole("button", { name: c.status }).hasAttribute("disabled")).toBe(false)); fireEvent.click(screen.getByRole("button", { name: c.status }));
 fireEvent.click(await screen.findByRole("button", { name: c.retryExact })); await screen.findAllByRole("button", { name: c.result });
 const commands = writes.filter(item => item.path.endsWith("/execute")); expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]);
});
it("renders all 41 bound materials and removes issuance controls", async () => {
 materials = 41; setup(); await link(); fireEvent.click(screen.getByRole("button", { name: c.search })); fireEvent.click(await screen.findByRole("button", { name: c.compare })); await screen.findByText(c.overCap);
 expect(screen.getAllByRole("button", { name: c.reviewImage })).toHaveLength(41); expect(screen.queryByRole("button", { name: c.technicians })).toBeNull(); expect(screen.queryByRole("button", { name: c.review })).toBeNull(); expect(writes).toEqual([]);
});
it("keeps colliding names unselectable while retaining distinguishable people", async () => {
 names = [{ userId: uuid(41), name: " Same Name " }, { userId: uuid(42), name: "same  name" }, { userId: technicianId, name: "Distinct Technician" }]; setup(); await compare(); fireEvent.click(screen.getByRole("button", { name: c.technicians })); await screen.findByText(c.collision);
 expect(within(screen.getByRole("combobox", { name: `${c.select} · ${c.required}` })).getAllByRole("option").map(item => item.textContent)).toEqual([c.select, "Distinct Technician"]);
});
it("does not allow image acknowledgment until protected image read succeeds", async () => {
 setup(); await compare(); const checkbox = screen.getByRole("checkbox", { name: `${c.ack} · ${c.required}` }); expect(checkbox.hasAttribute("disabled")).toBe(true);
 fireEvent.click(screen.getByRole("button", { name: c.reviewImage })); fireEvent.load(await screen.findByRole("img")); await waitFor(() => expect(checkbox.hasAttribute("disabled")).toBe(false)); expect((checkbox as HTMLInputElement).checked).toBe(false);
});
it("denial of any nested protected read removes the whole workspace and its inputs", async () => {
 setup(); await compare(); fireEvent.change(screen.getByRole("textbox", { name: `${base.reason} · ${c.required}` }), { target: { value: "Private unsent rationale" } }); denied = true;
 fireEvent.click(screen.getByRole("button", { name: c.reviewImage })); await screen.findByText(base.denied);
 expect(screen.queryByText("Restricted A identity")).toBeNull(); expect(screen.queryByDisplayValue("Private unsent rationale")).toBeNull(); expect(screen.queryByText("Authorized physical visit B")).toBeNull();
});
it("requires restricted inspection of each historical issue before exposing its handoff link", async () => {
 receipt = { requestId, kind: "issue", state: "completed", proofId, usability: "historical" }; setup(); await link(); fireEvent.click(screen.getByRole("button", { name: c.status }));
 const inspect = await screen.findByRole("button", { name: c.inspect }); expect(screen.queryByRole("link", { name: c.openLink })).toBeNull(); fireEvent.click(inspect);
 expect(await screen.findByRole("link", { name: c.openLink })).toHaveProperty("href", `http://localhost:3000/diagnostics?order=${orderId}&handoff=${proofId}`);
});
it("discovered pending input has no execute control and no saved command", async () => {
 setup(); await link(); fireEvent.click(screen.getByRole("button", { name: c.status })); await screen.findByText(c.pending);
 expect(screen.queryByRole("button", { name: c.retryExact })).toBeNull(); expect(writes).toEqual([]);
});
it("preserves a reason across locale changes and offers an explicit dirty leave choice", async () => {
 setup(proofId); const input = await screen.findByRole("textbox", { name: `${base.reason} · ${c.required}` }); fireEvent.change(input, { target: { value: "Unsent private reason" } });
 fireEvent.click(screen.getByRole("button", { name: base.refresh })); await screen.findByRole("region", { name: c.leave }); expect(screen.getByDisplayValue("Unsent private reason")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: c.keep }));
 fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "ru" } }); expect(screen.getByDisplayValue("Unsent private reason")).toBeTruthy();
});
it("uploads no bytes before classification and records a complete correction using genuinely new verified support", async () => {
 setup(); fireEvent.click(await screen.findByRole("button", { name: c.visit })); fireEvent.click(screen.getByRole("button", { name: c.loadIdentity }));
 fireEvent.click(await screen.findByRole("button", { name: c.correction })); fireEvent.click(screen.getByRole("button",{name:c.replacement}));
 const file = new File([new Uint8Array([1, 2, 3, 4])], "synthetic-private.png", { type: "image/png" });
 fireEvent.change(screen.getByLabelText(`${c.file} · ${c.optional}`), { target: { files: [file] } });
 expect(screen.getByRole("button", { name: c.stage }).getAttribute("aria-disabled")==="true").toBe(true); expect(writes).toEqual([]);
 for (const [label, value] of [[c.purpose, "Physical review"], [c.basis, "Authorized synthetic source"], [c.provenance, "Physical plate capture"], [c.scheduleReason, "Authorized retention"], [base.explanation, "Complete supported replacement"]]) fireEvent.change(screen.getByLabelText(`${label} · ${c.required}`), { target: { value } });
 fireEvent.change(screen.getByLabelText(`${c.until} · ${c.required}`), { target: { value: "2027-10-24T10:00" } });
 fireEvent.change(screen.getByLabelText(`${c.location} · ${c.required}`), { target: { value: "New complete physical plate" } }); fireEvent.change(screen.getByLabelText(`${c.value} · ${c.required}`), { target: { value: "New physical value" } });
 expect(screen.getByRole("button", { name: c.capture }).getAttribute("aria-disabled")==="true").toBe(true);
 fireEvent.click(screen.getByRole("button", { name: c.stage }));
 const support = await screen.findByRole("checkbox", { name: `${c.verified} 2` }); fireEvent.click(support);
 const capture = screen.getByRole("button", { name: c.capture }); await waitFor(() => expect(capture.getAttribute("aria-disabled")==="true").toBe(false)); fireEvent.click(capture); fireEvent.click(screen.getByRole("button",{name:c.reviewCorrection})); await screen.findByText(base.saved);
 const staged = writes.find(item => item.path.endsWith("/identity-provenance"))?.body as D.DiagnosticIdentityProvenanceStage;
 const appended = writes.find(item => item.path.endsWith("/identity-evidence"))?.body as D.DiagnosticIdentityEvidenceCapture;
 expect(staged.rights).toEqual({ ...rights, purpose: "Physical review", basis: "Authorized synthetic source", provenance: "Physical plate capture", schedule: { kind: "until", until: "2027-10-24T10:00:00.000Z", reason: "Authorized retention" } });
 expect(appended).toEqual({ id: expect.any(String), expectedOrderVersion: 7, identityRecordId: uuid(21), correction: { supersedesId: uuid(31), explanation: "Complete supported replacement" }, rights: staged.rights, identifiers: [{ kind: "vin_stamp", location: "New complete physical plate", value: "New physical value", provenanceIds: [staged.id] }] });
});
it("issues the complete comparative command only after explicit material and same-vehicle review", async () => {
 setup(); await compare(); fireEvent.click(screen.getByRole("button", { name: c.technicians })); await screen.findByRole("option", { name: "Distinct Technician" });
 fireEvent.change(screen.getByRole("combobox", { name: `${c.select} · ${c.required}` }), { target: { value: technicianId } });
 fireEvent.change(screen.getByRole("textbox", { name: `${base.reason} · ${c.required}` }), { target: { value: "Complete deliberate comparison" } });
 const review = screen.getByRole("button", { name: c.review }); expect(review.getAttribute("aria-disabled")==="true").toBe(true);
 fireEvent.click(screen.getByRole("button", { name: c.reviewImage })); const ack = screen.getByRole("checkbox", { name: `${c.ack} · ${c.required}` }); fireEvent.load(await screen.findByRole("img")); await waitFor(() => expect(ack.hasAttribute("disabled")).toBe(false)); fireEvent.click(ack); fireEvent.click(screen.getByRole("checkbox", { name: `${c.same} · ${c.required}` })); fireEvent.click(review);
 expect(writes).toEqual([]); fireEvent.click(screen.getByRole("button", { name: c.issue })); await screen.findByRole("button", { name: c.inspect });
 expect(writes.at(-1)?.body).toEqual({ kind: "issue", command: { predecessorId, expectedPredecessorVersion: 3, expectedOrderVersion: 7, predecessorIdentityRecordId: uuid(20), candidateIdentityRecordId: uuid(21), linkingTechnicianId: technicianId, method: "comparative_attestation", rationale: "Complete deliberate comparison", provenanceRecordIds: [uuid(100)] } }); expect(screen.queryByRole("link", { name: c.openLink })).toBeNull();
});
it("stops a repeated handoff cursor and offers an explicit restart without choosing an alternative", async () => {
 const real = fetch;
 vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => String(args[0]).includes("continuity-handoffs") ? Response.json({ handoffs: [], result: null, nextCursor: "same-cursor", scope: "current_b_owned_handoffs" }) : real(...args));
 setup(proofId); await screen.findByText(c.unavailable); expect(screen.queryByRole("button", { name: c.reviewB })).toBeNull(); expect(writes).toEqual([]); expect(screen.getByRole("button", { name: c.check }).hasAttribute("disabled")).toBe(false);
});
it("opens an existing B result before checking the supplied proof and preserves ordinary report recovery", async () => {
 const real = fetch;
 vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => String(args[0]).includes("continuity-handoffs") ? Response.json({ handoffs: [], result: { proofId: uuid(999), reportId }, nextCursor: "unused-continuation", scope: "current_b_owned_handoffs" }) : real(...args));
 setup(proofId); await screen.findByRole("button", { name: c.result }); expect(screen.queryByRole("button", { name: c.consume })).toBeNull(); expect(screen.queryByRole("button", { name: c.reviewB })).toBeNull(); expect(writes).toEqual([]);
});
it("does not render a protected late comparison after the user leaves the workspace", async () => {
 let release: (()=>void) | undefined; const gate=new Promise<void>(resolve=>{release=resolve;}); const real=fetch;
 vi.stubGlobal("fetch",async(...args:Parameters<typeof fetch>)=>{if(String(args[0]).includes("reinspection-comparison"))await gate;return real(...args);});
 const view=setup(); await link(); fireEvent.click(screen.getByRole("button",{name:c.search})); fireEvent.click(await screen.findByRole("button",{name:c.compare})); view.unmount(); release?.();
 await Promise.resolve(); expect(screen.queryByText("Restricted A identity")).toBeNull();
});
it("image decode failure blocks acknowledgment and issuance", async()=>{
 setup();await compare();fireEvent.click(screen.getByRole("button",{name:c.reviewImage}));fireEvent.error(await screen.findByRole("img"));
 expect(screen.getByRole("checkbox",{name:`${c.ack} · ${c.required}`}).hasAttribute("disabled")).toBe(true);expect(screen.getByRole("button",{name:c.review}).getAttribute("aria-disabled")==="true").toBe(true);expect(writes).toEqual([]);
});
it("keeps reviewer receipt proof-read and copy controls absent for a B-only technician",async()=>{
 context.capabilities=["diagnostics.technician"];receipt={requestId,kind:"issue",state:"completed",proofId,usability:"historical"};setup(proofId);await screen.findByRole("button",{name:c.reviewB});fireEvent.click(screen.getByRole("button",{name:c.status}));await screen.findByText(c.recorded);
 expect(screen.queryByRole("button",{name:c.inspect})).toBeNull();expect(screen.queryByRole("button",{name:c.copy})).toBeNull();expect(fetches.some(path=>path.includes("continuity-proofs"))).toBe(false);
});
it("discarding classification input clears the real form rather than only its dirty indicator",async()=>{
 setup();fireEvent.click(await screen.findByRole("button",{name:c.visit}));fireEvent.click(screen.getByRole("button",{name:c.loadIdentity}));fireEvent.click(await screen.findByRole("button",{name:c.correction})); fireEvent.click(screen.getByRole("button",{name:c.replacement}));
 fireEvent.change(screen.getByLabelText(`${c.purpose} · ${c.required}`),{target:{value:"Private unsent classification"}});fireEvent.click(screen.getByRole("button",{name:c.link}));await screen.findByRole("region",{name:c.leave});fireEvent.click(screen.getByRole("button",{name:c.discard}));
 expect(screen.queryByDisplayValue("Private unsent classification")).toBeNull();expect(screen.getByRole("button",{name:c.search})).toBeTruthy();
});

it("validates correction fields on blur and links an ordered error summary without mutating", async () => {
 setup(); fireEvent.click(await screen.findByRole("button", {name:c.visit})); fireEvent.click(screen.getByRole("button", {name:c.loadIdentity})); fireEvent.click(await screen.findByRole("button", {name:c.correction})); fireEvent.click(screen.getByRole("button",{name:c.replacement}));
 const purpose=screen.getByLabelText(`${c.purpose} · ${c.required}`);
 expect(purpose.getAttribute("aria-invalid")).toBeNull(); fireEvent.change(purpose,{target:{value:" "}}); fireEvent.blur(purpose);
 expect(purpose.getAttribute("aria-invalid")).toBe("true"); expect(document.getElementById(purpose.getAttribute("aria-describedby")!.split(" ").at(-1)!)).toBeTruthy();
 const capture=screen.getByRole("button",{name:c.capture}); expect(capture.getAttribute("aria-disabled")).toBe("true"); expect(capture.hasAttribute("disabled")).toBe(false); fireEvent.click(capture);
 const summary=screen.getByRole("region",{name:c.invalidFields}); const first=within(summary).getAllByRole("link")[0]!; fireEvent.click(first);
 expect(document.activeElement?.id).toBe(first.getAttribute("href")!.slice(1)); expect(writes).toEqual([]);
});
it("limits identifiers to twenty and returns removal focus to the preceding identifier", async()=>{
 setup();fireEvent.click(await screen.findByRole("button",{name:c.visit}));fireEvent.click(screen.getByRole("button",{name:c.loadIdentity}));fireEvent.click(await screen.findByRole("button",{name:c.correction})); fireEvent.click(screen.getByRole("button",{name:c.replacement}));
 const add=screen.getByRole("button",{name:c.add});for(let n=1;n<20;n++)fireEvent.click(add);
 expect(add.getAttribute("aria-disabled")).toBe("true");fireEvent.click(add);expect(screen.getAllByRole("button",{name:c.remove})).toHaveLength(20);
 fireEvent.click(screen.getAllByRole("button",{name:c.remove})[19]!);expect(document.activeElement?.textContent).toBe(`${c.identifier} 19`);
});
it("keeps unsent input on Escape only inside the leave choice and restores the invoking focus", async()=>{
 setup(proofId);const input=await screen.findByRole("textbox",{name:`${base.reason} · ${c.required}`});fireEvent.change(input,{target:{value:"Keep private reason"}});
 const refresh=screen.getByRole("button",{name:base.refresh});refresh.focus();fireEvent.click(refresh);const region=await screen.findByRole("region",{name:c.leave});
 expect(region.contains(document.activeElement)).toBe(true);fireEvent.keyDown(input,{key:"Escape"});expect(screen.getByRole("region",{name:c.leave})).toBeTruthy();
 fireEvent.keyDown(within(region).getByRole("button",{name:c.keep}),{key:"Escape"});expect(screen.queryByRole("region",{name:c.leave})).toBeNull();expect(document.activeElement).toBe(refresh);expect(screen.getByDisplayValue("Keep private reason")).toBeTruthy();
});
it("stops a longer receipt cursor cycle without exposing a retry command", async()=>{
 const real=fetch;let cursorPage=0;
 vi.stubGlobal("fetch",async(...args:Parameters<typeof fetch>)=>String(args[0]).includes("continuity-requests")?Response.json({requests:[],nextCursor:["receipt-a","receipt-b","receipt-a"][cursorPage++]??null}):real(...args));
 setup();await link();fireEvent.click(screen.getByRole("button",{name:c.status}));fireEvent.click(await screen.findByRole("button",{name:c.continue}));await waitFor(()=>expect(cursorPage).toBe(2));fireEvent.click(screen.getByRole("button",{name:c.continue}));await screen.findByText(c.unavailable);
 expect(screen.queryByRole("button",{name:c.retryExact})).toBeNull();expect(writes).toEqual([]);
});

it("validates the physical observation on blur and cannot send an invalid mileage",async()=>{
 setup();fireEvent.click(await screen.findByRole("button",{name:c.visit}));const intake=screen.getByText(base.intake).closest("details")!;intake.open=true;
 const mileage=within(intake).getByLabelText(`${base.mileage} · ${c.required}`);fireEvent.change(mileage,{target:{value:"10000001"}});fireEvent.blur(mileage);
 expect(mileage.getAttribute("aria-invalid")).toBe("true");const record=within(intake).getByRole("button",{name:base.observe});expect(record.getAttribute("aria-disabled")).toBe("true");fireEvent.click(record);expect(writes).toEqual([]);
});
it("exposes the exact complete selectable link after clipboard failure and returns to its own receipt",async()=>{
 receipt={requestId,kind:"issue",state:"completed",proofId,usability:"historical"};vi.spyOn(navigator.clipboard,"writeText").mockRejectedValue(new Error("Clipboard unavailable"));
 setup();await link();fireEvent.click(screen.getByRole("button",{name:c.status}));const invoking=await screen.findByRole("button",{name:c.inspect});fireEvent.click(invoking);const copy=await screen.findByRole("button",{name:c.copy});fireEvent.click(copy);
 const complete=await screen.findByRole("textbox",{name:c.completeLink}) as HTMLInputElement;expect(complete.value).toBe(`http://localhost:3000/diagnostics?order=${orderId}&handoff=${proofId}`);complete.focus();expect(complete.selectionEnd).toBe(complete.value.length);fireEvent.click(within(copy.closest("section")!).getByRole("button",{name:base.back}));expect(document.activeElement).toBe(invoking);
});
it.each([1,40])("reviews every one of %i references and repeats actual A/B facts before issuance",async count=>{
 materials=count;setup();await compare();fireEvent.click(screen.getByRole("button",{name:c.technicians}));await screen.findByRole("option",{name:"Distinct Technician"});fireEvent.change(screen.getByRole("combobox",{name:`${c.select} · ${c.required}`}),{target:{value:technicianId}});fireEvent.change(screen.getByRole("textbox",{name:`${base.reason} · ${c.required}`}),{target:{value:"All physical material reviewed"}});
 const openers=screen.getAllByRole("button",{name:c.reviewImage});for(let n=0;n<count;n++){fireEvent.click(openers[n]!);const row=openers[n]!.closest("li")!;fireEvent.load(await within(row).findByRole("img"));const checkbox=within(row).getByRole("checkbox");fireEvent.click(checkbox);}
 fireEvent.click(screen.getByRole("checkbox",{name:`${c.same} · ${c.required}`}));fireEvent.click(screen.getByRole("button",{name:c.review}));const review=screen.getByRole("region",{name:c.review});expect(review.contains(document.activeElement)).toBe(true);expect(review.textContent).toContain("Restricted A identity");expect(review.textContent).toContain("Authorized physical visit B");expect(review.textContent).toContain("129,000 km");expect(review.textContent).toContain("Distinct Technician");expect(review.textContent).toContain(`${count}/40`);expect(review.textContent).toContain("All physical material reviewed");
 fireEvent.click(within(review).getByRole("button",{name:c.edit}));expect(document.activeElement).toBe(screen.getByRole("textbox",{name:`${base.reason} · ${c.required}`}));expect(screen.getByRole("button",{name:c.review}).getAttribute("aria-disabled")).toBe("true");expect(writes).toEqual([]);
});
it("reports duplicate kind and location beside both unsent identifiers",async()=>{
 setup();fireEvent.click(await screen.findByRole("button",{name:c.visit}));fireEvent.click(screen.getByRole("button",{name:c.loadIdentity}));fireEvent.click(await screen.findByRole("button",{name:c.correction}));fireEvent.click(screen.getByRole("button",{name:c.replacement}));fireEvent.click(screen.getByRole("button",{name:c.add}));
 const fields=screen.getAllByLabelText(`${c.location} · ${c.required}`);for(const input of fields){fireEvent.change(input,{target:{value:"Same physical plate"}});fireEvent.blur(input);}expect(fields.map(input=>input.getAttribute("aria-invalid"))).toEqual(["true","true"]);expect(screen.getAllByText(c.duplicate)).toHaveLength(2);expect(writes).toEqual([]);
});

it("clears all protected content on image denial while another child read is pending",async()=>{
 setup();await compare();const real=fetch;let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 vi.stubGlobal("fetch",async(...args:Parameters<typeof fetch>)=>{const path=String(args[0]);if(path.includes("linking-technicians")){await gate;return Response.json({technicians:[{userId:technicianId,name:"Late protected technician"}]});}if(path.includes("/provenance/"))return Response.json({}, {status:403});return real(...args);});
 fireEvent.click(screen.getByRole("button",{name:c.technicians}));fireEvent.click(screen.getByRole("button",{name:c.reviewImage}));await screen.findByText(base.denied);release();await new Promise(resolve=>setTimeout(resolve,0));
 expect(screen.queryByText("Late protected technician")).toBeNull();expect(screen.queryByText("Restricted A identity")).toBeNull();expect(screen.queryByText("Authorized physical visit B")).toBeNull();expect(writes).toEqual([]);
});
it("fences a late comparison when navigation selects a different order and actor",async()=>{
 setup();await link();fireEvent.click(screen.getByRole("button",{name:c.search}));const real=fetch;let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 vi.stubGlobal("fetch",async(...args:Parameters<typeof fetch>)=>{const path=String(args[0]);if(path.includes("reinspection-comparison")){const old=comparison();await gate;return Response.json(old);}if(path.endsWith("/workspace"))return Response.json({...context,actorId:uuid(800),capabilities:["diagnostics.technician"],order:{...context.order,id:uuid(801),observedVehicle:{...observation,manualReference:"New actor current order"}}});return real(...args);});
 fireEvent.click(await screen.findByRole("button",{name:c.compare}));
 // Prop navigation models the route's new exact order, independent of locked local controls.
 cleanup();const view=render(<AdminLocaleProvider initialLocale="en"><DiagnosticWorkspace initialOrder={uuid(801)}/></AdminLocaleProvider>);await view.findByText("New actor current order");release();await new Promise(resolve=>setTimeout(resolve,0));
 expect(screen.queryByText("Restricted A identity")).toBeNull();expect(screen.queryByRole("button",{name:c.issue})).toBeNull();expect(writes).toEqual([]);
});
it("a new Session with no receipts still checks the current B result without claiming cancellation",async()=>{
 const real=fetch;vi.stubGlobal("fetch",async(...args:Parameters<typeof fetch>)=>String(args[0]).includes("continuity-requests")?Response.json({requests:[],nextCursor:null}):String(args[0]).includes("continuity-handoffs")?Response.json({handoffs:[],result:{proofId:uuid(999),reportId},nextCursor:null,scope:"current_b_owned_handoffs"}):real(...args));
 context.capabilities=["diagnostics.technician"];setup(proofId);await screen.findByRole("button",{name:c.result});fireEvent.click(screen.getByRole("button",{name:c.status}));await screen.findAllByText(c.sessionAbsence);expect(screen.getByRole("button",{name:c.result})).toBeTruthy();expect(screen.queryByRole("button",{name:c.consume})).toBeNull();expect(writes).toEqual([]);
});
it("clears a forbidden historical decision after current role loss",async()=>{
 receipt={requestId,kind:"issue",state:"completed",proofId,usability:"historical"};setup();await link();fireEvent.click(screen.getByRole("button",{name:c.status}));fireEvent.click(await screen.findByRole("button",{name:c.inspect}));await screen.findByText("Restricted recorded rationale");fireEvent.click(within(screen.getByRole("region",{name:c.recorded})).getByRole("button",{name:base.back}));proofReadDenied=true;fireEvent.click(screen.getByRole("button",{name:c.inspect}));await screen.findByText(base.denied);
 expect(screen.queryByRole("link",{name:c.openLink})).toBeNull();expect(screen.queryByText("Restricted recorded rationale")).toBeNull();expect(screen.queryByText("Authorized physical visit B")).toBeNull();
});
async function replacementInput(){
 fireEvent.click(await screen.findByRole("button",{name:c.visit}));fireEvent.click(screen.getByRole("button",{name:c.loadIdentity}));fireEvent.click(await screen.findByRole("button",{name:c.correction}));fireEvent.click(screen.getByRole("button",{name:c.replacement}));
 for(const [label,value] of [[c.purpose,"Physical review"],[c.basis,"Synthetic authority"],[c.provenance,"Physical plate"],[c.scheduleReason,"Authorized retention"],[base.explanation,"Complete replacement rationale"],[c.location,"Physical B plate"],[c.value,"Replacement B"]])fireEvent.change(screen.getByLabelText(`${label} · ${c.required}`),{target:{value}});
 fireEvent.change(screen.getByLabelText(`${c.until} · ${c.required}`),{target:{value:"2027-10-24T10:00"}});fireEvent.change(screen.getByLabelText(`${c.file} · ${c.optional}`),{target:{files:[new File([new Uint8Array([1,2,3,4])],"synthetic.png",{type:"image/png"})]}});fireEvent.click(screen.getByRole("button",{name:c.stage}));fireEvent.click(await screen.findByRole("checkbox",{name:`${c.verified} 2`}));fireEvent.click(screen.getByRole("button",{name:c.capture}));
}
it("a concurrent correction winner clears retry readiness and never retargets the complete replacement",async()=>{
 setup();await replacementInput();const real=fetch;let rejected=0;vi.stubGlobal("fetch",async(...args:Parameters<typeof fetch>)=>{if(String(args[0]).endsWith("/identity-evidence")&&args[1]?.method==="POST"){rejected++;return Response.json({}, {status:409});}return real(...args);});
 fireEvent.click(screen.getByRole("button",{name:c.reviewCorrection}));await screen.findAllByText(base.refresh);expect(screen.getByRole("button",{name:c.capture}).getAttribute("aria-disabled")).toBe("true");fireEvent.click(screen.getByRole("button",{name:c.capture}));fireEvent.click(screen.getByRole("button",{name:c.reviewCorrection}));expect(rejected).toBe(1);expect(screen.getByDisplayValue("Replacement B")).toBeTruthy();expect(screen.queryByRole("button",{name:base.retry})).toBeNull();
});
it("a recorded complete replacement refreshes and focuses the returned immutable record",async()=>{
 setup();await replacementInput();const real=fetch;let appended:D.DiagnosticIdentityEvidence|undefined;
 vi.stubGlobal("fetch",async(...args:Parameters<typeof fetch>)=>{const path=String(args[0]);if(path.endsWith("/identity-evidence")&&args[1]?.method==="POST"){const response=await real(...args);appended=await response.clone().json();return response;}if(path.endsWith("/identity-evidence")&&appended)return Response.json([evidenceFixture(uuid(31),[uuid(100)]),appended]);return real(...args);});
 fireEvent.click(screen.getByRole("button",{name:c.reviewCorrection}));await screen.findByText(base.saved);await waitFor(()=>expect(document.activeElement?.getAttribute("data-record")).toBe(appended?.id));expect(screen.queryByDisplayValue("Replacement B")).toBeNull();
});
it("checks every receipt page after a lost prepare and never attaches unsent input to a discovered preparation",async()=>{
 const real=fetch;let receiptPages=0;
 vi.stubGlobal("fetch",async(...args:Parameters<typeof fetch>)=>{const path=String(args[0]);if(path.endsWith("/continuity-requests")&&args[1]?.method==="POST")throw new TypeError("Lost prepare reply");if(path.includes("continuity-requests")){receiptPages++;return Response.json({requests:receiptPages===3?[{requestId,kind:"consume",state:"pending_input"}]:[],nextCursor:receiptPages<3?`recovery-${receiptPages}`:null});}return real(...args);});
 setup(proofId);fireEvent.change(await screen.findByRole("textbox",{name:`${base.reason} · ${c.required}`}),{target:{value:"Never bind this reason to discovered input"}});fireEvent.click(screen.getByRole("button",{name:c.reviewB}));fireEvent.click(screen.getByRole("button",{name:c.consume}));await screen.findByText(c.uncertain);await waitFor(()=>expect(screen.getByRole("button",{name:c.status}).hasAttribute("disabled")).toBe(false));fireEvent.click(screen.getByRole("button",{name:c.status}));await screen.findByText(c.pending);
 expect(receiptPages).toBe(3);expect(screen.queryByRole("button",{name:c.retryExact})).toBeNull();expect(writes.filter(item=>item.path.endsWith("/execute"))).toEqual([]);
});
