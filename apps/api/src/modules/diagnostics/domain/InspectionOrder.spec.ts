import { describe, expect, it } from "vitest";
import { InspectionOrder, type InspectionOrderState } from "./InspectionOrder";

const now = new Date("2026-10-15T12:00:00Z");
const authorization = { authorityReference: "synthetic-owner-authorization", recordedBy: "reception", recordedAt: now.toISOString() };
function order(patch: Partial<InspectionOrderState> = {}) {
  return new InspectionOrder({ id: "inspection", centerId: "center", templateVersionId: "published-version-1", commissionerId: "buyer-a",
    audience: "buyer_private", listingId: "listing", status: "requested", physicalAuthorization: null,
    publicationAuthorization: null, events: [], ...patch });
}

describe("inspection appointment and separate authorizations", () => {
  it("records the actual actor and time while preserving the pinned checklist and commissioner", () => {
    const confirmed = order().transition("confirmed", "reception", now);
    expect(confirmed.state).toMatchObject({ status: "confirmed", templateVersionId: "published-version-1", commissionerId: "buyer-a", audience: "buyer_private",
      events: [{ state: "confirmed", actorId: "reception", occurredAt: "2026-10-15T12:00:00.000Z" }] });
    expect(order().state.status).toBe("requested");
  });
  it("does not turn an unconfirmed request into an arrival or no-show", () => {
    expect(() => order().transition("arrived", "technician", now)).toThrowError("APPOINTMENT_TRANSITION_DENIED");
    expect(() => order().transition("no_show", "reception", now)).toThrowError("APPOINTMENT_TRANSITION_DENIED");
  });
  it("requires vehicle access authorization before inspection even for a paying buyer", () => {
    expect(() => order({ status: "confirmed" }).transition("arrived", "technician", now)).toThrowError("PHYSICAL_AUTHORIZATION_REQUIRED");
    expect(order({ status: "confirmed" }).authorize("physical", authorization).transition("arrived", "technician", now).state.status).toBe("arrived");
  });
  it("requires separate public consent rather than treating physical access as publication consent", () => {
    const publicOrder = order({ audience: "listing_public", status: "confirmed" }).authorize("physical", authorization);
    expect(() => publicOrder.transition("arrived", "technician", now)).toThrowError("PUBLICATION_AUTHORIZATION_REQUIRED");
    expect(publicOrder.authorize("publication", { ...authorization, authorityReference: "separate-public-consent" }).transition("arrived", "technician", now).state.audience).toBe("listing_public");
  });
  it("never converts a buyer-private commission into public publication", () => {
    expect(() => order().authorize("publication", authorization)).toThrowError("PRIVATE_AUDIENCE_IMMUTABLE");
  });
  it("keeps cancelled and no-show appointments terminal", () => {
    expect(() => order({ status: "cancelled" }).transition("confirmed", "reception", now)).toThrowError("APPOINTMENT_TRANSITION_DENIED");
    expect(() => order({ status: "no_show" }).transition("confirmed", "reception", now)).toThrowError("APPOINTMENT_TRANSITION_DENIED");
  });
});
