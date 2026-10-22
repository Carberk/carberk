import { describe, expect, it } from "vitest";
import { publisherParticipant, type PublisherParticipant } from "./PublisherParticipant";
const person: PublisherParticipant = { userId: "seller", active: true, membership: null };
const employee: PublisherParticipant = { userId: "employee", active: true, membership: { id: "member", businessId: "business", active: true, businessStatus: "active", role: "sales" } };
const personal = { sellerId: "seller", businessId: null };
const business = { sellerId: "other-employee", businessId: "business" };
describe("current nonacting publisher eligibility", () => {
  it("admits the active personal seller without a Session", () => expect(() => publisherParticipant(person, personal)).not.toThrow());
  it("admits an active sales member for current business inventory without making them staff", () => expect(() => publisherParticipant(employee, business)).not.toThrow());
  it.each([null, { ...person, active: false }, { ...person, userId: "different" }])("refuses missing, inactive or different personal sellers", participant => {
    expect(() => publisherParticipant(participant, personal)).toThrow();
  });
  it.each([
    { ...employee, active: false }, { ...employee, membership: null },
    { ...employee, membership: { ...employee.membership!, active: false } },
    { ...employee, membership: { ...employee.membership!, businessId: "different" } },
    { ...employee, membership: { ...employee.membership!, businessStatus: "suspended" } },
    { ...employee, membership: { ...employee.membership!, businessStatus: "recovery" } },
  ])("refuses historical business contexts for current publication", participant => expect(() => publisherParticipant(participant, business)).toThrow());
});
