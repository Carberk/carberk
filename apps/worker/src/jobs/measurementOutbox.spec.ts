import { describe, expect, it, vi } from "vitest";
import { MeasurementOutboxDelivery } from "./measurementOutbox";

const event = { version: 1, eventId: "00000000-0000-4000-8000-000000000001", occurredAt: "2026-10-15T00:00:00.000Z", purpose: "product_improvement", eventName: "listing_published", context: { platform: "server", release: "server", build: "test", locale: "en" }, payload: { listingId: "00000000-0000-4000-8000-000000000002", cityId: "00000000-0000-4000-8000-000000000003" } };
const row = { id: "outbox-1", principalId: "principal-1", generation: "generation-1", epoch: "epoch-1", environment: "test", population: "synthetic", event };
function setup(result: "accepted" | "duplicate" | "revoked" | "unavailable" = "accepted") {
  const collector = { appendIfEligible: vi.fn(async () => result) };
  const prisma = { $transaction: vi.fn(async (fn: (tx: object) => Promise<unknown>) => fn({ $executeRaw: vi.fn(), measurementOutbox: { findMany: vi.fn(async () => [row]) } })), measurementOutbox: { delete: vi.fn(async () => undefined) } };
  return { collector, prisma, service: new MeasurementOutboxDelivery(prisma as never, collector) };
}
describe("measurement outbox delivery", () => {
  it("deletes terminal results and preserves captured authority", async () => { const { service, collector, prisma } = setup("accepted"); expect(await service.deliver()).toEqual({ delivered: 1, retried: 0 }); expect(collector.appendIfEligible).toHaveBeenCalledWith(expect.objectContaining({ principalId: row.principalId, generation: row.generation, epoch: row.epoch })); expect(prisma.measurementOutbox.delete).toHaveBeenCalledWith({ where: { id: row.id } }); });
  it("retries collector outages without deleting source evidence", async () => { const { service, prisma } = setup("unavailable"); expect(await service.deliver()).toEqual({ delivered: 0, retried: 1 }); expect(prisma.measurementOutbox.delete).not.toHaveBeenCalled(); });
});
