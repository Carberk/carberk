export interface ServicePushScope { id: string; purpose: "support" | "history"; customerId: string | null; assigneeId: string | null; epoch: number; erased: boolean }
export interface ServicePushPrincipal { userId: string; sessionUserId: string; deviceUserId: string; expiresAt: Date; elevatedUntil: Date | null; suspended: boolean; deleting: boolean; deviceInvalidated: boolean; capabilities: string[] }
export function canDeliverServicePush(scope: ServicePushScope, principal: ServicePushPrincipal, event: { epoch: number; visibility: string }, now: Date): boolean {
 if (scope.erased || !scope.customerId || event.epoch !== scope.epoch || principal.userId !== principal.sessionUserId || principal.userId !== principal.deviceUserId || principal.expiresAt <= now || principal.deleting || principal.deviceInvalidated) return false;
 if (principal.userId === scope.customerId) return event.visibility === "customer";
 return !principal.suspended && principal.userId === scope.assigneeId && principal.elevatedUntil !== null && principal.elevatedUntil > now && principal.capabilities.includes(scope.purpose === "support" ? "support.operations" : "history.fulfilment");
}
