import { OperationsSchemas } from "@auto-tm/contracts";

import type { StaffAuthorityPort, StaffSubject } from "../../identity/identity.public";

export class ReadOperationsHealth {
  constructor(private readonly authority: StaffAuthorityPort, private readonly read: () => Promise<string | null>, private readonly now: () => Date = () => new Date()) {}

  async execute(subject: StaffSubject): Promise<OperationsSchemas.OperationsHealth> {
    await this.authority.authorize({ ...subject, capability: "analytics.aggregate" });
    let result: OperationsSchemas.OperationsHealth = { state: "unavailable", snapshot: null };
    try {
      const raw = await this.read();
      if (raw && Buffer.byteLength(raw) <= 16_384) {
        const parsed = OperationsSchemas.OperationsSnapshotSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          const age = this.now().getTime() - Date.parse(parsed.data.observedAt);
          if (age >= -5_000 && age <= 90_000) result = { state: "available", snapshot: parsed.data };
        }
      }
    } catch { /* Missing, invalid or unreachable operational evidence is unknown. */ }
    // Recheck current authority after the bounded remote read. Revocation must not release a stale authorized response.
    await this.authority.authorize({ ...subject, capability: "analytics.aggregate" });
    return result;
  }
}
