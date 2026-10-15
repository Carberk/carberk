import type { MeasurementLedgerPort } from "../../measurement.public";
export class FakeMeasurementLedger implements MeasurementLedgerPort {
 records: Parameters<MeasurementLedgerPort["appendIfEligible"]>[0][] = [];
 revoked = new Set<string>(); unavailable = false;
 async appendIfEligible(record: Parameters<MeasurementLedgerPort["appendIfEligible"]>[0]): Promise<"accepted" | "duplicate" | "revoked"> {
  if (this.unavailable) throw new Error("Ledger unavailable");
  if (this.revoked.has(record.authority.subject.generation)) return "revoked";
  if (this.records.some((item) => item.event.eventId === record.event.eventId)) return "duplicate";
  this.records.push(structuredClone(record)); return "accepted";
 }
}
