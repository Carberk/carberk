import { z } from "zod";

import { ListingStatus } from "../enums";

export const AdminContextQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
});
export const AdminContextListingQuerySchema = AdminContextQuerySchema.extend({
  status: z.nativeEnum(ListingStatus).optional(),
  brandId: z.string().uuid().optional(),
  regionId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
const names = z.object({ ru: z.string(), tk: z.string(), en: z.string() });
export const AdminContextUserSummarySchema = z.object({
  id: z.string().uuid(), displayName: z.string().nullable(), nameNumber: z.number().nullable(),
  createdAt: z.string().datetime(), suspended: z.boolean(), deletionScheduled: z.boolean(),
});
export const AdminContextListingSummarySchema = z.object({
  id: z.string().uuid(), publicNumber: z.number(), sellerId: z.string().uuid(),
  status: z.string(), brand: names, model: names, city: names, region: names.nullable(),
  year: z.number().nullable(), priceAmount: z.number(), priceCurrency: z.string(),
  createdAt: z.string().datetime(), deletedAt: z.string().datetime().nullable(),
});
export const AdminContextListingDetailSchema = AdminContextListingSummarySchema.extend({
  description: z.string().nullable(), vin: z.string().nullable(), mileageKm: z.number().nullable(),
  condition: z.string().nullable(), enginePower: z.number().nullable(), damaged: z.boolean().nullable(),
  knownIssuesText: z.string().nullable(), locationText: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(), soldAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  specifications: z.array(z.object({ name: z.string(), value: names.nullable(), id: z.string().nullable() })),
  seller: AdminContextUserSummarySchema, complaintCount: z.number().int().nonnegative(),
  media: z.array(z.object({ id: z.string().uuid(), kind: z.enum(["photo", "video"]), url: z.string().url().nullable(), width: z.number().nullable(), height: z.number().nullable() })),
});
export const AdminContextUserDetailSchema = AdminContextUserSummarySchema.extend({
  listings: z.array(AdminContextListingSummarySchema), listingCount: z.number().int().nonnegative(),
  complaintCount: z.number().int().nonnegative(),
});
const option = z.object({ id: z.string().uuid(), name: names });
export const AdminContextListingPageSchema = z.object({ brands: z.array(option).default([]), regions: z.array(option).default([]), items: z.array(AdminContextListingSummarySchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
export const AdminContextUserPageSchema = z.object({ items: z.array(AdminContextUserSummarySchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
export type AdminContextQuery = z.infer<typeof AdminContextQuerySchema>;
export type AdminContextListingQuery = z.infer<typeof AdminContextListingQuerySchema>;
export type AdminContextListingDetail = z.infer<typeof AdminContextListingDetailSchema>;
export type AdminContextUserDetail = z.infer<typeof AdminContextUserDetailSchema>;
export type AdminContextListingPage = z.infer<typeof AdminContextListingPageSchema>;
export type AdminContextUserPage = z.infer<typeof AdminContextUserPageSchema>;
