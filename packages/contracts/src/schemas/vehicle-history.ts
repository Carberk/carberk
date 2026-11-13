import { z } from "../zod";

export const HistoryDeskSchema = z.object({
  purpose: z.literal("vehicle-history"),
  mode: z.literal("synthetic"),
  actor: z.object({ id: z.string().guid(), displayName: z.string().nullable(), nameNumber: z.number().int() }),
  // The OpenAPI adapter emits an invalid empty anyOf for an empty tuple.
  requests: z.tuple([]).openapi({ items: {} }),
});
export type HistoryDesk = z.infer<typeof HistoryDeskSchema>;
