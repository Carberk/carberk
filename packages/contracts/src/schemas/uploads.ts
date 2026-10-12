import { z } from "zod";

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
