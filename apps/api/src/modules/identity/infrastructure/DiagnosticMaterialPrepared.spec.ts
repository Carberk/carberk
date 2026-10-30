import { describe, expect, it } from "vitest";
import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { materialHarness } from "../application/testing/DiagnosticMaterialHarness";

const verified = async (h: ReturnType<typeof materialHarness>, n = 11, version = 1) => {
  const input = { ...h.stage(h.id(n)), expectedOrderVersion: version };
  await h.identity.stage(h.subject, h.orderId, input);
  await h.identity.upload(h.subject, h.orderId, input.id, { expectedOrderVersion: version, mime: input.contentType, bytes: h.bytes });
  return input.id;
};
const capture = (h: ReturnType<typeof materialHarness>, provenanceId: string, n = 20, version = 1): D.DiagnosticIdentityEvidenceCapture => ({
  id: h.id(n), expectedOrderVersion: version, identityRecordId: h.rawId, rights: h.rights, correction: null,
  identifiers: [{ kind: "manufacturer_plate", location: "engine bay", value: "Synthetic plate", provenanceIds: [provenanceId] }],
});
const findingInput = (h: ReturnType<typeof materialHarness>, n = 12) => ({ reportId: h.reportId, evidenceId: h.id(n), findingId: "brakes", expectedVersion: 1, mime: "image/png", bytes: h.bytes });

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
  it("preserves a renewal committed between cleanup's initial and planning reads", async () => {
    const h = materialHarness(), input = h.stage(); await h.identity.stage(h.subject, h.orderId, input);
    let original: unknown;
    h.failPut();
    h.onPut(async () => {
      original = await h.db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: input.id } });
      h.replaceEpochBeforeCleanupPlan(input.id, "replacement-between-reads");
    });
    await expect(h.identity.upload(h.subject, h.orderId, input.id, { expectedOrderVersion: 1, mime: input.contentType, bytes: h.bytes })).rejects.toThrow();
    const replacement = await h.db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: input.id } });
    expect(replacement).toEqual({ ...original as object, epoch: "replacement-between-reads" });
    expect(replacement).toMatchObject({ state: "staged", cleanupRequestedAt: null });
    expect(h.stored.has(replacement.objectKey!)).toBe(true);
    expect(await h.db.diagnosticAudit.count()).toBe(0);
  });
  it("uploads and abandons ordinary finding evidence without a source mutation receipt", async () => {
    const h = materialHarness(), evidenceId = h.id(12);
    expect(await h.evidence.upload(h.subject, { reportId: h.reportId, evidenceId, findingId: "brakes", expectedVersion: 1, mime: "image/png", bytes: h.bytes })).toMatchObject({ id: evidenceId, sizeBytes: 3 });
    await h.evidence.abandon(h.subject, h.reportId, evidenceId);
    expect(await h.db.diagnosticEvidence.findUniqueOrThrow({ where: { id: evidenceId } })).toMatchObject({ state: "cleanup_pending" });
    expect(h.commands).toEqual([]);
  });
  it("appends an immutable record and explicit correction with exact retries, version, generation and audits", async () => {
    const h = materialHarness(), p = await verified(h), input = capture(h, p);
    const raw = await h.db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: h.rawId } });
    const report = await h.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: h.reportId } });
    expect(report).toMatchObject({ identityRecordId: raw.id, identityRecordHash: raw.observationHash });
    const first = await h.identity.append(h.subject, h.orderId, input);
    expect(first).toMatchObject({ orderVersion: 2, identityRecordId: h.rawId, observationHash: raw.observationHash });
    expect(await h.identity.append(h.subject, h.orderId, input)).toEqual(first);
    const p2 = await verified(h, 13, 2), correction = { ...capture(h, p2, 21, 2), correction: { supersedesId: first.id, explanation: "Fresh supporting plate" } };
    const second = await h.identity.append(h.subject, h.orderId, correction);
    expect(await h.identity.list(h.subject, h.orderId)).toEqual([first, second]);
    expect(await h.db.inspectionOrder.findUniqueOrThrow({ where: { id: h.orderId } })).toMatchObject({ version: 3, identityEvidenceGeneration: 2 });
    expect(await h.db.diagnosticAudit.count()).toBe(2);
    expect(await h.db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: h.rawId } })).toEqual(raw);
    expect(await h.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: h.reportId } })).toEqual(report);
  });
  it.each(["stale-version", "foreign-provenance", "foreign-raw", "superseded-raw"] as const)("refuses %s append without version, evidence or audit changes", async defect => {
    const h = materialHarness(), p = await verified(h), input = capture(h, p);
    if (defect === "stale-version") input.expectedOrderVersion = 0;
    if (defect === "foreign-provenance") await h.db.diagnosticIdentityProvenance.update({ where: { id: p }, data: { orderId: h.id(100) } });
    if (defect === "foreign-raw") await h.db.diagnosticIdentityRecord.update({ where: { id: h.rawId }, data: { orderId: h.id(100) } });
    if (defect === "superseded-raw") h.seed("diagnosticIdentityRecord", { id: h.id(100), orderId: h.orderId, orderVersion: 2, erasedAt: null });
    await expect(h.identity.append(h.subject, h.orderId, input)).rejects.toThrow(/DIAGNOSTIC_(STALE_VERSION|NO_ACCESS)/);
    expect(await h.db.diagnosticIdentityEvidence.count()).toBe(0);
    expect(await h.db.diagnosticAudit.count()).toBe(0);
    expect(await h.db.inspectionOrder.findUniqueOrThrow({ where: { id: h.orderId } })).toMatchObject({ version: 1, identityEvidenceGeneration: 0 });
  });
  it("rolls back the whole append on source completion failure", async () => {
    const h = materialHarness(), p = await verified(h); h.failFinish();
    await expect(h.identity.append(h.subject, h.orderId, capture(h, p))).rejects.toThrow("material_finish_rollback");
    expect(await h.db.diagnosticIdentityEvidence.count()).toBe(0);
    expect(await h.db.diagnosticAudit.count()).toBe(0);
    expect(await h.db.inspectionOrder.findUniqueOrThrow({ where: { id: h.orderId } })).toMatchObject({ version: 1, identityEvidenceGeneration: 0 });
  });
  it("rejects a correction without fresh provenance and a changed retry", async () => {
    const h = materialHarness(), p = await verified(h), input = capture(h, p), first = await h.identity.append(h.subject, h.orderId, input);
    await expect(h.identity.append(h.subject, h.orderId, { ...capture(h, p, 21, 2), correction: { supersedesId: first.id, explanation: "No new support" } })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    await expect(h.identity.append(h.subject, h.orderId, { ...input, identifiers: [{ ...input.identifiers[0]!, value: "Changed retry" }] })).rejects.toThrow("DIAGNOSTIC_EVIDENCE_CONFLICT");
    expect(await h.identity.list(h.subject, h.orderId)).toEqual([first]);
  });
  it.each(["epoch", "rights", "erasure", "permission"] as const)("refuses identity delivery after post-read %s changes", async defect => {
    const h = materialHarness(), p = await verified(h);
    h.onRead(async () => {
      if (defect === "epoch") await h.db.diagnosticIdentityProvenance.update({ where: { id: p }, data: { epoch: "replacement" } });
      if (defect === "rights") h.clock(new Date(h.rights.schedule.until));
      if (defect === "erasure") await h.db.diagnosticIdentityProvenance.update({ where: { id: p }, data: { erasedAt: new Date(), state: "cleanup_pending" } });
      if (defect === "permission") await h.db.staffGrant.updateMany({ data: { revokedAt: new Date() } });
    });
    await expect(h.identity.read(h.subject, h.orderId, p)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
  });
  it("refuses an object-id collision and a foreign staging retry", async () => {
    const h = materialHarness(), input = h.stage();
    await h.evidence.upload(h.subject, { ...findingInput(h), evidenceId: input.id });
    await expect(h.identity.stage(h.subject, h.orderId, input)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await h.db.diagnosticIdentityProvenance.count()).toBe(0);
    const other = { ...h.stage(h.id(40)) };
    await h.identity.stage(h.subject, h.orderId, other);
    await expect(h.identity.stage(h.subject, h.id(100), other)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
  });
  it.each(["lost-reply", "permission", "stale-report"] as const)("keeps finding cleanup durable after %s", async defect => {
    const h = materialHarness(), input = findingInput(h);
    if (defect === "lost-reply") h.failPut();
    h.onPut(async () => {
      if (defect === "permission") await h.db.staffGrant.updateMany({ data: { revokedAt: new Date() } });
      if (defect === "stale-report") await h.db.diagnosticReportRecord.update({ where: { id: h.reportId }, data: { version: 2 } });
    });
    await expect(h.evidence.upload(h.subject, input)).rejects.toThrow();
    expect(await h.db.diagnosticEvidence.findUniqueOrThrow({ where: { id: input.evidenceId } })).toMatchObject({ state: "cleanup_pending", cleanupRequestedAt: expect.any(Date) });
    expect(h.commands).toEqual([]);
  });
  it("does not clean another finding epoch and reauthorizes finding bytes", async () => {
    const h = materialHarness(), input = findingInput(h);
    await h.evidence.upload(h.subject, input);
    expect(await h.evidence.read(h.subject, h.reportId, input.evidenceId)).toEqual({ bytes: h.bytes, mime: "image/webp" });
    h.onRead(async () => { await h.db.diagnosticEvidence.update({ where: { id: input.evidenceId }, data: { epoch: "replacement" } }); });
    await expect(h.evidence.read(h.subject, h.reportId, input.evidenceId)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
  });

  it("keeps finding ownership and active leases distinct from identity source mutation", async () => {
    const h = materialHarness(), input = findingInput(h);
    h.seed("diagnosticEvidence", { id: input.evidenceId, reportId: h.reportId, findingId: input.findingId, state: "staged", cleanupRequestedAt: null,
      sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81", sizeBytes: 3, writeLeaseUntil: new Date("2026-11-01") });
    await expect(h.evidence.upload(h.subject, input)).rejects.toThrow("DIAGNOSTIC_EVIDENCE_BUSY");
    expect(h.stored.size).toBe(0);
    expect(h.commands).toEqual([]);
  });
  it("refuses abandon while a finding references the evidence", async () => {
    const h = materialHarness(), input = findingInput(h); await h.evidence.upload(h.subject, input);
    await h.db.diagnosticReportRecord.update({ where: { id: h.reportId }, data: { state: { status: "draft", authorId: h.subject.userId, findings: [{ evidenceIds: [input.evidenceId] }] } } });
    await expect(h.evidence.abandon(h.subject, h.reportId, input.evidenceId)).rejects.toThrow("REPORT_EVIDENCE_IN_USE");
    expect(await h.db.diagnosticEvidence.findUniqueOrThrow({ where: { id: input.evidenceId } })).toMatchObject({ state: "verified", cleanupRequestedAt: null });
  });
  it("reauthorizes a failed finding storage read before returning generic unavailability", async () => {
    const h = materialHarness(), input = findingInput(h); await h.evidence.upload(h.subject, input); h.stored.clear();
    await expect(h.evidence.read(h.subject, h.reportId, input.evidenceId)).rejects.toThrow("DIAGNOSTIC_EVIDENCE_UNAVAILABLE");
    h.onRead(async () => { await h.db.staffGrant.updateMany({ data: { revokedAt: new Date() } }); });
    await expect(h.evidence.read(h.subject, h.reportId, input.evidenceId)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
  });

});
