import { MeasurementSchemas } from "@auto-tm/contracts";

import type { Prisma } from "../generated/prisma/client/client";
export interface MeasurementCaptureActivation {
 enabled:boolean; environment:"test"|"staging"|"production";
 purposes:readonly MeasurementSchemas.MeasurementPurpose[]; evidenceRef:string; realCollectionApproved:boolean;
}

/** Source transaction stores original authority. Delivery can never resolve a newer actor. */
export class PrismaMeasurementCommit {
 constructor(private readonly activation: MeasurementCaptureActivation, private readonly epoch: string, private readonly now: () => Date = () => new Date(), private readonly expiresAt?: string) {}
 async capture(transaction: object, userId: string, event: MeasurementSchemas.MeasurementEvent, classification: { conversionEligible: boolean } = { conversionEligible: true }): Promise<"captured" | "disabled" | "unavailable"> {
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
   // Keep the lock order explicit. The enclosing source mutation owns the
   // User lock before capture; capture itself takes collector and principal
   // without joining the locks into one opaque query. This keeps the guest
   // path free of a User lock and leaves account eligibility to the source
   // transaction that owns the User lock.
   const collectors = await tx.$queryRaw<{ epoch: string }[]>`SELECT "epoch" FROM "measurement_state" WHERE "key" = 'collector' FOR KEY SHARE`;
   const rows = await tx.$queryRaw<{ id: string; generation: string; epoch: string; userId: string | null }[]>`SELECT "id", "generation", "epoch", "userId" FROM "measurement_principals" WHERE "userId" = ${userId} FOR KEY SHARE`;
   const principal = rows[0];
   if (collectors[0]?.epoch !== this.epoch || !principal || principal.epoch !== this.epoch || principal.userId !== userId) {
    await tx.$queryRaw`SELECT set_config('statement_timeout', ${previous[0]?.statement ?? "0"}, true), set_config('lock_timeout', ${previous[0]?.lock ?? "0"}, true)`;
    await tx.$executeRaw`RELEASE SAVEPOINT measurement_capture`;
    return "disabled";
   }
   if (principal) await tx.measurementOutbox.createMany({ data: [{ id: parsed.data.eventId, principalId: principal.id, generation: principal.generation, epoch: this.epoch,
    environment: this.activation.environment, population: "synthetic", conversionEligible:classification.conversionEligible, event: JSON.parse(JSON.stringify(parsed.data)), expiresAt: new Date(now.getTime() + MeasurementSchemas.MEASUREMENT_LIMITS.queueAgeMs) }], skipDuplicates: true });
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
