import type { MeasurementSchemas } from "@auto-tm/contracts";
export interface MeasurementEligibility { generation: string; purposes: MeasurementSchemas.MeasurementPurpose[] }
export type DeliveryResult = { kind: "accepted" | "permanent" } | { kind: "retry"; retryAfterMs?: number };
export interface MeasurementBuffer { generation: string; events: MeasurementSchemas.MeasurementEvent[]; attempts: number; retryAt: number }
export interface MeasurementQueuePorts {
 now(): number; random(): number;
 read(): Promise<unknown>; write(value: MeasurementBuffer | null): Promise<void>;
 send(events: MeasurementSchemas.MeasurementEvent[], stillEligible: () => boolean): Promise<DeliveryResult>;
}
/** Behavioral red interface checkpoint. */
export class MeasurementQueue {
 constructor(_ports: MeasurementQueuePorts) {}
 setEligibility(_value: MeasurementEligibility | null): void {}
 emit(_event: MeasurementSchemas.MeasurementEvent): void {}
 async flush(): Promise<void> {}
}
