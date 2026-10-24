import { describe, expect, it, vi } from "vitest";
import { PrismaMeasurementCommit } from "./PrismaMeasurementCommit";

const activation = { enabled: true, environment: "test" as const, purposes: ["product_improvement" as const], evidenceRef: "savepoint-proof", realCollectionApproved: false };
const event = { version: 1 as const, eventId: "00000000-0000-4000-8000-000000000001", occurredAt: "2026-10-15T00:00:00.000Z", purpose: "product_improvement" as const,
  eventName: "listing_published" as const, context: { platform: "server" as const, release: "server", build: "unit", locale: "en" as const }, payload: { listingId: "00000000-0000-4000-8000-000000000002", cityId: "00000000-0000-4000-8000-000000000003" } };

function txThatFailsOutbox() {
  const raw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings[0] ?? "";
    if (sql.includes("current_setting")) return [{ statement: "0", lock: "0" }];
    if (sql.includes('FROM "measurement_state"')) return [{ epoch: "epoch-1" }];
    if (sql.includes('FROM "measurement_principals"')) return [{ id: "principal-1", generation: "generation-1", epoch: "epoch-1", userId: "user-1" }];
    if (sql.includes('FROM "users"')) return [{ deletionScheduledAt: null }];
    return [];
  });
  return { $executeRaw: raw, $queryRaw: raw, measurementOutbox: { createMany: vi.fn(async () => { throw new Error("collector unavailable"); }) } };
}

describe("PrismaMeasurementCommit savepoint isolation", () => {
  it("locks collector before principal and checks User eligibility after both", async () => {
    const tx = txThatFailsOutbox();
    await new PrismaMeasurementCommit(activation, "epoch-1").capture(tx, "user-1", event);
    const sql = tx.$queryRaw.mock.calls.map(([strings]) => String(strings[0]));
    const collector = sql.findIndex((query) => query.includes('FROM "measurement_state"'));
    const principal = sql.findIndex((query) => query.includes('FROM "measurement_principals"'));
    const user = sql.findIndex((query) => query.includes('FROM "users"'));
    expect(collector).toBeGreaterThanOrEqual(0);
    expect(principal).toBeGreaterThan(collector);
    expect(user).toBeGreaterThan(principal);
  });

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

it.each(["invalid", "", "2026-10-14T00:00:00Z"])("fails closed for invalid or expired supplied activation expiry %j", async (expiresAt) => {
 const tx = txThatFailsOutbox();
 const result = await new PrismaMeasurementCommit({...activation,environment:"staging"},"epoch-1",()=>new Date("2026-10-15T00:00:00Z"),expiresAt).capture(tx,"user-1",event);
 expect(result).toBe("disabled");expect(tx.$executeRaw).not.toHaveBeenCalled();expect(tx.$queryRaw).not.toHaveBeenCalled();
});
