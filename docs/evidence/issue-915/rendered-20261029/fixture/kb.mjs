// Real-keyboard (CDP Input.dispatchKeyEvent) evidence. usage: node kb.mjs <suite> <theme> <locale> <width>
import { writeFileSync, mkdirSync } from "node:fs";
const [suite, theme = "light", locale = "en", width = "1280"] = process.argv.slice(2);
const call = async a => { const r = await (await fetch("http://127.0.0.1:9444/", { method: "POST", body: JSON.stringify(a) })).json(); if (!r.ok) throw new Error(r.error); return r.out; };
const ev = expr => call({ op: "eval", expr });
const press = (key, mods = 0, n = 1) => call({ op: "press", key, mods, n });
const type = text => call({ op: "type", text });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const focus = () => ev("__fx.focusInfo()");
const log = [];
const note = (step, data) => { log.push({ step, ...data }); console.log(step, JSON.stringify(data).slice(0, 400)); };
const OUT = "/tmp/issue915-render/out/kb"; mkdirSync(OUT, { recursive: true });
async function shot(name) { // viewport screenshot at the moment of focus; focused element centered
  await ev("(()=>{const e=document.activeElement;if(e&&e!==document.body)e.scrollIntoView({block:'center'});return 1})()"); await sleep(120);
  await call({ op: "shot", path: `${OUT}/${name}__${locale}__${theme}__${width}.png` });
}
async function go(q, state, arg) {
  await call({ op: "viewport", w: +width, h: 900 });
  await call({ op: "goto", url: `http://127.0.0.1:5917/?${q}&locale=${locale}&theme=${theme}` });
  await call({ op: "viewport", w: +width, h: 900 });
  if (state) await ev(`(async()=>{await __fx.S.${state}(${arg === undefined ? "undefined" : JSON.stringify(arg)});return 1})()`);
  await ev("__fx.S.startAtTop()"); await sleep(150);
}
/** Press Tab until predicate (page JS over document.activeElement) is true; record every stop. */
async function tabTo(pred, max = 120, shift = false) {
  const stops = [];
  for (let i = 0; i < max; i++) { await press("Tab", shift ? 8 : 0); const f = await focus(); stops.push(f); if (await ev(`(()=>{const el=document.activeElement;return !!(${pred})})()`)) return { found: true, n: i + 1, stops }; }
  return { found: false, n: max, stops };
}
const q = { tech: "role=tech&scene=capture", techCorrect: "role=tech&scene=correct", rev: "role=reviewer&scene=capture", bonly: "role=tech&scene=capture&handoff=1" };
const lab = key => `__fx.cc.${key}`;
const stopSummary = stops => stops.map(s => `${s.el}${s.focusVisible ? "" : " [!fv]"} ${s.outlineW ? "" : "[no-outline]"} r=${s.outlineVsPage ?? "-"}${s.coveredBy ? " COVERED:" + s.coveredBy : ""}${s.inViewport === false ? " [off-viewport]" : ""}`);

const suites = {
  async capture() {
    await go(q.tech, "captureEmpty");
    const t = await tabTo(`el.getAttribute('type')==='submit'`, 140);
    note("tab-order to submit (capture form, includes earlier controls)", { found: t.found, stops: t.n, order: stopSummary(t.stops) });
    const ringBad = t.stops.filter(s => s.focusVisible && (s.outlineVsPage < 3 || !s.outlineW)).map(s => s.el);
    note("focus-ring failures on tab path", { count: ringBad.length, ringBad });
    await shot("kb-capture-submit-focused", "[data-panel=visit]");
    await press("Enter"); await sleep(200); note("Enter on submit (blank form): focus lands on", { f: await focus(), summary: await ev("document.querySelector('form section[aria-label][tabindex]')?.textContent.slice(0,200)") });
    await shot("kb-capture-after-submit", "[data-panel=visit]");
    // Add identifier with keyboard
    const a = await tabTo(`el.textContent?.startsWith(${lab("add")})`, 80, true);
    note("shift-tab back to Add identifier", { found: a.found, n: a.n });
    await press("Enter"); await sleep(200); note("Enter on Add identifier: focus", { f: await focus() });
    await press("Tab"); note("Tab after new identifier heading", { f: (await focus()).el });
    await shot("kb-capture-added", "[data-panel=visit]");
    const s2 = await tabTo(`el.getAttribute('type')==='submit'`, 60);
    await press("Enter"); await sleep(250);
    note("Enter on submit with appended identifier", { f: (await focus()).el, summaryItems: await ev("[...document.querySelectorAll('form section[aria-label][tabindex] li')].map(l=>l.textContent.slice(0,80)).filter(t=>/ 2:/.test(t))") });
    await shot("kb-capture-after-submit-2", "[data-panel=visit]");
    // summary link via keyboard
    const sl = await tabTo(`el.tagName==='A' && el.closest('section[aria-label][tabindex]')`, 80, true);
    note("shift-tab to summary link", { found: sl.found, link: sl.stops.at(-1)?.el });
    await press("Enter"); await sleep(150); note("Enter on summary link moves focus to", { f: (await focus()).el, invalid: (await focus()).invalid, describedby: (await focus()).describedby });
    // Remove identifier 2 via keyboard
    const rm = await tabTo(`el.textContent?.startsWith(${lab("remove")}) && el.closest('fieldset')?.querySelector('legend')?.textContent?.endsWith(' 2')`, 80);
    note("tab to Remove identifier 2", { found: rm.found });
    await press("Enter"); await sleep(200); note("Enter on Remove: focus", { f: (await focus()).el });
  },
  async correction() {
    await go(q.techCorrect, "correctionPrereq");
    const t = await tabTo(`el.textContent?.startsWith(${lab("replacement")})`, 60);
    note("tab to replacement button", { found: t.found, n: t.n });
    await press("Enter"); await sleep(250); note("Enter on replacement: focus lands on", { f: await focus() });
    await shot("kb-correction-after-replacement", "[data-panel=visit]");
  },
  async pairImage() {
    const FAIL = "11111111-1111-4111-8111-000000000104";
    const opener = `el === [...document.querySelectorAll('li button[aria-labelledby]')].filter(b=>b.closest('li').querySelector('input[type=checkbox][aria-labelledby]'))[4]`;
    const RETRY = `(el.textContent||'').startsWith(__fx.cc.retryImage.split('{image}')[0].trim())`, RELOAD = `el.textContent===__fx.cc.reloadComparison`, BACK = `el.textContent===__fx.cc.backCandidates`;
    const fresh = async () => { await go(q.rev, "pair"); await ev(`(()=>{__fx.fx.failIds.add('${FAIL}');__fx.fx.failMode='http500';return 1})()`); };
    await fresh();
    const t = await tabTo(opener, 200); note("tab to image 5 opener", { found: t.found, n: t.n });
    await press("Enter"); await sleep(900); note("Enter on opener (image fails): focus", { f: await focus(), alert: await ev("[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent.slice(0,60))"), ack: await ev("document.querySelector('[id$=material]')?.textContent"), buttons: await ev("[...document.querySelectorAll('section[aria-labelledby] button')].map(b=>b.textContent.slice(0,40))") });
    await shot("kb-image-failure", "[data-panel=link]");
    const r = await tabTo(RETRY, 5); note("Tab -> Retry", { found: r.found, n: r.n });
    await press("Enter"); await sleep(900); note("Enter on Retry while server still fails: focus", { f: (await focus()).el, alerts: await ev("[...document.querySelectorAll('[role=alert]')].length") });
    await ev("__fx.fx.failIds.clear();__fx.fx.failTimes.clear();1");
    const r2 = await tabTo(RETRY, 6); await press("Enter"); await sleep(1000);
    note("Enter on Retry after server recovery: focus + status", { f: (await focus()).el, status: await ev("[...document.querySelectorAll('[role=status]')].map(e=>e.textContent.slice(0,60))"), ack: await ev("document.querySelector('[id$=material]')?.textContent"), issueButtonPresent: await ev("[...document.querySelectorAll('button')].some(b=>b.textContent===__fx.cc.issue)") });
    await shot("kb-image-ready", "[data-panel=link]");
    await fresh(); await ev("(async()=>{await __fx.S.openImage({index:4,wait:900});await __fx.S.startAtTop();return 1})()");
    const rl = await tabTo(RELOAD, 300); await press("Enter"); await sleep(1500);
    note("Enter on Reload comparison: focus", { found: rl.found, f: (await focus()).el, ack: await ev("document.querySelector('[id$=material]')?.textContent") });
    await fresh(); await ev("(async()=>{await __fx.S.openImage({index:4,wait:900});await __fx.S.startAtTop();return 1})()");
    const bk = await tabTo(BACK, 300); await press("Enter"); await sleep(700);
    note("Enter on Back to candidates: focus", { found: bk.found, f: (await focus()).el, pairGone: await ev("!document.querySelector('#continuity-side-a')") });
  },
  async bonly() {
    await go(q.bonly, "bonlyList");
    const t = await tabTo(`(el.textContent||'').startsWith(__fx.cc.usable.split('{n}')[0])`, 40); note("tab to first handoff row", { found: t.found, n: t.n, order: stopSummary(t.stops) });
    await press("Enter"); await sleep(250);
    await ev("document.querySelector('textarea')?.focus();1"); await type("line one"); await press("Enter"); await type("line two"); await sleep(100);
    note("Enter in textarea: newline, no submit", { value: await ev("document.querySelector('textarea').value"), writes: await ev("__fx.fx.writes.length") });
    const rv = await tabTo(`el.textContent===__fx.cc.reviewB`, 6); note("tab to Review", { found: rv.found, f: rv.stops.at(-1)?.el });
    await press("Enter"); await sleep(250); note("Enter on Review: focus", { f: (await focus()).el });
    await shot("kb-bonly-review", "[data-panel=link]");
    await ev("__fx.fx.loseExecute=true;1");
    const cs = await tabTo(`el.className.includes('bg-primary') && el.closest('section[role=region]')`, 6); await press("Enter"); await sleep(1000);
    note("Enter on consume with lost reply: focus + alert", { f: (await focus()).el, alerts: await ev("[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent.slice(0,90))"), writes: await ev("__fx.fx.writes.map(w=>w.path.split('/').slice(-1)[0])") });
    await shot("kb-bonly-lost", "[data-panel=link]");
    const ck = await tabTo(`el.textContent===${lab("status")}`, 80, true); await press("Enter"); await sleep(900);
    note("Check operation status: focus + buttons", { f: (await focus()).el, btns: await ev("[...document.querySelectorAll('[data-panel=link] button')].filter(b=>!b.disabled).map(b=>b.textContent.slice(0,40))") });
    const rt = await tabTo(`el.textContent===${lab("retryExact")}`, 6); note("Retry exact reachable", { found: rt.found });
    await press("Enter"); await sleep(1000); note("Enter on Retry exact: focus + writes", { f: (await focus()).el, writes: await ev("__fx.fx.writes.map(w=>w.path.split('/').slice(-1)[0])"), result: await ev("[...document.querySelectorAll('button')].some(b=>b.textContent===__fx.cc.result)") });
  },
  async disclosure() {
    await go(q.tech, "captureSave");
    const t = await tabTo(`el.tagName==='SUMMARY'`, 80); note("summary focus", { found: t.found, f: t.stops.at(-1) });
    await shot("kb-summary-focused", "[data-panel=visit]");
    await press("Enter"); await sleep(120); note("Enter toggles details", { open: await ev("document.activeElement.parentElement.open") });
    await press(" "); await sleep(120); note("Space toggles details", { open: await ev("document.activeElement.parentElement.open") });
  },
  async hover() {
    await go(q.tech, "captureEmpty");
    const out = {};
    for (const [name, sel] of [["secondary", "button.min-h-11:not(.bg-primary)"], ["primary", "button.bg-primary"]]) {
      const pos = await ev(`(()=>{const b=[...document.querySelectorAll('${sel}')].find(b=>b.getBoundingClientRect().height>0 && !b.disabled);b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,label:b.textContent}})()`);
      const base = await ev(`(()=>{const b=[...document.querySelectorAll('${sel}')].find(b=>b.getBoundingClientRect().height>0 && !b.disabled);return __fx.contrastOf(b)})()`);
      await call({ op: "move", x: pos.x, y: pos.y }); const hov = await ev(`(()=>{const b=document.elementFromPoint(${pos.x},${pos.y}).closest('button');return __fx.contrastOf(b)})()`);
      await call({ op: "down", x: pos.x, y: pos.y }); const prs = await ev(`(()=>{const b=document.elementFromPoint(${pos.x},${pos.y}).closest('button');return __fx.contrastOf(b)})()`); await call({ op: "move", x: 2, y: 2 }); await call({ op: "up", x: 2, y: 2 });
      out[name] = { label: pos.label, rest: base, hover: hov, pressed: prs };
    }
    note("hover/pressed contrast", out);
  },
};
await suites[suite]();
writeFileSync(`${OUT}/${suite}__${locale}__${theme}__${width}.json`, JSON.stringify(log, null, 1));
