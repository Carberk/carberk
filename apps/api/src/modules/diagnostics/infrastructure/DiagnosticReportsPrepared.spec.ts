import { describe, expect, it } from "vitest";
import { reportPreparedHarness } from "../../identity/application/testing/ReportPreparedHarness";
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
});
