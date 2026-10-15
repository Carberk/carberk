import type { MeasurementCommitPort } from "../../measurement.public";
export class FakeMeasurementCommit implements MeasurementCommitPort {
 readonly facts: { userId: string; event: Parameters<MeasurementCommitPort["capture"]>[2] }[] = [];
 unavailable = false;
 async capture(_transaction: object, userId: string, event: Parameters<MeasurementCommitPort["capture"]>[2]): Promise<"captured" | "unavailable"> {
  if (this.unavailable) return "unavailable";
  this.facts.push({ userId, event: structuredClone(event) }); return "captured";
 }
}
