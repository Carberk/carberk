import { describe, expect, it } from "vitest";
import { BootstrapMeasurement } from "./BootstrapMeasurement";
import { FakeMeasurementSessions } from "./testing/FakeMeasurementSessions";
const capability = `mg_${"a".repeat(43)}`;
describe("measurement issuance and guest rights", () => {
 it("does not issue without activation and preserves guest erasure with collection off", async () => {
  const sessions = new FakeMeasurementSessions(); const bootstrap = new BootstrapMeasurement(sessions, "synthetic");
  expect(await bootstrap.execute({}, {})).toEqual({ kind: "disabled" }); expect(sessions.bootstraps).toEqual([]);
  expect(await bootstrap.eraseGuest(capability)).toBe("accepted"); expect(sessions.erased.has(capability)).toBe(true);
 });
 it("does not mistake trusted population labels for real collection approval or accept client actor claims", async () => {
  const sessions = new FakeMeasurementSessions(); const bootstrap = new BootstrapMeasurement(sessions, "marketplace", { enabled: true, environment: "production", purposes: ["product_improvement"], evidenceRef: "fixture", realCollectionApproved: false });
  expect(await bootstrap.execute({}, {})).toEqual({ kind: "disabled" });
  expect(await bootstrap.execute({ actorId: "injected" }, {})).toEqual({ kind: "invalid" });
  expect(await bootstrap.execute({}, { guestCapability: "raw-injected" })).toEqual({ kind: "invalid" });
  expect(sessions.bootstraps).toEqual([]);
 });
});
