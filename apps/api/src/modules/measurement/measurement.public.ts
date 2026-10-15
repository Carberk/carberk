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
 /** Atomic identity-generation/rights check and durable event-ID insert. Never revive a revoked generation. */
 appendIfEligible(record: { event: MeasurementSchemas.MeasurementEvent; authority: MeasurementAuthority; receivedAt: Date; expiresAt: Date }): Promise<"accepted" | "duplicate" | "revoked">;
}
