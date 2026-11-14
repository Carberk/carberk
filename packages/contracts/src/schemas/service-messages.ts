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
