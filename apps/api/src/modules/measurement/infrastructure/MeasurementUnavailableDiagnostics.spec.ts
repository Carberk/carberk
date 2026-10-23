import type { PrismaService } from "@auto-tm/db";
import type { MeasurementSchemas } from "@auto-tm/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcceptMeasurement } from "../application/AcceptMeasurement";
import type { MeasurementAuthority } from "../measurement.public";

import { PrismaMeasurementStore } from "./PrismaMeasurementStore";

const now = new Date("2026-10-15T00:00:00.000Z");
const authority: MeasurementAuthority = { origin: "server", environment: "test", population: "synthetic", subject: { kind: "account", pseudonym: "a".repeat(64), generation: "generation-1" } };
const event: MeasurementSchemas.MeasurementEvent = { version: 1, eventId: "00000000-0000-4000-8000-000000000001", visitId: "00000000-0000-4000-8000-000000000002", occurredAt: now.toISOString(), purpose: "product_improvement", eventName: "listing_visibility_changed", context: { platform: "server", release: "1.0", build: "1", locale: "en" }, payload: { listingId: "00000000-0000-4000-8000-000000000003", visibility: "public", reason: "published" } };
const activation = { enabled: true, environment: "test" as const, purposes: ["product_improvement" as const], evidenceRef: "synthetic-917", realCollectionApproved: false };
const failure = Object.assign(new Error("PRIVATE SQL account token capability payload"), { code: "P2010", meta: { message: "PRIVATE database details" } });

// Fake only the database boundary. Exercise the actual ingress, store and visit policy.
function setup(failAt?: string, error: unknown = failure, gate: Promise<void> = Promise.resolve()) {
 let query = 0;
 const step = async <T>(phase: string, result: T): Promise<T> => { if (phase === failAt) throw error; return result; };
 const tx = {
  $queryRaw: () => ++query === 1 ? step("epoch_lock", [{ epoch: "epoch" }]) : step("principal_lock", [{ id: "principal", pseudonym: authority.subject.pseudonym, generation: "generation-1", epoch: "epoch", kind: "account", userId: "PRIVATE user", expiresAt: null }]),
  measurementVisit: { findUnique: () => step("visit_read", { id: event.visitId, principalId: "principal", startedAt: now, foregroundAt: now, endedAt: null }) },
  measurementRecord: { createMany: () => step("record_insert", { count: 1 }) },
 };
 const db = { $transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => {
  await gate;
  await step("transaction_start", undefined);
  const result = await work(tx);
  await step("transaction_commit", undefined);
  return result;
 } } as unknown as PrismaService;
 const store = new PrismaMeasurementStore(db, { epoch: "epoch", environment: "test", population: "synthetic" }, () => now, { eligible: () => step("conversion_check", true) });
 return { store, ingress: new AcceptMeasurement(store, () => now, activation) };
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("sanitized attribution for unavailable measurement receipts", () => {
 it.each(["transaction_start", "epoch_lock", "principal_lock", "visit_read", "conversion_check", "record_insert", "transaction_commit"])("attributes a rejected %s without disclosing raw errors or identities", async phase => {
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { ingress } = setup(phase);
  expect(await ingress.afterCommit(event, authority)).toBe("unavailable");
  expect(warnings.mock.calls).toEqual([
   ["[measurement-unavailable]", { phase, prismaCode: "P2010" }],
   ["[measurement-unavailable]", { phase: "ledger_rejected", prismaCode: "P2010" }],
  ]);
 });
 it("does not forward arbitrary error codes, messages or metadata", async () => {
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { ingress } = setup("record_insert", { code: "PRIVATE token", message: "PRIVATE SQL", meta: failure.meta });
  expect(await ingress.afterCommit(event, authority)).toBe("unavailable");
  expect(warnings.mock.calls).toEqual([
   ["[measurement-unavailable]", { phase: "record_insert", prismaCode: "unknown" }],
   ["[measurement-unavailable]", { phase: "ledger_rejected", prismaCode: "unknown" }],
  ]);
 });
 it("distinguishes the existing deadline from rejection and observes a later rejection", async () => {
  vi.useFakeTimers();
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const { ingress } = setup("transaction_start", failure, gate);
  const pending = ingress.afterCommit(event, authority);
  await vi.advanceTimersByTimeAsync(249);
  expect(warnings.mock.calls).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBe("unavailable");
  expect(warnings.mock.calls).toEqual([["[measurement-unavailable]", { phase: "ledger_deadline", prismaCode: "unknown" }]]);
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(warnings.mock.calls).toEqual([
   ["[measurement-unavailable]", { phase: "ledger_deadline", prismaCode: "unknown" }],
   ["[measurement-unavailable]", { phase: "transaction_start", prismaCode: "P2010" }],
   ["[measurement-unavailable]", { phase: "ledger_rejected", prismaCode: "P2010" }],
  ]);
 });
 it("preserves accepted receipts and clears the deadline without warning", async () => {
  vi.useFakeTimers();
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await setup().ingress.afterCommit(event, authority)).toBe("accepted");
  await vi.advanceTimersByTimeAsync(1000);
  expect(warnings.mock.calls).toEqual([]);
 });
 it("preserves the original store error even if diagnostic output fails", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => { throw new Error("Output unavailable"); });
  const { store, ingress } = setup("transaction_start");
  await expect(store.appendIfEligible({ event, authority, receivedAt: now, expiresAt: now })).rejects.toBe(failure);
  expect(await ingress.afterCommit(event, authority)).toBe("unavailable");
 });
});
