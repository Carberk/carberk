import type { MeasurementSchemas } from "@auto-tm/contracts";
import type { DeliveryResult } from "./MeasurementQueue";
export class MeasurementHttpSender {
 constructor(_apiUrl: string, _authorization: () => Promise<string | null>, _now: () => number) {}
 async send(_events: MeasurementSchemas.MeasurementEvent[], _eligible: () => boolean): Promise<DeliveryResult> { return { kind: "permanent" }; }
}
