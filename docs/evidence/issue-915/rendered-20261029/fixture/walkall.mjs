import { writeFileSync, appendFileSync } from "node:fs";
const call = async a => { const r = await (await fetch("http://127.0.0.1:9444/", { method: "POST", body: JSON.stringify(a) })).json(); if (!r.ok) throw new Error(r.error); return r.out; };
const combos = [["capture-ready", "role=tech&scene=capture", "capturePath"], ["correct-form", "role=tech&scene=correct", "correctionFilled"], ["pair-decision", "role=reviewer&scene=capture", "decision"], ["pair-imgfail", "role=reviewer&scene=capture", "pairImageFail"], ["bonly-review", "role=tech&scene=capture&handoff=1", "bonlyReview"], ["bonly-lost", "role=tech&scene=capture&handoff=1", "bonlyLostChecked"]];
const res = [];
for (const [name, q, state] of combos) for (const theme of ["light", "dark"]) for (const w of [1280, 384]) for (const locale of ["en", "ru"]) {
  if (locale === "ru" && w === 1280 && theme === "dark") continue;
  await call({ op: "viewport", w, h: 900 }); await call({ op: "goto", url: `http://127.0.0.1:5917/?${q}&locale=${locale}&theme=${theme}` }); await call({ op: "viewport", w, h: 900 });
  await call({ op: "eval", expr: `(async()=>{await __fx.S.${state}();await __fx.S.startAtTop();return 1})()` });
  const stops = []; let seen = new Set();
  for (let i = 0; i < 260; i++) { await call({ op: "press", key: "Tab" }); const f = await call({ op: "eval", expr: "__fx.focusInfo()" }); if (f.el === "body") break; stops.push(f); }
  const bad = stops.filter(s => !s.focusVisible || s.outlineW < 2 || s.outlineVsPage < 3 || s.coveredBy || s.inViewport === false);
  // ignore native datetime sub-fields (internal picker): outline none + not focus-visible is inherited from the field
  const real = bad.filter(s => !/Authorized end|Разрешённый срок|Rugsat edilen/.test(s.el) || s.coveredBy);
  res.push({ name, theme, w, locale, stops: stops.length, minRatio: Math.min(...stops.filter(s => s.focusVisible).map(s => s.outlineVsPage)), weak: [...new Set(real.map(s => `${s.el.slice(0, 60)} | ${s.outline} | r=${s.outlineVsPage} | fv=${s.focusVisible}${s.coveredBy ? " COVERED " + s.coveredBy : ""}${s.inViewport === false ? " OFFVIEW" : ""}`))] });
  console.log(name, theme, w, locale, "stops", stops.length, "weak", new Set(real.map(s => s.el)).size);
}
writeFileSync("/tmp/issue915-render/out/walkall.json", JSON.stringify(res, null, 1));
