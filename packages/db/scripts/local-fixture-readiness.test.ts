import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

const cli = resolve(__dirname, "local-fixture-readiness.ts");
function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<{ code: number | null; output: string }>((done) => {
    const child = spawn(process.execPath, ["--import", "tsx", cli, ...args], {
      env: { PATH: process.env["PATH"], ...env },
    });
    let output = "";
    child.stdout.on("data", (data: Buffer) => { output += data.toString(); });
    child.stderr.on("data", (data: Buffer) => { output += data.toString(); });
    child.on("close", (code) => done({ code, output }));
  });
}

test("unsafe actual database target refuses before contacting even the local API, preserving the env file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "readiness-"));
  const envFile = join(dir, "api.env");
  let requests = 0;
  const api = createServer((_request, response) => { requests++; response.end(); });
  await new Promise<void>((done) => api.listen(0, "127.0.0.1", done));
  const port = (api.address() as { port: number }).port;
  const config = `APP_ENV=development\nNODE_ENV=development\nPORT=${port}\nREDIS_URL=redis://127.0.0.1:6379\nDATABASE_URL=postgresql://private:secret@production.example/app\nMINIO_ENDPOINT=http://127.0.0.1:9000\n`;
  await writeFile(envFile, config);
  try {
    for (const scenario of [
      { env: {}, args: ["--api-origin", `http://127.0.0.1:${port}`], message: "DATABASE_URL must use loopback" },
      { env: { APP_ENV: "production" }, args: ["--api-origin", `http://127.0.0.1:${port}`], message: "APP_ENV and NODE_ENV" },
      { env: {}, args: ["--api-origin", "https://production.example"], message: "--api-origin must use loopback" },
      { env: { DATABASE_URL: "postgresql://user:secret@localhost/app?host=production.example" }, args: ["--api-origin", `http://127.0.0.1:${port}`], message: "DATABASE_URL must not contain query" },
      { env: { DATABASE_URL: "postgresql://user:secret@localhost/app", MINIO_ENDPOINT: "http://production.example" }, args: ["--api-origin", `http://127.0.0.1:${port}`], message: "MINIO_ENDPOINT must use loopback" },
      { env: { DATABASE_URL: "postgresql://user:secret@localhost/app", REDIS_URL: "redis://production.example:6379" }, args: ["--api-origin", `http://127.0.0.1:${port}`], message: "REDIS_URL must use loopback" },
      { env: {}, args: ["--reset"], message: "Invalid arguments" },
    ]) {
      const result = await run([...scenario.args, "--env-file", envFile], scenario.env);
      expect(result.code).toBe(1);
      expect(result.output).toContain(scenario.message);
      expect(result.output).not.toMatch(/secret|production\.example|private/);
    }
    expect(requests).toBe(0);
    expect(await readFile(envFile, "utf8")).toBe(config);
  } finally {
    api.closeAllConnections();
    await new Promise<void>((done) => api.close(() => done()));
    await rm(dir, { recursive: true, force: true });
  }
});

// A PostgreSQL wire boundary, not a mock of the readiness implementation. It
// refuses writes and returns stored rows to the real pg client in a child CLI.
async function databaseBoundary(rows: Record<string, unknown>[][]) {
  const { createServer: tcpServer } = await import("node:net");
  let writes = 0;
  let readOnly = false;
  const message = (type: string, body: Buffer = Buffer.alloc(0)) => {
    const length = Buffer.alloc(4); length.writeInt32BE(body.length + 4);
    return Buffer.concat([Buffer.from(type), length, body]);
  };
  const server = tcpServer((socket) => {
    let buffer = Buffer.alloc(0);
    let startup = true;
    let sql = "";
    let current: Record<string, unknown>[] = [];
    let index = 0;
    const send = (type: string, body?: Buffer) => socket.write(message(type, body));
    const describe = () => {
      const fields = Object.keys(current[0] ?? { id: "" });
      const count = Buffer.alloc(2); count.writeInt16BE(fields.length);
      send("T", Buffer.concat([count, ...fields.map((field) => {
        const meta = Buffer.alloc(18);
        meta.writeInt32BE(field === "manifest" ? 114 : ["width", "height", "sortOrder", "durationMs"].includes(field) ? 23 : 25, 6); meta.writeInt16BE(-1, 10); meta.writeInt32BE(-1, 12);
        return Buffer.concat([Buffer.from(`${field}\0`), meta]);
      })]));
    };
    const execute = () => {
      for (const row of current) {
        const count = Buffer.alloc(2); count.writeInt16BE(Object.keys(row).length);
        send("D", Buffer.concat([count, ...Object.values(row).map((value) => {
          const bytes = value === null ? null : Buffer.from(typeof value === "object" ? JSON.stringify(value) : String(value));
          const length = Buffer.alloc(4); length.writeInt32BE(bytes?.length ?? -1);
          return bytes ? Buffer.concat([length, bytes]) : length;
        })]));
      }
      send("C", Buffer.from("SELECT\0"));
    };
    const select = () => {
      if (/^BEGIN.*READ ONLY$/.test(sql)) { readOnly = true; current = []; }
      else if (sql === "ROLLBACK") current = [];
      else if (/^SELECT\b/i.test(sql) && readOnly) current = rows[index++] ?? [];
      else { writes++; current = []; }
    };
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (startup) {
        if (buffer.length < 4 || buffer.length < buffer.readInt32BE()) return;
        buffer = buffer.subarray(buffer.readInt32BE()); startup = false;
        send("R", Buffer.alloc(4)); send("Z", Buffer.from("I"));
      }
      while (buffer.length >= 5 && buffer.length >= 1 + buffer.readInt32BE(1)) {
        const type = String.fromCharCode(buffer[0] ?? 0);
        const end = 1 + buffer.readInt32BE(1);
        const body = buffer.subarray(5, end); buffer = buffer.subarray(end);
        if (type === "Q") { sql = body.toString().replace(/\0$/, ""); select(); if (current.length) describe(); execute(); send("Z", Buffer.from("I")); }
        if (type === "P") { sql = body.subarray(1).toString().split("\0")[0] ?? ""; select(); send("1"); }
        if (type === "B") send("2");
        if (type === "D") describe();
        if (type === "E") execute();
        if (type === "S") send("Z", Buffer.from("T"));
        if (type === "X") socket.end();
      }
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { port: (server.address() as { port: number }).port, writes: () => writes,
    close: () => new Promise<void>((done) => server.close(() => done())) };
}

test("CLI reuses the baseline, checks real object HEAD responses, and fails actionably on missing media without writes", async () => {
  const { UI_FIXTURE } = await import("./ui-fixture");
  const users: { id: string }[] = UI_FIXTURE.userIds.map((id) => ({ id }));
  const listings = UI_FIXTURE.listings.map(({ id, sellerId }) => ({ id, sellerId, status: "active", deletedAt: null }));
  const photos = UI_FIXTURE.listings.flatMap((listing) => listing.photos.map((key, sortOrder) => ({ listingId: listing.id, key, sortOrder, width: 800, height: 600 })));
  const conversations = UI_FIXTURE.conversationIds.map((id) => ({ id }));
  const manifest = Object.fromEntries(["master", "cover:thumbnail", "cover:list", "cover:detail", "cover:fullscreen", "playlist:240", "segment:240:000.ts"].map((member) => [member, { key: `video/${member}`, sizeBytes: 12 }]));
  const videos = ["f1000000-0000-4000-8000-000000000100", "f1000000-0000-4000-8000-000000000101"].map((listingId) => ({ listingId, status: "Ready", state: "COMPLETED", bucket: "listing-videos", durationMs: 30000, width: 720, height: 1280, manifest }));
  const snapshot = JSON.stringify({ users, listings, photos, conversations, videos });
  const methods: string[] = [];
  let missing = false;
  let wrongSize = false;
  let ready = true;
  const api = createServer((request, response) => {
    methods.push(`${request.method} ${request.url}`);
    if (request.url === "/readyz") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ service: "api", status: ready ? "ready" : "not_ready", environment: "development", checks: { postgres: "ok", redis: "ok", minio: "ok" } }));
    } else { response.statusCode = missing ? 404 : 200; response.setHeader("Content-Length", wrongSize ? "11" : "12"); response.end(); }
  });
  await new Promise<void>((done) => api.listen(0, "127.0.0.1", done));
  const port = (api.address() as { port: number }).port;
  const dir = await mkdtemp(join(tmpdir(), "readiness-"));
  const envFile = join(dir, "api.env");
  const db = await databaseBoundary([users, listings, photos, conversations, videos]);
  const config = `APP_ENV=development\nNODE_ENV=test\nPORT=${port}\nREDIS_URL=redis://127.0.0.1:6379\nDATABASE_URL=postgresql://user:private@127.0.0.1:${db.port}/local\nMINIO_ENDPOINT=http://127.0.0.1:${port}\nMINIO_ACCESS_KEY=local\nMINIO_SECRET_KEY=private\nLISTING_VIDEO_UPLOADS_ENABLED=true\nLISTING_VIDEO_UPLOAD_TESTER_USER_IDS=" ${UI_FIXTURE.sellerId} "\nLISTING_VIDEO_VIEW_TESTER_USER_IDS=${UI_FIXTURE.sellerId}, ${UI_FIXTURE.buyerId}\n`;
  await writeFile(envFile, config);
  try {
    const scenarios = [
      { code: 0, message: "READY (local environment only)", setup: () => undefined },
      { code: 0, message: "READY (local environment only)", setup: () => undefined },
      { code: 1, message: "API readiness", setup: () => { ready = false; } },
      { code: 1, message: "Fixture Users missing", setup: () => { ready = true; users.pop(); } },
      { code: 1, message: "Fixture Listing", setup: () => { users.push({ id: UI_FIXTURE.userIds[5] ?? "" }); if (photos[0]) photos[0].key = "changed/original.webp"; } },
      { code: 1, message: "Ready video missing/incompatible", setup: () => { if (photos[0]) photos[0].key = "fixture/camry-beige-0/original.webp"; if (videos[0]) videos[0].status = "Processing"; } },
      { code: 1, message: "Photo objects missing/unavailable", setup: () => { if (videos[0]) videos[0].status = "Ready"; missing = true; } },
      { code: 1, message: "Ready-video objects missing/inconsistent", setup: () => { missing = false; wrongSize = true; } },
    ];
    for (const scenario of scenarios) {
      scenario.setup();
      const result = await run(["--api-origin", `http://127.0.0.1:${port}`, "--env-file", envFile]);
      expect(result.code, result.output).toBe(scenario.code);
      expect(result.output).toContain(scenario.message);
      expect(result.output).not.toContain("private");
    }
    wrongSize = false;
    const disabled = await run(["--api-origin", `http://127.0.0.1:${port}`, "--env-file", envFile], { LISTING_VIDEO_UPLOADS_ENABLED: "false" });
    expect(disabled.code).toBe(1);
    expect(disabled.output).toContain("Ready video access configuration missing");
    expect(db.writes()).toBe(0);
    expect(methods.some((method) => method.startsWith("HEAD /listing-videos/"))).toBe(true);
    expect(methods.every((method) => method === "GET /readyz" || method.startsWith("HEAD /listing-"))).toBe(true);
    expect(JSON.stringify({ users, listings, photos, conversations, videos })).toBe(snapshot);
    expect(await readFile(envFile, "utf8")).toBe(config);
  } finally {
    await db.close(); api.closeAllConnections();
    await new Promise<void>((done) => api.close(() => done()));
    await rm(dir, { recursive: true, force: true });
  }
});
