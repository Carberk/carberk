import { MeasurementSchemas } from "@auto-tm/contracts";

import type { DeliveryResult } from "./MeasurementQueue";

/** Credentials are resolved at send time and never enter persisted event envelopes or logs. */
export class MeasurementHttpSender {
 private readonly endpoint: string;
 constructor(apiUrl: string, private readonly authorization: () => Promise<string | null>, private readonly now: () => number) {
  const url = new URL(apiUrl);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new Error("Invalid measurement origin");
  this.endpoint = `${url.toString().replace(/\/$/, "")}/measurement/events`;
 }
 async send(events: MeasurementSchemas.MeasurementEvent[], eligible: () => boolean): Promise<DeliveryResult> {
  if (!eligible()) return { kind: "permanent" };
  const batch = MeasurementSchemas.MeasurementBatchSchema.safeParse({ events });
  if (!batch.success) return { kind: "permanent" };
  const body = JSON.stringify(batch.data);
  if (body.length > MeasurementSchemas.MEASUREMENT_LIMITS.batchBytes) return { kind: "permanent" };
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   const authorization = await Promise.race([this.authorization(), new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 1000); })]);
   clearTimeout(timer);
   if (!authorization || !eligible()) return { kind: "permanent" };
   timer = setTimeout(() => abort.abort(), 5000);
   const response = await fetch(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: authorization },
    body, signal: abort.signal, credentials: "omit", redirect: "error" });
   if (!eligible()) return { kind: "permanent" };
   if (response.ok) return { kind: "accepted" };
   if (response.status === 408 || response.status === 429 || response.status >= 500) {
    const header = response.headers.get("Retry-After");
    const delay = header && /^\d+$/.test(header) ? Number(header) * 1000 : header ? Date.parse(header) - this.now() : 0;
    return Number.isFinite(delay) && delay > 0 ? { kind: "retry", retryAfterMs: Math.min(3600000, delay) } : { kind: "retry" };
   }
   return { kind: "permanent" };
  } catch { return { kind: "retry" }; }
  finally { clearTimeout(timer); }
 }
}
