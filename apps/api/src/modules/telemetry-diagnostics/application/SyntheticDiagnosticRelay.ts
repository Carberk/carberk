import { DiagnosticTelemetrySchemas as D } from "@auto-tm/contracts";
import type { StaffSubject } from "../../identity/identity.public";

export interface DiagnosticAdmission { enabled: boolean; sessionIds: readonly string[]; expiresAt: string; release: string; build: string; files?: readonly string[] }
export interface DiagnosticTransport { send(event: D.DiagnosticEvent): Promise<boolean> }
export type DiagnosticRelayResult = "denied" | "invalid" | "rate_limited" | "delivered" | "unavailable";
/** Only short-lived, operator-owned synthetic fixtures are admitted here. Real
 * collection needs a separate lifecycle/region admission, not a flag rename. */
export class SyntheticDiagnosticRelay {
 private minute = -1;
 private attempts = 0;
 private pending = 0;
 private readonly delivered = new Set<string>();
 constructor(private readonly config: DiagnosticAdmission, private readonly authorize: (subject: StaffSubject) => Promise<void>, private readonly transport: DiagnosticTransport, private readonly now: () => number = Date.now) {}
 private admitted(subject: StaffSubject): boolean {
  const remaining = Date.parse(this.config.expiresAt) - this.now();
  return this.config.enabled && this.config.sessionIds.includes(subject.sessionId) && remaining > 0 && remaining <= 86400_000;
 }
 async execute(subject: StaffSubject, value: unknown): Promise<DiagnosticRelayResult> {
  if (!this.admitted(subject)) return "denied";
  try { await this.authorize(subject); } catch { return "denied"; }
  const parsed = D.DiagnosticEventSchema.safeParse(value);
  if (!parsed.success || Buffer.byteLength(JSON.stringify(parsed.data)) > 16_384) return "invalid";
  const event = parsed.data, age = this.now() - Date.parse(event.timestamp);
  if (age < -5_000 || age > 300_000 || event.release !== this.config.release || event.dist !== this.config.build) return "invalid";
  if (event.exception.values.some(value => value.stacktrace.frames.some(frame => !this.config.files?.includes(frame.filename)))) return "invalid";
  const minute = Math.floor(this.now() / 60_000);
  if (minute !== this.minute) { this.minute = minute; this.attempts = 0; this.delivered.clear(); }
  if (!this.admitted(subject)) return "denied";
  if (this.delivered.has(event.event_id)) return "delivered";
  if (this.pending >= 2 || this.attempts >= 30) return "rate_limited";
  this.pending++; this.attempts++;
  try {
   const accepted = await this.transport.send(event);
   await this.authorize(subject);
   if (!this.admitted(subject)) return "denied";
   if (!accepted) return "unavailable";
   this.delivered.add(event.event_id); return "delivered";
  } catch { return "denied"; }
  finally { this.pending--; }
 }
}
