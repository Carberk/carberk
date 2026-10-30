import { MeasurementSchemas } from "@auto-tm/contracts";
import type { MeasurementAuthority, MeasurementEmitterPort, MeasurementLedgerPort, MeasurementReceipt } from "../measurement.public";

import { reportMeasurementUnavailable } from "./MeasurementUnavailableDiagnostic";

export interface MeasurementActivation {
 enabled: boolean; environment: MeasurementAuthority["environment"];
 purposes: MeasurementSchemas.MeasurementPurpose[]; evidenceRef: string; realCollectionApproved: boolean;
}

/** Not wired into HTTP or feature transactions until durable identity/fence composition exists. */
export class AcceptMeasurement implements MeasurementEmitterPort {
 constructor(private readonly ledger: MeasurementLedgerPort, private readonly now: () => Date, private readonly activation?: MeasurementActivation) {}
 async afterCommit(event: MeasurementSchemas.MeasurementEvent, authority: MeasurementAuthority): Promise<MeasurementReceipt> {
  const activation = this.activation;
  if (!activation?.enabled || !/^[A-Za-z0-9_-]{1,128}$/.test(activation.evidenceRef)
   || authority.environment !== activation.environment
   || (!activation.realCollectionApproved && authority.population !== "synthetic")) return "disabled";
  const parsed = MeasurementSchemas.MeasurementEventSchema.safeParse(event);
  if (!parsed.success) return "invalid";
  const fact = parsed.data;
  if (!activation.purposes.includes(fact.purpose)) return "disabled";
  if (MeasurementSchemas.EVENT_DICTIONARY[fact.eventName].origin !== authority.origin
   || (authority.origin === "client" && (!fact.visitId || fact.context.platform === "server"))
   || (authority.origin === "server" && fact.context.platform !== "server")
   || !["test", "staging", "production"].includes(authority.environment)
   || !["synthetic", "reviewer", "pilot", "marketplace"].includes(authority.population)
   || !["account", "guest"].includes(authority.subject.kind)
   || !/^[a-f0-9]{64}$/.test(authority.subject.pseudonym)
   || !/^[A-Za-z0-9_-]{1,128}$/.test(authority.subject.generation)) return "invalid";
  const receivedAt = this.now(), time = Date.parse(fact.occurredAt);
  if (time > receivedAt.getTime() + MeasurementSchemas.MEASUREMENT_LIMITS.futureSkewMs
   || time < receivedAt.getTime() - MeasurementSchemas.MEASUREMENT_LIMITS.queueAgeMs) return "invalid";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   const append = async () => {
    try {
     return await this.ledger.appendIfEligible({ event: fact,
      authority: { ...authority, subject: { ...authority.subject } }, receivedAt,
      expiresAt: new Date(time + MeasurementSchemas.MEASUREMENT_LIMITS.rawRetentionDays * 86400000),
     });
    } catch (error) { reportMeasurementUnavailable("ledger_rejected", error); throw error; }
   };
   return await Promise.race([append(), new Promise<"unavailable">((resolve) => {
    timer = setTimeout(() => { reportMeasurementUnavailable("ledger_deadline"); resolve("unavailable"); }, 250);
   })]);
  } catch { return "unavailable"; }
  finally { clearTimeout(timer); }
 }
}
