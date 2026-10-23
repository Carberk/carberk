export type ServicePurpose = "support" | "history";
export type ServiceAction = "read" | "send" | "note" | "assign" | "file" | "queue";
export interface ServiceScope {
  purpose: ServicePurpose;
  resourceId: string;
  conversationId: string;
  customerId: string | null;
  assigneeId: string | null;
  assignmentVersion: number;
  lifecycleEpoch: number;
  erased: boolean;
}
export interface ServiceActor {
  userId: string;
  sessionId: string;
  sessionValid: boolean;
  deleting: boolean;
  suspended: boolean;
  staffAuthorized: boolean;
}
export interface ServiceFileAudience {
  conversationId: string;
  lifecycleEpoch: number;
  adopted: boolean;
  removed: boolean;
  visibility: "customer" | "staff";
}
export class ServiceDenied extends Error {
  constructor(readonly code: "NO_ACCESS" | "HISTORY_REMOVED" | "STALE_ASSIGNMENT" | "COLLECTION_DISABLED" | "INVALID_ATTACHMENT" | "IDEMPOTENCY_CONFLICT" | "INVALID_MESSAGE") { super(code); }
}
export function serviceCapability(purpose: ServicePurpose): "support.operations" | "history.fulfilment" {
  return purpose === "support" ? "support.operations" : "history.fulfilment";
}
export function assertServiceAccess(scope: ServiceScope, actor: ServiceActor, action: ServiceAction, file?: ServiceFileAudience): "customer" | "staff" {
  if (!actor.sessionValid || actor.deleting) throw new ServiceDenied("NO_ACCESS");
  if (scope.erased || !scope.customerId) throw new ServiceDenied("HISTORY_REMOVED");
  const customer = actor.userId === scope.customerId;
  if (customer) {
    if (action !== "read" && action !== "send" && action !== "file") throw new ServiceDenied("NO_ACCESS");
  } else {
    if (!actor.staffAuthorized || actor.suspended) throw new ServiceDenied("NO_ACCESS");
    const canClaim = action === "assign" && scope.assigneeId === null;
    if (action !== "queue" && !canClaim && actor.userId !== scope.assigneeId) throw new ServiceDenied("NO_ACCESS");
  }
  if (action === "file") {
    if (!file || file.conversationId !== scope.conversationId || file.lifecycleEpoch !== scope.lifecycleEpoch || !file.adopted || file.removed || (customer && file.visibility !== "customer")) throw new ServiceDenied("NO_ACCESS");
  }
  return customer ? "customer" : "staff";
}
