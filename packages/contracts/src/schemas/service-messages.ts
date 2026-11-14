import { z, DateTimeSchema } from "../zod";

const KeySchema = z.string().guid().transform((value) => value.toLowerCase());
export const ServiceStreamSchema = z.object({
  purpose: z.literal("vehicle_history"),
  objectId: KeySchema,
}).strict();
export type ServiceStream = z.infer<typeof ServiceStreamSchema>;

// Equality is exact original text: no trimming, newline or Unicode normalization.
export const ServiceTextSchema = z.string().max(4000).refine((text) => text.trim().length > 0);
export const SendServiceTextSchema = ServiceStreamSchema.extend({
  senderId: KeySchema,
  clientMessageId: KeySchema,
  text: ServiceTextSchema,
}).strict();
export type SendServiceText = z.infer<typeof SendServiceTextSchema>;

export const ReadServiceMessagesSchema = ServiceStreamSchema.extend({
  cursor: KeySchema.optional(),
  limit: z.number().int().min(1).max(50).default(50),
}).strict();
export type ReadServiceMessages = z.input<typeof ReadServiceMessagesSchema>;

// Communication facts only; durable persistence establishes Sent, never receipt/read.
export const ServiceMessageSchema = ServiceStreamSchema.extend({
  id: KeySchema,
  kind: z.literal("TEXT"),
  senderId: KeySchema,
  clientMessageId: KeySchema,
  text: ServiceTextSchema,
  // Decimal bigint, independent of timestamp ties and JavaScript number precision.
  order: z.string().regex(/^[1-9][0-9]{0,18}$/),
  createdAt: DateTimeSchema,
}).strict();
export type ServiceMessage = z.infer<typeof ServiceMessageSchema>;

export const ServiceMessagePageSchema = z.object({
  items: z.array(ServiceMessageSchema).max(50),
  nextCursor: KeySchema.nullable(),
}).strict();
export type ServiceMessagePage = z.infer<typeof ServiceMessagePageSchema>;

// 0 identifies the requester; positive versions identify the actual staff epoch.
export const ServiceParticipantSchema = z.object({
  participantId: KeySchema, sessionId: KeySchema,
  assignmentVersion: z.number().int().min(0).max(2147483647),
}).strict();
export type ServiceParticipant = z.infer<typeof ServiceParticipantSchema>;
export const ReadParticipantMessagesSchema = ReadServiceMessagesSchema.extend({ participant: ServiceParticipantSchema }).strict();
export type ReadParticipantMessages = z.input<typeof ReadParticipantMessagesSchema>;
export const AcknowledgeServiceMessagesSchema = ServiceStreamSchema.extend({
  participant: ServiceParticipantSchema, cursor: KeySchema, kind: z.enum(["received", "read"]),
}).strict();
export type AcknowledgeServiceMessages = z.infer<typeof AcknowledgeServiceMessagesSchema>;
const PositionSchema = z.string().regex(/^(0|[1-9][0-9]{0,18})$/);
export const ServiceReceiptSchema = ServiceParticipantSchema.omit({ sessionId: true }).extend({
  receivedOrder: PositionSchema, readOrder: PositionSchema,
}).strict().refine((value) => BigInt(value.readOrder) <= BigInt(value.receivedOrder));
export type ServiceReceipt = z.infer<typeof ServiceReceiptSchema>;
export const ServiceReceiptsSchema = z.object({ items: z.array(ServiceReceiptSchema) }).strict();
