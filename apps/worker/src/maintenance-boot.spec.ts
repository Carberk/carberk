import { spawn } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { expect, it, vi } from "vitest";

it("boots maintenance without application configuration and releases its listener on SIGTERM", async () => {
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, "127.0.0.1", done));
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("port reservation failed");
  const port = address.port;
  await new Promise<void>((done) => reservation.close(() => done()));

  const rootRequire = createRequire(resolve("../../package.json"));
  const child = spawn(process.execPath, ["--import", rootRequire.resolve("tsx"), "src/main.ts"], {
    // No DATABASE_URL, REDIS_URL, MINIO_* or inherited .env identity.
    env: { PATH: process.env["PATH"], NODE_ENV: "test", PHOTO_CONVERSION_MAINTENANCE: "true", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  let logs = "";
  child.stdout.on("data", (chunk: Buffer) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { logs += chunk.toString(); });
  const origin = `http://127.0.0.1:${port}`;
  try {
    await vi.waitFor(async () => {
      if (child.exitCode !== null) throw new Error(logs);
      const response = await fetch(`${origin}/readyz`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "maintenance", service: "worker", businessReady: false });
    }, { timeout: 5_000 });
    const response = await fetch(`${origin}/healthz`);
    expect(response.status).toBe(200);
    const malformedStatus = await new Promise<number>((done, reject) => {
      const req = request({ host: "127.0.0.1", port, path: "http://[" }, (res) => {
        res.resume();
        done(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    expect(malformedStatus).toBe(400);
    child.kill("SIGTERM");
    expect(await exited).toEqual([0, null]);
    await expect(fetch(`${origin}/healthz`)).rejects.toThrow();
    expect(logs).toContain("no queue consumers started");
    expect(logs).not.toContain("Worker started (BullMQ consumer)");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
  }
}, 10_000);
