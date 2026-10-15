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
  constructor(readonly state: InspectionOrderState) {}
  transition(next: AppointmentState, actorId: string, now: Date): InspectionOrder {
    return new InspectionOrder({ ...this.state, status: next,
      events: [...this.state.events, { state: next, actorId, occurredAt: now.toISOString() }] });
  }
  authorize(kind: "physical" | "publication", authorization: RecordedAuthorization): InspectionOrder {
    return new InspectionOrder({ ...this.state, [kind === "physical" ? "physicalAuthorization" : "publicationAuthorization"]: authorization });
  }
}
