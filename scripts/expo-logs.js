#!/usr/bin/env node

const WebSocket = require("ws");

const METRO_HOST = "http://localhost:8081";
const EXPO_START_TIMEOUT = 15_000;

let pendingId = 1;
let formatMode = "pretty";

function cdp(ws, method, params = {}) {
  const id = pendingId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 10_000);
    const handler = (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id === id) {
          clearTimeout(timer);
          ws.off("message", handler);
          resolve(msg.result);
        }
      } catch (_) {}
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function getDebugTargets() {
  for (const port of [8081, 8097]) {
    try {
      const res = await fetch(`http://localhost:${port}/json/list`);
      if (res.ok) {
        const targets = await res.json();
        if (targets.length > 0) return { port, targets };
      }
    } catch (_) {}
  }
  return null;
}

function formatConsoleEvent(ev) {
  const { type, args, timestamp } = ev.params;
  const level = type;

  const values = args.map((arg) => {
    if (arg.type === "string") return arg.value;
    if (arg.type === "number") return arg.value;
    if (arg.type === "boolean") return String(arg.value);
    if (arg.type === "undefined") return "undefined";
    if (arg.type === "null") return "null";
    if (arg.objectId) return `<object:${arg.description || arg.className || "Object"}>`;
    return arg.description || arg.value || JSON.stringify(arg);
  });

  return { level, values, timestamp, raw: ev };
}

function formatExceptionEvent(ev) {
  const { exceptionDetails } = ev.params;
  return {
    level: "exception",
    text: exceptionDetails.text,
    lineNumber: exceptionDetails.lineNumber,
    columnNumber: exceptionDetails.columnNumber,
    url: exceptionDetails.url,
    stack: exceptionDetails.exception?.description || "",
    raw: ev,
  };
}

function prettyPrint(entry) {
  const ts = entry.timestamp ? new Date(entry.timestamp * 1000).toISOString().slice(11, 23) : "";
  if (entry.level === "exception") {
    console.error(`\n[${ts}] 🔴 EXCEPTION: ${entry.text}`);
    if (entry.stack) console.error(entry.stack);
    if (entry.url) console.error(`    at ${entry.url}:${entry.lineNumber}:${entry.columnNumber}`);
  } else {
    const prefix = { error: "🔴", warn: "🟡", info: "🔵", debug: "⚪" }[entry.level] || "📋";
    console.log(`[${ts}] ${prefix} ${entry.values.join(" ")}`);
  }
}

async function main() {
  const once = process.argv.includes("--once");
  if (process.argv.includes("--json")) formatMode = "json";

  console.error("[expo-logs] looking for Hermes inspector on localhost:8081...");

  const result = await getDebugTargets();
  if (!result) {
    console.error("[expo-logs] no debug targets found. Is Metro running? Run: pnpm --filter @auto-tm/mobile dev");
    process.exit(1);
  }

  const { port, targets } = result;
  const target = targets[0];
  const wsUrl = target.webSocketDebuggerUrl;

  console.error(`[expo-logs] connected to ${target.title} on ${target.deviceName || "device"}`);

  const ws = new WebSocket(wsUrl);

  ws.on("open", async () => {
    try {
      await cdp(ws, "Runtime.enable");

      try {
        await cdp(ws, "Log.enable");
      } catch (_) {}

      console.error("[expo-logs] streaming logs (Ctrl+C to stop)...\n");
    } catch (err) {
      console.error("[expo-logs] failed to enable CDP domains:", err.message);
      process.exit(1);
    }
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.method === "Runtime.consoleAPICalled") {
        const entry = formatConsoleEvent(msg);
        if (formatMode === "json") {
          console.log(JSON.stringify(entry));
        } else {
          prettyPrint(entry);
        }
        if (once && entry.level === "error") process.exit(0);
      }

      if (msg.method === "Runtime.exceptionThrown") {
        const entry = formatExceptionEvent(msg);
        if (formatMode === "json") {
          console.log(JSON.stringify(entry));
        } else {
          prettyPrint(entry);
        }
      }
    } catch (_) {}
  });

  ws.on("close", () => {
    console.error("[expo-logs] connection closed");
    process.exit(0);
  });

  ws.on("error", (err) => {
    console.error("[expo-logs] websocket error:", err.message);
    process.exit(1);
  });

  if (once) {
    setTimeout(() => process.exit(0), 3000);
  }
}

main().catch((err) => {
  console.error("[expo-logs] fatal:", err.message);
  process.exit(1);
});
