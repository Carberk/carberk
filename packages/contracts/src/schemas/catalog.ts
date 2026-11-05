import { z } from "../zod";

export const LocaleQuerySchema = z.object({
  locale: z.enum(["tk", "ru", "en"]).optional(),
});
export type LocaleQuery = z.infer<typeof LocaleQuerySchema>;

// ── Brand ──

export const BrandSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
  /** Public URL of the brand logo; omitted when the brand has none (show a letter fallback). */
  logoUrl: z.string().url().optional(),
});
export type BrandSummary = z.infer<typeof BrandSummarySchema>;

export const BrandDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string(),
  nameTk: z.string(),
  nameEn: z.string(),
  slug: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type BrandDetail = z.infer<typeof BrandDetailSchema>;

// ── Model ──

export const ModelSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  brandId: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type ModelSummary = z.infer<typeof ModelSummarySchema>;

export const ModelDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string(),
  nameTk: z.string(),
  nameEn: z.string(),
  slug: z.string(),
  brandId: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type ModelDetail = z.infer<typeof ModelDetailSchema>;

// ── Generation ──

export const GenerationSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  modelId: z.string(),
  yearStart: z.number().int().nullable().optional(),
  yearEnd: z.number().int().nullable().optional(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type GenerationSummary = z.infer<typeof GenerationSummarySchema>;

export const GenerationDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string(),
  nameTk: z.string(),
  nameEn: z.string(),
  modelId: z.string(),
  yearStart: z.number().int().nullable().optional(),
  yearEnd: z.number().int().nullable().optional(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type GenerationDetail = z.infer<typeof GenerationDetailSchema>;

// ── Color ──

export const ColorSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  hex: z.string().nullable().optional(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type ColorSummary = z.infer<typeof ColorSummarySchema>;

export const ColorDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string(),
  nameTk: z.string(),
  nameEn: z.string(),
  hex: z.string().nullable().optional(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type ColorDetail = z.infer<typeof ColorDetailSchema>;

// ── BodyType ──

export const BodyTypeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type BodyTypeSummary = z.infer<typeof BodyTypeSummarySchema>;

export const BodyTypeDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string(),
  nameTk: z.string(),
  nameEn: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type BodyTypeDetail = z.infer<typeof BodyTypeDetailSchema>;

// ── EngineType ──

export const EngineTypeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type EngineTypeSummary = z.infer<typeof EngineTypeSummarySchema>;

export const EngineTypeDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string(),
  nameTk: z.string(),
  nameEn: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type EngineTypeDetail = z.infer<typeof EngineTypeDetailSchema>;

// ── Transmission ──

export const TransmissionSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type TransmissionSummary = z.infer<typeof TransmissionSummarySchema>;

export const TransmissionDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string(),
  nameTk: z.string(),
  nameEn: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type TransmissionDetail = z.infer<typeof TransmissionDetailSchema>;

// ── DriveType ──

export const DriveTypeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type DriveTypeSummary = z.infer<typeof DriveTypeSummarySchema>;

export const DriveTypeDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string(),
  nameTk: z.string(),
  nameEn: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type DriveTypeDetail = z.infer<typeof DriveTypeDetailSchema>;

// ── Region ──

export const RegionSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type RegionSummary = z.infer<typeof RegionSummarySchema>;

export const RegionDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string(),
  nameTk: z.string(),
  nameEn: z.string(),
  slug: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type RegionDetail = z.infer<typeof RegionDetailSchema>;

// ── City ──

export const CitySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  regionId: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type CitySummary = z.infer<typeof CitySummarySchema>;

export const CityDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string(),
  nameTk: z.string(),
  nameEn: z.string(),
  slug: z.string(),
  regionId: z.string(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type CityDetail = z.infer<typeof CityDetailSchema>;

// ── Search ──

export const CatalogSearchQuerySchema = z.object({
  q: z.string().max(100).optional(),
  locale: z.enum(["tk", "ru", "en"]).optional(),
});
export type CatalogSearchQuery = z.infer<typeof CatalogSearchQuerySchema>;

export const CatalogSearchResultItemSchema = z.object({
  kind: z.enum(["brand", "model"]),
  brandId: z.string(),
  modelId: z.string().optional(),
  label: z.string(),
  brandLabel: z.string().optional(),
  localeFallback: z.enum(["ru", "tk", "en"]).optional(),
});
export type CatalogSearchResultItem = z.infer<
  typeof CatalogSearchResultItemSchema
>;

export const CatalogSearchResponseSchema = z.object({
  results: z.array(CatalogSearchResultItemSchema),
  yearFrom: z.number().int().optional(),
  yearTo: z.number().int().optional(),
});
export type CatalogSearchResponse = z.infer<typeof CatalogSearchResponseSchema>;

// ── List Response Schemas ──

export const BrandSummaryListResponseSchema = z.object({
  items: z.array(BrandSummarySchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type BrandSummaryListResponse = z.infer<
  typeof BrandSummaryListResponseSchema
>;

// ── Admin Write DTOs (Brand + Model only) ──

export const CreateBrandRequestSchema = z.object({
  nameRu: z.string().min(1),
  nameTk: z.string().min(1),
  nameEn: z.string().min(1),
  slug: z.string().min(1),
});
export type CreateBrandRequest = z.infer<typeof CreateBrandRequestSchema>;

export const UpdateBrandRequestSchema = CreateBrandRequestSchema.partial();
export type UpdateBrandRequest = z.infer<typeof UpdateBrandRequestSchema>;

export const BRAND_LOGO_MAX_BYTES = 200 * 1024;
export const BrandLogoContentTypeSchema = z.enum(["image/svg+xml", "image/png", "image/webp"]);
export type BrandLogoContentType = z.infer<typeof BrandLogoContentTypeSchema>;

/** Why the API rejected a logo; sent as `details.reason` on a 400 `VALIDATION_FAILED`. */
export const BrandLogoRejectionReasonSchema = z.enum([
  "LOGO_UNSUPPORTED_TYPE",
  "LOGO_TOO_LARGE",
  "LOGO_EMPTY",
  "LOGO_UNREADABLE",
  "LOGO_TYPE_MISMATCH",
  "LOGO_NOT_SQUARE",
  "LOGO_UNSAFE_SVG",
  "LOGO_UPLOAD_MISSING",
]);
export type BrandLogoRejectionReason = z.infer<typeof BrandLogoRejectionReasonSchema>;

/**
 * Step 1 of an admin logo upload (ADR-0008 presigned path). The content type
 * is checked by the API so an unsupported type gets a specific reason.
 */
export const PresignBrandLogoRequestSchema = z.object({
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});
export type PresignBrandLogoRequest = z.infer<typeof PresignBrandLogoRequestSchema>;

/** The uploader PUTs the file to `uploadUrl` sending exactly `headers`. */
export const PresignBrandLogoResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string(),
  expiresIn: z.number().int().positive(),
  headers: z.record(z.string(), z.string()),
});
export type PresignBrandLogoResponse = z.infer<typeof PresignBrandLogoResponseSchema>;

/** Step 2: the API reads the uploaded object, validates it, and makes it the logo. */
export const SetBrandLogoRequestSchema = z.object({
  key: z.string().min(1),
});
export type SetBrandLogoRequest = z.infer<typeof SetBrandLogoRequestSchema>;

export const SetBrandLogoResponseSchema = z.object({
  id: z.string(),
  logoUrl: z.string().url(),
});
export type SetBrandLogoResponse = z.infer<typeof SetBrandLogoResponseSchema>;

export const DeleteBrandParamSchema = z.object({
  id: z.string().guid(),
});
export type DeleteBrandParam = z.infer<typeof DeleteBrandParamSchema>;

export const CreateModelRequestSchema = z.object({
  nameRu: z.string().min(1),
  nameTk: z.string().min(1),
  nameEn: z.string().min(1),
  slug: z.string().min(1),
  brandId: z.string().guid(),
});
export type CreateModelRequest = z.infer<typeof CreateModelRequestSchema>;

export const UpdateModelRequestSchema = CreateModelRequestSchema.partial();
export type UpdateModelRequest = z.infer<typeof UpdateModelRequestSchema>;

export const DeleteModelParamSchema = z.object({
  id: z.string().guid(),
});
export type DeleteModelParam = z.infer<typeof DeleteModelParamSchema>;
