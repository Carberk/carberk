import { z } from "zod";

import type { OperationsSnapshot } from "./Watchdog";

const incident = z.object({ openedAt: z.string().datetime(), lastObservedAt: z.string().datetime(), resolvedAt: z.string().datetime().nullable() }).strict();
export function restoreIncident(raw: string | null, now: Date) {
  if (!raw || Buffer.byteLength(raw) > 512) return null;
  try {
    const parsed = incident.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const data = parsed.data;
    const opened = Date.parse(data.openedAt), last = Date.parse(data.lastObservedAt);
    if (opened > last || last > now.getTime() || now.getTime() - last > 30 * 86_400_000
      || (data.resolvedAt !== null && (Date.parse(data.resolvedAt) < opened || Date.parse(data.resolvedAt) > last))) return null;
    return data;
  } catch { return null; }
}

/** Sends only incident transitions. Failures retry once per tick; no durable payload queue. */
export class AlertSink {
  private delivered: string | null = null;
  private pending = false;
  constructor(private readonly url: string | undefined, private readonly secret: string | undefined, private readonly request = fetch, private readonly receipts?: { read(): Promise<string | null>; save(transition: string): Promise<void> }) {}
  async publish(snapshot: OperationsSnapshot): Promise<boolean> {
    if (!this.url || !snapshot.incident) return false;
    const transition = `${snapshot.incident.openedAt}:${snapshot.incident.resolvedAt ?? "open"}`;
    if (this.pending || transition === this.delivered) return false;
    this.pending = true;
    try {
      if (this.receipts && await this.receipts.read() === transition) { this.delivered = transition; return false; }
      const response = await this.request(this.url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(3_000),
        headers: { "content-type": "application/json", ...(this.secret ? { authorization: `Bearer ${this.secret}` } : {}) },
        body: JSON.stringify({ version: 1, observedAt: snapshot.observedAt, incident: snapshot.incident,
          probes: { api: snapshot.api, collector: snapshot.collector, worker: snapshot.worker,
            disk: snapshot.disk?.state ?? "unknown", tls: snapshot.tls?.state ?? "unknown" } }) });
      await response.body?.cancel();
      if (!response.ok) return false;
      if (this.receipts) await this.receipts.save(transition);
      this.delivered = transition;
      return true;
    } catch { return false; } finally { this.pending = false; }
  }
}
