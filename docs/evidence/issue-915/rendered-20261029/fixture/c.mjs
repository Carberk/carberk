// usage: node c.mjs op key=value ...   or   node c.mjs eval '<expr>'   (values JSON-parsed when possible)
const [op, ...rest] = process.argv.slice(2); const args = { op };
if (op === "eval") args.expr = rest.join(" ");
else for (const kv of rest) { const i = kv.indexOf("="); const k = kv.slice(0, i), v = kv.slice(i + 1); try { args[k] = JSON.parse(v); } catch { args[k] = v; } }
const r = await (await fetch("http://127.0.0.1:9444/", { method: "POST", body: JSON.stringify(args) })).json();
if (!r.ok) { console.error("ERR", r.error); process.exit(1); }
console.log(typeof r.out === "string" ? r.out : JSON.stringify(r.out, null, 1));
