import { z, DateTimeSchema } from "../zod";

export const HistoryDeskSchema = z.object({
  purpose: z.literal("vehicle-history"),
  mode: z.literal("synthetic"),
  actor: z.object({ id: z.string().guid(), displayName: z.string().nullable(), nameNumber: z.number().int() }),
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
  assignedOperator: z.null(),
});
export type HistoryRequest = z.infer<typeof HistoryRequestSchema>;

export const ListHistoryRequestsQuerySchema = z.object({ cursor: z.string().guid().optional() }).strict();
export const ListHistoryRequestsResponseSchema = z.object({
  items: z.array(HistoryRequestSchema),
  nextCursor: z.string().guid().nullable(),
});
