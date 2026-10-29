import { writeFileSync } from "node:fs";
const call = async a => { const r = await (await fetch("http://127.0.0.1:9444/", { method: "POST", body: JSON.stringify(a) })).json(); if (!r.ok) throw new Error(r.error); return r.out; };
const [name, q, state, subject, locale = "en", theme = "light", w = "1280"] = process.argv.slice(2);
await call({ op: "viewport", w: +w, h: 900 }); await call({ op: "goto", url: `http://127.0.0.1:5917/?${q}&locale=${locale}&theme=${theme}` }); await call({ op: "viewport", w: +w, h: 900 });
await call({ op: "eval", expr: `(async()=>{await __fx.S.${state}();return 1})()` });
const keep = ["button", "textbox", "combobox", "checkbox", "link", "heading", "alert", "status", "group", "region", "img", "DisclosureTriangle", "spinbutton", "radio", "Details", "form"];
const rows = await call({ op: "ax", selector: subject, keep });
const path = `/tmp/issue915-render/out/ax/${name}__${locale}__${theme}.txt`; writeFileSync(path, rows.join("\n")); console.log(name, rows.length);
