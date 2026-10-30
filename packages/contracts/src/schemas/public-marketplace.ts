import { z } from "zod";

const names = z.object({ tk: z.string(), ru: z.string(), en: z.string() });
export const PublicBusinessSchema = z.object({ id: z.string().uuid(), slug: z.string(), name: z.string(), logoUrl: z.string().nullable(), city: names.nullable(), identityChecked: z.boolean(), contactPhone: z.string().nullable(), address: z.string().nullable().optional(), description: z.string().nullable().optional(), hours: z.string().nullable().optional(), services: z.string().nullable().optional() });
export const PublicListingSchema = z.object({ id: z.string().uuid(), status: z.enum(["active", "sold"]), brand: names, model: names, year: z.number().nullable(), priceAmount: z.number(), priceCurrency: z.enum(["TMT", "USD", "AED"]), mileageKm: z.number().nullable(), description: z.string().nullable(), city: names, photos: z.array(z.string()), business: PublicBusinessSchema.nullable(), allowChat: z.boolean(), contactPhone: z.string().nullable() });
export const PublicShowroomSchema = z.object({ business: PublicBusinessSchema, listings: z.array(PublicListingSchema), nextCursor: z.string().nullable() });
export type PublicBusiness = z.infer<typeof PublicBusinessSchema>;
export type PublicListing = z.infer<typeof PublicListingSchema>;
export type PublicShowroom = z.infer<typeof PublicShowroomSchema>;
