import { MeasurementSchemas } from "@auto-tm/contracts";
import type { MeasurementSessionPort, MeasurementAuthority } from "../measurement.public";
import type { MeasurementActivation } from "./AcceptMeasurement";
export type BootstrapReceipt = { kind: "accepted"; session: MeasurementSchemas.MeasurementBootstrapResponse } | { kind: "invalid" | "disabled" | "unauthorized" | "unavailable" };

/** Issuance is purpose-gated separately from ordinary sign-in Terms agreement. */
export class BootstrapMeasurement {
 constructor(private readonly sessions: MeasurementSessionPort, private readonly population: MeasurementAuthority["population"], private readonly activation?: MeasurementActivation, private readonly admit: (proof: string | undefined) => boolean = () => true) {}
 private enabled(): boolean {
  return !!this.activation?.enabled && /^[A-Za-z0-9_-]{1,128}$/.test(this.activation.evidenceRef)
   && this.activation.purposes.length > 0 && (this.population === "synthetic" || this.activation.realCollectionApproved);
 }
 async execute(body: unknown, credential: { authenticatedUserId?: string; guestCapability?: string; syntheticCapability?: string }): Promise<BootstrapReceipt> {
  const parsed = MeasurementSchemas.MeasurementBootstrapRequestSchema.safeParse(body);
  if (!parsed.success || (credential.guestCapability && !/^mg_[A-Za-z0-9_-]{43}$/.test(credential.guestCapability))) return { kind: "invalid" };
  if (!this.enabled() || !this.admit(credential.syntheticCapability)) return { kind: "disabled" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   const session = await Promise.race([this.sessions.bootstrap({ ...(credential.authenticatedUserId ? { authenticatedUserId: credential.authenticatedUserId } : {}), ...(credential.guestCapability ? { guestCapability: credential.guestCapability } : {}), ...(parsed.data.visitId ? { visitId: parsed.data.visitId } : {}) }), new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 1000); })]);
   if (!session) return { kind: "unavailable" };
   const response = MeasurementSchemas.MeasurementBootstrapResponseSchema.safeParse({ ...session, purposes: this.activation?.purposes });
   return response.success ? { kind: "accepted", session: response.data } : { kind: "unavailable" };
  } catch { return { kind: "unavailable" }; }
  finally { clearTimeout(timer); }
 }
 async eraseGuest(capability: string | undefined): Promise<"accepted" | "unauthorized" | "unavailable"> {
  if (!capability || !/^mg_[A-Za-z0-9_-]{43}$/.test(capability)) return "unauthorized";
  // Erasure stays available when collection is disabled or its evidence expires.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   return await Promise.race([this.sessions.eraseGuest(capability).then(() => "accepted" as const), new Promise<"unavailable">((resolve) => { timer = setTimeout(() => resolve("unavailable"), 1000); })]);
  } catch { return "unavailable"; }
  finally { clearTimeout(timer); }
 }
}
