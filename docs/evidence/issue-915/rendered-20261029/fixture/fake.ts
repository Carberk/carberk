// Network-boundary fake for the issue-915 rendered fixture. Synthetic data only; NO real network is ever used.
const u = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
export const ids = { order: u(1), actor: u(2), proof: u(3), report: u(4), request: u(5), predReport: u(6), tech: u(7), aOrder: u(8), other: u(9), center: u(10), template: u(11) };
const H = (c: string) => c.repeat(64);
const text = { en: "Synthetic inspection template", ru: "Синтетический шаблон осмотра", tk: "Synthetic barlag nusgasy" };
const definition = { title: text, limitations: text, syntheticNotice: text, checks: [{ id: "brakes", label: text, required: true, evidenceRequired: false, measurement: null }], panels: [] };
const obsB = { observedAt: "2026-10-24T10:00:00.000Z", mileageKm: 129000, method: "manual", vin: null, manualReference: "Authorized physical visit B — ГОС-0042-TM / front-left strut tower" };
const obsA = { observedAt: "2026-09-02T08:30:00.000Z", mileageKm: 120450, method: "manual", vin: null, manualReference: "Prior visit A — registration plate bracket, rear" };
const rights = (purpose: string) => ({ category: "vehicle_observation", purpose, basis: "Synthetic authority basis for the visit", provenance: "Synthetic physical observation record", identifiability: "personal", use: ["service"], schedule: { kind: "until", until: "2027-10-24T10:00:00.000Z", reason: "Synthetic retention reason" }, supplierRestrictions: "", hold: null });
const longLoc = "Windshield base, driver side, below the wiper cowl, near the second rivet from the left edge of the bracket";
const unbroken = "XTA210930Y2765432XTA210930Y2765432XTA210930Y2765432ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const prov = (id: string) => ({ id, sha256: H("c"), mime: "image/webp", sizeBytes: 4096 });
type Ident = { kind: string; location: string; value: string; provenanceIds: string[] };
function evidence(o: { id: number; order: string; version: number; raw: number; obs: any; ident: Ident[]; supersedes?: number; explanation?: string; purpose?: string }) {
  const pids = [...new Set(o.ident.flatMap(i => i.provenanceIds))];
  return { id: u(o.id), orderId: o.order, orderVersion: o.version, identityRecordId: u(o.raw), observationHash: H("a"), observation: o.obs, identifiers: o.ident, provenance: pids.map(p => prov(p)), rights: rights(o.purpose ?? "Synthetic identity review"), correction: o.supersedes ? { supersedesId: u(o.supersedes), explanation: o.explanation ?? "" } : null, recordHash: H("d"), recordedBy: ids.actor, recordedAt: "2026-10-24T10:05:00.000Z" };
}
const I = (n: number) => u(n);
export const chains = {
  aRoot: () => evidence({ id: 30, order: ids.aOrder, version: 3, raw: 20, obs: obsA, ident: [{ kind: "vin_stamp", location: longLoc, value: unbroken, provenanceIds: [I(100), I(101)] }, { kind: "manufacturer_plate", location: "Door pillar, driver side", value: "Plate A-77", provenanceIds: [I(102)] }] }),
  aCorr: () => evidence({ id: 32, order: ids.aOrder, version: 3, raw: 20, obs: obsA, supersedes: 30, explanation: "Corrected the transposed characters after the physical re-read of the stamp. The second photo shows the corrected row clearly.", ident: [{ kind: "vin_stamp", location: longLoc, value: unbroken.replace("XTA", "XTB"), provenanceIds: [I(100), I(103)] }, { kind: "chassis_stamp", location: "Floor pan under the passenger seat", value: "CH-0091-77", provenanceIds: [I(104)] }] }),
  bRoot: () => evidence({ id: 31, order: ids.order, version: 7, raw: 21, obs: obsB, ident: [{ kind: "manufacturer_plate", location: "Front-left strut tower, plate riveted to the metal", value: "Observed B value 1", provenanceIds: [I(110), I(111)] }] }),
  bCorr: () => evidence({ id: 33, order: ids.order, version: 7, raw: 21, obs: obsB, supersedes: 31, explanation: "The first plate photo was blurred; a corrected value was recorded with a new photo of the same plate.", ident: [{ kind: "manufacturer_plate", location: "Front-left strut tower, plate riveted to the metal", value: "Observed B value 1 (corrected)", provenanceIds: [I(112), I(113)] }, { kind: "vin_stamp", location: "Windshield base", value: "WVWZZZ1JZXW000001", provenanceIds: [I(111)] }] }),
};
export const allImageIds = [100, 101, 102, 103, 104, 110, 111, 112, 113];

type Role = "tech" | "reviewer";
export const fx: any = {
  role: "tech" as Role, scene: "capture", denied: false, offline: false, loseExecute: false, log: [] as string[], writes: [] as any[],
  bEvidence: [] as any[], rawPresent: true, handoffPages: 0, handoffMode: "list", candidatesMode: "plain", techNames: [{ userId: ids.tech, name: "Aigerim Nurmukhammedova-Tyurkmenbashi" }, { userId: u(12), name: "Мердан Бердымурадов" }],
  failIds: new Set<string>(), failMode: "http500", failTimes: new Map<string, number>(), images: new Map<string, ArrayBuffer>(), gates: [] as { re: RegExp; p: Promise<void> }[],
  receipt: null as any, consumedReportId: null as string | null, reports: [] as any[], uploadFail: 0, stageConflict: false,
};
function context() {
  const caps = fx.role === "tech" ? ["diagnostics.technician"] : ["diagnostics.reviewer"];
  return { actorId: ids.actor, order: { id: ids.order, centerId: ids.center, templateVersionId: ids.template, audience: "buyer_private", listingId: null, status: "arrived", version: 7, synthetic: true, createdAt: obsB.observedAt, physicalAuthorized: true, publicationAuthorized: false, vehicleMatched: false, physicalAuthorization: { authorityReference: "Synthetic", recordedBy: ids.actor, recordedAt: obsB.observedAt }, publicationAuthorization: null, observedVehicle: obsB, events: [] }, template: { id: ids.template, centerId: ids.center, version: 2, definition, synthetic: true, publishedAt: obsB.observedAt }, capabilities: caps, assignments: [], staffChoices: [] };
}
function comparison() {
  return { predecessor: { reportId: ids.predReport, reportVersion: 3, snapshotHash: H("e"), identityRecordId: u(20), identityRecordHash: H("f"), identity: { observation: obsA, evidence: chains.aRoot(), corrections: [chains.aCorr()], evidenceGeneration: 2, correctionHeadHash: H("1") } },
    candidate: { orderId: ids.order, orderVersion: 7, identityRecordId: u(21), identityRecordHash: H("2"), identity: { observation: obsB, evidence: chains.bRoot(), corrections: [chains.bCorr()], evidenceGeneration: 2, correctionHeadHash: H("3") } } };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });
async function gate(path: string) { for (const g of fx.gates) if (g.re.test(path)) await g.p; }
export function holdNext(re: RegExp) { let release!: () => void; const p = new Promise<void>(r => (release = r)); const g = { re, p }; fx.gates.push(g); return () => { fx.gates = fx.gates.filter((x: any) => x !== g); release(); }; }
export function installFake() {
  const real = window.fetch.bind(window);
  window.fetch = async (input: any, init: any = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href); const path = url.pathname; const method = (init.method ?? "GET").toUpperCase();
    if (!path.startsWith("/api/v1/") && !path.startsWith("/diagnostics/")) return real(input, init); // vite assets only
    fx.log.push(`${method} ${path}${url.search}`);
    if (fx.offline) throw new TypeError("Failed to fetch (fixture offline)");
    await gate(path);
    if (fx.denied) return json({ code: "DIAGNOSTIC_NO_ACCESS" }, 403);
    const body = init.body && typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    if (method !== "GET") fx.writes.push({ method, path, body: typeof body === "object" && !(body instanceof Blob) ? body : "[bytes]" });
    const m = (re: RegExp) => re.test(path);
    // protected images (pair proxy and own provenance proxy)
    const img = path.match(/\/(?:reinspection-comparison\/provenance|identity-provenance)\/([0-9a-f-]{36})$/);
    if (img && method === "GET") {
      const id = img[1] as string;
      const left = fx.failTimes.get(id) ?? (fx.failIds.has(id) ? Infinity : 0);
      if (left > 0) { fx.failTimes.set(id, left - 1); if (!isFinite(left)) fx.failTimes.set(id, Infinity);
        if (fx.failMode === "corrupt") return new Response(new Uint8Array([1, 2, 3, 4, 5]), { headers: { "Content-Type": "image/webp" } });
        if (fx.failMode === "badtype") return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "text/html" } });
        if (fx.failMode === "net") throw new TypeError("Failed to fetch image");
        return json({ code: "X" }, 500); }
      const bytes = fx.images.get(id) ?? fx.images.get("default");
      return new Response(bytes, { headers: { "Content-Type": "image/webp" } });
    }
    if (img && method === "PUT") return json({ id: img[1], state: "verified", sha256: H("c"), sizeBytes: 4096, mime: "image/webp" });
    const mm = path.match(/\/identity-provenance\/([0-9a-f-]{36})$/); if (mm && method === "PUT") return json({ id: mm[1], state: "verified", sha256: H("c"), sizeBytes: 4096, mime: "image/webp" });
    if (m(/\/workspace$/)) return json(context());
    if (m(/\/orders\/[^/]+\/reports$/) && method === "GET") return json(fx.reports);
    if (m(/\/identity-records$/)) return json(fx.rawPresent ? [{ id: u(21), orderId: ids.order, orderVersion: 7, observationHash: H("a"), observation: obsB, recordedBy: ids.actor, recordedAt: obsB.observedAt }] : []);
    if (m(/\/identity-evidence$/) && method === "GET") return json(fx.bEvidence);
    if (m(/\/identity-evidence$/) && method === "POST") {
      if (fx.stageConflict) return json({ code: "DIAGNOSTIC_CONFLICT" }, 409);
      const rec = { ...evidence({ id: 40 + fx.bEvidence.length, order: ids.order, version: 7, raw: 21, obs: obsB, ident: body.identifiers, supersedes: body.correction ? 1 : undefined, explanation: body.correction?.explanation }), id: body.id, rights: body.rights, correction: body.correction ?? null };
      fx.bEvidence = [...fx.bEvidence, rec]; return json(rec);
    }
    if (m(/\/identity-provenance$/) && method === "POST") return json({ id: body.id, state: "staged" });
    if (m(/\/predecessor-candidates$/)) {
      const cur = url.searchParams.get("cursor");
      if (fx.candidatesMode === "empty-partial" && !cur) return json({ candidates: [], nextCursor: "c1", exhausted: false, scope: "currently_authorized_retained_predecessors" });
      if (fx.candidatesMode === "scope-empty") return json({ candidates: [], nextCursor: null, exhausted: true, scope: "currently_authorized_retained_predecessors" });
      return json({ candidates: [{ reportId: ids.predReport, observedAt: obsA.observedAt, mileageKm: obsA.mileageKm }, { reportId: u(66), observedAt: "2026-06-11T09:00:00.000Z", mileageKm: 98000 }], nextCursor: null, exhausted: true, scope: "currently_authorized_retained_predecessors" });
    }
    if (m(/\/reinspection-comparison$/)) return json(comparison());
    if (m(/\/linking-technicians$/)) return json({ technicians: fx.techNames });
    if (m(/\/continuity-handoffs$/)) {
      fx.handoffPages++; const cur = url.searchParams.get("cursor");
      if (fx.handoffMode === "none") return json({ handoffs: [], result: null, nextCursor: null, scope: "current_b_owned_handoffs" });
      if (fx.consumedReportId) return json({ handoffs: [], result: { proofId: ids.proof, reportId: fx.consumedReportId }, nextCursor: null, scope: "current_b_owned_handoffs" });
      if (!cur) return json({ handoffs: [{ proofId: ids.proof, status: "usable", expectedOrderVersion: 7 }, { proofId: u(301), status: "usable", expectedOrderVersion: 7 }, { proofId: u(302), status: "usable", expectedOrderVersion: 7 }], result: null, nextCursor: "h1", scope: "current_b_owned_handoffs" });
      return json({ handoffs: [{ proofId: u(303), status: "usable", expectedOrderVersion: 7 }], result: null, nextCursor: null, scope: "current_b_owned_handoffs" });
    }
    if (m(/\/continuity-requests$/) && method === "POST") { fx.receipt = { requestId: ids.request, kind: body.kind, state: "pending_input" }; return json(fx.receipt); }
    if (m(/\/execute$/)) {
      if (fx.loseExecute) { fx.loseExecute = false; throw new TypeError("Connection lost"); }
      if (body.kind === "consume") { fx.consumedReportId = body.command.reportId; fx.reports = [{ id: body.command.reportId, orderId: ids.order, audience: "buyer_private", status: "draft", templateVersionId: ids.template, observedAt: obsB.observedAt, mileageKm: obsB.mileageKm, findings: [], authorId: ids.actor, reviewerId: null, successorOf: null, supersededBy: null, correctionReason: null, returnReason: null, finalizedAt: null, withdrawnAt: null, withdrawalReason: null, version: 0, template: definition, synthetic: true }];
        fx.receipt = { requestId: ids.request, kind: "consume", state: "completed", result: { proofId: ids.proof, reportId: body.command.reportId } }; }
      else fx.receipt = { requestId: ids.request, kind: "issue", state: "completed", proofId: ids.proof, usability: "historical" };
      return json(fx.receipt);
    }
    if (m(new RegExp(`/continuity-requests/${ids.request}$`))) return json(fx.receipt ?? { requestId: ids.request, kind: "consume", state: "pending_input" });
    if (m(/\/continuity-requests$/)) return json({ requests: fx.receipt ? [fx.receipt] : [], nextCursor: null });
    if (m(/\/continuity-proofs\//)) return json({ proofId: ids.proof, policyVersion: "ADR-0108", predecessor: { reportId: ids.predReport, reportVersion: 3, snapshotHash: H("e"), identityRecordId: u(20), identityRecordHash: H("f") }, candidate: { orderId: ids.order, orderVersion: 7, identityRecordId: u(21), identityRecordHash: H("2") }, linkingTechnicianId: ids.tech, method: "comparative_attestation", result: "same_vehicle", rationale: "Synthetic recorded rationale", provenanceRecordIds: allImageIds.map(i => u(i)), issuedBy: ids.actor, issuedAt: obsB.observedAt });
    fx.log.push(`UNHANDLED ${method} ${path}`); return json({ code: "UNHANDLED_FIXTURE" }, 404);
  };
}
export function resetScene(role: Role, scene: string) {
  fx.role = role; fx.scene = scene; fx.denied = false; fx.offline = false; fx.loseExecute = false; fx.log = []; fx.writes = []; fx.failIds = new Set(); fx.failTimes = new Map(); fx.gates = []; fx.receipt = null; fx.consumedReportId = null; fx.reports = []; fx.handoffPages = 0; fx.handoffMode = "list"; fx.candidatesMode = "plain"; fx.rawPresent = true; fx.stageConflict = false;
  fx.bEvidence = scene === "correct" ? [chains.bRoot()] : scene === "chain" ? [chains.bRoot(), chains.bCorr()] : [];
}
export async function makeImages() {
  for (const n of [...allImageIds, 0]) {
    const portrait = n === 103 || n === 112; const w = portrait ? 800 : 1200, h = portrait ? 1200 : 800;
    const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d")!;
    g.fillStyle = `hsl(${(n * 37) % 360} 25% 82%)`; g.fillRect(0, 0, w, h); g.fillStyle = "#222"; g.font = "bold 56px sans-serif"; g.fillText(n ? `SYNTHETIC IMAGE ${n}` : "SYNTHETIC", 40, 110);
    g.strokeStyle = "#222"; g.lineWidth = 6; g.strokeRect(40, 160, w - 80, h - 320); g.font = "40px monospace"; g.fillText("XTA-SYNTH-0000", 80, h / 2); g.fillText(`${w}x${h} no real vehicle data`, 80, h - 80);
    const blob: Blob = await new Promise(r => c.toBlob(b => r(b!), "image/webp", 0.8));
    fx.images.set(n ? u(n) : "default", await blob.arrayBuffer());
  }
}
