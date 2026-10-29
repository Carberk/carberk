import { readFileSync, writeFileSync } from "node:fs";
const rs = readFileSync("out/results.jsonl", "utf8").trim().split("\n").map(l => JSON.parse(l));
const parts = r => { const [state, locale, theme, w] = r.id.split("__"); return { state, locale, theme, w: +w }; };
const kinds = {}; const byCombo = {}; const unique = new Map(); const overflow = []; let totalChecks = 0;
for (const r of rs) {
  const p = parts(r); totalChecks += r.audit.texts + r.audit.controls;
  for (const f of r.audit.fails) {
    const k = f.kind; kinds[k] = (kinds[k] || 0) + 1;
    const key = [k, p.theme, f.el?.replace(/#[\w-]+/g, "").replace(/\d+\/\d+$/, "").slice(0, 70) ?? ""].join("|");
    const cur = unique.get(key) ?? { kind: k, theme: p.theme, el: f.el, min: 99, n: 0, ex: r.id, fg: f.fg, bg: f.bg };
    cur.n++; const v = f.ratio ?? f.h ?? f.px ?? 0; if (f.ratio !== undefined && f.ratio < cur.min) { cur.min = f.ratio; cur.ex = r.id; cur.fg = f.fg ?? f.border; cur.bg = f.bg ?? f.parent; } unique.set(key, cur);
    if (/overflow|beyond-viewport/.test(k)) overflow.push({ id: r.id, ...f });
  }
}
const out = { jobs: rs.length, kinds, overflow: overflow.slice(0, 60), unique: [...unique.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.min - b.min) };
writeFileSync("out/agg.json", JSON.stringify(out, null, 1));
console.log("jobs", rs.length, JSON.stringify(kinds));
console.log("overflow entries", overflow.length);
for (const u of out.unique.filter(u => !/boundary|target-size/.test(u.kind)).slice(0, 80)) console.log(u.kind, u.theme, `n=${u.n}`, u.el?.slice(0, 70), u.min, u.fg, u.bg, u.ex);
