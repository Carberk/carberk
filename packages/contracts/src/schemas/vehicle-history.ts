import { z } from "../zod";

export const HistoryDeskSchema = z.object({
  purpose: z.literal("vehicle-history"),
  mode: z.literal("synthetic"),
  actor: z.object({ id: z.string().guid(), displayName: z.string().nullable(), nameNumber: z.number().int() }),
  requests: z.tuple([]),
});
export type HistoryDesk = z.infer<typeof HistoryDeskSchema>;
