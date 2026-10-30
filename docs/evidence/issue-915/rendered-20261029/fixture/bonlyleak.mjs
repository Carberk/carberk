import { writeFileSync } from "node:fs";
const call = async a => { const r = await (await fetch("http://127.0.0.1:9444/", { method: "POST", body: JSON.stringify(a) })).json(); if (!r.ok) throw new Error(r.error); return r.out; };
const res = {};
for (const locale of ["en", "ru", "tk"]) {
  await call({ op: "viewport", w: 1280, h: 900 }); await call({ op: "goto", url: `http://127.0.0.1:5917/?role=tech&scene=capture&handoff=1&locale=${locale}&theme=light` });
  const r = await call({ op: "eval", expr: `(async()=>{const f=__fx; await f.S.bonlyOpenResult(); const html=document.documentElement.innerHTML; const needles=["Prior visit A","registration plate bracket","XTA2109","11111111-1111-4111-8111-000000000006","11111111-1111-4111-8111-000000000008","11111111-1111-4111-8111-000000000030","11111111-1111-4111-8111-000000000032"]; return {aLeaks:needles.filter(n=>html.includes(n)), forbiddenRequests:f.fx.log.filter(l=>/comparison|continuity-proofs|predecessor|linking-technicians/.test(l)), writes:f.fx.writes.map(w=>w.path.split("/").slice(-2).join("/")), reportsPanel:document.querySelector("[data-panel=reports]").innerText.slice(0,160).replace(/\\n/g," | "), historyRow:[...document.querySelectorAll("dt")].some(d=>d.textContent===f.base.history)}})()` });
  res[locale] = r; console.log(locale, JSON.stringify(r));
}
writeFileSync("/tmp/issue915-render/out/bonlyleak.json", JSON.stringify(res, null, 1));
