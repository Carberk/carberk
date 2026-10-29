// usage: node run.mjs '<json array of jobs>'  | jobs: {id,q,locale,theme,w,h,state,subject,extra,full}
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
const call = async a => { const r = await (await fetch("http://127.0.0.1:9444/", { method: "POST", body: JSON.stringify(a) })).json(); if (!r.ok) throw new Error(r.error); return r.out; };
mkdirSync("/tmp/issue915-render/curated", { recursive: true });
const jobs = JSON.parse(process.argv[2]);
for (const j of jobs) {
  const t0 = Date.now();
  try {
    await call({ op: "viewport", w: j.w ?? 1280, h: j.h ?? 1000 });
    await call({ op: "goto", url: `http://127.0.0.1:5917/?${j.q}&locale=${j.locale ?? "en"}&theme=${j.theme ?? "light"}` });
    await call({ op: "viewport", w: j.w ?? 1280, h: j.h ?? 1000 });
    if (j.state) await call({ op: "eval", expr: `(async()=>{await __fx.S.${j.state}(${(j.stateArg === undefined ? "undefined" : JSON.stringify(j.stateArg))});return 1})()` });
    if (j.post) await call({ op: "eval", expr: j.post });
    const info = await call({ op: "eval", expr: `(async()=>{await __fx.sleep(200);return {audit:__fx.audit(),active:__fx.state().active,extra:${j.extra ? `await (async()=>{return ${j.extra}})()` : "null"}}})()` });
    let clip;
    if (j.subject && !j.full) clip = await call({ op: "eval", expr: `(()=>{const e=document.querySelector(${JSON.stringify(j.subject)});if(!e)return null;const r=e.getBoundingClientRect();const pad=16;const y=Math.max(0,r.top+scrollY-pad);return {x:0,y,width:document.documentElement.clientWidth,height:Math.min(${j.maxH ?? 3200},r.height+2*pad)}})()` });
    const png = `/tmp/issue915-render/curated/${j.id}.png`;
    await call({ op: "shot", path: png, ...(clip ? { clip } : { full: true }) });
    const rec = { id: j.id, job: j, ...info, ms: Date.now() - t0 };
    appendFileSync("/tmp/issue915-render/curated/results.jsonl", JSON.stringify(rec) + "\n");
    console.log(j.id, "fails=" + info.audit.failCount, "active=" + info.active, info.extra ? JSON.stringify(info.extra).slice(0, 200) : "");
  } catch (e) { console.log(j.id, "ERROR", String(e.message).slice(0, 300)); }
}
