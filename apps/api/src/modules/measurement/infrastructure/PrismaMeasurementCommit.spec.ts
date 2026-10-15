import { describe, expect, it, vi } from "vitest";
import { PrismaMeasurementCommit } from "./PrismaMeasurementCommit";

const activation = { enabled: true, environment: "test" as const, purposes: ["product_improvement" as const], evidenceRef: "savepoint-proof", realCollectionApproved: false };
const event = { version: 1 as const, eventId: "00000000-0000-4000-8000-000000000001", occurredAt: "2026-10-15T00:00:00.000Z", purpose: "product_improvement" as const,
  eventName: "listing_published" as const, context: { platform: "server" as const, release: "server", build: "unit", locale: "en" as const }, payload: { listingId: "00000000-0000-4000-8000-000000000002", cityId: "00000000-0000-4000-8000-000000000003" } };

function txThatFailsOutbox() {
  const raw = vi.fn(async (strings: TemplateStringsArray) => strings[0]?.includes("current_setting") ? [{ statement: "0", lock: "0" }] : strings[0]?.includes("SELECT p.") ? [{ id: "principal-1", generation: "generation-1" }] : []);
  return { $executeRaw: raw, $queryRaw: raw, measurementOutbox: { createMany: vi.fn(async () => { throw new Error("collector unavailable"); }) } };
}

describe("PrismaMeasurementCommit savepoint isolation", () => {
  it("rolls back collector failure to its savepoint and reports unavailable", async () => {
    const tx = txThatFailsOutbox();
    const result = await new PrismaMeasurementCommit(activation, "epoch-1").capture(tx, "user-1", event);
    expect(result).toBe("unavailable");
    expect(tx.$executeRaw.mock.calls.some(([sql]) => String(sql).includes("ROLLBACK TO SAVEPOINT"))).toBe(true);
    expect(tx.$executeRaw.mock.calls.some(([sql]) => String(sql).includes("RELEASE SAVEPOINT"))).toBe(true);
  });

  it("does not touch a transaction when disabled", async () => {
    const tx = txThatFailsOutbox();
    const result = await new PrismaMeasurementCommit({ ...activation, enabled: false }, "epoch-1").capture(tx, "user-1", event);
    expect(result).toBe("disabled"); expect(tx.$executeRaw).not.toHaveBeenCalled(); expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
