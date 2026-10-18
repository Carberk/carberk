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
   const rows = await tx.$queryRaw<{ id: string; generation: string }[]>`SELECT p."id", p."generation" FROM "measurement_principals" p JOIN "measurement_state" s ON s."key" = 'collector' AND s."epoch" = p."epoch"
    JOIN "users" u ON u."id" = p."userId" AND u."deletionScheduledAt" IS NULL
    WHERE p."userId" = ${userId} AND p."epoch" = ${this.epoch} FOR KEY SHARE OF p, s`;
   const principal = rows[0];
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
