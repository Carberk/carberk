import { describe, expect, it } from "vitest";

import { ExpireMeasurement } from "./ExpireMeasurement";
import { PrismaMeasurementRetentionLedger } from "./PrismaMeasurementRetentionLedger";
import { MeasurementRetentionDatabase } from "./application/testing/MeasurementRetentionDatabase";

const now = new Date("2026-10-25T00:00:00Z");
const visitCutoff = new Date("2026-07-27T00:00:00Z");

describe("measurement retention collector coordination", () => {
 it("refuses expiry without touching facts when another collector transaction holds the fence", async () => {
  const db = new MeasurementRetentionDatabase(); db.collectorBusy = true;
  db.rows.measurement_records.push({ id: "due", dueAt: now });
  const worker = new ExpireMeasurement(new PrismaMeasurementRetentionLedger(db.asPrisma()));
  await expect(worker.execute(now)).rejects.toThrow("Measurement retention unavailable");
  expect(db.rows.measurement_records).toEqual([{ id: "due", dueAt: now }]);
 });

 it("refuses an absent collector instead of fabricating an epoch or deleting unfenced facts", async () => {
  const db = new MeasurementRetentionDatabase(); db.collectorEpoch = null;
  db.rows.measurement_records.push({ id: "restored-old-epoch", dueAt: now });
  await expect(new PrismaMeasurementRetentionLedger(db.asPrisma()).deleteExpired(now, 1)).rejects.toThrow("Measurement collector unavailable");
  expect(db.collectorEpoch).toBeNull();
  expect(db.rows.measurement_records).toEqual([{ id: "restored-old-epoch", dueAt: now }]);
 });

 it("keeps independent per-table limits, due boundaries, skipped rows and direct deletion counts under the current epoch", async () => {
  const db = new MeasurementRetentionDatabase(); db.collectorEpoch = "rotated-external-epoch";
  for (const [table, rows] of Object.entries(db.rows)) {
   const cutoff = table === "measurement_visits" ? visitCutoff : now;
   rows.push({ id: "0-locked", dueAt: cutoff, locked: true }, { id: "1-boundary", dueAt: cutoff },
    { id: "2-backlog", dueAt: cutoff }, { id: "3-fresh", dueAt: new Date(cutoff.getTime() + 1) });
  }
  const ledger = new PrismaMeasurementRetentionLedger(db.asPrisma());
  expect(await ledger.deleteExpired(now, 1)).toBe(6);
  for (const rows of Object.values(db.rows)) expect(rows.map(row => row.id)).toEqual(["0-locked", "2-backlog", "3-fresh"]);
  expect(db.collectorEpoch).toBe("rotated-external-epoch");
  expect(db.options).toEqual([{ timeout: 10000, maxWait: 1000 }]);
 });

 it("rolls back earlier fact and outbox deletes if a later table fails", async () => {
  const db = new MeasurementRetentionDatabase(); db.failAt = "measurement_visits";
  db.rows.measurement_records.push({ id: "raw", dueAt: now });
  db.rows.measurement_outbox.push({ id: "queued", dueAt: now });
  await expect(new PrismaMeasurementRetentionLedger(db.asPrisma()).deleteExpired(now, 1)).rejects.toThrow("injected database failure");
  expect(db.rows.measurement_records).toEqual([{ id: "raw", dueAt: now }]);
  expect(db.rows.measurement_outbox).toEqual([{ id: "queued", dueAt: now }]);
 });
});
