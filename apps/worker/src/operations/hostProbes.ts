import { statfs } from "node:fs/promises";
import { connect } from "node:tls";

type DiskStats = { blocks: bigint; bavail: bigint };
export interface DiskObservation { state: "healthy" | "failing" | "unknown"; freeRatio: number | null }
export interface TlsObservation { state: "healthy" | "failing" | "unknown"; expiresAt: string | null }
/** The configured mount must be the intended monitored filesystem. A watchdog
 * container's rootfs cannot establish a separate DB/media volume's capacity. */
export class DiskProbe {
 private pending: Promise<DiskStats> | null = null;
 constructor(private readonly path?: string, private readonly read: (path: string) => Promise<DiskStats> = path => statfs(path, { bigint: true })) {}
 async check(): Promise<DiskObservation> {
  const unknown: DiskObservation = { state: "unknown", freeRatio: null };
  if (!this.path || !this.path.startsWith("/") || this.pending) return unknown;
  const pending = this.read(this.path); this.pending = pending;
  void pending.finally(() => { if (this.pending === pending) this.pending = null; }).catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   const stats = await Promise.race([pending, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1_000); })]);
   if (!stats || stats.blocks <= 0n || stats.bavail < 0n || stats.bavail > stats.blocks) return unknown;
   const freeRatio = Number(stats.bavail * 1_000_000n / stats.blocks) / 1_000_000;
   return { state: stats.bavail * 10n < stats.blocks ? "failing" : "healthy", freeRatio };
  } catch { return unknown; }
  finally { clearTimeout(timer); }
 }
}
/** Actual hostname/chain validation stays on. Only the expiry leaves the probe;
 * no certificate subject, endpoint, raw error or peer metadata is published. */
export async function tlsExpiryProbe(target: string | undefined, now: Date, testCa?: Buffer): Promise<TlsObservation> {
 let url: URL; try { if (!target) return { state: "unknown", expiresAt: null }; url = new URL(target); } catch { return { state: "unknown", expiresAt: null }; }
 if (url.protocol !== "https:" || url.username || url.password || url.hash) return { state: "unknown", expiresAt: null };
 return new Promise(resolve => {
  let settled = false;
  const socket = connect({ host: url.hostname, port: url.port ? Number(url.port) : 443, servername: url.hostname, rejectUnauthorized: true, ...(testCa ? { ca: testCa } : {}) });
  const finish = (result: TlsObservation) => { if (settled) return; settled = true; clearTimeout(timer); socket.destroy(); resolve(result); };
  const timer = setTimeout(() => finish({ state: "failing", expiresAt: null }), 3_000);
  socket.once("secureConnect", () => {
   const expiry = Date.parse(socket.getPeerCertificate().valid_to);
   if (!socket.authorized || !Number.isFinite(expiry)) { finish({ state: "failing", expiresAt: null }); return; }
   finish({ state: expiry - now.getTime() < 14 * 86400_000 ? "failing" : "healthy", expiresAt: new Date(expiry).toISOString() });
  });
  socket.once("error", () => finish({ state: "failing", expiresAt: null }));
  socket.once("close", () => finish({ state: "failing", expiresAt: null }));
 });
}
