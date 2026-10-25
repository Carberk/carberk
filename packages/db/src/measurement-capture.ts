import { MeasurementSchemas } from "@auto-tm/contracts";

import type { Prisma } from "../generated/prisma/client/client";
export interface MeasurementCaptureActivation {
 enabled:boolean; environment:"test"|"staging"|"production";
 purposes:readonly MeasurementSchemas.MeasurementPurpose[]; evidenceRef:string; realCollectionApproved:boolean;
}

/** Source transaction stores original authority. Delivery can never resolve a newer actor. */
export class PrismaMeasurementCommit {
 constructor(private readonly activation: MeasurementCaptureActivation, private readonly epoch: string, private readonly now: () => Date = () => new Date(), private readonly expiresAt?: string) {}
 async preparePublication(transaction: object, userId: string, events: readonly MeasurementSchemas.MeasurementEvent[]) {
  if (!this.activation.enabled || !this.epoch || !this.activation.evidenceRef) return null;
  try {
   const tx = transaction as Prisma.TransactionClient;
   const [collector] = await tx.$queryRaw<{ epoch: string }[]>`SELECT "epoch" FROM "measurement_state" WHERE "key" = 'collector' FOR KEY SHARE`;
   const [principal] = await tx.$queryRaw<{ id: string; generation: string; epoch: string; userId: string | null }[]>`SELECT "id", "generation", "epoch", "userId" FROM "measurement_principals" WHERE "userId" = ${userId} FOR KEY SHARE`;
   const [user] = await tx.$queryRaw<{ deletionScheduledAt: Date | null }[]>`SELECT "deletionScheduledAt" FROM "users" WHERE "id" = ${userId}`;
   if (!user || user.deletionScheduledAt || collector?.epoch !== this.epoch || !principal || principal.userId !== userId || principal.epoch !== this.epoch) return null;
  const now = this.now();
  return { environment: this.activation.environment, expiresAt: Object.fromEntries(events.map(event => [event.eventId, new Date(now.getTime() + MeasurementSchemas.MEASUREMENT_LIMITS.queueAgeMs).toISOString()])), principalId: principal.id, generation: principal.generation, epoch: principal.epoch } as const;
  } catch { return null; }
 }
 async capture(transaction: object, userId: string, event: MeasurementSchemas.MeasurementEvent, classification: { conversionEligible: boolean } = { conversionEligible: true }, plan?: { readonly environment: "test" | "staging" | "production"; readonly expiresAt: Readonly<Record<string, string>>; readonly principalId: string; readonly generation: string; readonly epoch: string }): Promise<"captured" | "disabled" | "unavailable"> {
  const now = this.now();
  const expiry = this.expiresAt === undefined ? undefined : Date.parse(this.expiresAt);
  if (!this.activation.enabled || !this.epoch || !this.activation.evidenceRef || (expiry !== undefined && (!Number.isFinite(expiry) || expiry <= now.getTime()))) return "disabled";
  const parsed = MeasurementSchemas.MeasurementEventSchema.safeParse(event);
  if (!parsed.success || MeasurementSchemas.EVENT_DICTIONARY[parsed.data.eventName].origin !== "server" || parsed.data.context.platform !== "server"
   || !this.activation.purposes.includes(parsed.data.purpose)) return "disabled";
  const tx = transaction as Prisma.TransactionClient;
  let savepoint = false;
  try {
   await tx.$executeRaw`SAVEPOINT measurement_capture`; savepoint = true;
   const previous = await tx.$queryRaw<{ statement: string; lock: string }[]>`SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock`;
   await tx.$queryRaw`SELECT set_config('statement_timeout', '50ms', true), set_config('lock_timeout', '10ms', true)`;
   // Callers establish the User fence before their resource locks. This is an
   // unlocked recheck of that fenced row, never a late User lock after collector.
   const collectors = await tx.$queryRaw<{ epoch: string }[]>`SELECT "epoch" FROM "measurement_state" WHERE "key" = 'collector' FOR KEY SHARE`;
   const rows = await tx.$queryRaw<{ id: string; generation: string; epoch: string; userId: string | null }[]>`SELECT "id", "generation", "epoch", "userId" FROM "measurement_principals" WHERE "userId" = ${userId} FOR KEY SHARE`;
   const principal = rows[0];
   const users = await tx.$queryRaw<{ deletionScheduledAt: Date | null }[]>`SELECT "deletionScheduledAt" FROM "users" WHERE "id" = ${userId}`;
   if (!users[0] || users[0].deletionScheduledAt || collectors[0]?.epoch !== this.epoch || !principal || principal.epoch !== this.epoch || principal.userId !== userId) {
    await tx.$queryRaw`SELECT set_config('statement_timeout', ${previous[0]?.statement ?? "0"}, true), set_config('lock_timeout', ${previous[0]?.lock ?? "0"}, true)`;
    await tx.$executeRaw`RELEASE SAVEPOINT measurement_capture`;
    return "disabled";
   }
   const plannedExpiry = plan?.expiresAt[parsed.data.eventId];
   const expiresAt = plannedExpiry ? new Date(plannedExpiry) : new Date(now.getTime() + MeasurementSchemas.MEASUREMENT_LIMITS.queueAgeMs);
   if (plan && (!Number.isFinite(expiresAt.getTime()) || plan.environment !== this.activation.environment || plan.principalId !== principal?.id || plan.generation !== principal?.generation || plan.epoch !== principal?.epoch)) return "disabled";
   if (principal) await tx.measurementOutbox.createMany({ data: [{ id: parsed.data.eventId, principalId: principal.id, generation: principal.generation, epoch: this.epoch,
    environment: plan?.environment ?? this.activation.environment, population: "synthetic", conversionEligible:classification.conversionEligible, event: JSON.parse(JSON.stringify(parsed.data)), expiresAt }], skipDuplicates: true });
   await tx.$queryRaw`SELECT set_config('statement_timeout', ${previous[0]?.statement ?? "0"}, true), set_config('lock_timeout', ${previous[0]?.lock ?? "0"}, true)`;
   await tx.$executeRaw`RELEASE SAVEPOINT measurement_capture`;
   return principal ? "captured" : "disabled";
  } catch {
   if (savepoint) {
    try { await tx.$executeRaw`ROLLBACK TO SAVEPOINT measurement_capture`; await tx.$executeRaw`RELEASE SAVEPOINT measurement_capture`; } catch { /* Broken source transaction must be handled by its owner. */ }
   }
   return "unavailable";
  }
 }
}
