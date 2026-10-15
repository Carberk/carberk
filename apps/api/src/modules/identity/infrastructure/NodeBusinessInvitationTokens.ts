import { createHash, randomBytes } from "node:crypto";
import type { BusinessInvitationTokens } from "../domain/ports/BusinessRepository";
export class NodeBusinessInvitationTokens implements BusinessInvitationTokens {
 issue(): string { return randomBytes(32).toString("hex"); }
 hash(token: string): string { return createHash("sha256").update(token).digest("hex"); }
}
