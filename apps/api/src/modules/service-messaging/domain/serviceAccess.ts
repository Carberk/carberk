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
export function assertServiceAccess(_scope: ServiceScope, _actor: ServiceActor, _action: ServiceAction, _file?: ServiceFileAudience): "customer" | "staff" {
  throw new ServiceDenied("NO_ACCESS");
}
