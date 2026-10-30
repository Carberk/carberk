import { describe, expect, it } from "vitest";
import { PrismaMeasurementCommit } from "./PrismaMeasurementCommit";

const activation = { enabled: true, environment: "test" as const, purposes: ["product_improvement" as const], evidenceRef: "savepoint-proof", realCollectionApproved: false };
const event = { version: 1 as const, eventId: "00000000-0000-4000-8000-000000000001", occurredAt: "2026-10-15T00:00:00.000Z", purpose: "product_improvement" as const,
  eventName: "listing_published" as const, context: { platform: "server" as const, release: "server", build: "unit", locale: "en" as const }, payload: { listingId: "00000000-0000-4000-8000-000000000002", cityId: "00000000-0000-4000-8000-000000000003" } };

function measurementTransaction(options: { failOutbox?: boolean; deletionScheduledAt?: Date | null } = {}) {
  const outbox: unknown[] = [];
  let savepoint: unknown[] | null = null;
  let lockPhase = 0;
  let operations = 0;
  const executeRaw = async (strings: TemplateStringsArray) => {
    operations += 1;
    const sql = strings[0] ?? "";
    if (sql.includes("SAVEPOINT") && !sql.includes("ROLLBACK") && !sql.includes("RELEASE")) savepoint = [...outbox];
    if (sql.includes("ROLLBACK TO SAVEPOINT")) {
      outbox.splice(0, outbox.length, ...(savepoint ?? []));
    }
    if (sql.includes("RELEASE SAVEPOINT")) savepoint = null;
  };
  const queryRaw = async (strings: TemplateStringsArray) => {
    operations += 1;
    const sql = strings[0] ?? "";
    if (sql.includes("current_setting")) return [{ statement: "0", lock: "0" }];
    if (sql.includes('FROM "measurement_state"')) {
      if (lockPhase !== 0) throw new Error("collector_lock_order");
      lockPhase = 1;
      return [{ epoch: "epoch-1" }];
    }
    if (sql.includes('FROM "measurement_principals"')) {
      if (lockPhase !== 1) throw new Error("principal_lock_order");
      lockPhase = 2;
      return [{ id: "principal-1", generation: "generation-1", epoch: "epoch-1", userId: "user-1" }];
    }
    if (sql.includes('FROM "users"')) {
      if (lockPhase !== 2) throw new Error("user_check_order");
      lockPhase = 3;
      return [{ deletionScheduledAt: options.deletionScheduledAt ?? null }];
    }
    return [];
  };
  return {
    $executeRaw: executeRaw,
    $queryRaw: queryRaw,
    measurementOutbox: {
      createMany: async ({ data }: { data: unknown[] }) => {
        outbox.push(...data);
        if (options.failOutbox) throw new Error("collector unavailable");
        return { count: data.length };
      },
    },
    outbox,
    get operations() { return operations; },
  };
}

describe("PrismaMeasurementCommit savepoint isolation", () => {
  it("captures only when collector, principal, and User checks all succeed", async () => {
    const tx = measurementTransaction();
    await expect(new PrismaMeasurementCommit(activation, "epoch-1").capture(tx, "user-1", event)).resolves.toBe("captured");
    expect(tx.outbox).toHaveLength(1);
  });

  it("rolls back collector failure to its savepoint and reports unavailable", async () => {
    const tx = measurementTransaction({ failOutbox: true });
    const result = await new PrismaMeasurementCommit(activation, "epoch-1").capture(tx, "user-1", event);
    expect(result).toBe("unavailable");
    expect(tx.outbox).toEqual([]);
  });

  it("refuses a User already scheduled for deletion without emitting an outbox row", async () => {
    const tx = measurementTransaction({ deletionScheduledAt: new Date("2026-10-24T12:00:00.000Z") });
    await expect(new PrismaMeasurementCommit(activation, "epoch-1").capture(tx, "user-1", event)).resolves.toBe("disabled");
    expect(tx.outbox).toEqual([]);
  });

  it("does not touch a transaction when disabled", async () => {
    const tx = measurementTransaction();
    const result = await new PrismaMeasurementCommit({ ...activation, enabled: false }, "epoch-1").capture(tx, "user-1", event);
    expect(result).toBe("disabled"); expect(tx.outbox).toEqual([]);
  });
});

it.each(["invalid", "", "2026-10-14T00:00:00Z"])("fails closed for invalid or expired supplied activation expiry %j", async (expiresAt) => {
 const tx = measurementTransaction();
 const result = await new PrismaMeasurementCommit({...activation,environment:"staging"},"epoch-1",()=>new Date("2026-10-15T00:00:00Z"),expiresAt).capture(tx,"user-1",event);
 expect(result).toBe("disabled");expect(tx.operations).toBe(0);expect(tx.outbox).toEqual([]);
});
