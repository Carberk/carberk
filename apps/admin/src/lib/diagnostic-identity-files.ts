import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { z } from "zod";

import { getApiBaseUrl } from "./api-config";
import { SESSION_EXPIRED_HEADER } from "./auth-cookie-options";
import { getAccessToken } from "./cookies";
import { diagnosticBytes, diagnosticFailure, diagnosticHeaders, diagnosticJson, diagnosticPairQuery, diagnosticUuid, DiagnosticTransportError, DIAGNOSTIC_IMAGE_LIMIT } from "./diagnostic-transport";
import { validateOrigin } from "./validators";

type Context = { params: Promise<{ id: string; file: string }> };
const paramsSchema = z.object({ id: diagnosticUuid, file: diagnosticUuid }).strict();
const uploadQuery = z.object({ expectedOrderVersion: z.string().regex(/^(0|[1-9]\d*)$/).transform(Number).pipe(z.number().int().nonnegative().safe()) }).strict();
const imageType = z.enum(["image/jpeg", "image/png", "image/webp"]);
function query(request: Request) {
 const entries = [...new URL(request.url).searchParams.entries()];
 if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new DiagnosticTransportError(400);
 return Object.fromEntries(entries);
}
/** Order provenance and exact-pair provenance never share a report-evidence fallback. */
export async function diagnosticIdentityFile(request: Request, context: Context, kind: "order" | "pair", upload = false): Promise<Response> {
 try {
  if (request.headers.get(SESSION_EXPIRED_HEADER) === "1" || (upload && !validateOrigin(request))) throw new DiagnosticTransportError(403);
  const token = await getAccessToken(); if (!token) throw new DiagnosticTransportError(403);
  const { id, file } = paramsSchema.parse(await context.params);
  const input = query(request);
  let path = `/diagnostics/orders/${id}/identity-provenance/${file}`;
  let bytes: Uint8Array | undefined; let mime: string | undefined;
  if (kind === "pair") {
   const pair = diagnosticPairQuery.parse(input);
   path = `/diagnostics/orders/${id}/reinspection-comparison/provenance/${file}?${new URLSearchParams(pair)}`;
  } else if (upload) {
   const version = uploadQuery.parse(input);
   mime = imageType.parse(request.headers.get("X-Evidence-Type"));
   if (request.headers.get("Content-Type") !== "application/octet-stream") throw new DiagnosticTransportError(400);
   bytes = await diagnosticBytes(request.body, request.headers.get("Content-Length"), DIAGNOSTIC_IMAGE_LIMIT);
   path += `?${new URLSearchParams({ expectedOrderVersion: String(version.expectedOrderVersion) })}`;
  } else z.object({}).strict().parse(input);
  const upstream = await fetch(`${getApiBaseUrl()}${path}`, {
   method: upload ? "PUT" : "GET", headers: { Authorization: `Bearer ${token}`, ...(upload ? { "Content-Type": "application/octet-stream", "X-Evidence-Type": mime! } : {}) },
   ...(bytes ? { body: bytes as BodyInit } : {}), cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30000),
  });
  if (upload) {
   const result = await diagnosticJson(upstream, D.DiagnosticIdentityProvenanceSchema);
   return Response.json(result, { status: upstream.status, headers: diagnosticHeaders });
  }
  if (!upstream.ok) { await upstream.body?.cancel(); throw new DiagnosticTransportError([400, 401, 403, 409].includes(upstream.status) ? upstream.status : 502); }
  // The protected API returns only retained sanitized WebP, never the original upload.
  if (upstream.headers.get("Content-Type") !== "image/webp") { await upstream.body?.cancel(); throw new DiagnosticTransportError(502); }
  const image = await diagnosticBytes(upstream.body, upstream.headers.get("Content-Length"), DIAGNOSTIC_IMAGE_LIMIT);
  return new Response(image as BodyInit, { headers: { ...diagnosticHeaders, "Content-Type": "image/webp", "Content-Length": String(image.byteLength) } });
 } catch (error) {
  const status = error instanceof DiagnosticTransportError ? error.status : error instanceof z.ZodError ? 400 : 502;
  return Response.json({ code: diagnosticFailure(status).code }, { status, headers: diagnosticHeaders });
 }
}
