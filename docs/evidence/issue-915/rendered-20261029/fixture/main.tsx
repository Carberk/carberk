import { createRoot } from "react-dom/client";
import "/Users/bagtyyar/.t3/worktrees/carberk/t3-904e7fe8/apps/admin/src/app/globals.css";
import { DiagnosticWorkspace } from "@/app/diagnostics/DiagnosticWorkspace";
import { continuityCopy } from "@/app/diagnostics/continuity-copy";
import { diagnosticCopy } from "@/app/diagnostics/copy";
import { AdminLanguageSwitch, AdminLocaleProvider } from "@/lib/i18n";
import { fx, holdNext, ids, installFake, makeImages, resetScene } from "./fake";
import { audit, contrastOf, describe, focusInfo, nameOf } from "./audit";

const q = new URLSearchParams(location.search);
const locale = (q.get("locale") ?? "en") as "en" | "ru" | "tk";
const theme = q.get("theme") ?? "light";
const role = (q.get("role") ?? "tech") as "tech" | "reviewer";
const scene = q.get("scene") ?? "capture";
const handoff = q.get("handoff") ? ids.proof : undefined;
document.documentElement.className = `h-full antialiased font-sans ${theme === "dark" ? "dark" : ""}`;
installFake();
resetScene(role, scene);
if (q.get("hm")) fx.handoffMode = q.get("hm");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until<T>(fn: () => T | null | undefined | false, ms = 8000): Promise<T> { const t = Date.now(); for (;;) { const v = fn(); if (v) return v as T; if (Date.now() - t > ms) throw new Error("timeout waiting: " + fn.toString().slice(0, 120)); await sleep(30); } }
const all = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
function buttons(name: string | RegExp, root: ParentNode = document) { return all<HTMLElement>("button,a[href],summary,[role=button]", root).filter(el => { const n = nameOf(el); return typeof name === "string" ? n === name || n.startsWith(name) : name.test(n); }); }
async function click(name: string | RegExp, idx = 0, root: ParentNode = document) { const el = await until(() => buttons(name, root)[idx]); el.click(); await sleep(60); return el; }
function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
function control(labelStart: string, idx = 0, root: ParentNode = document) {
  const hits = all<HTMLElement>("input,textarea,select", root).filter(el => nameOf(el).startsWith(labelStart));
  return hits[idx] as HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement;
}
const cc = continuityCopy[locale], base = diagnosticCopy[locale];
const rights = (v: string) => ({ purpose: `${v} purpose`, basis: `${v} basis of authority`, provenance: `${v} source`, scheduleReason: `${v} retention reason`, identifiability: "personal", until: "2027-10-24T10:00" });
async function fillDeclaration(legend: string, tag: string) {
  const r = rights(tag); const fs = all<HTMLFieldSetElement>("fieldset").find(f => f.querySelector("legend")?.textContent === legend)!;
  const set = (label: string, v: string) => setValue(control(label, 0, fs), v);
  set(`${cc.purpose}`, r.purpose); set(`${cc.basis}`, r.basis); set(`${cc.provenance}`, r.provenance); set(`${cc.scheduleReason}`, r.scheduleReason); set(`${cc.identifiability}`, r.identifiability); set(`${cc.until}`, r.until); await sleep(50);
}
function fileInput() { return document.querySelector<HTMLInputElement>("input[type=file]")!; }
async function pickFile() {
  const c = document.createElement("canvas"); c.width = 400; c.height = 300; c.getContext("2d")!.fillRect(0, 0, 400, 300);
  const blob: Blob = await new Promise(r => c.toBlob(b => r(b!), "image/webp"));
  const dt = new DataTransfer(); dt.items.add(new File([blob], "synthetic.webp", { type: "image/webp" })); const i = fileInput(); i.files = dt.files; i.dispatchEvent(new Event("change", { bubbles: true })); await sleep(50);
}
const fxApi = {
  fx, ids, cc, base, focusInfo, holdNext, sleep, until, all, buttons, click, setValue, control, nameOf, describe, audit, contrastOf, fillDeclaration, pickFile, fileInput,
  async openVisit() { await click(cc.visit, 0, document.querySelector("nav")!); },
  async openLink() { await click(cc.link, 0, document.querySelector("nav")!); },
  async loadIdentity() { await click(cc.loadIdentity); await until(() => document.body.textContent?.includes(cc.raw)); await sleep(80); },
  async reachPair() { await this.openLink(); await click(cc.search); await click(cc.compare); await until(() => document.querySelector("#continuity-side-b")); await sleep(80); },
  state() { return { active: describe(document.activeElement as Element), url: location.search, log: fx.log.slice(-8) }; },
};

const S: Record<string, (o?: any) => Promise<any>> = {
  async intake() { await fxApi.openVisit(); const sum = document.querySelector<HTMLElement>("details[data-intake] summary")!; if (!(sum.parentElement as HTMLDetailsElement).open) sum.click(); await sleep(80); },
  async captureEmpty() { await fxApi.openVisit(); await fxApi.loadIdentity(); },
  async captureErrors() {
    await S.captureEmpty!(); await click(cc.capture, 0, document.querySelector("form")!); await sleep(150);
    await click(cc.add); await sleep(100); await click(cc.add); await sleep(100);
  },
  async captureErrorsBlurred() { // errors after explicit submit incl. newly appended identifiers
    await S.captureErrors!(); await click(cc.capture, 0, document.querySelector("form")!); await sleep(150);
  },
  async uploadImage(o?: any) {
    await fillDeclaration(cc.imageRights, "img"); await pickFile(); await click(cc.stage); await until(() => document.querySelectorAll("ul li button").length > 0 || document.body.textContent?.includes(cc.verified)); await sleep(150);
  },
  async fillIdentifier(o: any = {}) {
    const i = o.index ?? 0; const fs = [...document.querySelectorAll<HTMLFieldSetElement>("form fieldset")].filter(f => f.querySelector(":scope > legend")?.textContent?.startsWith(`${cc.identifier} ${i + 1}`) && f.querySelector("h4"))[0]!;
    setValue(control(`${cc.kind}`, 0, fs), o.kind ?? "manufacturer_plate"); setValue(control(`${cc.location}`, 0, fs), o.location ?? "Front-left strut tower"); setValue(control(`${cc.value}`, 0, fs), o.value ?? "OBS-0001");
    await sleep(60); const boxes = [...fs.querySelectorAll<HTMLInputElement>("input[type=checkbox]")]; for (const b of (o.support === "all" ? boxes : boxes.slice(0, o.support ?? 1))) { if (!b.checked) b.click(); } await sleep(60);
  },
  async fillRecord(o: any = {}) { await fillDeclaration(cc.recordRights, "rec"); if (o.explanation) setValue(control(base.explanation), o.explanation); await sleep(60); },
  async capturePath() { await S.captureEmpty!(); await S.uploadImage!(); await S.fillIdentifier!(); await S.fillRecord!(); },
  async openReview() { await click(cc.capture, 0, document.querySelector("form")!); await until(() => document.querySelector("section[aria-label]")); await sleep(120); },
  async captureReview() { await S.capturePath!(); await S.openReview!(); },
  async captureSave() { await S.capturePath!(); await S.saveRecord!(); },
  async saveRecord() { await S.openReview!(); const btn = [...document.querySelectorAll<HTMLElement>("section[role=region] button")].find(b => b.classList.contains("bg-primary"))!; btn.click(); await sleep(900); },
  async correctionPath() { await S.captureEmpty!(); await click(cc.correction, 0, document.querySelector("ol:nth-of-type(2)") ?? document); await until(() => buttons(cc.replacement)[0]); await sleep(100); },
  async correctionForm() { await S.correctionPath!(); await click(cc.replacement); await sleep(150); },
  async correctionReview() { await S.correctionFilled!(); await S.openReview!(); },
  async correctionSave() { await S.correctionFilled!(); await S.saveRecord!(); },
  async correctionFilled() { await S.correctionForm!(); await S.uploadImage!(); await S.fillIdentifier!({ support: "all" }); await fillDeclaration(cc.recordRights, "rec"); setValue(control(base.explanation), "Re-read the stamp after cleaning; the corrected value is supported by the new photo."); await sleep(80); },
  async pair() { await fxApi.reachPair(); },
  async ackAll() { // review + acknowledge every image through the real controls
    const items = [...document.querySelectorAll<HTMLElement>("ul > li")].filter(li => li.querySelector("input[type=checkbox][aria-labelledby]"));
    for (const li of items) { const b = li.querySelector<HTMLElement>("button")!; b.click(); await until(() => li.querySelector<HTMLInputElement>("input[type=checkbox]:not(:disabled)"), 5000); const cb = li.querySelector<HTMLInputElement>("input[type=checkbox]")!; if (!cb.checked) cb.click(); await sleep(40); const close = [...li.querySelectorAll<HTMLElement>("button")].find(x => x.textContent === cc.close); close?.click(); await sleep(40); }
  },
  async decision() {
    await S.pair!(); await click(cc.technicians); await until(() => document.querySelector("select option[value='" + ids.tech + "']"));
    const sel = (l: string) => control(l); setValue(sel(cc.select), ids.tech); setValue(sel(cc.method), "comparative_attestation"); setValue(control(base.reason, 0, document.querySelector("main")!), "Both visits compared line by line; the plates and stamps match."); const same = control(cc.same); if (!same.checked) same.click(); await sleep(100); await S.ackAll!();
  },
  async decisionReview() { await S.decision!(); await click(cc.review); await sleep(150); },
  async issued() { await S.decisionReview!(); const b = [...document.querySelectorAll<HTMLElement>("section[role=region] button")].find(b => b.textContent === cc.issue)!; b.click(); await sleep(900); },
  async bonlyReview() { await S.bonlyChoose!(); setValue(control(base.reason), "My own intended physical visit and reason for linking this inspection."); await sleep(80); await click(cc.reviewB, 0, document.querySelector("main")!); await sleep(150); },
  async bonlyConsume() { await S.bonlyReview!(); const b = [...document.querySelectorAll<HTMLElement>("section[role=region] button")].find(b => b.textContent === cc.consume)!; b.click(); await sleep(1000); },
  async bonlyLost() { await S.bonlyReview!(); fx.loseExecute = true; const b = [...document.querySelectorAll<HTMLElement>("section[role=region] button")].find(b => b.textContent === cc.consume)!; b.click(); await sleep(900); },
  async bonlyLostChecked() { await S.bonlyLost!(); await click(cc.status); await sleep(900); },
  async bonlyOpenResult() { await S.bonlyConsume!(); await click(cc.result); await sleep(900); },
  async startAtTop() { const t = document.createElement("button"); t.tabIndex = 0; document.body.prepend(t); t.focus(); t.remove(); scrollTo(0, 0); },
  async openImage(o: any = {}) { const lis = [...document.querySelectorAll<HTMLElement>("ul > li")].filter(li => li.querySelector("input[type=checkbox][aria-labelledby]")); const li = lis[o.index ?? 0]!; li.querySelector<HTMLElement>("button")!.click(); await sleep(o.wait ?? 700); return li; },
  async pairImagesOpen() { await S.pair!(); await S.openImage!({ index: 0 }); await S.openImage!({ index: 5 }); },
  async pairImageFail(o: any = {}) { await S.pair!(); fx.failMode = o.mode ?? "http500"; fx.failIds.add(ids.tech.replace(/7$/, "") .slice(0, 0) + "11111111-1111-4111-8111-000000000104"); await S.openImage!({ index: 4, wait: 900 }); },
  async pairImageFailCorrupt() { await S.pairImageFail!({ mode: "corrupt" }); },
  async pairImageRetryOk() { await S.pairImageFail!(); fx.failIds.clear(); fx.failTimes.clear(); const b = buttons(cc.retryImage.split("{image}")[0]!.trim())[0]!; b.click(); await sleep(900); },
  async candidatesEmptyPartial() { fx.candidatesMode = "empty-partial"; await fxApi.openLink(); await click(cc.search); await sleep(300); },
  async candidatesScopeEmpty() { fx.candidatesMode = "scope-empty"; await fxApi.openLink(); await click(cc.search); await sleep(300); },
  async techNone() { await S.pair!(); fx.techNames = []; await click(cc.technicians); await sleep(300); },
  async denied() { await S.pair!(); fx.denied = true; await click(cc.technicians); await sleep(500); },
  async offline() { await fxApi.openLink(); fx.offline = true; await click(cc.search); await sleep(400); },
  async busy() { await fxApi.openLink(); const rel = holdNext(/predecessor-candidates/); (window as any).__release = rel; await click(cc.search); await sleep(200); },
  async stale() { await S.capturePath!(); fx.stageConflict = true; await S.saveRecord!(); await sleep(300); },
  async correctionPrereq() { await S.correctionPath!(); },
  async bonlyList() { await click(cc.check).catch(() => {}); await sleep(300); },
  async bonlyChoose() { await sleep(500); await until(() => buttons(cc.usable.replace("{n}", "")).length); await click(cc.usable.replace("{n}", ""), 0); await sleep(150); },
};
(fxApi as any).S = S;
(window as any).__fx = fxApi;
function App() {
  return <AdminLocaleProvider initialLocale={locale}><div className="flex justify-end border-b px-6 py-2"><AdminLanguageSwitch /></div>
    <main id="main" className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8"><DiagnosticWorkspace key={`${ids.order}:${handoff ?? ""}`} initialOrder={ids.order} handoff={handoff} /></main></AdminLocaleProvider>;
}
makeImages().then(() => { createRoot(document.getElementById("root")!).render(<App />); (window as any).__ready = true; });
