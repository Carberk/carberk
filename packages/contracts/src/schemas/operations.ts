import { z } from "zod";

export const OperationalProbeSchema = z.enum(["healthy", "failing", "unknown"]);
export const TechnicalSnapshotSchema = z.object({
  version: z.literal(1), observedAt: z.string().datetime(),
  errors: z.object({ windowMs: z.literal(300_000), requests: z.number().int().nonnegative(), technicalErrors: z.number().int().nonnegative(), rate: z.number().min(0).max(1).nullable() }).strict(),
  latency: z.object({ windowMs: z.literal(600_000), requests: z.number().int().nonnegative(), p95UpperMs: z.number().nonnegative().nullable() }).strict(),
}).strict().refine(value => value.errors.technicalErrors <= value.errors.requests
  && (value.errors.rate === null || (value.errors.requests >= 100 && Math.abs(value.errors.rate - value.errors.technicalErrors / value.errors.requests) < 1e-9))
  && (value.latency.p95UpperMs === null || value.latency.requests >= 100));
export type TechnicalSnapshot = z.infer<typeof TechnicalSnapshotSchema>;
export const OperationalQueueNameSchema = z.enum(["video-transcode", "notification-fanout", "orphan-cleanup", "account-purge", "retired-upload-cleanup",
  "listing-view-retention", "measurement-retention", "measurement-outbox", "service-lifecycle", "service-push", "diagnostic-artifacts", "email-code"]);
export const OperationsSnapshotSchema = z.object({
  version: z.literal(1),
  observedAt: z.string().datetime(),
  api: OperationalProbeSchema,
  collector: OperationalProbeSchema,
  worker: OperationalProbeSchema,
  technical: TechnicalSnapshotSchema.nullable().optional(),
  queues: z.array(z.object({ name: OperationalQueueNameSchema, waiting: z.number().int().min(0).max(1_000_000_000).nullable(), sustainedBacklog: z.boolean() }).strict()).max(12),
  incident: z.object({ openedAt: z.string().datetime(), lastObservedAt: z.string().datetime(), resolvedAt: z.string().datetime().nullable() }).strict().nullable(),
}).strict();
export type OperationsSnapshot = z.infer<typeof OperationsSnapshotSchema>;

export const OperationsHealthSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unavailable"), snapshot: z.null() }).strict(),
  z.object({ state: z.literal("available"), snapshot: OperationsSnapshotSchema }).strict(),
]);
export type OperationsHealth = z.infer<typeof OperationsHealthSchema>;
