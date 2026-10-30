import type { MeasurementSessionPort } from "../../measurement.public";
export class FakeMeasurementSessions implements MeasurementSessionPort {
 readonly erased = new Set<string>();
 readonly bootstraps: Parameters<MeasurementSessionPort["bootstrap"]>[0][] = [];
 unavailable = false;
 async bootstrap(input: Parameters<MeasurementSessionPort["bootstrap"]>[0]): Promise<NonNullable<Awaited<ReturnType<MeasurementSessionPort["bootstrap"]>>>> {
  if (this.unavailable) throw new Error("Unavailable");
  this.bootstraps.push(structuredClone(input));
  return { visitId: "00000000-0000-4000-8000-000000000002", generation: "generation-http",
   ...(!input.authenticatedUserId ? { guestCapability: `mg_${"a".repeat(43)}` } : {}) };
 }
 async eraseGuest(capability: string): Promise<void> { if (this.unavailable) throw new Error("Unavailable"); this.erased.add(capability); }
}
