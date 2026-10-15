import type { MeasurementSchemas } from "@auto-tm/contracts";

import type { DeliveryResult, MeasurementBuffer, MeasurementQueuePorts } from "../../MeasurementQueue";

export class FakeMeasurementPorts implements MeasurementQueuePorts {
 nowMs = Date.parse("2026-10-15T00:00:00.000Z"); stored: MeasurementBuffer | null = null;
 delivered: MeasurementSchemas.MeasurementEvent[][] = []; response: DeliveryResult = { kind: "accepted" };
 throwStorage = false; throwTransport = false;
 now() { return this.nowMs; } random() { return 0.5; }
 async read(): Promise<unknown> { if (this.throwStorage) throw new Error("Storage unavailable"); return this.stored; }
 async write(value: MeasurementBuffer | null) { if (this.throwStorage) throw new Error("Storage unavailable"); this.stored = value ? structuredClone(value) : null; }
 async send(events: MeasurementSchemas.MeasurementEvent[], stillEligible: () => boolean): Promise<DeliveryResult> {
  if (!stillEligible()) return { kind: "permanent" };
  this.delivered.push(structuredClone(events));
  if (this.throwTransport) throw new Error("Transport unavailable"); return this.response;
 }
}
