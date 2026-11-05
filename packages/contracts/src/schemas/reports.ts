import { DateTimeSchema, z } from "../zod";

// Phase 2 stub — full schema lands in S11
export const InspectionReportSummarySchema = z.object({
  id: z.string().guid(),
  listingId: z.string().guid(),
  inspectorId: z.string().guid(),
  completedAt: DateTimeSchema.nullable(),
});
export type InspectionReportSummary = z.infer<
  typeof InspectionReportSummarySchema
>;

// ── Inspection interest fake-door (S9a T4) ──

export const InspectionInterestSide = {
  Buyer: "buyer",
  Seller: "seller",
} as const;
export type InspectionInterestSide =
  (typeof InspectionInterestSide)[keyof typeof InspectionInterestSide];

export const CreateInspectionInterestRequestSchema = z.object({
  willingnessToPayTmt: z.number().int().min(0).max(10000).optional(),
});
export type CreateInspectionInterestRequest = z.infer<
  typeof CreateInspectionInterestRequestSchema
>;

export const CreateInspectionInterestResponseSchema = z.object({
  id: z.string().guid(),
  listingId: z.string().guid(),
  requesterUserId: z.string().guid(),
  side: z.nativeEnum(InspectionInterestSide),
  willingnessToPayTmt: z.number().int().min(0).max(10000).nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  reusedExisting: z.boolean(),
});
export type CreateInspectionInterestResponse = z.infer<
  typeof CreateInspectionInterestResponseSchema
>;

export const InspectionInterestCountItemSchema = z.object({
  listingId: z.string().guid(),
  totalInterest: z.number().int().nonnegative(),
  buyerInterest: z.number().int().nonnegative(),
  sellerInterest: z.number().int().nonnegative(),
  willingnessToPayTmtSum: z.number().int().nonnegative(),
  willingnessToPayTmtCount: z.number().int().nonnegative(),
  willingnessToPayTmtAvg: z.number().nullable(),
});
export type InspectionInterestCountItem = z.infer<
  typeof InspectionInterestCountItemSchema
>;

export const ListInspectionInterestStatsResponseSchema = z.object({
  items: z.array(InspectionInterestCountItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalPages: z.number().int().nonnegative(),
});
export type ListInspectionInterestStatsResponse = z.infer<
  typeof ListInspectionInterestStatsResponseSchema
>;
