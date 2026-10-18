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
