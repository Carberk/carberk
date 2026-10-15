export interface ServicePushScope { id: string; purpose: "support" | "history"; customerId: string | null; assigneeId: string | null; epoch: number; erased: boolean }
export interface ServicePushPrincipal { userId: string; sessionUserId: string; deviceUserId: string; expiresAt: Date; elevatedUntil: Date | null; suspended: boolean; deleting: boolean; deviceInvalidated: boolean; capabilities: string[] }
export function canDeliverServicePush(_scope: ServicePushScope, _principal: ServicePushPrincipal, _event: { epoch: number; visibility: string }, _now: Date): boolean { return false; }
