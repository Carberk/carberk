import type { MeasurementAuthority } from "../measurement.public";
export interface MeasurementSubjectPort {
 /** Only this adapter resolves authenticated identity and server-owned eligibility metadata. */
 resolve(input: { authenticatedUserId?: string; guestCapability?: string }): Promise<MeasurementAuthority | null>;
}
export type BatchReceipt = "accepted" | "invalid" | "unauthorized" | "unavailable" | "limited";
export class AcceptClientMeasurementBatch {
 constructor(_subjects: MeasurementSubjectPort, _accept: import("./AcceptMeasurement").AcceptMeasurement, _now: () => number) {}
 async execute(_body: unknown, _credential: { authenticatedUserId?: string; guestCapability?: string }): Promise<BatchReceipt> { return "accepted"; }
}
