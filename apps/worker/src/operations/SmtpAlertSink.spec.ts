import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type TLSSocket } from "node:tls";

import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { operationsConfig } from "./OperationsConfig";
import { SmtpAlertSink } from "./SmtpAlertSink";
import type { OperationsSnapshot } from "./Watchdog";

const env = { OPERATIONS_ALERTS_ENABLED: "true", OPERATIONS_ALERT_TRANSPORT: "smtp",
  OPERATIONS_SMTP_USER: "tkmdevelopers@gmail.com", OPERATIONS_SMTP_APP_PASSWORD: "synthetic-password-only",
  OPERATIONS_SMTP_FROM: "tkmdevelopers@gmail.com", OPERATIONS_SMTP_TO: "bagtyyarkowusow.dev@gmail.com" };
const now = Date.parse("2026-10-18T00:00:00Z");
const snapshot = (): OperationsSnapshot => ({ version: 1, observedAt: new Date(now).toISOString(), api: "failing", collector: "healthy", worker: "healthy", queues: [],
  incident: { openedAt: new Date(now).toISOString(), lastObservedAt: new Date(now).toISOString(), resolvedAt: null } });
let dir: string, key: Buffer, cert: Buffer;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "carberk-smtp-"));
  await writeFile(join(dir, "openssl.conf"), "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost\n");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-config", join(dir, "openssl.conf"), "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  key = await readFile(join(dir, "key.pem")); cert = await readFile(join(dir, "cert.pem"));
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

async function smtp() {
  const commands: string[] = [], messages: string[] = [], sockets = new Set<TLSSocket>();
  let rejectRecipient = false, stall = false;
  const server = createServer({ key, cert }, socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => undefined);
    if (stall) return;
    socket.write("220 smtp.gmail.test ESMTP\r\n");
    let buffer = "", data: string[] | null = null;
    socket.on("data", chunk => {
      buffer += chunk.toString();
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") { messages.push(data.join("\r\n")); data = null; socket.write("250 2.0.0 accepted\r\n"); }
          else data.push(line);
          continue;
        }
        commands.push(line);
        if (line.startsWith("EHLO")) socket.write("250-smtp.gmail.test\r\n250 AUTH PLAIN\r\n");
        else if (line.startsWith("AUTH PLAIN")) socket.write("235 2.7.0 authenticated\r\n");
        else if (line.startsWith("MAIL FROM")) socket.write("250 2.1.0 OK\r\n");
        else if (line.startsWith("RCPT TO")) socket.write(rejectRecipient ? "550 5.1.1 synthetic-password-only private server error\r\n" : "250 2.1.5 OK\r\n");
        else if (line === "DATA") { data = []; socket.write("354 send message\r\n"); }
        else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  server.on("tlsClientError", () => undefined);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing fixture port");
  return { commands, messages, boundary: { host: "127.0.0.1", port: address.port, servername: "localhost", ca: cert, timeoutMs: 400 },
    reject: (value: boolean) => { rejectRecipient = value; }, stall: () => { stall = true; },
    close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
function receiptStore() {
  let value: string | null = null;
  return { read: async () => value, save: async (next: string) => { value = next; } };
}
function config() {
  const result = operationsConfig(env).smtp;
  if (!result) throw new Error("Missing SMTP config");
  return result;
}


it("delivers only allowlisted transitions over authenticated TLS and deduplicates across restart, including recovery", async () => {
  const server = await smtp(), receipts = receiptStore();
  const create = () => new SmtpAlertSink(config(), receipts, server.boundary);
  try {
    const state = snapshot();
    if (!state.incident) throw new Error("Missing fixture incident");
    Object.assign(state.incident, { private: "private-identity-token" });
    Object.assign(state, { private: "private-user-content" });
    expect(await create().publish(state, now)).toBe(true);
    expect(await create().publish(state, now + 30_000)).toBe(false);
    state.incident.resolvedAt = state.observedAt;
    expect(await create().publish(state, now + 60_000)).toBe(true);
    expect(await create().publish(state, now + 90_000)).toBe(false);
    expect(server.messages).toHaveLength(2);
    expect(server.commands.some(line => line.startsWith("AUTH PLAIN"))).toBe(true);
    expect(server.commands.filter(line => line.startsWith("RCPT TO"))).toEqual(Array(2).fill("RCPT TO:<bagtyyarkowusow.dev@gmail.com>"));
    expect(server.messages.join()).toContain("Carberk operational incident recovered");
    expect(server.messages.join()).not.toMatch(/private-|synthetic-password|attachment|hostname/i);
  } finally { await server.close(); }
});

it("persists bounded retries across restart, redacts recipient errors, and admits recovery after exhaustion", async () => {
  const server = await smtp(), receipts = receiptStore();
  const create = () => new SmtpAlertSink(config(), receipts, server.boundary);
  const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    server.reject(true);
    const state = snapshot();
    expect(await create().publish(state, now)).toBe(false);
    expect(await create().publish(state, now + 1)).toBe(false);
    expect(await create().publish(state, now + 30_000)).toBe(false);
    expect(await create().publish(state, now + 90_000)).toBe(false);
    expect(await create().publish(state, now + 300_000)).toBe(false);
    expect(server.commands.filter(line => line.startsWith("RCPT TO"))).toHaveLength(3);
    expect(logs).not.toHaveBeenCalled();
    server.reject(false);
    if (!state.incident) throw new Error("Missing fixture incident");
    state.incident.resolvedAt = state.observedAt;
    expect(await create().publish(state, now + 330_000)).toBe(true);
    expect(server.messages).toHaveLength(1);
  } finally { logs.mockRestore(); await server.close(); }
});

it("never authenticates before verified TLS and bounds a silent SMTP server", async () => {
  const server = await smtp(), receipts = receiptStore();
  try {
    const { ca: _ca, ...untrusted } = server.boundary;
    expect(_ca).toBeDefined();
    expect(await new SmtpAlertSink(config(), receipts, untrusted).publish(snapshot(), now)).toBe(false);
    const wrongHost = { ...server.boundary, servername: "wrong.example" };
    expect(await new SmtpAlertSink(config(), receiptStore(), wrongHost).publish(snapshot(), now)).toBe(false);
    expect(server.commands).toHaveLength(0);
    server.stall();
    const started = Date.now();
    expect(await new SmtpAlertSink(config(), receiptStore(), server.boundary).publish(snapshot(), now)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(server.commands).toHaveLength(0);
  } finally { await server.close(); }
});

it("fails closed on unavailable or malformed receipt storage and allows only one in-flight attempt", async () => {
  const server = await smtp();
  try {
    for (const receipts of [{ read: async () => { throw new Error("private database"); }, save: async () => undefined },
      { read: async () => "malformed", save: async () => undefined },
      { read: async () => null, save: async () => { throw new Error("private database"); } }]) {
      expect(await new SmtpAlertSink(config(), receipts, server.boundary).publish(snapshot(), now)).toBe(false);
    }
    expect(server.commands).toHaveLength(0);
    const sink = new SmtpAlertSink(config(), receiptStore(), server.boundary);
    expect(await Promise.all([sink.publish(snapshot(), now), sink.publish(snapshot(), now)])).toEqual([true, false]);
    expect(server.messages).toHaveLength(1);
  } finally { await server.close(); }
});
