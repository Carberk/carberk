import { describe, expect, it } from "vitest";

import { assertServiceAccess, ServiceDenied, type ServiceActor, type ServiceScope } from "./serviceAccess";

const scope: ServiceScope = { purpose: "support", resourceId: "case-1", conversationId: "service-1", customerId: "customer", assigneeId: "operator", assignmentVersion: 1, lifecycleEpoch: 1, erased: false };
const customer: ServiceActor = { userId: "customer", sessionId: "session-c", sessionValid: true, deleting: false, suspended: true, staffAuthorized: false };
const operator: ServiceActor = { userId: "operator", sessionId: "session-o", sessionValid: true, deleting: false, suspended: false, staffAuthorized: true };
describe("current service audience", () => {
  it("keeps a restricted customer's Support appeal and history accessible independently of staff handover", () => {
    expect(assertServiceAccess(scope, customer, "send")).toBe("customer");
    expect(assertServiceAccess({ ...scope, assigneeId: "next" }, customer, "read")).toBe("customer");
  });
  it("permits the current named staff member and immediately excludes the old assignee", () => {
    expect(assertServiceAccess(scope, operator, "read")).toBe("staff");
    expect(() => assertServiceAccess({ ...scope, assigneeId: "next", assignmentVersion: 2 }, operator, "read")).toThrow(ServiceDenied);
  });
  it.each(["read", "send", "note", "assign", "file"] as const)("refuses stale session, revoked capability and unrelated marketplace/dealer actors for %s", action => {
    expect(() => assertServiceAccess(scope, { ...operator, sessionValid: false }, action)).toThrow(ServiceDenied);
    expect(() => assertServiceAccess(scope, { ...operator, staffAuthorized: false }, action)).toThrow(ServiceDenied);
    expect(() => assertServiceAccess(scope, { ...operator, userId: "seller-admin", staffAuthorized: false }, action)).toThrow(ServiceDenied);
  });
  it("permits purpose-authorized queue metadata and claiming without releasing unassigned bodies", () => {
    const unassigned = { ...scope, assigneeId: null };
    expect(assertServiceAccess(unassigned, operator, "queue")).toBe("staff");
    expect(assertServiceAccess(unassigned, operator, "assign")).toBe("staff");
    expect(() => assertServiceAccess(unassigned, operator, "read")).toThrow(ServiceDenied);
    expect(() => assertServiceAccess(scope, customer, "note")).toThrow(ServiceDenied);
  });
  it("checks exact file audience, lifecycle and current actor on every retrieval", () => {
    const file = { conversationId: "service-1", lifecycleEpoch: 1, adopted: true, removed: false, visibility: "customer" as const };
    expect(assertServiceAccess(scope, customer, "file", file)).toBe("customer");
    expect(() => assertServiceAccess(scope, customer, "file", { ...file, visibility: "staff" })).toThrow(ServiceDenied);
    expect(() => assertServiceAccess(scope, customer, "file", { ...file, conversationId: "another-service" })).toThrow(ServiceDenied);
    expect(() => assertServiceAccess(scope, customer, "file", { ...file, lifecycleEpoch: 0 })).toThrow(ServiceDenied);
    expect(() => assertServiceAccess(scope, customer, "file", { ...file, removed: true })).toThrow(ServiceDenied);
    expect(() => assertServiceAccess({ ...scope, erased: true }, customer, "read")).toThrow(ServiceDenied);
  });
});
