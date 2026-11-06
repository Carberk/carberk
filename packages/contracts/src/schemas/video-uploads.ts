import { DateTimeSchema, z } from "../zod";

/** Prepared Listing video cap (ADR-0112): at most 15 MiB, MP4 only. */
export const MAX_VIDEO_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Server-chosen multipart part size; every part except the last is this size. */
export const VIDEO_UPLOAD_PART_SIZE_BYTES = 5 * 1024 * 1024;

export const VideoUploadTargetSchema = z.object({
  type: z.enum(["draft", "listing"]),
  id: z.string().uuid(),
});
export type VideoUploadTarget = z.infer<typeof VideoUploadTargetSchema>;

export const OpenVideoUploadRequestSchema = z.object({
  target: VideoUploadTargetSchema,
  contentType: z.literal("video/mp4"),
  sizeBytes: z.number().int().min(1).max(MAX_VIDEO_UPLOAD_BYTES),
  coverOffsetMs: z.number().int().min(0),
});
export type OpenVideoUploadRequest = z.infer<typeof OpenVideoUploadRequestSchema>;

export const VideoUploadPartSchema = z.object({
  partNumber: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
  uploadUrl: z.string().url(),
  expiresAt: DateTimeSchema,
});
export type VideoUploadPart = z.infer<typeof VideoUploadPartSchema>;

export const ConfirmedVideoPartSchema = z.object({
  partNumber: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative(),
});
export type ConfirmedVideoPart = z.infer<typeof ConfirmedVideoPartSchema>;

export const VideoUploadStateSchema = z.enum([
  "UPLOADING",
  "PROCESSING",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);
export type VideoUploadState = z.infer<typeof VideoUploadStateSchema>;

export const OpenVideoUploadResponseSchema = z.object({
  sessionId: z.string().uuid(),
  generationId: z.string().uuid(),
  target: VideoUploadTargetSchema,
  state: VideoUploadStateSchema,
  partSizeBytes: z.number().int().positive(),
  parts: z.array(VideoUploadPartSchema),
  expiresAt: DateTimeSchema,
});
export type OpenVideoUploadResponse = z.infer<typeof OpenVideoUploadResponseSchema>;

export const VideoUploadStatusResponseSchema = z.object({
  sessionId: z.string().uuid(),
  generationId: z.string().uuid(),
  target: VideoUploadTargetSchema,
  state: VideoUploadStateSchema,
  partSizeBytes: z.number().int().positive(),
  confirmedParts: z.array(ConfirmedVideoPartSchema),
  parts: z.array(VideoUploadPartSchema),
  expiresAt: DateTimeSchema,
  failureReason: z.string().max(500).nullable().optional(),
});
export type VideoUploadStatusResponse = z.infer<typeof VideoUploadStatusResponseSchema>;

export const CancelVideoUploadResponseSchema = z.object({
  sessionId: z.string().uuid(),
  generationId: z.string().uuid(),
  state: z.literal("CANCELLED"),
});
export type CancelVideoUploadResponse = z.infer<typeof CancelVideoUploadResponseSchema>;
