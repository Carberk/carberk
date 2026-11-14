import { z, DateTimeSchema } from "../zod";

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
export const HistoryQueueResponseSchema = z.object({
  items: z.array(z.object({ id: z.string().guid(), createdAt: DateTimeSchema, status: z.literal("enquiry"),
    assignmentVersion: z.number().int().min(0), mine: z.boolean() })),
  nextCursor: z.string().guid().nullable(),
});
