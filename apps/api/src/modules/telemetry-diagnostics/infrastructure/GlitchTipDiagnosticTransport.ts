import { DiagnosticTelemetrySchemas as D } from "@auto-tm/contracts";
import type { DiagnosticTransport } from "../application/SyntheticDiagnosticRelay";

/** The server forwards only the strict synthetic event, never the request,
 * client IP, cookie, Session, SDK attachment or browser authorization header. */
export class GlitchTipDiagnosticTransport implements DiagnosticTransport {
 constructor(private readonly endpoint: string, private readonly publicKey: string, allowLoopbackTest = false) {
  let url: URL; try { url = new URL(endpoint); } catch { throw new Error("Invalid diagnostic collector configuration"); }
  if (!(url.protocol === "https:" || (allowLoopbackTest && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) || url.username || url.password || url.search || url.hash || !/^\/api\/[1-9][0-9]{0,9}\/store\/$/.test(url.pathname) || !/^[a-f0-9]{32}$/.test(publicKey)) throw new Error("Invalid diagnostic collector configuration");
 }
 async send(value: D.DiagnosticEvent): Promise<boolean> {
  const parsed = D.DiagnosticEventSchema.safeParse(value); if (!parsed.success) return false;
  const body = JSON.stringify(parsed.data); if (Buffer.byteLength(body) > 16_384) return false;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3_000);
  try {
   const response = await fetch(this.endpoint, { method: "POST", body, credentials: "omit", redirect: "error", signal: controller.signal,
    headers: { "content-type": "application/json", "x-sentry-auth": `Sentry sentry_version=7,sentry_client=carberk-synthetic/1,sentry_key=${this.publicKey}` } });
   if (!response.ok || !response.body) { await response.body?.cancel(); return false; }
   const reader = response.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
   try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 1_024) { await reader.cancel(); return false; } chunks.push(part.value); } }
   finally { reader.releaseLock(); }
   const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
   return !!result && typeof result === "object" && "id" in result && result.id === parsed.data.event_id;
  } catch { return false; }
  finally { clearTimeout(timer); }
 }
}
