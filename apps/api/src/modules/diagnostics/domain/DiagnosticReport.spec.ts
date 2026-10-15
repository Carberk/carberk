import { describe, expect, it } from "vitest";
import { DiagnosticReport, type DiagnosticReportState } from "./DiagnosticReport";

const base: DiagnosticReportState = { id: "report", orderId: "order", audience: "listing_public", status: "draft", templateVersionId: "v1", observedAt: "2026-10-15T12:00:00.000Z", mileageKm: 120000, findings: [], reviewerId: null, authorId: "tech", successorOf: null, correctionReason: null, finalizedAt: null, withdrawnAt: null };
const finding = { id: "f1", checkId: "brakes", assessment: "fault" as const, explanation: "Pad below the approved limit", evidenceIds: ["photo-1"] };
describe("diagnostic report workflow", () => {
  it("requires an explicit assessment and evidence before submission", () => {
    const report = new DiagnosticReport(base);
    expect(() => report.submit("tech", ["brakes"])).toThrow("REPORT_UNASSESSED_REQUIRED");
    expect(report.upsertFinding("tech", finding).submit("tech", ["brakes"]).state.status).toBe("submitted");
  });
  it("separates public review and keeps finalized snapshots immutable", () => {
    const submitted = new DiagnosticReport(base).upsertFinding("tech", finding).submit("tech", ["brakes"]);
    expect(() => submitted.review("tech", "finalize")).toThrow("REPORT_REVIEWER_SEPARATION_REQUIRED");
    const final = submitted.review("reviewer", "finalize");
    expect(final.publicBadgeAvailable()).toBe(true);
    expect(() => final.upsertFinding("reviewer", finding)).toThrow("REPORT_IMMUTABLE");
    expect(final.correct("report-2", "tech", "Corrected measurement", "2026-10-16T12:00:00.000Z", 120100).state.successorOf).toBe("report");
  });
  it("allows audited private self-review without creating public metadata", () => {
    const privateReport = new DiagnosticReport({ ...base, audience: "buyer_private", reviewerId: "tech" }).upsertFinding("tech", finding).submit("tech", ["brakes"]);
    const final = privateReport.review("tech", "finalize");
    expect(final.publicBadgeAvailable()).toBe(false);
    expect(final.withdraw("tech").state.status).toBe("withdrawn");
  });
});
