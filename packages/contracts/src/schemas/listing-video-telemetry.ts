import { z } from "../zod";

import { MAX_VIDEO_UPLOAD_BYTES } from "./video-uploads";

/**
 * Tester measurements from the phone for Listing video (#1052). Every event
 * is a fixed name with fixed reasons, counts, byte sizes and durations, and
 * unknown keys are refused, so no file contents, URL, grant, credential,
 * path, ID or other personal data can be sent or logged through it.
 */
const durationMs = z.number().int().min(0).max(24 * 60 * 60 * 1000);
const bytes = z.number().int().min(0).max(MAX_VIDEO_UPLOAD_BYTES);
const count = z.number().int().min(0).max(10_000);
const audience = z.enum(["viewer", "owner-preview", "moderator"]);
const uploadProgress = { confirmedBytes: bytes, totalBytes: bytes };

export const ListingVideoTelemetryEventSchema = z.discriminatedUnion("event", [
  z.strictObject({
    event: z.literal("preparation_finished"),
    outcome: z.enum(["prepared", "failed"]),
    failure: z.enum(["source", "interrupted", "storage", "preparation"]).optional(),
    /** Copy plus trim/transcode on the phone. */
    durationMs,
    /** Length of the kept interval. */
    clipMs: durationMs,
    preparedBytes: bytes.optional(),
  }),
  z.strictObject({
    event: z.literal("upload_interrupted"),
    reason: z.enum(["user", "network", "background"]),
    ...uploadProgress,
  }),
  z.strictObject({
    event: z.literal("upload_resumed"),
    /** What the upload resumed from; `restart` is a reopened app. */
    reason: z.enum(["user", "network", "background", "retry", "restart"]),
    ...uploadProgress,
  }),
  z.strictObject({
    event: z.literal("upload_failed"),
    failure: z.enum(["transfer", "source", "expired"]),
    ...uploadProgress,
  }),
  z.strictObject({
    event: z.literal("playback_started"),
    audience,
    quality: z.enum(["auto", "data-saver", "240", "360", "720"]),
    /** From the Play tap to the first playing frame. */
    startupMs: durationMs,
  }),
  z.strictObject({
    event: z.literal("playback_abandoned"),
    audience,
    /** From the Play tap to leaving before the first playing frame. */
    waitedMs: durationMs,
  }),
  z.strictObject({
    event: z.literal("playback_buffering"),
    audience,
    /** Stalls after playback started, reported when the player closes. */
    stallCount: count,
    stallMs: durationMs,
    /** The furthest position reached, not the total time spent playing. */
    watchedMs: durationMs,
  }),
]);
export type ListingVideoTelemetryEvent = z.infer<typeof ListingVideoTelemetryEventSchema>;
