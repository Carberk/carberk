import { z } from "zod";

/** Additive tester-only V1. Object keys, upload ids and actor authority never
 * enter these request bodies. Declared media facts are verified by the worker. */
export const CreateSessionInput = z.object({
  protocolVersion: z.literal(1),
  target: z.object({ kind: z.enum(["draft", "listing"]), id: z.string().uuid() }).strict(),
  prepared: z.object({ sizeBytes: z.number().int().min(1).max(15 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  posterMs: z.number().int().min(0).max(89_999),
  idempotencyKey: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict();
export const PartCredentialsInput = z.object({ partNumbers: z.array(z.number().int().min(1).max(3)).min(1).max(3).refine(parts => new Set(parts).size === parts.length) }).strict();
export const EmptyInput = z.object({}).strict();

export const ConfirmedPart = z.object({ partNumber: z.number().int().min(1).max(3), sizeBytes: z.number().int().positive().max(5242880), etag: z.string().min(1).max(1024) });
export const SessionSnapshot = z.object({ version: z.literal(1), sessionId: z.string().uuid(), generation: z.string().uuid(), state: z.enum(["INITIALIZING", "UPLOADING", "PAUSED", "COMPLETING", "PROCESSING", "READY", "FAILED", "CLEANUP_PENDING"]), expiresAt: z.string().datetime(), partBytes: z.literal(5242880), partCount: z.number().int().min(1).max(3), parts: z.array(ConfirmedPart).max(3).optional() });
export const PartCredentialsResponse = z.object({ version: z.literal(1), sessionId: z.string().uuid(), parts: z.array(z.object({ partNumber: z.number().int().min(1).max(3), sizeBytes: z.number().int().positive().max(5242880), url: z.string().url().max(8192), expiresAt: z.string().datetime() })).min(1).max(3) });
