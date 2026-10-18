import { z } from "zod";

import { getAccessToken } from "@/lib/cookies";
import { getApiBaseUrl } from "@/lib/api-config";
import { validateOrigin } from "@/lib/validators";

const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
export type PrivateFileContext = { params: Promise<{ id: string; file: string }> };
export async function proxyPrivateFile(request: Request, context: PrivateFileContext, upload: boolean, resource: "attachments" | "history/artifacts"): Promise<Response> {
 const token = await getAccessToken();
 if (!token || (upload && !validateOrigin(request))) return Response.json({ code: "NO_ACCESS" }, { status: 403, headers });
 const params = z.object({ id: z.string().uuid(), file: z.string().uuid() }).safeParse(await context.params);
 if (!params.success) return Response.json({ code: "INVALID_ATTACHMENT" }, { status: 400, headers });
 const path = `/services/conversations/${params.data.id}/${resource}/${params.data.file}${upload ? "/bytes" : ""}`;
 if (upload && (Number(request.headers.get("Content-Length")) > 20 * 1024 * 1024 || request.headers.get("Content-Type") !== "application/octet-stream")) return Response.json({ code: "INVALID_ATTACHMENT" }, { status: 400, headers });
 let bytes: Uint8Array | undefined;
 if (upload) { bytes = new Uint8Array(await request.arrayBuffer()); if (bytes.length > 20 * 1024 * 1024) return Response.json({ code: "INVALID_ATTACHMENT" }, { status: 400, headers }); }
 const upstream = await fetch(`${getApiBaseUrl()}${path}`, { method: upload ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(upload ? { "Content-Type": "application/octet-stream" } : {}) }, ...(bytes ? { body: bytes as BodyInit } : {}), cache: "no-store", signal: AbortSignal.timeout(30000) });
 const outputHeaders = new Headers(headers);
 outputHeaders.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/octet-stream");
 const disposition = upstream.headers.get("Content-Disposition"); if (disposition) outputHeaders.set("Content-Disposition", disposition);
 return new Response(upstream.body, { status: upstream.status, headers: outputHeaders });
}
