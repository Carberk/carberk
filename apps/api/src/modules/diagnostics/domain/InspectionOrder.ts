export type DiagnosticAudience = "buyer_private" | "listing_public";
export type AppointmentState = "requested" | "confirmed" | "arrived" | "no_show" | "cancelled";
export interface RecordedAuthorization {
  authorityReference: string;
  recordedBy: string;
  recordedAt: string;
}
export interface InspectionOrderState {
  id: string;
  centerId: string;
  templateVersionId: string;
  commissionerId: string;
  audience: DiagnosticAudience;
  listingId: string | null;
  status: AppointmentState;
  physicalAuthorization: RecordedAuthorization | null;
  publicationAuthorization: RecordedAuthorization | null;
  events: { state: AppointmentState; actorId: string; occurredAt: string }[];
}
export class DiagnosticRuleError extends Error {
  constructor(readonly code: string) { super(code); }
}

/** Appointment state and authorizations travel together, independently of Listing publication. */
export class InspectionOrder {
  private readonly data: InspectionOrderState;
  constructor(state: InspectionOrderState) { this.data = structuredClone(state); }
  get state(): InspectionOrderState { return structuredClone(this.data); }
  transition(next: AppointmentState, actorId: string, now: Date): InspectionOrder {
    if (next === this.data.status) return this;
    const permitted: Record<AppointmentState, readonly AppointmentState[]> = {
      requested: ["confirmed", "cancelled"], confirmed: ["arrived", "no_show", "cancelled"],
      arrived: [], no_show: [], cancelled: [],
    };
    if (!permitted[this.data.status].includes(next)) throw new DiagnosticRuleError("APPOINTMENT_TRANSITION_DENIED");
    if (next === "arrived") {
      if (!this.data.physicalAuthorization) throw new DiagnosticRuleError("PHYSICAL_AUTHORIZATION_REQUIRED");
      if (this.data.audience === "listing_public" && !this.data.publicationAuthorization) throw new DiagnosticRuleError("PUBLICATION_AUTHORIZATION_REQUIRED");
    }
    return new InspectionOrder({ ...this.data, status: next,
      events: [...this.data.events, { state: next, actorId, occurredAt: now.toISOString() }] });
  }
  authorize(kind: "physical" | "publication", authorization: RecordedAuthorization): InspectionOrder {
    if (kind === "publication" && this.data.audience !== "listing_public") throw new DiagnosticRuleError("PRIVATE_AUDIENCE_IMMUTABLE");
    if (!["requested", "confirmed"].includes(this.data.status)) throw new DiagnosticRuleError("AUTHORIZATION_LOCKED");
    if (!authorization.authorityReference.trim() || !authorization.recordedBy || !Number.isFinite(Date.parse(authorization.recordedAt))) throw new DiagnosticRuleError("AUTHORIZATION_REQUIRED");
    return new InspectionOrder({ ...this.data, [kind === "physical" ? "physicalAuthorization" : "publicationAuthorization"]: authorization });
  }
}
