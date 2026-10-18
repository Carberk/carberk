import { expect, it } from "vitest";

import { canDeliverServicePush, type ServicePushPrincipal, type ServicePushScope } from "./servicePushPolicy";
const now = new Date("2026-10-15T12:00:00Z");
const scope: ServicePushScope = { id: "conversation", purpose: "support", customerId: "customer", assigneeId: "operator", epoch: 1, erased: false };
const customer: ServicePushPrincipal = { userId: "customer", sessionUserId: "customer", deviceUserId: "customer", expiresAt: new Date(now.getTime() + 60000), elevatedUntil: null, suspended: true, deleting: false, deviceInvalidated: false, capabilities: [] };
const operator: ServicePushPrincipal = { ...customer, userId: "operator", sessionUserId: "operator", deviceUserId: "operator", suspended: false, elevatedUntil: new Date(now.getTime() + 60000), capabilities: ["support.operations"] };
it("keeps a restricted customer's public Support reply private to that customer's current device session", () => {
 expect(canDeliverServicePush(scope, customer, { epoch: 1, visibility: "customer" }, now)).toBe(true);
 expect(canDeliverServicePush(scope, customer, { epoch: 1, visibility: "staff" }, now)).toBe(false);
 expect(canDeliverServicePush(scope, { ...customer, sessionUserId: "other" }, { epoch: 1, visibility: "customer" }, now)).toBe(false);
 expect(canDeliverServicePush(scope, { ...customer, deviceUserId: "other" }, { epoch: 1, visibility: "customer" }, now)).toBe(false);
});
it("rejects stale Session, handover, revoked capability, lost elevation, and deletion at delivery", () => {
 expect(canDeliverServicePush(scope, operator, { epoch: 1, visibility: "customer" }, now)).toBe(true);
 for (const principal of [{ ...operator, expiresAt: now }, { ...operator, elevatedUntil: now }, { ...operator, deleting: true }, { ...operator, deviceInvalidated: true }, { ...operator, suspended: true }, { ...operator, capabilities: [] }]) expect(canDeliverServicePush(scope, principal, { epoch: 1, visibility: "customer" }, now)).toBe(false);
 expect(canDeliverServicePush({ ...scope, assigneeId: "next" }, operator, { epoch: 1, visibility: "customer" }, now)).toBe(false);
 expect(canDeliverServicePush(scope, operator, { epoch: 0, visibility: "customer" }, now)).toBe(false);
 expect(canDeliverServicePush({ ...scope, erased: true }, customer, { epoch: 1, visibility: "customer" }, now)).toBe(false);
});
