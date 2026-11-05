import { DateTimeSchema, z } from "../zod";
import { Locale } from "../enums";

export const BlogPostSummarySchema = z.object({
  id: z.string().guid(),
  title: z.string(),
  slug: z.string(),
  locale: z.nativeEnum(Locale),
  publishedAt: DateTimeSchema.nullable(),
});
export type BlogPostSummary = z.infer<typeof BlogPostSummarySchema>;
