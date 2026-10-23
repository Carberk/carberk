import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
const state = z.object({ userId: z.string(), sessionId: z.string(), orderId: z.string(),
  query: z.enum(["retained-predecessors-v1", "b-handoffs-v1"]), until: z.number(), expires: z.number(), after: z.object({ at: z.string().datetime(), id: z.string() }).nullable() }).strict();
export type DiscoveryPosition = z.infer<typeof state>;
/** Fixed-size authenticated encryption hides scan positions, including omitted ids.
 * Process-local key: restart/replica change refuses uniformly; restart the scan. No persistent
 * rights or protected material is stored in the continuation. */
export class DiagnosticDiscoveryCursor {
  constructor(private readonly key: Buffer) {}
  open(token: string | undefined, subject: DiagnosticSubject, orderId: string, now: Date, query: DiscoveryPosition["query"] = "retained-predecessors-v1"): DiscoveryPosition {
    if (!token) return { ...subject, orderId, query, until: now.getTime(), expires: now.getTime() + 15 * 60_000, after: null };
    try {
      if (!/^[A-Za-z0-9_-]{1062}$/.test(token)) throw new Error("Invalid continuation");
      const bytes = Buffer.from(token, "base64url");
      const decipher = createDecipheriv("aes-256-gcm", this.key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const decoded = state.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString().trim()));
      if (decoded.query !== query || decoded.userId !== subject.userId || decoded.sessionId !== subject.sessionId || decoded.orderId !== orderId || decoded.expires <= now.getTime()) throw new Error("Expired or foreign continuation");
      return decoded;
    } catch { throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS"); }
  }
  seal(position: DiscoveryPosition): string {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = JSON.stringify(position);
    if (Buffer.byteLength(body) > 768) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
    const encrypted = Buffer.concat([cipher.update(body.padEnd(768)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  }
}
