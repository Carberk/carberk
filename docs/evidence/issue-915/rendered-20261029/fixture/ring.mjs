import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const call = async a => { const r = await (await fetch("http://127.0.0.1:9444/", { method: "POST", body: JSON.stringify(a) })).json(); if (!r.ok) throw new Error(r.error); return r.out; };
mkdirSync("/tmp/issue915-render/out/ring", { recursive: true });
const targets = [
 ["summary", "role=tech&scene=capture", "captureSave", `el.tagName==='SUMMARY'`],
 ["checkbox", "role=reviewer&scene=capture", "pairImagesOpen", `el.type==='checkbox'`],
 ["textarea", "role=tech&scene=capture", "captureEmpty", `el.tagName==='TEXTAREA'`],
 ["primary-button", "role=tech&scene=capture", "captureEmpty", `el.tagName==='BUTTON' && el.className.includes('bg-primary')`],
 ["secondary-button-legacy", "role=tech&scene=capture", "captureEmpty", `el.tagName==='BUTTON' && el.textContent===__fx.cc.loadIdentity`],
 ["language-select", "role=tech&scene=capture", "captureEmpty", `el.tagName==='SELECT'`],
 ["programmatic-heading", "role=reviewer&scene=capture", "pairImageFail", `false`],
];
const rows = [];
for (const theme of ["light", "dark"]) for (const [name, q, state, pred] of targets) {
  await call({ op: "viewport", w: 1280, h: 900 }); await call({ op: "goto", url: `http://127.0.0.1:5917/?${q}&locale=en&theme=${theme}` }); await call({ op: "viewport", w: 1280, h: 900 });
  await call({ op: "eval", expr: `(async()=>{await __fx.S.${state}();await __fx.S.startAtTop();return 1})()` });
  if (name === "programmatic-heading") { /* focus already on recovery heading */ }
  else { let ok = false; for (let i = 0; i < 200 && !ok; i++) { await call({ op: "press", key: "Tab" }); ok = await call({ op: "eval", expr: `(()=>{const el=document.activeElement;return !!(${pred})})()` }); } if (!ok) { console.log(name, theme, "NOT FOUND"); continue; } }
  const g = await call({ op: "eval", expr: `(()=>{const el=document.activeElement;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();const pb=__fx.focusInfo();return {x:r.left,y:r.top,w:r.width,h:r.height,info:pb}})()` });
  const m = 10, clip = { x: Math.max(0, g.x - m), y: Math.max(0, g.y - m), width: Math.min(g.w, 400) + 2 * m, height: g.h + 2 * m };
  const path = `/tmp/issue915-render/out/ring/${name}__${theme}.png`; await call({ op: "shot", path, clip: { ...clip, y: clip.y + (await call({ op: "eval", expr: "scrollY" })) } });
  const py = `
from PIL import Image
im=Image.open("${path}").convert("RGB"); W,H=im.size; bg=im.getpixel((1,1)); m=${m}
def lin(v):
    s=v/255; return s/12.92 if s<=0.03928 else ((s+0.055)/1.055)**2.4
def L(c): return 0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2])
def ratio(a,b):
    x,y=L(a),L(b); return (max(x,y)+0.05)/(min(x,y)+0.05)
best=0; cnt=0
for x in range(W):
  for y in range(H):
    inside = (x>=m and x<W-m and y>=m and y<H-m)
    if inside: continue
    r=ratio(im.getpixel((x,y)),bg)
    if r>1.1: cnt+=1
    best=max(best,r)
print(round(best,2),cnt)`;
  const out = execFileSync("python3", ["-c", py]).toString().trim().split(" ");
  rows.push({ name, theme, computed: g.info.outline, computedRatio: g.info.outlineVsPage, renderedMaxRingContrast: +out[0], ringPixels: +out[1] });
  console.log(name, theme, g.info.outline, "computed", g.info.outlineVsPage, "pixel-max", out[0], "ringpx", out[1]);
}
writeFileSync("/tmp/issue915-render/out/ring.json", JSON.stringify(rows, null, 1));
