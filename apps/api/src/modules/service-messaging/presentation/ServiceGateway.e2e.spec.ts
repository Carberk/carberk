// Actual Socket.IO and HTTP fixture coverage is consolidated with ServiceMessaging.e2e.
// This file documents the transport protocol without substituting mocked authority.
import { expect, it } from "vitest";
import { ServiceRealtimeProtocol } from "./ServiceRealtimeProtocol";
it("rejects body/identity material in service invalidation payloads", () => {
 expect(ServiceRealtimeProtocol.changed.safeParse({ conversationId: "11111111-1111-4111-8111-111111111111", lastSequence: 1, body: "private" }).success).toBe(false);
});
