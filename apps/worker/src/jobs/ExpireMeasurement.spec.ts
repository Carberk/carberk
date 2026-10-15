import { describe, expect, it } from "vitest";
import { ExpireMeasurement } from "./ExpireMeasurement";
import { FakeMeasurementRetentionLedger } from "./application/testing/FakeMeasurementRetentionLedger";
const now = new Date("2026-10-15T00:00:00Z");
describe("bounded measurement raw retention", () => {
 it("erases exact-boundary raw facts and caps backlog work without extending durable anonymous classes", async () => {
  const ledger = new FakeMeasurementRetentionLedger(); ledger.rows.push(new Date("2026-10-14T00:00:00Z"), now, new Date("2026-10-16T00:00:00Z"));
  const result = await new ExpireMeasurement(ledger).execute(now, { batchSize: 1, maxBatches: 1 });
  expect(result.deleted).toBe(1); expect(result.oldestOverdueAt?.toISOString()).toBe("2026-10-14T00:00:00.000Z"); expect(result.healthy).toBe(false);
  expect((await new ExpireMeasurement(ledger).execute(now)).deleted).toBe(1); expect(ledger.rows).toEqual([new Date("2026-10-16T00:00:00Z")]);
 });
 it("reports collector failure without leaking SQL or claiming successful expiry", async () => {
  const ledger = new FakeMeasurementRetentionLedger(); ledger.unavailable = true;
  await expect(new ExpireMeasurement(ledger).execute(now)).rejects.toThrow("Measurement retention unavailable");
 });
});
