import { MeasurementSchemas } from "@auto-tm/contracts";
export interface MeasurementEligibility { generation: string; purposes: MeasurementSchemas.MeasurementPurpose[] }
export type DeliveryResult = { kind: "accepted" | "permanent" } | { kind: "retry"; retryAfterMs?: number };
export interface MeasurementBuffer { generation: string; events: MeasurementSchemas.MeasurementEvent[]; attempts: number; retryAt: number }
export interface MeasurementQueuePorts {
 now(): number; random(): number;
 read(): Promise<unknown>; write(value: MeasurementBuffer | null): Promise<void>;
 send(events: MeasurementSchemas.MeasurementEvent[], stillEligible: () => boolean): Promise<DeliveryResult>;
}
/** No timers, credentials or global listeners. The host schedules flush outside core actions. */
export class MeasurementQueue {
 private readonly dropped = { disabled: 0, invalid: 0, capacity: 0, expired: 0, permanent: 0, retry_exhausted: 0 };
 metrics(): Readonly<typeof this.dropped> { return { ...this.dropped }; }
 private eligibility: MeasurementEligibility | null = null;
 private epoch = 0;
 private events: MeasurementSchemas.MeasurementEvent[] = [];
 private attempts = 0;
 private retryAt = 0;
 private hydrated = false;
 private inFlight: Promise<void> | null = null;
 constructor(private readonly ports: MeasurementQueuePorts) {}

 setEligibility(value: MeasurementEligibility | null): void {
  const next = value && /^[A-Za-z0-9_-]{1,128}$/.test(value.generation) ? value : null;
  if (JSON.stringify(next) === JSON.stringify(this.eligibility)) return;
  this.epoch++; this.eligibility = next ? { generation: next.generation, purposes: [...next.purposes] } : null;
  this.events = []; this.attempts = 0; this.retryAt = 0;
  // The next flush checks the persisted generation before reading any events.
  this.hydrated = false;
 }

 emit(event: MeasurementSchemas.MeasurementEvent): void {
  if (!this.eligibility) { this.dropped.disabled++; return; }
  const parsed = MeasurementSchemas.MeasurementEventSchema.safeParse(event);
  if (!parsed.success || !this.allowed(parsed.data)) { this.dropped.invalid++; return; }
  if (this.events.some((item) => item.eventId === parsed.data.eventId)) return;
  this.events.push(parsed.data);
  this.trim();
 }

 flush(): Promise<void> {
  if (this.inFlight) return this.inFlight;
  this.inFlight = this.deliver().catch(() => { /* Telemetry never rejects into core flows. */ }).finally(() => { this.inFlight = null; });
  return this.inFlight;
 }

 private allowed(event: MeasurementSchemas.MeasurementEvent): boolean {
  const time = Date.parse(event.occurredAt), now = this.ports.now();
  return !!this.eligibility?.purposes.includes(event.purpose)
   && MeasurementSchemas.EVENT_DICTIONARY[event.eventName].origin === "client"
   && time <= now + MeasurementSchemas.MEASUREMENT_LIMITS.futureSkewMs
   && time >= now - MeasurementSchemas.MEASUREMENT_LIMITS.queueAgeMs;
 }

 private trim(): void {
  const before = this.events.length;
  this.events = this.events.filter((item) => this.allowed(item));
  this.dropped.expired += before - this.events.length;
  while (this.events.length > MeasurementSchemas.MEASUREMENT_LIMITS.queueEvents
   || JSON.stringify(this.events).length > MeasurementSchemas.MEASUREMENT_LIMITS.queueBytes - 512) { this.events.shift(); this.dropped.capacity++; }
 }

 private async bounded<T>(operation: Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Measurement unavailable")), timeout); })]); }
  finally { clearTimeout(timer); }
 }

 private async persist(epoch: number): Promise<void> {
  if (epoch !== this.epoch) return;
  const value = this.eligibility && this.events.length ? {
   generation: this.eligibility.generation, events: this.events, attempts: this.attempts, retryAt: this.retryAt,
  } : null;
  try { await this.bounded(this.ports.write(value), 1000); } catch { /* Memory stays bounded when disk fails. */ }
 }

 private async deliver(): Promise<void> {
  const epoch = this.epoch;
  if (!this.hydrated) {
   let stored: unknown;
   try { stored = await this.bounded(this.ports.read(), 1000); } catch { stored = null; }
   if (epoch !== this.epoch) return;
   this.hydrated = true;
   if (stored && typeof stored === "object" && "generation" in stored && stored.generation === this.eligibility?.generation
     && "events" in stored && Array.isArray(stored.events) && stored.events.length <= 1000
     && JSON.stringify(stored).length <= MeasurementSchemas.MEASUREMENT_LIMITS.queueBytes) {
    const pending = this.events;
    this.events = [];
    for (const candidate of [...stored.events, ...pending]) this.emit(candidate as MeasurementSchemas.MeasurementEvent);
    if ("attempts" in stored && typeof stored.attempts === "number" && Number.isInteger(stored.attempts)) this.attempts = Math.max(0, Math.min(12, stored.attempts));
    if ("retryAt" in stored && typeof stored.retryAt === "number" && Number.isFinite(stored.retryAt)) this.retryAt = Math.min(stored.retryAt, this.ports.now() + 3600000);
   }
  }
  this.trim();
  if (!this.eligibility || !this.events.length || this.attempts >= 12) {
   this.events = []; await this.persist(epoch); return;
  }
  if (this.ports.now() < this.retryAt) { await this.persist(epoch); return; }
  const batch: MeasurementSchemas.MeasurementEvent[] = [];
  for (const item of this.events) {
   if (batch.length >= 50 || JSON.stringify({ events: [...batch, item] }).length > MeasurementSchemas.MEASUREMENT_LIMITS.batchBytes) break;
   batch.push(item);
  }
  const valid = () => epoch === this.epoch && !!this.eligibility && batch.every((item) => this.allowed(item));
  if (!valid()) return;
  await this.persist(epoch);
  if (!valid()) return;
  let response: DeliveryResult;
  try { response = await this.bounded(this.ports.send(batch, valid), 5000); }
  catch { response = { kind: "retry" }; }
  if (!valid()) return;
  if (response.kind === "retry") {
   this.attempts++;
   const backoff = Math.min(3600000, 5000 * 2 ** (this.attempts - 1) * (0.5 + this.ports.random()));
   this.retryAt = this.ports.now() + Math.min(3600000, Math.max(backoff, response.retryAfterMs ?? 0));
   if (this.attempts >= 12) { this.dropped.retry_exhausted += this.events.length; this.events = []; }
  } else {
   if (response.kind === "permanent") this.dropped.permanent += batch.length;
   const sent = new Set(batch.map((item) => item.eventId));
   this.events = this.events.filter((item) => !sent.has(item.eventId)); this.attempts = 0; this.retryAt = 0;
  }
  await this.persist(epoch);
 }
}
