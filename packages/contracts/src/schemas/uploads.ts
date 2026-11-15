import { z } from "../zod";
import { ErrorCode, ErrorResponseSchema } from "../errors";

export const PresignKindSchema = z.enum(["image", "video"]);
export type PresignKind = z.infer<typeof PresignKindSchema>;

export const PresignRequestSchema = z.object({
  kind: PresignKindSchema,
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  /** Omitted by installed clients: preserves the legacy upload flow. */
  writeProtocol: z.literal("conditional-v1").optional(),
});
export type PresignRequest = z.infer<typeof PresignRequestSchema>;

/** Renewal retains issuance identity and metadata; targets and ETags are never caller authority. */
export const RenewPhotoUploadRequestSchema = z.object({
  key: z.string().regex(/^pending\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/original\.webp$/),
  contentType: z.literal("image/webp"),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
}).strict();
export type RenewPhotoUploadRequest = z.infer<typeof RenewPhotoUploadRequestSchema>;

/** The renewal route's 400 responses retain the ordinary error envelope and details. */
export const RenewPhotoUploadRefusalSchema = ErrorResponseSchema.extend({
  statusCode: z.literal(400),
  code: z.enum([ErrorCode.ValidationFailed, "UPLOAD_NOT_AVAILABLE"]),
  // The existing HTTP filter preserves the caller's ID or returns "unknown".
  requestId: z.string(),
});

export const PresignResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string(),
  expiresIn: z.number().int().positive(),
  maxSizeBytes: z.number().int().positive(),
  /** Required HTTP PUT headers for opt-in uploads; absent on legacy responses. */
  headers: z.record(z.string(), z.string()).optional(),
});
export type PresignResponse = z.infer<typeof PresignResponseSchema>;

/** Change the served URI when regenerated WebP derivatives must bypass older disk/CDN entries. */
export const PHOTO_VARIANT_CACHE_VERSION = "webp-natural-1";
