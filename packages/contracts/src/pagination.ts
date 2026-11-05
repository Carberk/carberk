import { z } from "./zod";

// Catalog reads (brands, models, generations, cities, regions, etc.) are the
// only consumers today and the lists are small, bounded reference data. The
// mobile wizard fetches the full set in one trip and filters client-side, so
// max needs to accommodate the largest catalog entity (brands: 130; models per
// brand: ~80 max; cities per region: ~30). Listings have their own paginated
// schema in packages/contracts/src/schemas/listings.ts which retains the
// 50-item cap appropriate for feed reads.
export const CursorPaginationRequestSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});
export type CursorPaginationRequest = z.infer<
  typeof CursorPaginationRequestSchema
>;

export const CursorPaginationResponseSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type CursorPaginationResponse = z.infer<
  typeof CursorPaginationResponseSchema
>;

export const OffsetPaginationRequestSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
});
export type OffsetPaginationRequest = z.infer<
  typeof OffsetPaginationRequestSchema
>;

export const OffsetPaginationResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(10).max(200),
  totalPages: z.number().int().nonnegative(),
});
export type OffsetPaginationResponse = z.infer<
  typeof OffsetPaginationResponseSchema
>;

// Admin-table pagination: stricter cap than the shared offset schema.
export const AdminTablePaginationRequestSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
});
export type AdminTablePaginationRequest = z.infer<
  typeof AdminTablePaginationRequestSchema
>;
