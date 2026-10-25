import { describe, expect, it } from "vitest";
import { materialHarness } from "../application/testing/materialHarness";

describe("material adapters at their actual outer entry", () => {
  it("stages and verifies classified provenance, recognizes exact retries, and delivers only retained bytes", async () => {
    const h = materialHarness(), input = h.stage();
    expect(await h.identity.stage(h.subject, h.orderId, input)).toEqual({ id: input.id, state: "staged" });
    const upload = { expectedOrderVersion: 1, mime: input.contentType, bytes: h.bytes };
    const result = await h.identity.upload(h.subject, h.orderId, input.id, upload);
    expect(result).toMatchObject({ id: input.id, state: "verified", mime: "image/webp", sizeBytes: 3 });
    expect(await h.identity.upload(h.subject, h.orderId, input.id, upload)).toEqual(result);
    expect(await h.identity.read(h.subject, h.orderId, input.id)).toEqual({ bytes: h.bytes, mime: "image/webp" });
  });
  it("refuses stale staging and rolls its material intent back", async () => {
    const h = materialHarness(), input = h.stage();
    await expect(h.identity.stage(h.subject, h.orderId, { ...input, expectedOrderVersion: 0 })).rejects.toThrow("DIAGNOSTIC_STALE_VERSION");
    expect(await h.db.diagnosticIdentityProvenance.findUnique({ where: { id: input.id } })).toBeNull();
  });
  it("rolls staged metadata back when source completion fails", async () => {
    const h = materialHarness(), input = h.stage(); h.failFinish();
    await expect(h.identity.stage(h.subject, h.orderId, input)).rejects.toThrow("material_finish_rollback");
    expect(await h.db.diagnosticIdentityProvenance.findUnique({ where: { id: input.id } })).toBeNull();
  });
  it("revalidates the declared end after preparation waits", async () => {
    const h = materialHarness(), input = h.stage();
    h.afterPrepare(async () => { h.clock(new Date(input.rights.schedule.until)); });
    await expect(h.identity.stage(h.subject, h.orderId, input)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await h.db.diagnosticIdentityProvenance.count()).toBe(0);
  });
  it.each(["permission", "expiry", "lost-reply"] as const)("keeps exact durable cleanup after post-intent %s", async defect => {
    const h = materialHarness(), input = h.stage(); await h.identity.stage(h.subject, h.orderId, input);
    if (defect === "lost-reply") h.failPut();
    h.onPut(async () => {
      if (defect === "permission") await h.db.staffGrant.updateMany({ where: { userId: h.subject.userId }, data: { revokedAt: new Date() } });
      if (defect === "expiry") h.clock(new Date(input.rights.schedule.until));
    });
    await expect(h.identity.upload(h.subject, h.orderId, input.id, { expectedOrderVersion: 1, mime: input.contentType, bytes: h.bytes })).rejects.toThrow();
    const row = await h.db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: input.id } });
    expect(row).toMatchObject({ state: "cleanup_pending", cleanupRequestedAt: expect.any(Date), objectKey: expect.any(String) });
    expect(h.stored.has(row.objectKey!)).toBe(true);
  });
  it("does not clean a replacement epoch after stale adoption", async () => {
    const h = materialHarness(), input = h.stage(); await h.identity.stage(h.subject, h.orderId, input);
    h.onPut(async () => { await h.db.diagnosticIdentityProvenance.update({ where: { id: input.id }, data: { epoch: "replacement" } }); });
    await expect(h.identity.upload(h.subject, h.orderId, input.id, { expectedOrderVersion: 1, mime: input.contentType, bytes: h.bytes })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await h.db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: input.id } })).toMatchObject({ epoch: "replacement", state: "staged", cleanupRequestedAt: null });
  });
  it("uploads and abandons ordinary finding evidence without a source mutation receipt", async () => {
    const h = materialHarness(), evidenceId = h.id(12);
    expect(await h.evidence.upload(h.subject, { reportId: h.reportId, evidenceId, findingId: "brakes", expectedVersion: 1, mime: "image/png", bytes: h.bytes })).toMatchObject({ id: evidenceId, sizeBytes: 3 });
    await h.evidence.abandon(h.subject, h.reportId, evidenceId);
    expect(await h.db.diagnosticEvidence.findUniqueOrThrow({ where: { id: evidenceId } })).toMatchObject({ state: "cleanup_pending" });
    expect(h.commands).toEqual([]);
  });
});
