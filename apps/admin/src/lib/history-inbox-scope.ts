import { createHash } from "node:crypto";
import { VehicleHistorySchemas as V } from "@auto-tm/contracts";

export function historyInboxScope(token: string): { actorId: string; scope: string } | null {
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: unknown; sid?: unknown };
    const id = V.HistoryOperatorSchema.shape.id;
    const actor = id.safeParse(claims.sub);
    const session = id.safeParse(claims.sid);
    if (!actor.success || !session.success) return null;
    const scope = createHash("sha256").update(`history-inbox\0${actor.data}\0${session.data}`).digest("hex");
    return { actorId: actor.data, scope };
  } catch {
    return null;
  }
}
