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

test("rich mapping and worker config are required before any API request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "readiness-rich-"));
  const envFile = join(dir, "api.env");
  const workerFile = join(dir, "worker.env");
  let requests = 0;
  const api = createServer((_request, response) => { requests++; response.end(); });
  await new Promise<void>((done) => api.listen(0, "127.0.0.1", done));
  const port = (api.address() as { port: number }).port;
  const config = `APP_ENV=development\nNODE_ENV=test\nPORT=${port}\nDATABASE_URL=postgresql://user:private@127.0.0.1:5432/local\nREDIS_URL=redis://127.0.0.1:6379\nMINIO_ENDPOINT=http://127.0.0.1:9000\nMINIO_PUBLIC_URL=http://127.0.0.1:9000\nMINIO_ACCESS_KEY=local\nMINIO_SECRET_KEY=private\nLISTING_VIDEO_API_ORIGIN=http://127.0.0.1:${port}\nLISTING_VIDEO_UPLOADS_ENABLED=true\nLISTING_VIDEO_UPLOAD_TESTER_USER_IDS=seller\nLISTING_VIDEO_VIEW_TESTER_USER_IDS=seller\n`;
  await writeFile(envFile, config);
  await writeFile(workerFile, config);
  const base = ["--api-origin", `http://127.0.0.1:${port}`, "--env-file", envFile];
  const mapping = ["--owner-id", "seller", "--viewer-id", "viewer", "--worker-env", workerFile];
  try {
    for (const scenario of [
      { args: [], message: "--owner-id" },
      { args: ["--owner-id", "seller"], message: "--viewer-id" },
      { args: ["--owner-id", "seller", "--viewer-id", "viewer"], message: "--worker-env" },
      { args: mapping, env: { LISTING_VIDEO_UPLOADS_ENABLED: "false" }, message: "LISTING_VIDEO_UPLOADS_ENABLED" },
      { args: mapping, env: { LISTING_VIDEO_VIEW_TESTER_USER_IDS: "other" }, message: "mapping" },
      { args: [...mapping, "--mode", "apply"], message: "Invalid arguments" },
      { args: [...mapping, "--plan-hash", "private"], message: "Invalid arguments" },
    ]) {
      const result = await run([...base, ...scenario.args], scenario.env);
      expect(result.code, result.output).toBe(1);
      expect(result.output).toContain(scenario.message);
      expect(result.output).not.toContain("private");
    }
    await writeFile(workerFile, `${config}\nNODE_ENV=production`);
    const remoteWorker = await run([...base, ...mapping]);
    expect(remoteWorker.code).toBe(1);
    expect(remoteWorker.output).toContain("Worker APP_ENV and NODE_ENV");
    await writeFile(workerFile, config);
    expect(requests).toBe(0);
    expect(await readFile(envFile, "utf8")).toBe(config);
    expect(await readFile(workerFile, "utf8")).toBe(config);
  } finally {
    api.closeAllConnections();
    await new Promise<void>((done) => api.close(() => done()));
    await rm(dir, { recursive: true, force: true });
  }
});
