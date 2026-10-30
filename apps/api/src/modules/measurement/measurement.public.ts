import type { MeasurementSchemas } from "@auto-tm/contracts";

/** A committed source feature supplies only its reviewed minimal fact, never domain payloads. */
export interface MeasurementEmitterPort {
 afterCommit(event: MeasurementSchemas.MeasurementEvent, authority: MeasurementAuthority): Promise<MeasurementReceipt>;
}
export interface MeasurementAuthority {
 origin: "client" | "server";
 environment: "test" | "staging" | "production";
 population: "synthetic" | "reviewer" | "pilot" | "marketplace";
 /** Issued by the measurement identity boundary. Never a raw account/install ID. */
 subject: { kind: "account" | "guest"; pseudonym: string; generation: string };
}
export type MeasurementReceipt = "accepted" | "duplicate" | "disabled" | "invalid" | "revoked" | "unavailable";
export interface MeasurementLedgerPort {
 /** Atomic identity-generation/rights check and durable event-ID insert. Client visits
  * must already exist and belong to this exact principal generation and collector epoch.
  * Only bootstrap issues visits. Ingress never creates/rebinds an unknown or old visit.
  * Deletion and restore invalidation serialize with this insert. */
 appendIfEligible(record: { event: MeasurementSchemas.MeasurementEvent; authority: MeasurementAuthority; receivedAt: Date; expiresAt: Date }): Promise<"accepted" | "duplicate" | "revoked">;
}

export interface MeasurementSessionPort {
 bootstrap(input: { authenticatedUserId?: string; guestCapability?: string; visitId?: string }): Promise<{ visitId: string; generation: string; guestCapability?: string } | null>;
 eraseGuest(capability: string): Promise<void>;
}

export const MEASUREMENT_COMMIT_PORT = Symbol("MeasurementCommitPort");
export interface MeasurementPublicationPlan {
  readonly environment: "test" | "staging" | "production";
  readonly expiresAt: Readonly<Record<string, string>>;
  readonly createdAt: Readonly<Record<string, string>>;
  readonly principalId: string;
  readonly generation: string;
  readonly epoch: string;
}
/** Infrastructure passes its existing source transaction as an opaque context.
 * Domain/application callers do not inspect collector persistence or await transport. */
export interface MeasurementCommitPort {
 preparePublication?(transaction: object, userId: string, events: readonly MeasurementSchemas.MeasurementEvent[]): Promise<MeasurementPublicationPlan | null>;
 capture(transaction: object, userId: string, event: MeasurementSchemas.MeasurementEvent, classification?: { conversionEligible: boolean }, plan?: MeasurementPublicationPlan): Promise<"captured" | "disabled" | "unavailable">;
}

export const MEASUREMENT_CONVERSION_PORT=Symbol("MeasurementConversionPort");
export interface MeasurementConversionPort {
 eligible(transaction:object,input:{userId:string|null;event:MeasurementSchemas.MeasurementEvent}):Promise<boolean>;
}

export const MEASUREMENT_SIGN_IN_OUTCOME_PORT=Symbol("MeasurementSignInOutcomePort");
export interface MeasurementSignInOutcomePort {
 /** Only the source auth boundary supplies accepted outcomes. Guest credential is never an event field. */
 record(input:{attemptId?:string;guestCapability?:string;result:"success"|"expected_rejection"|"technical_failure";durationMs:number;category?:"validation"|"permission"|"unknown"}):Promise<void>;
}
