import { z, DateTimeSchema } from "../zod";

import { ServiceMessageSchema, ServiceTextSchema, ServiceReceiptSchema, ServiceReceiptsSchema } from "./service-messages";
import { PublicIdentitySchema } from "./identity";

export const HistoryOperatorSchema = z.object({ id: z.string().guid(), displayName: z.string().nullable(), nameNumber: z.number().int() });
export const HistoryDeskSchema = z.object({
  purpose: z.literal("vehicle-history"),
  mode: z.literal("synthetic"),
  actor: HistoryOperatorSchema,
  // The OpenAPI adapter emits an invalid empty anyOf for an empty tuple.
  requests: z.tuple([]).openapi({ items: {} }),
});
export type HistoryDesk = z.infer<typeof HistoryDeskSchema>;

// A new explicit action gets a new key; uncertain transport retries keep it.
export const CreateHistoryRequestSchema = z.object({
  attemptKey: z.string().guid().transform((value) => value.toLowerCase()),
  sourceListingId: z.string().guid().transform((value) => value.toLowerCase()).nullish(),
}).strict();
export type CreateHistoryRequest = z.infer<typeof CreateHistoryRequestSchema>;

export const HistoryRequestSchema = z.object({
  id: z.string().guid(),
  sourceListingId: z.string().guid().nullable(),
  createdAt: DateTimeSchema,
  status: z.literal("enquiry"),
  assignedOperator: HistoryOperatorSchema.nullable(),
  assignmentVersion: z.number().int().min(0).max(2147483647).default(0),
});
export type HistoryRequest = z.infer<typeof HistoryRequestSchema>;

export const ListHistoryRequestsQuerySchema = z.object({ cursor: z.string().guid().optional() }).strict();
export const ListHistoryRequestsResponseSchema = z.object({
  items: z.array(HistoryRequestSchema),
  nextCursor: z.string().guid().nullable(),
});

export const ClaimHistoryRequestSchema = z.object({ expectedAssignmentVersion: z.number().int().min(0).max(2147483647) }).strict();
export const HistoryQueueQuerySchema = z.object({
  filter: z.enum(["unassigned", "mine"]).optional(),
  search: z.string().trim().min(1).max(64).optional(),
  cursor: z.string().guid().optional(),
}).strict();
export const HistoryRequesterIdentitySchema = PublicIdentitySchema.pick({ displayName: true, nameNumber: true, deleted: true }).strict();
export const HistoryQueueItemSchema = z.object({
  id: z.string().guid(), createdAt: DateTimeSchema, status: z.literal("enquiry"),
  assignmentVersion: z.number().int().min(0).max(2147483647), mine: z.boolean(),
  requester: HistoryRequesterIdentitySchema.nullable(), assignedOperator: HistoryOperatorSchema.strict().nullable(),
}).strict();
export const OperatorHistoryRequestSchema = HistoryQueueItemSchema.extend({ sourceListingId: z.string().guid().nullable() }).strict();
export const HistoryQueueResponseSchema = z.object({
  items: z.array(HistoryQueueItemSchema).max(50),
  nextCursor: z.string().guid().nullable(),
}).strict();

const MessageKeySchema = ServiceMessageSchema.shape.id;
const AssignmentVersionSchema = ClaimHistoryRequestSchema.shape.expectedAssignmentVersion;
export const HistoryMessageSendQuerySchema = z.object({}).strict();
export const SendHistoryTextSchema = z.object({ clientMessageId: MessageKeySchema, text: ServiceTextSchema }).strict();
export const SendOperatorHistoryTextSchema = SendHistoryTextSchema.extend({ expectedAssignmentVersion: AssignmentVersionSchema }).strict();
export const ReadHistoryMessagesSchema = z.object({
  cursor: MessageKeySchema.optional(), limit: z.coerce.number().int().min(1).max(50).default(50),
}).strict();
export const ReadOperatorHistoryMessagesSchema = ReadHistoryMessagesSchema.extend({
  expectedAssignmentVersion: z.string().regex(/^(0|[1-9][0-9]*)$/).transform(Number).pipe(AssignmentVersionSchema),
}).strict();
export const HistoryMessageSchema = ServiceMessageSchema.omit({ purpose: true, objectId: true, senderId: true }).extend({
  author: HistoryOperatorSchema.extend({ kind: z.enum(["requester", "operator"]) }).strict(),
}).strict();
export type HistoryMessage = z.infer<typeof HistoryMessageSchema>;
export const HistoryMessagesPageSchema = z.object({
  items: z.array(HistoryMessageSchema).max(50), nextCursor: MessageKeySchema.nullable(),
}).strict();

export const AddHistoryPrivateNoteSchema = z.object({
  clientNoteId: MessageKeySchema, text: ServiceTextSchema, expectedAssignmentVersion: AssignmentVersionSchema,
}).strict();
export const ReadHistoryPrivateNotesSchema = ReadOperatorHistoryMessagesSchema;
export const HistoryPrivateNoteSchema = z.object({
  id: MessageKeySchema, clientNoteId: MessageKeySchema, text: ServiceTextSchema,
  createdAt: DateTimeSchema, author: HistoryOperatorSchema.strict(),
}).strict();
export type HistoryPrivateNote = z.infer<typeof HistoryPrivateNoteSchema>;
export const HistoryPrivateNotesPageSchema = z.object({
  items: z.array(HistoryPrivateNoteSchema).max(50), nextCursor: MessageKeySchema.nullable(),
}).strict();
export type HistoryPrivateNotesPage = z.infer<typeof HistoryPrivateNotesPageSchema>;

export const AcknowledgeHistoryMessagesSchema = z.object({ cursor: MessageKeySchema, kind: z.enum(["received", "read"]) }).strict();
export const AcknowledgeOperatorHistoryMessagesSchema = AcknowledgeHistoryMessagesSchema.extend({ expectedAssignmentVersion: AssignmentVersionSchema }).strict();
export const ReadHistoryReceiptsSchema = HistoryMessageSendQuerySchema;
export const ReadOperatorHistoryReceiptsSchema = ReadOperatorHistoryMessagesSchema.pick({ expectedAssignmentVersion: true });
export const HistoryReceiptSchema = ServiceReceiptSchema;
export const HistoryReceiptsSchema = ServiceReceiptsSchema;

export const ReadHistoryReminderSchema = HistoryMessageSendQuerySchema;
export const ReadOperatorHistoryReminderSchema = ReadOperatorHistoryReceiptsSchema;
export const StopHistoryRemindersSchema = z.object({ expectedWaitingVersion: AssignmentVersionSchema }).strict();
export const SendHistoryReminderSchema = StopHistoryRemindersSchema.extend({
  expectedAssignmentVersion: AssignmentVersionSchema,
  clientMessageId: MessageKeySchema,
}).strict();
export const HistoryReminderSchema = z.object({
  reason: z.enum(["customer_answer", "quote_choice"]).nullable(),
  since: DateTimeSchema.nullable(),
  version: AssignmentVersionSchema,
  eligibleAt: DateTimeSchema.nullable(),
  eligible: z.boolean(),
  ineligibleReason: z.enum(["declined", "stopped", "used", "not_waiting", "too_early"]).nullable(),
  declined: z.boolean(), stopped: z.boolean(), used: z.boolean(),
  outcome: HistoryMessageSchema.nullable(),
}).strict();
export type HistoryReminder = z.infer<typeof HistoryReminderSchema>;

// Admin-only commands. Scope is an opaque correlation fence, never authority.
const InboxScopeSchema = z.string().regex(/^[a-f0-9]{64}$/);
const InboxSelectionSchema = z.object({ id: z.string().guid(), scope: InboxScopeSchema,
  expectedAssignmentVersion: AssignmentVersionSchema }).strict();
export const HistoryInboxActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("queue"), query: HistoryQueueQuerySchema, scope: InboxScopeSchema.optional() }).strict(),
  InboxSelectionSchema.extend({ kind: z.literal("detail") }).strict(),
  InboxSelectionSchema.extend({ kind: z.literal("claim") }).strict(),
  InboxSelectionSchema.extend({ kind: z.literal("transcript"), cursor: MessageKeySchema.optional() }).strict(),
]);
