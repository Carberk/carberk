// CDP driver daemon: headless Google Chrome + tiny HTTP command API on 127.0.0.1:9444. Everything under /tmp.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = "/tmp/issue915-render/chrome-profile";
mkdirSync(PROFILE, { recursive: true });
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${PROFILE}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--force-device-scale-factor=1", "--hide-scrollbars=false", "--disable-background-networking", "about:blank"], { stdio: "ignore" });
writeFileSync("/tmp/issue915-render/chrome.pid", String(chrome.pid));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const events = [];
async function connect() {
  for (let i = 0; i < 60; i++) { try { const list = await (await fetch("http://127.0.0.1:9333/json")).json(); const page = list.find(t => t.type === "page"); if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; } } catch {} await sleep(250); }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); } else if (d.method) { if (d.method === "Page.javascriptDialogOpening") { send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {}); } events.push(d); if (events.length > 500) events.shift(); } };
}
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const keys = { Tab: [9, "Tab"], Enter: [13, "Enter"], Escape: [27, "Escape"], " ": [32, "Space"], ArrowDown: [40, "ArrowDown"], ArrowUp: [38, "ArrowUp"], ArrowLeft: [37, "ArrowLeft"], ArrowRight: [39, "ArrowRight"] };
async function press(key, mods = 0) {
  const [vk, code] = keys[key] ?? [key.toUpperCase().charCodeAt(0), "Key" + key.toUpperCase()];
  const text = key === "Enter" ? "\r" : key === " " ? " " : key.length === 1 ? key : undefined;
  await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mods, ...(text ? { text } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
}
async function ev(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: 20000 });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function mouse(x, y, kind) {
  if (kind === "move") return send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  if (kind === "down") { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); return send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); }
  if (kind === "up") return send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await mouse(x, y, "down"); await mouse(x, y, "up");
}
const ops = {
  async goto({ url }) { await send("Page.enable"); const p = send("Page.navigate", { url }); await p; for (let i = 0; i < 80; i++) { await sleep(100); try { if (await ev("window.__ready===true")) break; } catch {} } await sleep(300); return "ok"; },
  async viewport({ w, h, dpr = 1 }) { await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false }); await sleep(250); return "ok"; },
  async eval({ expr }) { return ev(expr); },
  async press({ key, mods = 0, n = 1 }) { for (let i = 0; i < n; i++) await press(key, mods); await sleep(60); return "ok"; },
  async type({ text }) { await send("Input.insertText", { text }); await sleep(40); return "ok"; },
  async shot({ path, full = false, clip }) {
    let params = { format: "png" };
    if (full) { const m = await send("Page.getLayoutMetrics"); const w = Math.ceil(m.cssContentSize.width), h = Math.ceil(m.cssContentSize.height); params = { ...params, captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.min(h, 16000), scale: 1 } }; }
    if (clip) params = { ...params, captureBeyondViewport: true, clip: { ...clip, scale: 1 } };
    const r = await send("Page.captureScreenshot", params); writeFileSync(path, Buffer.from(r.data, "base64")); return path;
  },
  async clickAt({ x, y }) { await mouse(x, y, "click"); await sleep(80); return "ok"; },
  async move({ x, y }) { await mouse(x, y, "move"); await sleep(60); return "ok"; },
  async down({ x, y }) { await mouse(x, y, "down"); await sleep(60); return "ok"; },
  async up({ x, y }) { await mouse(x, y, "up"); await sleep(60); return "ok"; },
  async scheme({ value }) { await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value }, { name: "prefers-reduced-motion", value: "no-preference" }] }); return "ok"; },
  async chooser({ path }) { // real <input type=file> chooser: intercept, then set files on the node the browser reports
    await send("Page.setInterceptFileChooserDialog", { enabled: true });
    return "armed";
  },
  async setFiles({ path }) { const e = [...events].reverse().find(x => x.method === "Page.fileChooserOpened"); if (!e) throw new Error("no chooser event"); await send("DOM.enable"); await send("DOM.setFileInputFiles", { files: [path], backendNodeId: e.params.backendNodeId }); await send("Page.setInterceptFileChooserDialog", { enabled: false }); return "set"; },
  async ax({ selector, keep }) {
    await send("DOM.enable"); await send("Accessibility.enable");
    const doc = await send("DOM.getDocument", { depth: -1 }); const q = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector });
    if (!q.nodeId) throw new Error("no node " + selector);
    const d = await send("DOM.describeNode", { nodeId: q.nodeId, depth: -1, pierce: true }); const ids = new Set(), order = new Map(); (function walk(n) { order.set(n.backendNodeId, order.size); ids.add(n.backendNodeId); (n.children ?? []).forEach(walk); })(d.node);
    const { nodes } = await send("Accessibility.getFullAXTree");
    const skip = new Set(["generic", "StaticText", "InlineTextBox", "none", "paragraph", "LineBreak", "ListMarker", "RootWebArea", "Section"]);
    return nodes.filter(n => !n.ignored && ids.has(n.backendDOMNodeId) && !skip.has(n.role?.value) && (!keep || keep.includes(n.role?.value))).sort((a, b) => order.get(a.backendDOMNodeId) - order.get(b.backendDOMNodeId)).map(n => { const props = {}; for (const p of n.properties ?? []) if (["disabled", "invalid", "required", "checked", "expanded", "focused", "level", "readonly", "pressed", "modal", "busy", "live", "atomic"].includes(p.name)) props[p.name] = p.value?.value; return `${n.role?.value}${props.level ? props.level : ""} "${(n.name?.value ?? "").slice(0, 110)}"${Object.keys(props).length ? " " + JSON.stringify(props) : ""}${n.description?.value ? " desc=\"" + n.description.value.slice(0, 80) + "\"" : ""}`; });
  },
  async events() { const r = events.splice(0); return r.map(e => e.method + " " + JSON.stringify(e.params).slice(0, 200)); },
  async quit() { chrome.kill(); setTimeout(() => process.exit(0), 200); return "bye"; },
};
await connect(); await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c; const { op, ...args } = body ? JSON.parse(body) : {};
  try { const out = await ops[op](args); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, out })); }
  catch (e) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: String(e.message ?? e) })); }
}).listen(9444, "127.0.0.1");
console.log("cdpd ready");
