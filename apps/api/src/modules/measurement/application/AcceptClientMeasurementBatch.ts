import { MeasurementSchemas } from "@auto-tm/contracts";

import type { MeasurementAuthority } from "../measurement.public";
import type { AcceptMeasurement } from "./AcceptMeasurement";

export interface MeasurementSubjectPort {
 /** Only this adapter resolves authenticated identity and server-owned eligibility metadata. */
 resolve(input: { authenticatedUserId?: string; guestCapability?: string }): Promise<MeasurementAuthority | null>;
}
export type BatchReceipt = "accepted" | "invalid" | "unauthorized" | "unavailable" | "limited";

/** Per-process caps supplement core ingress throttling; no raw credential becomes a rate key. */
export class AcceptClientMeasurementBatch {
 private window = 0;
 private total = 0;
 private readonly subjects = new Map<string, number>();
 constructor(private readonly identities: MeasurementSubjectPort, private readonly accept: AcceptMeasurement, private readonly now: () => number) {}
 async execute(body: unknown, credential: { authenticatedUserId?: string; guestCapability?: string }): Promise<BatchReceipt> {
  if (!credential.authenticatedUserId && (!credential.guestCapability || !/^mg_[A-Za-z0-9_-]{43}$/.test(credential.guestCapability))) return "unauthorized";
  const batch = MeasurementSchemas.MeasurementBatchSchema.safeParse(body);
  if (!batch.success || Buffer.byteLength(JSON.stringify(body), "utf8") > MeasurementSchemas.MEASUREMENT_LIMITS.batchBytes
   || batch.data.events.some((item) => !item.visitId || item.context.platform === "server" || MeasurementSchemas.EVENT_DICTIONARY[item.eventName].origin !== "client")) return "invalid";
  let authority: MeasurementAuthority | null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   authority = await Promise.race([this.identities.resolve(credential), new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Identity resolution unavailable")), 250);
   })]);
  } catch { return "unavailable"; }
  finally { clearTimeout(timer); }
  if (!authority || authority.origin !== "client") return "unauthorized";
  const window = Math.floor(this.now() / 60000);
  if (window !== this.window) { this.window = window; this.total = 0; this.subjects.clear(); }
  const key = authority.subject.pseudonym;
  const received = this.subjects.get(key) ?? 0;
  // Initial pilot caps. Multi-replica/distributed load proof remains an acceptance gate.
  if (this.total + batch.data.events.length > 1000 || received + batch.data.events.length > 120 || (!this.subjects.has(key) && this.subjects.size >= 1000)) return "limited";
  this.subjects.set(key, received + batch.data.events.length); this.total += batch.data.events.length;
  for (const event of batch.data.events) {
   const result = await this.accept.afterCommit(event, authority);
   if (result === "unavailable") return "unavailable";
   if (result === "invalid") return "invalid";
  }
  return "accepted";
 }
}
