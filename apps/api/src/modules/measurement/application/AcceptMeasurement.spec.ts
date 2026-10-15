import { describe, expect, it } from "vitest";
import type { MeasurementSchemas } from "@auto-tm/contracts";
import { AcceptMeasurement } from "./AcceptMeasurement";
import { FakeMeasurementLedger } from "./testing/FakeMeasurementLedger";
import type { MeasurementAuthority } from "../measurement.public";

const event: MeasurementSchemas.MeasurementEvent = { version: 1, eventId: "00000000-0000-4000-8000-000000000001", occurredAt: "2026-10-15T00:00:00.000Z",
 purpose: "product_improvement", eventName: "listing_published", context: { platform: "server", release: "1.0", build: "1", locale: "tk" },
 payload: { listingId: "00000000-0000-4000-8000-000000000002", cityId: "00000000-0000-4000-8000-000000000003" } };
const authority: MeasurementAuthority = { origin: "server", environment: "staging", population: "synthetic", subject: { kind: "account", pseudonym: "a".repeat(64), generation: "generation-1" } };
const activation = { environment: "staging" as const, purposes: ["product_improvement" as const], evidenceRef: "fixture-proof-905", enabled: true, realCollectionApproved: false };
function setup() { const ledger = new FakeMeasurementLedger(); const ingress = new AcceptMeasurement(ledger, () => new Date("2026-10-15T00:00:00.000Z"), activation); return { ledger, ingress }; }
describe("trusted first-party measurement ingress", () => {
 it("defaults closed and requires purpose activation evidence independently of trusted population", async () => {
  const ledger = new FakeMeasurementLedger(); const ingress = new AcceptMeasurement(ledger, () => new Date(), undefined);
  expect(await ingress.afterCommit(event, authority)).toBe("disabled"); expect(ledger.records).toHaveLength(0);
 });
 it("durably deduplicates committed facts and fixes trusted receive/expiry metadata", async () => {
  const { ledger, ingress } = setup(); expect(await ingress.afterCommit(event, authority)).toBe("accepted");
  expect(await ingress.afterCommit(event, authority)).toBe("duplicate");
  expect(ledger.records[0]?.receivedAt.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  expect(ledger.records[0]?.expiresAt.toISOString()).toBe("2027-01-13T00:00:00.000Z");
 });
 it("rejects client guesses, raw fields, environment spoofing and invalid time without forwarding payloads", async () => {
  const { ledger, ingress } = setup();
  expect(await ingress.afterCommit(event, { ...authority, origin: "client" })).toBe("invalid");
  expect(await ingress.afterCommit({ ...event, token: "SENSITIVE" } as MeasurementSchemas.MeasurementEvent, authority)).toBe("invalid");
  expect(await ingress.afterCommit(event, { ...authority, environment: "production" })).toBe("disabled");
  expect(await ingress.afterCommit({ ...event, occurredAt: "2026-10-01T00:00:00.000Z" }, authority)).toBe("invalid");
  expect(ledger.records).toHaveLength(0);
 });
 it("rejects real populations without separate admission, and permits genuine eligible activity without admin-role exclusion", async () => {
  const { ledger, ingress } = setup(); expect(await ingress.afterCommit(event, { ...authority, population: "marketplace" })).toBe("disabled");
  const admitted = new AcceptMeasurement(ledger, () => new Date("2026-10-15T00:00:00.000Z"), { ...activation, realCollectionApproved: true });
  expect(await admitted.afterCommit(event, { ...authority, population: "marketplace" })).toBe("accepted");
 });
 it("cannot reattach a revoked generation and isolates ledger failure", async () => {
  const { ledger, ingress } = setup(); ledger.revoked.add("generation-1"); expect(await ingress.afterCommit(event, authority)).toBe("revoked");
  ledger.unavailable = true; expect(await ingress.afterCommit(event, authority)).toBe("unavailable");
 });
});
