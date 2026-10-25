import type { MeasurementCommitPort, MeasurementPublicationPlan } from "../../measurement.public";
export class FakeMeasurementCommit implements MeasurementCommitPort {
 readonly facts: { userId: string; event: Parameters<MeasurementCommitPort["capture"]>[2] }[] = [];
 unavailable = false;
 async preparePublication(_transaction: object, _userId: string, events: readonly Parameters<MeasurementCommitPort["capture"]>[2][]): Promise<MeasurementPublicationPlan> {
  return { environment: "test", principalId: "fake-principal", generation: "fake-generation", epoch: "fake-epoch",
   expiresAt: Object.fromEntries(events.map(event => [event.eventId, "2099-01-01T00:00:00.000Z"])) };
 }
 async capture(_transaction: object, userId: string, event: Parameters<MeasurementCommitPort["capture"]>[2]): Promise<"captured" | "unavailable"> {
  if (this.unavailable) return "unavailable";
  this.facts.push({ userId, event: structuredClone(event) }); return "captured";
 }
}
