import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { rejectExpiredSession } from "./action-session";
import { getApiBaseUrl } from "./api-config";
import { getAccessToken } from "./cookies";

// Transport bounds, not retention policy. Uploads match the existing strict stage contract.
export const DIAGNOSTIC_IMAGE_LIMIT = 10 * 1024 * 1024;
export const DIAGNOSTIC_JSON_LIMIT = 8 * 1024 * 1024;
export const diagnosticHeaders = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
export const diagnosticUuid = z.string().uuid();
export const diagnosticPairQuery = z.object({ predecessorId: diagnosticUuid }).strict();
export type ProtectedDiagnosticResult<T> = { ok: true; data: T } | { ok: false; error: "denied" | "conflict" | "error"; code: string };

export class DiagnosticTransportError extends Error {
 constructor(readonly status: number) { super("Diagnostic transport unavailable"); }
}
export function diagnosticFailure(status: number) {
 return { ok: false as const, error: status === 401 || status === 403 ? "denied" as const : status === 409 ? "conflict" as const : "error" as const,
  code: status === 401 || status === 403 ? "DIAGNOSTIC_NO_ACCESS" : status === 409 ? "DIAGNOSTIC_CONFLICT" : "DIAGNOSTIC_INVALID_INPUT" };
}

/** Reject malformed declarations before reading; bound chunked bodies before copying/decoding.
 * No bytes are released to the browser until the whole upstream representation fits. */
export async function diagnosticBytes(body: ReadableStream<Uint8Array> | null, length: string | null, limit: number): Promise<Uint8Array> {
 if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > limit)) {
  await body?.cancel(); throw new DiagnosticTransportError(400);
 }
 if (!body) throw new DiagnosticTransportError(400);
 const reader = body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
 try {
  while (true) {
   const part = await reader.read(); if (part.done) break;
   size += part.value.byteLength;
   if (size > limit) { await reader.cancel(); throw new DiagnosticTransportError(400); }
   chunks.push(part.value);
  }
 } finally { reader.releaseLock(); }
 if (!size || (length !== null && Number(length) !== size)) throw new DiagnosticTransportError(400);
 const bytes = new Uint8Array(size); let offset = 0;
 for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
 return bytes;
}
export async function diagnosticJson<S extends z.ZodType>(response: Response, schema: S): Promise<z.output<S>> {
 if (!response.ok) {
  await response.body?.cancel();
  throw new DiagnosticTransportError([400, 401, 403, 409].includes(response.status) ? response.status : 502);
 }
 if (response.headers.get("Content-Type")?.split(";")[0]?.trim() !== "application/json") {
  await response.body?.cancel(); throw new DiagnosticTransportError(502);
 }
 const bytes = await diagnosticBytes(response.body, response.headers.get("Content-Length"), DIAGNOSTIC_JSON_LIMIT);
 return schema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
export async function diagnosticFetch(path: string, token: string, options: { body?: unknown } = {}): Promise<Response> {
 return fetch(`${getApiBaseUrl()}${path}`, {
  method: options.body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, ...(options.body === undefined ? {} : { "Content-Type": "application/json" }) },
  ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30000),
 });
}

/** New actions use a bounded, schema-checked transport with fixed public errors.
 * Current bearer authority is fetched once per invocation and never returned. */
export async function protectedDiagnostic<T>(mutation: boolean, work: (token: string) => Promise<T>): Promise<ProtectedDiagnosticResult<T>> {
 await rejectExpiredSession();
 try {
  if (mutation) {
   const incoming = await headers(); const origin = incoming.get("origin");
   const expected = process.env["ADMIN_ORIGIN"];
   if (!origin) throw new DiagnosticTransportError(403);
   const parsed = new URL(origin);
   if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin || (expected ? origin !== expected : parsed.host !== incoming.get("host"))) throw new DiagnosticTransportError(403);
  }
  const token = await getAccessToken(); if (!token) throw new DiagnosticTransportError(403);
  return { ok: true, data: await work(token) };
 } catch (error) {
  unstable_rethrow(error);
  return diagnosticFailure(error instanceof DiagnosticTransportError ? error.status : 400);
 }
}
