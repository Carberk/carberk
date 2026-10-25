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
  const outbox: Record<string, unknown>[] = [];
  return {
    outbox,
    $executeRaw: async () => 0,
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
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
    expect(first.outbox[0]).toEqual({ ...second.outbox[0], expiresAt: new Date(early.getTime() + MeasurementSchemas.MEASUREMENT_LIMITS.queueAgeMs) });
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
});
