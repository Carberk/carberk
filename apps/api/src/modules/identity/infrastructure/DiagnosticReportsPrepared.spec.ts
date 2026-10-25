import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { describe, expect, it } from "vitest";
import { reportPreparedHarness } from "../application/testing/ReportPreparedHarness";
const draft = (h: ReturnType<typeof reportPreparedHarness>) => h.reports.create(h.subject, h.orderId, { reportId: h.reportId, expectedOrderVersion: 1 });
describe("report outer source transactions", () => {
  it("creates the original pinned draft and audit through one prepared outer transaction", async () => {
    const h = reportPreparedHarness();
    expect(await draft(h)).toMatchObject({ id: h.reportId, status: "draft", version: 0, findings: [] });
    expect(await h.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: h.reportId } })).toMatchObject({ identityRecordId: h.id(5), identityRecordHash: "a".repeat(64) });
    expect(await h.db.diagnosticAudit.findMany()).toMatchObject([{ action: "REPORT_DRAFT_CREATED", orderId: h.orderId }]);
    expect(h.commands.map(c => c.operation)).toEqual(["report_change"]);
  });
  it("returns the same draft on retry without another source mutation", async () => {
    const h = reportPreparedHarness(), first = await draft(h);
    expect(await draft(h)).toEqual(first);
    expect(h.commands).toHaveLength(1);
    expect(await h.db.diagnosticAudit.count()).toBe(1);
  });
  it.each(["write", "finish"] as const)("rolls draft, pins and audit back on exact %s failure", async failure => {
    const h = reportPreparedHarness();
    if (failure === "finish") h.failFinish(); else h.failWrite("diagnosticAudit");
    await expect(draft(h)).rejects.toThrow(failure === "finish" ? "r5_finish_rollback" : "r5_actual_write_rollback");
    expect(await h.db.diagnosticReportRecord.count()).toBe(0);
    expect(await h.db.diagnosticAudit.count()).toBe(0);
    expect(await h.db.diagnosticIdentityRecord.findMany()).toMatchObject([{ id: h.id(5), observationHash: "a".repeat(64) }]);
  });
  it("rejects a stale order without a draft or audit", async () => {
    const h = reportPreparedHarness();
    await expect(h.reports.create(h.subject, h.orderId, { reportId: h.reportId, expectedOrderVersion: 0 })).rejects.toThrow("DIAGNOSTIC_STALE_VERSION");
    expect(await h.db.diagnosticReportRecord.count()).toBe(0);
    expect(await h.db.diagnosticAudit.count()).toBe(0);
  });
  it("keeps ordinary public access and proofless reinspection closed", async () => {
    const h = reportPreparedHarness();
    await expect(h.documents.list(null, h.reportId)).rejects.toThrow("DIAGNOSTIC_PUBLIC_UNAVAILABLE");
    await expect(h.reports.reinspect(h.subject, h.orderId, { reportId: h.reportId, predecessorId: h.id(30), expectedOrderVersion: 1, reason: "New visit" })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
  });
  it("saves a finding, submits and returns it with exact version conflicts and stable pins", async () => {
    const h = reportPreparedHarness(); await draft(h);
    const finding = { id: h.id(20), checkId: "brakes", assessment: "normal" as const, explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    expect(await h.reports.save(h.subject, h.reportId, { expectedVersion: 0, finding })).toMatchObject({ version: 1, findings: [finding] });
    await expect(h.reports.save(h.subject, h.reportId, { expectedVersion: 0, finding })).rejects.toThrow("DIAGNOSTIC_STALE_VERSION");
    expect(await h.reports.transition(h.subject, h.reportId, { expectedVersion: 1, action: "submit" })).toMatchObject({ status: "submitted", version: 2 });
    expect(await h.reports.transition(h.subject, h.reportId, { expectedVersion: 2, action: "return", reason: "Inspect again", privateSelfReview: true })).toMatchObject({ status: "returned", version: 3, returnReason: "Inspect again" });
    expect(await h.reports.forOrder(h.subject, h.orderId)).toEqual([]);
    await expect(h.reports.read(h.subject, h.reportId)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await h.db.diagnosticAudit.findMany()).toMatchObject([{ action: "REPORT_DRAFT_CREATED" }, { action: "REPORT_FINDING_SAVED" }, { action: "REPORT_SUBMIT" }, { action: "REPORT_RETURN" }]);
    expect(await h.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: h.reportId } })).toMatchObject({ identityRecordId: h.id(5), identityRecordHash: "a".repeat(64) });
  });
  it.each(["write", "finish"] as const)("restores the entire existing state and audit on save %s failure", async failure => {
    const h = reportPreparedHarness(); await draft(h);
    const before = await h.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: h.reportId } });
    if (failure === "finish") h.failFinish(); else h.failWrite("diagnosticAudit");
    await expect(h.reports.save(h.subject, h.reportId, { expectedVersion: 0, finding: { id: h.id(20), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null } })).rejects.toThrow(failure === "finish" ? "r5_finish_rollback" : "r5_actual_write_rollback");
    expect(await h.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: h.reportId } })).toEqual(before);
    expect(await h.db.diagnosticAudit.count()).toBe(1);
  });
  it("prepares and recovers private requests without making an admission result", async () => {
    const h = reportPreparedHarness();
    const request = await h.proofs.prepareRequest(h.subject, h.orderId, { kind: "consume" });
    expect(request).toMatchObject({ kind: "consume", state: "pending_input" });
    expect(await h.proofs.recoverRequest(h.subject, h.orderId, request.requestId)).toEqual(request);
    expect(await h.proofs.discoverRequests(h.subject, h.orderId, {})).toEqual({ requests: [request], nextCursor: null });
    expect(await h.proofs.handoffs(h.subject, h.orderId, {})).toEqual({ handoffs: [], result: null, nextCursor: null, scope: "current_b_owned_handoffs" });
    await expect(h.proofs.recoverRequest({ ...h.subject, sessionId: h.id(99) }, h.orderId, request.requestId)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
  });
  it("rolls a request back on exact receipt finish failure", async () => {
    const h = reportPreparedHarness(); h.failFinish();
    await expect(h.proofs.prepareRequest(h.subject, h.orderId, { kind: "issue" })).rejects.toThrow("r5_finish_rollback");
    expect(await h.db.diagnosticContinuityRequest.count()).toBe(0);
  });
  it("authorizes only the surviving B binding on exact handoff retry", async () => {
    const h = reportPreparedHarness(); const original = await draft(h);
    await h.db.diagnosticReportRecord.update({ where: { id: h.reportId }, data: { reinspection: true, continuityProofId: h.id(80), reinspectionOrderVersion: 1,
      state: { ...original, correctionReason: "Fresh visit" } } });
    const input = { reportId: h.reportId, expectedOrderVersion: 1, reason: "Fresh visit" };
    expect(await h.proofs.useHandoff(h.subject, h.orderId, h.id(80), input)).toEqual({ reportId: h.reportId });
    await expect(h.proofs.useHandoff(h.subject, h.orderId, h.id(81), input)).rejects.toThrow("DIAGNOSTIC_REINSPECTION_CONFLICT");
    expect(await h.db.diagnosticContinuityProof.count()).toBe(0);
    expect(await h.db.diagnosticAudit.count()).toBe(1);
  });

  it("finalizes with three locale intents, opens an exact correction, and withdraws the retained original", async () => {
    const h = reportPreparedHarness(); await draft(h);
    await h.reports.transition(h.subject, h.reportId, { expectedVersion: 0, action: "submit" });
    expect(await h.reports.transition(h.subject, h.reportId, { expectedVersion: 1, action: "finalize", privateSelfReview: true, reason: "Private authorized review" })).toMatchObject({ status: "finalized", version: 2 });
    expect((await h.db.diagnosticPdfArtifact.findMany({ orderBy: { locale: "asc" } })).map(row => [row.locale, row.state, row.reportId])).toEqual([["en", "pending", h.reportId], ["ru", "pending", h.reportId], ["tk", "pending", h.reportId]]);
    const input = { successorId: h.id(50), expectedVersion: 2, reason: "Recording correction" };
    const correction = await h.reports.correct(h.subject, h.reportId, input);
    expect(correction).toMatchObject({ id: h.id(50), status: "draft", successorOf: h.reportId, lineageKind: "correction" });
    expect(await h.reports.correct(h.subject, h.reportId, input)).toEqual(correction);
    await expect(h.reports.correct(h.subject, h.reportId, { ...input, reason: "Changed" })).rejects.toThrow("DIAGNOSTIC_CORRECTION_CONFLICT");
    expect(await h.reports.transition(h.subject, h.reportId, { expectedVersion: 2, action: "withdraw", reason: "Withdraw synthetic" })).toMatchObject({ status: "withdrawn", version: 3 });
    expect(await h.db.diagnosticAudit.count()).toBe(5);
    expect(await h.documents.list(h.subject, h.reportId)).toMatchObject([{ locale: "en", state: "pending" }, { locale: "ru", state: "pending" }, { locale: "tk", state: "pending" }]);
  });
  it.each(["authority", "epoch", "bytes"] as const)("reauthorizes after object I/O and refuses changed %s", async change => {
    const h = reportPreparedHarness(); await draft(h);
    await h.reports.transition(h.subject, h.reportId, { expectedVersion: 0, action: "submit" });
    await h.reports.transition(h.subject, h.reportId, { expectedVersion: 1, action: "finalize", privateSelfReview: true, reason: "Private authorized review" });
    const artifact = await h.db.diagnosticPdfArtifact.findFirstOrThrow({ where: { reportId: h.reportId, locale: "en" } });
    const bytes = new Uint8Array([37, 80, 68, 70]); h.stored.set(artifact.objectKey, bytes);
    await h.db.diagnosticPdfArtifact.update({ where: { id: artifact.id }, data: { state: "ready", sha256: h.sha(bytes), sizeBytes: bytes.length, verifiedAt: new Date("2026-10-25T12:00:00Z") } });
    expect(await h.documents.download(h.subject, h.reportId, "en")).toEqual(bytes);
    h.onRead(async () => {
      if (change === "authority") await h.db.session.update({ where: { id: h.subject.sessionId }, data: { expiresAt: new Date("2026-01-01") } });
      if (change === "epoch") await h.db.diagnosticPdfArtifact.update({ where: { id: artifact.id }, data: { epoch: "replacement" } });
      if (change === "bytes") h.stored.set(artifact.objectKey, new Uint8Array([1]));
    });
    await expect(h.documents.download(h.subject, h.reportId, "en")).rejects.toThrow(change === "authority" ? "DIAGNOSTIC_NO_ACCESS" : change === "epoch" ? "DIAGNOSTIC_PDF_NOT_READY" : "DIAGNOSTIC_PDF_UNAVAILABLE");
  });

});

/** Production material, finalization and prepared issuance construct the fixture.
 * This fake verifies transaction protocol and business behavior, never SQL locks. */
async function privatePair(beforeIssue?: (h: ReturnType<typeof reportPreparedHarness>) => Promise<void>, requestIssue = false) {
  const h = reportPreparedHarness(), b = h.id(60), rawB = h.id(61), technician = { userId: h.id(62), sessionId: h.id(63) };
  h.seed("user", { id: technician.userId, role: "user", suspendedAt: null, deletionScheduledAt: null, dealershipMemberships: [] });
  h.seed("session", { id: technician.sessionId, userId: technician.userId, expiresAt: new Date("2027-01-01"), adminTotpExpiresAt: new Date("2027-01-01") });
  h.seed("staffGrant", { userId: technician.userId, capability: "diagnostics.technician", revokedAt: null });
  h.seed("diagnosticCenterAssignment", { id: h.id(64), centerId: h.id(6), userId: technician.userId, capability: "diagnostics.technician", qualifiedUntil: new Date("2027-01-01"), revokedAt: null });
  const observation = { method: "manual", vin: null, manualReference: "Synthetic plate", mileageKm: 120, observedAt: "2026-10-25T12:00:00.000Z" };
  h.seed("inspectionOrder", { id: b, centerId: h.id(6), templateVersionId: h.id(9), status: "arrived", physicalAuthorization: {}, version: 1, identityEvidenceGeneration: 0, synthetic: true, erasedAt: null, listingId: null, audience: "buyer_private", commissionerId: h.subject.userId, observedVehicle: observation });
  h.seed("diagnosticIdentityRecord", { id: rawB, orderId: b, orderVersion: 1, observation, observationHash: "b".repeat(64), erasedAt: null });
  h.seed("diagnosticOrderAssignment", { id: h.id(65), orderId: b, userId: technician.userId, capability: "diagnostics.technician", revokedAt: null });
  h.seed("diagnosticOrderAssignment", { id: h.id(66), orderId: b, userId: h.subject.userId, capability: "diagnostics.reviewer", revokedAt: null });
  const rights: D.DiagnosticIdentityRights = { category: "vehicle_observation" as const, purpose: "Synthetic comparison", basis: "Synthetic fixture", provenance: "Synthetic fixture", identifiability: "personal" as const, use: ["service" as const], schedule: { kind: "until" as const, until: "2026-11-25T12:00:00.000Z", reason: "Declared fixture end" }, supplierRestrictions: "Service only", hold: null };
  const bytes = new Uint8Array([1, 2, 3]);
  for (const [orderId, rawId, subject, n] of [[h.orderId, h.id(5), h.subject, 70], [b, rawB, technician, 72]] as const) {
    await h.identity.stage(subject, orderId, { id: h.id(n), expectedOrderVersion: 1, contentType: "image/png", sizeBytes: 3, rights });
    await h.identity.upload(subject, orderId, h.id(n), { expectedOrderVersion: 1, mime: "image/png", bytes });
    await h.identity.append(subject, orderId, { id: h.id(n + 1), identityRecordId: rawId, expectedOrderVersion: 1, rights, correction: null,
      identifiers: [{ kind: "manufacturer_plate", location: "engine bay", value: "Synthetic plate", provenanceIds: [h.id(n)] }] });
  }
  await h.reports.create(h.subject, h.orderId, { reportId: h.reportId, expectedOrderVersion: 2 });
  await h.reports.transition(h.subject, h.reportId, { expectedVersion: 0, action: "submit" });
  await h.reports.transition(h.subject, h.reportId, { expectedVersion: 1, action: "finalize", privateSelfReview: true, reason: "Authorized fixture review" });
  const issuance = { predecessorId: h.reportId, expectedPredecessorVersion: 2, expectedOrderVersion: 2,
    predecessorIdentityRecordId: h.id(5), candidateIdentityRecordId: rawB, linkingTechnicianId: technician.userId,
    method: "comparative_attestation" as const, rationale: "Same physical manufacturer plate", provenanceRecordIds: [h.id(70), h.id(72)] };
  if (beforeIssue) await beforeIssue(h);
  let proofId: string;
  if (requestIssue) {
    const request = await h.proofs.prepareRequest(h.subject, b, { kind: "issue" });
    const issued = await h.proofs.executeRequest(h.subject, b, request.requestId, { kind: "issue", command: issuance });
    expect(await h.proofs.executeRequest(h.subject, b, request.requestId, { kind: "issue", command: issuance })).toEqual(issued);
    expect(await h.proofs.recoverRequest(h.subject, b, request.requestId)).toEqual(issued);
    proofId = (await h.db.diagnosticContinuityProof.findUniqueOrThrow({ where: { requestId: request.requestId } })).id;
  } else ({ proofId } = await h.proofs.issue(h.subject, b, issuance));
  return { ...h, b, rawB, technician, proofId, issuance, input: { reportId: h.id(80), predecessorId: h.reportId, expectedOrderVersion: 2, proofId, reason: "Fresh independent visit" } };
}

describe("private proof consumption at the real adapter", () => {
  it("reads historical material, discovers usable B handoff, consumes once and returns the exact retry", async () => {
    const h = await privatePair();
    expect(await h.proofs.read(h.subject, h.b, h.proofId)).toMatchObject({ proofId: h.proofId, method: "comparative_attestation" });
    expect(await h.proofs.handoffs(h.technician, h.b, {})).toMatchObject({ handoffs: [{ proofId: h.proofId, status: "usable", expectedOrderVersion: 2 }] });
    const result = await h.proofs.consume(h.technician, h.b, h.input);
    expect(result).toMatchObject({ id: h.input.reportId, orderId: h.b, findings: [], mileageKm: 120, lineageKind: "reinspection" });
    expect(await h.proofs.consume(h.technician, h.b, h.input)).toEqual(result);
    expect(await h.db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: h.proofId } })).toMatchObject({ consumedReportId: h.input.reportId, consumedAt: new Date("2026-10-25T12:00:00Z") });
    expect(h.commands.filter(c => c.operation === "proof_consume")).toHaveLength(1);
    expect(await h.db.diagnosticAudit.findMany({ where: { action: "CONTINUITY_PROOF_CONSUMED" } })).toHaveLength(1);
  });
  it.each(["write", "finish"] as const)("restores proof, report, pins and both audits on exact consume %s failure", async failure => {
    const h = await privatePair();
    const proof = await h.db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: h.proofId } });
    const reports = await h.db.diagnosticReportRecord.findMany(), audits = await h.db.diagnosticAudit.findMany();
    if (failure === "finish") h.failFinish(); else h.failWrite("diagnosticReportRecord");
    await expect(h.proofs.consume(h.technician, h.b, h.input)).rejects.toThrow(failure === "finish" ? "r5_finish_rollback" : "r5_actual_write_rollback");
    expect(await h.db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: h.proofId } })).toEqual(proof);
    expect(await h.db.diagnosticReportRecord.findMany()).toEqual(reports);
    expect(await h.db.diagnosticAudit.findMany()).toEqual(audits);
  });
  it("retains historical reading after invalidation but refuses new consumption", async () => {
    const h = await privatePair();
    await h.db.diagnosticContinuityProof.update({ where: { id: h.proofId }, data: { invalidatedAt: new Date("2026-10-25T12:00:00Z") } });
    expect(await h.proofs.read(h.subject, h.b, h.proofId)).toMatchObject({ proofId: h.proofId });
    await expect(h.proofs.consume(h.technician, h.b, h.input)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await h.db.diagnosticReportRecord.count()).toBe(1);
  });
});

describe("finite report source effects and unlocked proposal", () => {
  it.each(["write", "finish"] as const)("restores final snapshot, all pins, intents and audits on %s failure", async failure => {
    const h = reportPreparedHarness(); await draft(h);
    await h.reports.transition(h.subject, h.reportId, { expectedVersion: 0, action: "submit" });
    const before = await h.db.diagnosticReportRecord.findMany(), audits = await h.db.diagnosticAudit.findMany();
    if (failure === "finish") h.failFinish(); else h.failWrite("diagnosticPdfArtifact");
    await expect(h.reports.transition(h.subject, h.reportId, { expectedVersion: 1, action: "finalize", privateSelfReview: true, reason: "Private review" })).rejects.toThrow(failure === "finish" ? "r5_finish_rollback" : "r5_actual_write_rollback");
    expect(await h.db.diagnosticReportRecord.findMany()).toEqual(before);
    expect(await h.db.diagnosticAudit.findMany()).toEqual(audits);
    expect(await h.db.diagnosticPdfArtifact.findMany()).toEqual([]);
    const artifacts = h.commands.at(-1)!.rows.filter(r => r.table === "diagnostic_pdf_artifacts");
    expect(artifacts).toHaveLength(3);
    expect(new Set(artifacts.map(r => r.key["id"])).size).toBe(3);
    expect(artifacts.every(r => r.verb === "insert")).toBe(true);
  });
  it("shares complete pinned ancestor/descendant/provenance/rights mapping without proposal locks or mutations", async () => {
    const h = await privatePair();
    const order = await h.db.inspectionOrder.findUniqueOrThrow({ where: { id: h.orderId } });
    const parent = await h.db.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: h.id(71) } });
    const rights = parent.rights as unknown as D.DiagnosticIdentityRights;
    await h.identity.stage(h.subject, h.orderId, { id: h.id(90), expectedOrderVersion: 2, contentType: "image/png", sizeBytes: 3, rights });
    await h.identity.upload(h.subject, h.orderId, h.id(90), { expectedOrderVersion: 2, mime: "image/png", bytes: new Uint8Array([4, 5, 6]) });
    const correction = await h.identity.append(h.subject, h.orderId, { id: h.id(91), identityRecordId: h.id(5), expectedOrderVersion: 2, rights,
      correction: { supersedesId: parent.id, explanation: "Fresh plate evidence" }, identifiers: [{ kind: "manufacturer_plate", value: "Synthetic plate", location: "engine bay", provenanceIds: [h.id(90)] }] });
    const current = await h.db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } });
    const before = await h.db.diagnosticIdentityEvidence.findMany(), commands = h.commands.length;
    for (const pin of [{ id: parent.id, hash: parent.recordHash! }, { id: correction.id, hash: correction.recordHash! }]) {
      const result = await h.compareIdentity(current, current.observedVehicle as Parameters<typeof h.identity.identity>[2], pin);
      expect(result.proposal).toEqual(result.locked);
      expect(result.proposal.provenance).toEqual([h.id(70), h.id(90)]);
      expect(result.proposal.identity.corrections).toHaveLength(1);
      expect(result.proposal.identity.evidence?.rights).toEqual(rights);
      expect(result.unlocked.some(q => /FOR (UPDATE|SHARE)|diagnostic_prepare|diagnostic_source_scope/.test(q))).toBe(false);
    }
    expect(h.commands).toHaveLength(commands);
    expect(await h.db.diagnosticIdentityEvidence.findMany()).toEqual(before);
  });
  it.each(["write", "finish"] as const)("rolls prepared private issuance and its audit back on %s failure", async failure => {
    let saved: ReturnType<typeof reportPreparedHarness> | undefined;
    let beforeAudits: unknown, beforeReports: unknown;
    await expect(privatePair(async h => { saved = h; beforeAudits = await h.db.diagnosticAudit.findMany(); beforeReports = await h.db.diagnosticReportRecord.findMany();
      if (failure === "finish") h.failFinish(); else h.failWrite("diagnosticAudit");
    })).rejects.toThrow(failure === "finish" ? "r5_finish_rollback" : "r5_actual_write_rollback");
    expect(await saved!.db.diagnosticContinuityProof.findMany()).toEqual([]);
    expect(await saved!.db.diagnosticAudit.findMany()).toEqual(beforeAudits);
    expect(await saved!.db.diagnosticReportRecord.findMany()).toEqual(beforeReports);
    expect(saved!.commands.at(-1)?.operation).toBe("proof_issue");
  });
  it("refuses an issuer Session expiring after preparation before actual authority checks", async () => {
    let saved: ReturnType<typeof reportPreparedHarness> | undefined;
    await expect(privatePair(async h => { saved = h; h.afterPrepare(async () => { h.clock(new Date("2027-01-02")); }); })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(saved!.commands.at(-1)?.operation).toBe("proof_issue");
    expect(await saved!.db.diagnosticContinuityProof.count()).toBe(0);
    expect(await saved!.db.diagnosticAudit.count({ where: { action: "CONTINUITY_PROOF_ISSUED" } })).toBe(0);
  });
});

describe("verified report evidence retirement", () => {
  async function attached() {
    const h = reportPreparedHarness(); await draft(h);
    await h.uploads.upload(h.subject, { reportId: h.reportId, evidenceId: h.id(95), findingId: h.id(20), expectedVersion: 0, mime: "image/png", bytes: new Uint8Array([1, 2, 3]) });
    const finding: D.DiagnosticFinding = { id: h.id(20), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [h.id(95)], kind: null, source: null, measurement: null, location: null };
    await h.reports.save(h.subject, h.reportId, { expectedVersion: 0, finding });
    return { ...h, finding: { ...finding, evidenceIds: [] } };
  }
  it("declares exactly the verified evidence cleanup fields before actual save", async () => {
    const h = await attached(), before = await h.db.diagnosticEvidence.findUniqueOrThrow({ where: { id: h.id(95) } });
    await h.reports.save(h.subject, h.reportId, { expectedVersion: 1, finding: h.finding });
    const row = h.commands.at(-1)!.rows.find(r => r.table === "diagnostic_evidence");
    expect(row).toMatchObject({ verb: "update", key: { id: before.id }, expected: { source: { state: "verified", cleanupRequestedAt: null } }, next: { state: "cleanup_pending", cleanupRequestedAt: "2026-10-25T12:00:00.000Z" } });
    expect(await h.db.diagnosticEvidence.findUniqueOrThrow({ where: { id: before.id } })).toEqual({ ...before, state: "cleanup_pending", cleanupRequestedAt: new Date("2026-10-25T12:00:00Z") });
    expect(h.stored.get(before.objectKey)).toEqual(new Uint8Array([1, 2, 3]));
  });
  it.each(["write", "finish"] as const)("restores verified evidence and complete saved state on retirement %s failure", async failure => {
    const h = await attached(), evidence = await h.db.diagnosticEvidence.findMany(), reports = await h.db.diagnosticReportRecord.findMany(), audits = await h.db.diagnosticAudit.findMany();
    if (failure === "finish") h.failFinish(); else h.failWrite("diagnosticEvidence");
    await expect(h.reports.save(h.subject, h.reportId, { expectedVersion: 1, finding: h.finding })).rejects.toThrow(failure === "finish" ? "r5_finish_rollback" : "r5_actual_write_rollback");
    expect(await h.db.diagnosticEvidence.findMany()).toEqual(evidence);
    expect(await h.db.diagnosticReportRecord.findMany()).toEqual(reports);
    expect(await h.db.diagnosticAudit.findMany()).toEqual(audits);
  });
});

describe("private request execution", () => {
  it("executes and recovers both actual request kinds with exact-result retries", async () => {
    const h = await privatePair(undefined, true), request = await h.proofs.prepareRequest(h.technician, h.b, { kind: "consume" });
    const command = { proofId: h.proofId, reportId: h.input.reportId, expectedOrderVersion: 2, reason: h.input.reason };
    const result = await h.proofs.executeRequest(h.technician, h.b, request.requestId, { kind: "consume", command });
    expect(await h.proofs.executeRequest(h.technician, h.b, request.requestId, { kind: "consume", command })).toEqual(result);
    expect(await h.proofs.recoverRequest(h.technician, h.b, request.requestId)).toEqual(result);
    expect(await h.proofs.discoverRequests(h.technician, h.b, {})).toMatchObject({ requests: [result] });
    await expect(h.proofs.executeRequest(h.technician, h.b, request.requestId, { kind: "consume", command: { ...command, reason: "Different reason" } })).rejects.toThrow("DIAGNOSTIC_REINSPECTION_CONFLICT");
    expect(await h.db.diagnosticContinuityProof.count()).toBe(1);
    expect(await h.db.diagnosticReportRecord.count()).toBe(2);
  });
});

describe("issuer post-preparation fact revalidation", () => {
  it.each(["grant", "qualification", "provenance"] as const)("refuses changed %s facts after the offline preparation boundary", async defect => {
    let saved: ReturnType<typeof reportPreparedHarness> | undefined;
    // Explicit DB-boundary fault injection, not PostgreSQL opposition evidence.
    await expect(privatePair(async h => { saved = h; h.afterPrepare(async () => {
      if (defect === "grant") await h.db.staffGrant.update({ where: { userId_capability: { userId: h.subject.userId, capability: "diagnostics.reviewer" } }, data: { revokedAt: new Date("2026-10-25T12:00:00Z") } });
      if (defect === "qualification") await h.db.diagnosticCenterAssignment.update({ where: { id: h.id(11) }, data: { qualifiedUntil: new Date("2026-10-25T12:00:00Z") } });
      if (defect === "provenance") await h.db.diagnosticIdentityProvenance.update({ where: { id: h.id(70) }, data: { state: "cleanup_pending", cleanupRequestedAt: new Date("2026-10-25T12:00:00Z") } });
    }); })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(saved!.commands.at(-1)?.operation).toBe("proof_issue");
    expect(await saved!.db.diagnosticContinuityProof.count()).toBe(0);
    expect(await saved!.db.diagnosticAudit.count({ where: { action: "CONTINUITY_PROOF_ISSUED" } })).toBe(0);
  });
});

describe("request-result atomic rollback", () => {
  it.each(["issue", "consume"] as const)("retains the pending %s request without partial result when finish fails", async kind => {
    const h = await privatePair(), actor = kind === "issue" ? h.subject : h.technician;
    const request = await h.proofs.prepareRequest(actor, h.b, { kind });
    const reports = await h.db.diagnosticReportRecord.findMany(), proofs = await h.db.diagnosticContinuityProof.findMany(), audits = await h.db.diagnosticAudit.findMany();
    const input: D.DiagnosticContinuityRequestExecute = kind === "issue" ? { kind, command: h.issuance }
      : { kind, command: { proofId: h.proofId, reportId: h.input.reportId, expectedOrderVersion: 2, reason: h.input.reason } };
    h.failFinish();
    await expect(h.proofs.executeRequest(actor, h.b, request.requestId, input)).rejects.toThrow("r5_finish_rollback");
    expect(await h.proofs.recoverRequest(actor, h.b, request.requestId)).toEqual(request);
    expect(await h.db.diagnosticReportRecord.findMany()).toEqual(reports);
    expect(await h.db.diagnosticContinuityProof.findMany()).toEqual(proofs);
    expect(await h.db.diagnosticAudit.findMany()).toEqual(audits);
  });
});

describe("request planning-conflict recovery protocol", () => {
  it.each(["issue", "consume"] as const)("recovers only the exact committed %s winner without another mutation", async kind => {
    const h = await privatePair(undefined, true), actor = kind === "issue" ? h.subject : h.technician;
    const proof = await h.db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: h.proofId } });
    const requestId = kind === "issue" ? proof.requestId! : (await h.proofs.prepareRequest(actor, h.b, { kind })).requestId;
    const input: D.DiagnosticContinuityRequestExecute = kind === "issue" ? { kind, command: h.issuance }
      : { kind, command: { proofId: h.proofId, reportId: h.input.reportId, expectedOrderVersion: 2, reason: h.input.reason } };
    const winner = await h.proofs.executeRequest(actor, h.b, requestId, input), audits = await h.db.diagnosticAudit.findMany(), commands = h.commands.length;
    // Simulates stale proposal reads followed by the exact PostgreSQL protocol error.
    // Real backend blocking and concurrency are asserted only in authored SQL source.
    h.requestWinnerConflict(kind, h.input.reportId);
    expect(await h.proofs.executeRequest(actor, h.b, requestId, input)).toEqual(winner);
    expect(h.commands).toHaveLength(commands);
    expect(await h.db.diagnosticAudit.findMany()).toEqual(audits);
    h.requestWinnerConflict(kind, h.input.reportId, "r5_unrelated_database_failure");
    await expect(h.proofs.executeRequest(actor, h.b, requestId, input)).rejects.toThrow("r5_unrelated_database_failure");
    expect(await h.db.diagnosticAudit.findMany()).toEqual(audits);
  });
});

describe("complete initial discovery pages", () => {
  it("authorizes every initial handoff/request result without creating another source receipt", async () => {
    const h = await privatePair(), second = await h.proofs.issue(h.subject, h.b, h.issuance);
    const one = await h.proofs.prepareRequest(h.technician, h.b, { kind: "consume" }), two = await h.proofs.prepareRequest(h.technician, h.b, { kind: "consume" });
    const commands = h.commands.length;
    const page = await h.proofs.handoffs(h.technician, h.b, {});
    expect(page.handoffs.map(item => item.proofId).sort()).toEqual([h.proofId, second.proofId].sort());
    const requests = await h.proofs.discoverRequests(h.technician, h.b, {});
    expect(requests.requests.map(item => item.requestId).sort()).toEqual([one.requestId, two.requestId].sort());
    expect(h.commands).toHaveLength(commands);
  });
});
