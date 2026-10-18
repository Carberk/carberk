import { z } from "zod";

export const ServicePurposeSchema = z.enum(["support", "history"]);
export const ServiceContentCategorySchema = z.enum(["support_communication", "history_communication", "payment_evidence", "provider_artifact", "vehicle_observation"]);
export const ServiceRightsSchema = z.object({
  category: ServiceContentCategorySchema,
  purpose: z.string().trim().min(1).max(300),
  basis: z.string().trim().min(1).max(500),
  provenance: z.string().trim().min(1).max(1000),
  identifiability: z.enum(["personal", "pseudonymous", "anonymous"]),
  use: z.array(z.enum(["service", "archive", "redistribute", "export"])).max(4),
  schedule: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("support_case"), closedDays: z.literal(90), eraseOnAccountDeletion: z.literal(true) }),
    z.object({ kind: z.literal("until"), until: z.string().datetime(), reason: z.string().trim().min(1).max(500) }),
    z.object({ kind: z.literal("permitted_knowledge"), reviewAt: z.string().datetime(), reason: z.string().trim().min(1).max(500) }),
  ]),
  supplierRestrictions: z.string().trim().max(1000),
  hold: z.object({ reason: z.string().min(1).max(500), until: z.string().datetime() }).nullable(),
});
export const ServiceCreateSchema = z.object({ purpose: ServicePurposeSchema, sourceListingId: z.string().uuid().optional(), synthetic: z.boolean().default(true) });
export const SupportCommandSchema = z.discriminatedUnion("kind", [
 z.object({ kind: z.enum(["close_resolved", "reopen", "investigate", "investigation_done"]) }),
 z.object({ kind: z.literal("close_awaiting"), reason: z.string().trim().min(1).max(500), clientMessageId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }),
 z.object({ kind: z.literal("category"), category: z.enum(["exposure", "account", "ordinary"]) }),
]);
export const SupportSnapshotSchema = z.object({ unansweredSince: z.string().datetime().nullable(), awaitingCustomerSince: z.string().datetime().nullable(), investigation: z.boolean(), category: z.enum(["exposure", "account", "ordinary"]), escalatedAt: z.string().datetime().nullable(), staffedElapsedMs: z.number().nonnegative(), overdue: z.boolean() });
export type SupportCommand = z.infer<typeof SupportCommandSchema>;
export const ServiceSendSchema = z.object({ clientMessageId: z.string().uuid(), body: z.string().trim().max(4000).optional(), attachmentId: z.string().uuid().optional(), visibility: z.enum(["customer", "staff"]).default("customer"), supportKind: z.enum(["reply", "request_information", "notice"]).optional(), reason: z.string().trim().min(1).max(500).optional() }).refine(value => !!value.body || !!value.attachmentId, "Message content required");
export const ServiceAssignSchema = z.object({ expectedVersion: z.number().int().nonnegative(), targetUserId: z.string().uuid().optional() });
export const ServiceReadSchema = z.object({ throughSequence: z.number().int().nonnegative() });
export const ServicePageQuerySchema = z.object({ after: z.coerce.number().int().nonnegative().default(0), limit: z.coerce.number().int().min(1).max(50).default(25) });
export const ServiceStageAttachmentSchema = z.object({
  category: ServiceContentCategorySchema,
  visibility: z.enum(["customer", "staff"]).default("customer"),
  contentType: z.enum(["image/jpeg", "image/webp", "application/pdf"]),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  filename: z.string().trim().min(1).max(150).refine(value => !/[\\/\r\n\0]/.test(value)),
  rights: ServiceRightsSchema,
});
export const ServiceAttachmentSchema = z.object({ id: z.string().uuid(), contentType: z.string(), sizeBytes: z.number().int(), filename: z.string() });
export const ServiceMessageSchema = z.object({ id: z.string().uuid(), clientMessageId: z.string().uuid(), sequence: z.number().int(), sender: z.enum(["customer", "carberk", "operator"]), operatorName: z.string().nullable(), visibility: z.enum(["customer", "staff"]), body: z.string().nullable(), attachment: ServiceAttachmentSchema.nullable(), createdAt: z.string().datetime() });
export const ServiceConversationSchema = z.object({ id: z.string().uuid(), resourceId: z.string().uuid(), purpose: ServicePurposeSchema, status: z.string(), assignmentVersion: z.number().int(), assigned: z.boolean(), operatorName: z.string().nullable(), sourceListingId: z.string().uuid().nullable(), canSend: z.boolean(), support: SupportSnapshotSchema.nullable().optional(), messages: z.array(ServiceMessageSchema), lastSequence: z.number().int(), readThrough: z.number().int(), peerReadThrough: z.number().int().nonnegative().optional(), unread: z.number().int(), hasMore: z.boolean() });
export type ServicePurpose = z.infer<typeof ServicePurposeSchema>;
export type ServiceRights = z.infer<typeof ServiceRightsSchema>;
export type ServiceSend = z.infer<typeof ServiceSendSchema>;
export type ServiceStageAttachment = z.infer<typeof ServiceStageAttachmentSchema>;
export type ServiceMessage = z.infer<typeof ServiceMessageSchema>;
export type ServiceConversation = z.infer<typeof ServiceConversationSchema>;

// Every command is synthetic-only; current authority and claim versions are server checks.
const historyProvider = z.enum(["carfax", "autocheck"]);
const historyProviders = z.array(historyProvider).min(1).max(2).refine(values => new Set(values).size === values.length);
const historyWindow = { windowStart: z.string().datetime(), windowEnd: z.string().datetime() };
export const HistoryCommandSchema = z.discriminatedUnion("kind", [
 z.object({ kind: z.literal("capacity"), expectedAssignmentVersion: z.number().int().nonnegative(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slotLimit: z.number().int().nonnegative().max(1000), morningLimit: z.number().int().nonnegative().max(1000), evidence: z.string().trim().min(1).max(1000), providers: z.array(z.object({ provider: historyProvider, allowance: z.number().int().nonnegative().max(10000), consumed: z.number().int().nonnegative(), resetAt: z.string().datetime(), evidence: z.string().trim().min(1).max(1000) })).min(1).max(2) }).strict(),
 z.object({ kind: z.literal("quote"), expectedAssignmentVersion: z.number().int().nonnegative(), quoteId: z.string().uuid(), vin: z.string().min(1).max(30), providers: historyProviders, preflightOutcome: z.enum(["available", "malformed", "unsupported", "no_history", "mismatch", "temporary_failure"]), preflightEvidence: z.string().trim().min(1).max(1000), refundRule: z.string().trim().min(1).max(1000), ...historyWindow, feasible: z.boolean() }).strict(),
 z.object({ kind: z.literal("accept"), quoteId: z.string().uuid(), vin: z.string().length(17), providers: historyProviders, amount: z.literal(100), refundRule: z.string().min(1).max(1000), ...historyWindow, rights: ServiceRightsSchema }).strict(),
 z.object({ kind: z.literal("payment"), orderId: z.string().uuid(), clientPaymentId: z.string().uuid(), claim: z.string().trim().min(1).max(1000), attachmentId: z.string().uuid().optional() }).strict(),
 z.object({ kind: z.literal("verify"), expectedAssignmentVersion: z.number().int().nonnegative(), expectedVersion: z.number().int().nonnegative(), orderId: z.string().uuid(), paymentId: z.string().uuid(), verifiedFunds: z.boolean(), amount: z.number().int().positive(), receivedAt: z.string().datetime(), evidence: z.string().trim().min(1).max(1000) }).strict(),
 z.object({ kind: z.enum(["purchase", "purchase_uncertain", "purchase_completed", "purchase_no_data", "missed", "refund_approve", "refund_execute"]), expectedAssignmentVersion: z.number().int().nonnegative(), expectedVersion: z.number().int().nonnegative(), orderId: z.string().uuid(), reason: z.string().trim().min(1).max(1000), reference: z.string().trim().min(1).max(300).optional() }).strict(),
 z.object({ kind: z.literal("recovery"), expectedVersion: z.number().int().nonnegative(), orderId: z.string().uuid(), agree: z.boolean(), deadline: z.string().datetime().optional() }).strict(),
]);
export type HistoryCommand = z.infer<typeof HistoryCommandSchema>;
export const HistorySnapshotSchema = z.object({
 synthetic: z.literal(true),
 quotes: z.array(z.object({ id: z.string().uuid(), vin: z.string().nullable(), providers: z.array(historyProvider), amount: z.literal(100), preflightOutcome: z.string(), refundRule: z.string(), ...historyWindow, feasible: z.boolean(), acceptedAt: z.string().datetime().nullable(), supersededAt: z.string().datetime().nullable() })),
 order: z.object({ id: z.string().uuid(), quoteId: z.string().uuid(), state: z.string(), version: z.number().int(), day: z.string(), holdExpiresAt: z.string().datetime(), promiseAt: z.string().datetime(), paidAt: z.string().datetime().nullable(), escalatedAt: z.string().datetime().nullable(), recoveryDeadline: z.string().datetime().nullable(), recoveryUsed: z.boolean(), refundState: z.string().nullable() }).nullable(),
 payments: z.array(z.object({ id: z.string().uuid(), claim: z.string().nullable(), state: z.string(), amount: z.number().nullable(), receivedAt: z.string().datetime().nullable(), confirmedAt: z.string().datetime().nullable() })),
});
export type HistorySnapshot = z.infer<typeof HistorySnapshotSchema>;
