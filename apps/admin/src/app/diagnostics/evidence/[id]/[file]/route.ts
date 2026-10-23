import { z } from "zod";

import { getApiBaseUrl } from "@/lib/api-config";
import { getAccessToken } from "@/lib/cookies";
import { validateOrigin } from "@/lib/validators";

const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
type Context = { params: Promise<{ id: string; file: string }> };
async function proxy(request: Request, context: Context, upload: boolean) {
 const token = await getAccessToken();
 const params = z.object({ id: z.string().uuid(), file: z.string().uuid() }).safeParse(await context.params);
 if (!token || !params.success || (upload && !validateOrigin(request))) return Response.json({ code: "DIAGNOSTIC_NO_ACCESS" }, { status: 403, headers });
 const path = `/diagnostics/reports/${params.data.id}/evidence/${params.data.file}`;
 let bytes: Uint8Array | undefined, query = "";
 if (upload) {
  const input = z.object({ findingId: z.string().uuid(), expectedVersion: z.coerce.number().int().nonnegative() }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success || !["image/jpeg", "image/png", "image/webp"].includes(request.headers.get("X-Evidence-Type") ?? "") || request.headers.get("Content-Type") !== "application/octet-stream" || Number(request.headers.get("Content-Length")) > 10*1024*1024) return Response.json({ code: "REPORT_EVIDENCE_INVALID" }, { status: 400, headers });
  const reader = request.body?.getReader(); if (!reader) return Response.json({}, { status: 400, headers });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
   while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 10*1024*1024) { await reader.cancel(); return Response.json({}, { status: 400, headers }); } chunks.push(part.value); }
   bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  } finally { reader.releaseLock(); }
  query = `?${new URLSearchParams({ findingId: input.data.findingId, expectedVersion: String(input.data.expectedVersion) })}`;
 }
 const upstream = await fetch(`${getApiBaseUrl()}${path}${query}`, { method: upload ? "PUT" : "GET", headers: { Authorization: `Bearer ${token}`, ...(upload ? { "Content-Type": "application/octet-stream", "X-Evidence-Type": request.headers.get("X-Evidence-Type")??"" } : {}) }, ...(bytes ? { body: bytes as BodyInit } : {}), cache: "no-store", signal: AbortSignal.timeout(30000) });
 return new Response(upstream.body, { status: upstream.status, headers: { ...headers, "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream" } });
}
export async function GET(request: Request, context: Context) { return proxy(request, context, false); }
export async function PUT(request: Request, context: Context) { return proxy(request, context, true); }
