import { z } from "../zod";

export const SavedSearchSummarySchema = z.object({
  id: z.string().guid(),
  name: z.string(),
  filters: z.unknown(),
  matchCount: z.number().int().nonnegative(),
});
export type SavedSearchSummary = z.infer<typeof SavedSearchSummarySchema>;
