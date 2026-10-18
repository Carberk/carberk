import { describe, expect, it } from "vitest";

import { StaffAuthorityDenied, type StaffAuthorityPort } from "../../identity/identity.public";

import { ReadOperationsHealth } from "./ReadOperationsHealth";

const subject = { userId: "synthetic", sessionId: "session" };
const now = new Date("2026-10-18T00:00:00Z");
const snapshot = { version: 1, observedAt: now.toISOString(), api: "healthy", collector: "unknown", worker: "healthy", queues: [], incident: null };
function fixture() {
  let allowed = true;
  const authority: StaffAuthorityPort = { authorize: async input => {
    expect(input).toEqual({ ...subject, capability: "analytics.aggregate" });
    if (!allowed) throw new StaffAuthorityDenied("CAPABILITY_REQUIRED");
  }, summary: async () => ({ capabilities: [], elevated: false }) };
  return { authority, revoke: () => { allowed = false; } };
}
describe("safe operational staff reads", () => {
  it("denies absent current grant before reading infrastructure", async () => {
    const scope = fixture(); scope.revoke();
    let read = false;
    const service = new ReadOperationsHealth(scope.authority, async () => { read = true; return null; });
    await expect(service.execute(subject)).rejects.toBeInstanceOf(StaffAuthorityDenied);
    expect(read).toBe(false);
  });
  it("denies authority revoked during the remote read", async () => {
    const scope = fixture();
    const service = new ReadOperationsHealth(scope.authority, async () => { scope.revoke(); return JSON.stringify(snapshot); }, () => now);
    await expect(service.execute(subject)).rejects.toBeInstanceOf(StaffAuthorityDenied);
  });
  it("returns a bounded current snapshot and treats missing, stale, future or private fields as unknown", async () => {
    const scope = fixture();
    const valid = new ReadOperationsHealth(scope.authority, async () => JSON.stringify(snapshot), () => now);
    expect(await valid.execute(subject)).toEqual({ state: "available", snapshot });
    for (const raw of [null, "malformed", "x".repeat(16_385), JSON.stringify({ ...snapshot, token: "private" }),
      JSON.stringify({ ...snapshot, observedAt: new Date(now.getTime() - 90_001).toISOString() }),
      JSON.stringify({ ...snapshot, observedAt: new Date(now.getTime() + 5_001).toISOString() })]) {
      expect(await new ReadOperationsHealth(scope.authority, async () => raw, () => now).execute(subject)).toEqual({ state: "unavailable", snapshot: null });
    }
  });
});
