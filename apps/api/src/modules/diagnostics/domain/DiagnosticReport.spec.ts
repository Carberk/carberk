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

describe("diagnostic immutable observation boundaries", () => {
 it("does not retain caller-owned nested state", () => {
  const source = structuredClone(base); source.findings = [structuredClone(finding)];
  const report = new DiagnosticReport(source);
  source.findings[0]!.explanation = "mutated after construction";
  source.findings[0]!.evidenceIds.push("foreign");
  expect(report.state.findings[0]).toEqual(finding);
 });
 it("requires an explanation for Not applicable", () => {
  expect(() => new DiagnosticReport(base).upsertFinding("tech", { ...finding, assessment: "not_applicable", explanation: null, evidenceIds: [] })).toThrow("REPORT_EXPLANATION_REQUIRED");
 });
 it("does not submit mandatory unchecked scope as complete", () => {
  const report = new DiagnosticReport(base).upsertFinding("tech", { ...finding, assessment: "not_checked", explanation: "Not accessible", evidenceIds: [] });
  expect(() => report.submit("tech", ["brakes"])).toThrow("REPORT_INCOMPLETE");
 });
 it("requires a return reason and keeps it separate from a correction reason", () => {
  const submitted = new DiagnosticReport(base).upsertFinding("tech", finding).submit("tech", ["brakes"]);
  expect(() => submitted.review("reviewer", "return")).toThrow("REPORT_RETURN_REASON_REQUIRED");
  const returned = submitted.review("reviewer", "return", " Explain the measurement ");
  expect(returned.state).toMatchObject({ returnReason: "Explain the measurement", correctionReason: null });
 });
 it("cannot relabel old observations as a new inspection during correction", () => {
  const original = new DiagnosticReport(base).upsertFinding("tech", finding).submit("tech", ["brakes"]).review("reviewer", "finalize");
  const corrected = original.correct("corrected", "tech", "Editorial correction", "2026-10-16T12:00:00.000Z", 120100);
  expect(corrected.state.observedAt).toBe("2026-10-15T12:00:00.000Z");
  expect(corrected.state.mileageKm).toBe(120000);
  expect(corrected.state.findings).toEqual([finding]);
 });
 it("does not claim a badge solely because a public snapshot was finalized", () => {
  const report = new DiagnosticReport(base).upsertFinding("tech", finding).submit("tech", ["brakes"]).review("reviewer", "finalize");
  expect(report.publicBadgeAvailable()).toBe(false);
 });
});
