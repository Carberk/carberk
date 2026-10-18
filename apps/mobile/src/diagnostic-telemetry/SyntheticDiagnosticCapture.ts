import { DiagnosticTelemetrySchemas as D } from "@auto-tm/contracts";

export interface SyntheticDiagnosticSession { generation: string; expiresAt: number; authorization: string }
export type SyntheticCaptureResult = "disabled" | "denied" | "invalid" | "rate_limited" | "delivered" | "unavailable";
/** Manual synthetic capture only. No raw disk cache, global error listener,
 * native SDK initialization or automatic retry is installed by this class. */
export class SyntheticDiagnosticCapture {
 private readonly endpoint: string;
 private epoch = 0;
 private stopped = false;
 private readonly pending = new Set<AbortController>();
 constructor(origin: string, private readonly current: () => Promise<SyntheticDiagnosticSession | null>, private readonly now: () => number = Date.now, private readonly enabled = false) {
  let url: URL; try { url = new URL(origin); } catch { throw new Error("Invalid diagnostic origin"); }
  if (url.username || url.password || url.search || url.hash || !["", "/", "/api/v1", "/api/v1/"].includes(url.pathname) || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new Error("Invalid diagnostic origin");
  this.endpoint = `${url.origin}/api/v1/diagnostic-telemetry/events`;
 }
 /** Logout, deletion or synthetic admission withdrawal aborts old delivery. */
 reset(): void { this.stopped = true; this.epoch++; for (const controller of this.pending) controller.abort(); }
 private async session(): Promise<SyntheticDiagnosticSession | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([this.current(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1_000); })]); }
  finally { clearTimeout(timer); }
 }
 async capture(raw: unknown, context: D.DiagnosticCaptureContext, generation: string): Promise<SyntheticCaptureResult> {
  if (!this.enabled) return "disabled";
  if (this.stopped) return "denied";
  const event = D.buildSyntheticDiagnostic(raw, context); if (!event) return "invalid";
  const body = JSON.stringify(event); if (body.length > 16_384) return "invalid";
  if (this.pending.size >= 2) return "rate_limited";
  const controller = new AbortController(), epoch = this.epoch; this.pending.add(controller);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const eligible = (session: SyntheticDiagnosticSession | null) => !!session && !this.stopped && epoch === this.epoch && session.generation === generation && session.expiresAt > this.now() && session.expiresAt <= this.now() + 86400_000;
  try {
   const session = await this.session(); if (!eligible(session) || !session?.authorization) return "denied";
   timer = setTimeout(() => controller.abort(), 3_000);
   const response = await fetch(this.endpoint, { method: "POST", body, credentials: "omit", redirect: "error", signal: controller.signal,
    headers: { "Content-Type": "application/json", Authorization: session.authorization } });
   // Receipt is status-only; never read collector/error response contents.
   controller.abort();
   if (!eligible(await this.session())) return "denied";
   return response.status === 202 ? "delivered" : response.status === 401 || response.status === 403 ? "denied" : "unavailable";
  } catch { return this.stopped || epoch !== this.epoch ? "denied" : "unavailable"; }
  finally { clearTimeout(timer); this.pending.delete(controller); }
 }
}
