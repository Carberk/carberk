import { MeasurementSchemas } from "@auto-tm/contracts";

import { MeasurementQueue, type MeasurementBuffer } from "./MeasurementQueue";
import { MeasurementHttpSender } from "./MeasurementHttpSender";

export interface MeasurementHostPorts {
 now(): number; random(): number; newId(): string;
 identity(): Promise<{ actorKey: string; authorization: string | null }>;
 readIdentity(): Promise<string | null>; writeIdentity(value: string | null): Promise<void>;
 readQueue(): Promise<unknown>; writeQueue(value: MeasurementBuffer | null): Promise<void>;
 syntheticProof(): Promise<string | null>;
}
type Session = MeasurementSchemas.MeasurementBootstrapResponse & { actorKey: string; queueGeneration: string };

/** Core features emit synchronously; host bootstrap/persistence/delivery run independently. */
export class MeasurementHost {
 readonly queue: MeasurementQueue;
 private session: Session | null = null;
 private epoch = 0;
 private readonly listeners=new Set<()=>void>();
 subscribe(listener:()=>void):()=>void {this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
 private changed():void {for(const listener of this.listeners)listener();}
 private guestAssociation: Session | null = null;
 constructor(private readonly apiUrl: string, private readonly ports: MeasurementHostPorts, private readonly enabled = false) {
  const sender = new MeasurementHttpSender(apiUrl, async () => {
   const identity = await ports.identity();
   return this.session?.actorKey === identity.actorKey ? identity.authorization ?? (this.session.guestCapability ? `Bearer ${this.session.guestCapability}` : null) : null;
  }, () => ports.now());
  this.queue = new MeasurementQueue({ now: () => ports.now(), random: () => ports.random(), read: () => ports.readQueue(), write: (value) => ports.writeQueue(value), send: (events, eligible) => sender.send(events, eligible) });
 }
 /** Called synchronously on auth changes before any new actor event can enqueue. */
 invalidate(): void {
  if (this.session?.actorKey === "guest") this.guestAssociation = this.session;
  this.epoch++; this.session = null; this.queue.setEligibility(null);this.changed();
  // Late old-generation writes remain ineligible even if native storage ignores cancellation.
  void this.ports.writeIdentity(null).catch(() => undefined);
  void this.ports.writeQueue(null).catch(() => undefined);
 }
 currentVisit(): string | null { return this.session?.visitId ?? null; }
 emit(event: MeasurementSchemas.MeasurementEvent): void {
  if (this.session && event.visitId === this.session.visitId) this.queue.emit(event);
 }
 async foreground(): Promise<void> {
  if (!this.enabled) return;
  const epoch = this.epoch;
  const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   const operation = async () => {
    const identity = await this.ports.identity();
    if (epoch !== this.epoch) return;
    let stored: Session | null = this.session ?? this.guestAssociation;
    if (!stored) {
     const raw = await this.ports.readIdentity();
     if (raw) {
      const candidate = JSON.parse(raw) as unknown;
      if (candidate && typeof candidate === "object" && "actorKey" in candidate && typeof candidate.actorKey === "string") {
       const { actorKey, queueGeneration, ...body } = candidate as { actorKey: string; queueGeneration?: unknown };
       const parsed = MeasurementSchemas.MeasurementBootstrapResponseSchema.safeParse(body);
       if (parsed.success && typeof queueGeneration === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(queueGeneration)) stored = { ...parsed.data, actorKey, queueGeneration };
      }
     }
    }
    if (epoch !== this.epoch) return;
    const sameActor = stored?.actorKey === identity.actorKey;
    const proof = await this.ports.syntheticProof();
    if (epoch !== this.epoch) return;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (identity.authorization) headers.Authorization = identity.authorization;
    else if (sameActor && stored?.guestCapability) headers.Authorization = `Bearer ${stored.guestCapability}`;
    if (proof) headers["X-Measurement-Synthetic"] = proof;
    // Sign-in may associate only the exact currently held guest visit.
    if (identity.authorization && stored?.guestCapability && stored.actorKey === "guest") headers["X-Measurement-Guest"] = stored.guestCapability;
    const visitId = sameActor || (stored?.actorKey === "guest" && identity.authorization) ? stored?.visitId : undefined;
    const response = await fetch(`${this.apiUrl.replace(/\/$/, "")}/measurement/bootstrap`, { method: "POST", headers, body: JSON.stringify(visitId ? { visitId } : {}), signal: abort.signal, credentials: "omit", redirect: "error" });
    if (epoch !== this.epoch) return;
    const parsed = MeasurementSchemas.MeasurementBootstrapResponseSchema.safeParse(await response.json());
    if (epoch !== this.epoch) return;
    if (!response.ok || !parsed.success) { this.invalidate(); return; }
    const queueGeneration = sameActor && stored?.generation === parsed.data.generation ? stored.queueGeneration : this.ports.newId();
    this.session = { ...parsed.data, actorKey: identity.actorKey, queueGeneration };
    this.guestAssociation = null;
    this.queue.setEligibility({ generation: queueGeneration, purposes: parsed.data.purposes });this.changed();
    await this.ports.writeIdentity(JSON.stringify(this.session));
    if (epoch !== this.epoch) return;
    await this.queue.flush();
   };
   await Promise.race([operation(), new Promise<void>((resolve) => { timer = setTimeout(() => { if (epoch === this.epoch) this.invalidate(); abort.abort(); resolve(); }, 5000); })]);
  } catch { /* A collector or storage failure cannot escape into core app flows. */ }
  finally { clearTimeout(timer); }
 }
 flush(): void { if (this.enabled) void this.queue.flush(); }
}
