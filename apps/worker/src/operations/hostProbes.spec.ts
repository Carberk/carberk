import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:tls";

import { afterAll, describe, expect, it } from "vitest";

import { DiskProbe, tlsExpiryProbe } from "./hostProbes";

const dirs: string[] = [], servers: Server[] = [];
afterAll(async () => {
 await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
 await Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true })));
});
async function certificate(days: number) {
 const dir = await mkdtemp(join(tmpdir(), "carberk-tls-probe-")); dirs.push(dir);
 await writeFile(join(dir, "openssl.conf"), "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost\n");
 execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", String(days), "-config", join(dir, "openssl.conf"), "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
 const key = await readFile(join(dir, "key.pem")), cert = await readFile(join(dir, "cert.pem"));
 const server = createServer({ key, cert }, socket => socket.end()); servers.push(server);
 server.listen(0, "127.0.0.1"); await once(server, "listening");
 const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing synthetic TLS listener");
 return { url: `https://localhost:${address.port}/readyz`, cert };
}
describe("bounded host capacity and TLS probes", () => {
 it("reports only the explicitly monitored disk and fails below ten percent free", async () => {
  expect(await new DiskProbe(undefined).check()).toEqual({ state: "unknown", freeRatio: null });
  expect(await new DiskProbe("/watched", async () => ({ blocks: 1000n, bavail: 99n })).check()).toEqual({ state: "failing", freeRatio: .099 });
  expect(await new DiskProbe("/watched", async () => ({ blocks: 1000n, bavail: 100n })).check()).toEqual({ state: "healthy", freeRatio: .1 });
  expect(await new DiskProbe("/watched", async () => { throw new Error("private filesystem path"); }).check()).toEqual({ state: "unknown", freeRatio: null });
 });
 it("validates the actual peer and distinguishes a one-day certificate from thirty days", async () => {
  const short = await certificate(1), long = await certificate(30);
  expect((await tlsExpiryProbe(short.url, new Date(), short.cert)).state).toBe("failing");
  expect((await tlsExpiryProbe(long.url, new Date(), long.cert)).state).toBe("healthy");
  expect(await tlsExpiryProbe(short.url, new Date())).toEqual({ state: "failing", expiresAt: null });
  expect(await tlsExpiryProbe("http://localhost/readyz", new Date())).toEqual({ state: "unknown", expiresAt: null });
 });
});
