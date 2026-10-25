import { PrismaMeasurementCommit } from "@auto-tm/db";
import { MeasurementSchemas } from "@auto-tm/contracts";
import { describe, expect, it } from "vitest";

// Offline counterexample for the closed publication intent, using the actual
// capture implementation. This does not model source guards or PostgreSQL.
const event: MeasurementSchemas.MeasurementEvent = {
  version: 1, eventId: "00000000-0000-4000-8000-000000000001", occurredAt: "2026-10-25T12:00:00.000Z",
  purpose: "product_improvement", eventName: "listing_published",
  context: { platform: "server", release: "server", build: "unit", locale: "en" },
  payload: { listingId: "00000000-0000-4000-8000-000000000002", cityId: "00000000-0000-4000-8000-000000000003" },
};
function captureTransaction() {
  const statements: { sql: string; values: unknown[] }[] = [];
  let failRead = false;
  let aborted = false;
  const outbox: Record<string, unknown>[] = [];
  return {
    outbox, statements,
    failNextRead: () => { failRead = true; },
    usable: () => !aborted,
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?"); statements.push({ sql, values });
      if (sql.includes("ROLLBACK TO SAVEPOINT")) aborted = false;
      if (aborted) throw new Error("transaction_aborted");
      return 0;
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?"); statements.push({ sql, values });
      if (aborted) throw new Error("transaction_aborted");
      if (failRead && sql.includes('FROM "measurement_state"')) { failRead = false; aborted = true; throw new Error("collector_unavailable"); }
      if (sql.includes("current_setting")) return [{ statement: "0", lock: "0" }];
      if (sql.includes('FROM "measurement_state"')) return [{ epoch: "epoch-1" }];
      if (sql.includes('FROM "measurement_principals"')) return [{ id: "principal-1", generation: "generation-1", epoch: "epoch-1", userId: "owner" }];
      if (sql.includes('FROM "users"')) return [{ deletionScheduledAt: null }];
      return [];
    },
    measurementOutbox: { createMany: async ({ data }: { data: Record<string, unknown>[] }) => { outbox.push(...data); return { count: data.length }; } },
  };
}
const activation = { enabled: true, environment: "test" as const, purposes: ["product_improvement" as const], evidenceRef: "r7b-finite-plan-counterexample", realCollectionApproved: false };

describe("publication capture plan counterexample", () => {
  it("binds activation and expiry to a finite plan reused by capture", async () => {
    const commit = new PrismaMeasurementCommit(activation, "epoch-1", () => new Date("2026-10-25T12:00:01.123Z"));
    const tx = captureTransaction();
    const plan = await commit.preparePublication(tx, "owner", [event]);
    expect(plan?.environment).toBe("test");
    expect(plan).toMatchObject({ principalId: "principal-1", generation: "generation-1", epoch: "epoch-1" });
    expect(await commit.capture(tx, "owner", event, undefined, plan ?? undefined)).toBe("captured");
    expect(plan?.expiresAt[event.eventId]).toBe("2026-11-01T12:00:01.123Z");
  });

  it("writes different protected expiresAt values for identical caller and database inputs", async () => {
    const first = captureTransaction(), second = captureTransaction();
    const early = new Date("2026-10-25T12:00:01.123Z"), late = new Date("2026-10-25T12:00:04.789Z");
    expect(await new PrismaMeasurementCommit(activation, "epoch-1", () => early).capture(first, "owner", event)).toBe("captured");
    expect(await new PrismaMeasurementCommit(activation, "epoch-1", () => late).capture(second, "owner", event)).toBe("captured");
    expect(first.outbox[0]).toEqual({ ...second.outbox[0], createdAt: early, expiresAt: new Date(early.getTime() + MeasurementSchemas.MEASUREMENT_LIMITS.queueAgeMs) });
    expect(second.outbox[0]?.["expiresAt"]).toEqual(new Date(late.getTime() + MeasurementSchemas.MEASUREMENT_LIMITS.queueAgeMs));
    expect(first.outbox[0]?.["expiresAt"]).not.toEqual(second.outbox[0]?.["expiresAt"]);
  });

  it("takes protected environment and optional absence from private activation", async () => {
    const test = captureTransaction(), staging = captureTransaction(), disabled = captureTransaction();
    const now = () => new Date("2026-10-25T12:00:01.123Z");
    expect(await new PrismaMeasurementCommit(activation, "epoch-1", now).capture(test, "owner", event)).toBe("captured");
    expect(await new PrismaMeasurementCommit({ ...activation, environment: "staging" }, "epoch-1", now).capture(staging, "owner", event)).toBe("captured");
    expect(test.outbox[0]).toEqual({ ...staging.outbox[0], environment: "test" });
    expect(staging.outbox[0]?.["environment"]).toBe("staging");
    expect(await new PrismaMeasurementCommit({ ...activation, enabled: false }, "epoch-1", now).capture(disabled, "owner", event)).toBe("disabled");
    expect(disabled.outbox).toEqual([]);
  });
  it("discovers without managed locks and recovers failed planning reads before returning optional absence", async () => {
    const tx = captureTransaction(), commit = new PrismaMeasurementCommit(activation, "epoch-1");
    tx.failNextRead();
    expect(await commit.preparePublication(tx, "owner", [event])).toBeNull();
    expect(tx.usable()).toBe(true);
    expect(tx.statements.map(row => row.sql).join("\n")).not.toMatch(/FOR (KEY SHARE|UPDATE)/);
    expect(tx.statements.slice(-2).map(row => row.sql)).toEqual(["ROLLBACK TO SAVEPOINT measurement_publication_plan", "RELEASE SAVEPOINT measurement_publication_plan"]);
    expect(await commit.preparePublication(tx, "owner", [event])).not.toBeNull();
  });

  it.each(["environment", "principalId", "generation", "epoch", "missing-event"])("leaves source timeouts and savepoints intact after %s plan refusal", async field => {
    const tx = captureTransaction(), commit = new PrismaMeasurementCommit(activation, "epoch-1");
    const plan = await commit.preparePublication(tx, "owner", [event]);
    if (!plan) throw new Error("plan_required");
    const invalid = field === "missing-event" ? { ...plan, expiresAt: {} } : { ...plan, [field]: "stale" };
    expect(await commit.capture(tx, "owner", event, undefined, invalid as typeof plan)).toBe("disabled");
    expect(tx.outbox).toEqual([]); expect(tx.usable()).toBe(true);
    expect(tx.statements.slice(-2)).toEqual([
      { sql: "SELECT set_config('statement_timeout', ?, true), set_config('lock_timeout', ?, true)", values: ["0", "0"] },
      { sql: "RELEASE SAVEPOINT measurement_capture", values: [] },
    ]);
  });

  it("rolls capture back to its savepoint on collector failure without aborting publication", async () => {
    const tx = captureTransaction(), commit = new PrismaMeasurementCommit(activation, "epoch-1");
    const plan = await commit.preparePublication(tx, "owner", [event]);
    tx.failNextRead();
    expect(await commit.capture(tx, "owner", event, undefined, plan ?? undefined)).toBe("unavailable");
    expect(tx.usable()).toBe(true); expect(tx.outbox).toEqual([]);
    expect(tx.statements.slice(-2).map(row => row.sql)).toEqual(["ROLLBACK TO SAVEPOINT measurement_capture", "RELEASE SAVEPOINT measurement_capture"]);
  });

});
