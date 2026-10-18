import { connect, type TLSSocket } from "node:tls";

import nodemailer from "nodemailer";
import { z } from "zod";

import type { OperationalSmtpConfig } from "./OperationsConfig";
import type { OperationsSnapshot } from "./Watchdog";

const receiptSchema = z.object({
  transition: z.string().max(100), attempts: z.number().int().min(1).max(3),
  nextAttemptAt: z.number().int().nonnegative(), delivered: z.boolean(),
}).strict();

interface Receipts { read(): Promise<string | null>; save(value: string): Promise<void> }
interface SmtpBoundary { host: string; port: number; servername: string; ca?: Buffer; timeoutMs: number }
const probe = (value: unknown) => value === "healthy" || value === "failing" ? value : "unknown";

/** One incident transition at a time, three persisted attempts, no payload queue or provider error output. */
export class SmtpAlertSink {
  private pending = false;
  constructor(private readonly config: OperationalSmtpConfig, private readonly receipts: Receipts,
    private readonly boundary: SmtpBoundary = { host: config.host, port: config.port, servername: config.host, timeoutMs: 3_000 }) {}

  async publish(snapshot: OperationsSnapshot, now = Date.now()): Promise<boolean> {
    if (this.pending || !snapshot.incident) return false;
    const { openedAt, lastObservedAt, resolvedAt } = snapshot.incident;
    // Pick fields individually. Neither incident extensions nor other snapshot data may enter mail.
    if (![openedAt, lastObservedAt, snapshot.observedAt, ...(resolvedAt ? [resolvedAt] : [])]
      .every(value => typeof value === "string" && value.length <= 30 && Number.isFinite(Date.parse(value)))) return false;
    const transition = `${openedAt}:${resolvedAt ?? "open"}`;
    this.pending = true;
    try {
      const raw = await this.receipts.read();
      if (raw !== null && Buffer.byteLength(raw) > 512) return false;
      const prior = raw === null ? null : receiptSchema.parse(JSON.parse(raw));
      const current = prior?.transition === transition ? prior : null;
      if (current && (current.delivered || current.attempts >= 3 || now < current.nextAttemptAt)) return false;
      const attempts = (current?.attempts ?? 0) + 1;
      const receipt = { transition, attempts, nextAttemptAt: now + 30_000 * 2 ** (attempts - 1), delivered: false };
      // Reserve the attempt before egress. Storage failure must not permit unbounded sends after restart.
      await this.receipts.save(JSON.stringify(receipt));
      const text = JSON.stringify({ version: 1, observedAt: snapshot.observedAt, incident: { openedAt, lastObservedAt, resolvedAt },
        probes: { api: probe(snapshot.api), collector: probe(snapshot.collector), worker: probe(snapshot.worker),
          disk: probe(snapshot.disk?.state), tls: probe(snapshot.tls?.state) } });
      await this.send(text, resolvedAt !== null, openedAt, resolvedAt);
      await this.receipts.save(JSON.stringify({ ...receipt, delivered: true }));
      return true;
    } catch { return false; } finally { this.pending = false; }
  }

  private async send(text: string, recovered: boolean, openedAt: string, resolvedAt: string | null): Promise<void> {
    let socket: TLSSocket | undefined;
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { host, port, servername, ca, timeoutMs } = this.boundary;
    const transport = nodemailer.createTransport({
      host, port, secure: true, requireTLS: true, logger: false, debug: false,
      name: "watchdog.carberk.invalid", disableFileAccess: true, disableUrlAccess: true,
      connectionTimeout: timeoutMs, greetingTimeout: timeoutMs, socketTimeout: timeoutMs, dnsTimeout: timeoutMs,
      auth: { user: this.config.user, pass: this.config.password },
      tls: { rejectUnauthorized: true, minVersion: "TLSv1.2", servername, ...(ca ? { ca } : {}) },
      // Own the socket so the absolute deadline also ends a slow SMTP transaction, including DATA.
      getSocket: (_options, callback) => {
        if (expired) { callback(new Error("Operational SMTP timeout")); return; }
        let returned = false;
        socket = connect({ host, port, servername, ca, rejectUnauthorized: true, minVersion: "TLSv1.2" });
        socket.once("error", () => {
          if (!returned) { returned = true; callback(new Error("Operational SMTP unavailable")); }
        });
        socket.once("secureConnect", () => {
          if (returned || expired || !socket?.authorized) { socket?.destroy(); return; }
          returned = true;
          callback(null, { connection: socket, secured: true });
        });
      },
    });
    try {
      await Promise.race([
        transport.sendMail({ from: this.config.from, to: this.config.to,
          envelope: { from: this.config.from, to: [this.config.to] },
          subject: `Carberk operational incident ${recovered ? "recovered" : "opened"}`,
          // Stable across ambiguous retries. SMTP acceptance is not an inbox receipt or exactly-once delivery.
          messageId: `<operations.${Date.parse(openedAt)}.${resolvedAt ? Date.parse(resolvedAt) : "open"}@carberk.invalid>`,
          text, date: new Date(openedAt), disableFileAccess: true, disableUrlAccess: true }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { expired = true; socket?.destroy(); reject(new Error("Operational SMTP timeout")); }, timeoutMs);
        }),
      ]);
    } finally {
      expired = true;
      clearTimeout(timer);
      socket?.destroy();
      transport.close();
    }
  }
}
