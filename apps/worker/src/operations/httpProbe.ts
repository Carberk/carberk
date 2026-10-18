import type { ProbeState } from "./Watchdog";

/** API probing requires actual business readiness, including maintenance denial, rather than just liveness. */
export async function httpProbe(url: string | undefined, target: "api" | "collector"): Promise<ProbeState> {
  if (!url) return "unknown";
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000), redirect: "error", headers: { accept: "application/json" } });
    if (!response.ok || target === "collector") {
      await response.body?.cancel();
      return response.ok ? "healthy" : "failing";
    }
    if (!response.body) return "failing";
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.length;
        if (bytes > 4_096) return "failing";
        parts.push(next.value);
      }
    } finally { await reader.cancel(); }
    const value: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    return typeof value === "object" && value !== null && "status" in value && value.status === "ready" ? "healthy" : "failing";
  } catch { return "failing"; }
}
