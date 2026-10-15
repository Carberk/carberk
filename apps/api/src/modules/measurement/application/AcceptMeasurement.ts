import type { MeasurementSchemas } from "@auto-tm/contracts";
import type { MeasurementAuthority, MeasurementEmitterPort, MeasurementLedgerPort, MeasurementReceipt } from "../measurement.public";
export interface MeasurementActivation { enabled: boolean; environment: MeasurementAuthority["environment"]; purposes: MeasurementSchemas.MeasurementPurpose[]; evidenceRef: string; realCollectionApproved: boolean }
export class AcceptMeasurement implements MeasurementEmitterPort {
 constructor(_ledger: MeasurementLedgerPort, _now: () => Date, _activation?: MeasurementActivation) {}
 async afterCommit(_event: MeasurementSchemas.MeasurementEvent, _authority: MeasurementAuthority): Promise<MeasurementReceipt> { return "disabled"; }
}
