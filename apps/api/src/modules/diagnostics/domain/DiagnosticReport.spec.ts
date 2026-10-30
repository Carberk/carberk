import { describe, expect, it } from "vitest";
import { DiagnosticReport, type DiagnosticReportState } from "./DiagnosticReport";

const now = new Date("2026-10-17T12:00:00.000Z");
const association = { publicationAuthorized: true, identityMatches: true, listingVisible: true };
const base: DiagnosticReportState = { id: "report", orderId: "order", audience: "listing_public", status: "draft", templateVersionId: "v1", observedAt: "2026-10-15T12:00:00.000Z", mileageKm: 120000, findings: [], reviewerId: null, authorId: "tech", successorOf: null, correctionReason: null, returnReason: null, withdrawalReason: null, finalizedAt: null, withdrawnAt: null };
const finding = { id: "f1", checkId: "brakes", assessment: "fault" as const, explanation: "Pad below the approved limit", evidenceIds: ["photo-1"] };
describe("diagnostic report workflow", () => {
  it("requires an explicit assessment and evidence before submission", () => {
    const report = new DiagnosticReport(base);
    expect(() => report.submit("tech", ["brakes"])).toThrow("REPORT_UNASSESSED_REQUIRED");
    expect(report.upsertFinding("tech", finding).submit("tech", ["brakes"]).state.status).toBe("submitted");
  });
  it("separates public review and keeps finalized snapshots immutable", () => {
    const submitted = new DiagnosticReport(base).upsertFinding("tech", finding).submit("tech", ["brakes"]);
    expect(() => submitted.review("tech", "finalize", { now })).toThrow("REPORT_REVIEWER_SEPARATION_REQUIRED");
    const final = submitted.review("reviewer", "finalize", { now });
    expect(final.publicBadgeAvailable(association)).toBe(true);
    expect(() => final.upsertFinding("reviewer", finding)).toThrow("REPORT_IMMUTABLE");
    expect(final.correct("report-2", "tech", "Corrected measurement").state.successorOf).toBe("report");
  });
  it("allows audited private self-review without creating public metadata", () => {
    const privateReport = new DiagnosticReport({ ...base, audience: "buyer_private", reviewerId: "tech" }).upsertFinding("tech", finding).submit("tech", ["brakes"]);
    expect(() => privateReport.review("tech", "finalize", { now })).toThrow("REPORT_REVIEWER_SEPARATION_REQUIRED");
    const final = privateReport.review("tech", "finalize", { now, privateSelfReviewAuthorized: true });
    expect(final.publicBadgeAvailable()).toBe(false);
    expect(final.withdraw("tech", "Incorrect association", now).state.status).toBe("withdrawn");
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
  expect(() => submitted.review("reviewer", "return", { now })).toThrow("REPORT_RETURN_REASON_REQUIRED");
  const returned = submitted.review("reviewer", "return", { now, reason: " Explain the measurement " });
  expect(returned.state).toMatchObject({ returnReason: "Explain the measurement", correctionReason: null });
 });
 it("cannot relabel old observations as a new inspection during correction", () => {
  const original = new DiagnosticReport(base).upsertFinding("tech", finding).submit("tech", ["brakes"]).review("reviewer", "finalize", { now });
  const corrected = original.correct("corrected", "tech", "Editorial correction");
  expect(corrected.state.observedAt).toBe("2026-10-15T12:00:00.000Z");
  expect(corrected.state.mileageKm).toBe(120000);
  expect(corrected.state.findings).toEqual([finding]);
 });
 it("does not claim a badge solely because a public snapshot was finalized", () => {
  const report = new DiagnosticReport(base).upsertFinding("tech", finding).submit("tech", ["brakes"]).review("reviewer", "finalize", { now });
  expect(report.publicBadgeAvailable()).toBe(false);
 });
});

it("records a new observation only against a new inspection order", () => {
 const report = new DiagnosticReport(base).upsertFinding("tech", finding).submit("tech", ["brakes"]).review("reviewer", "finalize", { now });
 const input = { reportId: "new-report", orderId: "new-order", templateVersionId: "v2", authorId: "tech", observedAt: "2026-10-17T12:00:00.000Z", mileageKm: 120100, reason: "Physical reinspection after repair" };
 expect(() => report.reinspect({ ...input, orderId: "order" })).toThrow("REPORT_REINSPECTION_REQUIRED");
 const next = report.reinspect(input);
 expect(next.state).toMatchObject({ observedAt: "2026-10-17T12:00:00.000Z", mileageKm: 120100, findings: [], audience: "listing_public", successorOf: "report" });
 expect(report.state.mileageKm).toBe(120000);
});


describe("pinned diagnostic scope", () => {
 const scope = { checks: [{ id: "brakes", required: true, evidenceRequired: true, measurement: { unit: "mm", method: { tk: "Ölçeg", ru: "Измерение", en: "Measurement" } } }], panels: [{ id: "door", evidenceRequired: false }] };
 const measured = { ...finding, measurement: { value: 2.5, unit: "mm", method: "Caliper", uncertainty: "±0.1 mm" }, kind: "observed_damage" as const, source: null };
 it("refuses findings outside the immutable template", () => {
  expect(() => new DiagnosticReport(base, scope).upsertFinding("tech", { ...measured, checkId: "invented" })).toThrow("REPORT_UNKNOWN_CHECK");
 });
 it("requires measurement units and method from the pinned check", () => {
  expect(() => new DiagnosticReport(base, scope).upsertFinding("tech", finding)).toThrow("REPORT_MEASUREMENT_REQUIRED");
  expect(() => new DiagnosticReport(base, scope).upsertFinding("tech", { ...measured, measurement: { ...measured.measurement, unit: "inch" } })).toThrow("REPORT_MEASUREMENT_INVALID");
 });
 it("cannot replace an explicit assessment using a new finding identity", () => {
  const report = new DiagnosticReport(base, scope).upsertFinding("tech", measured);
  expect(() => report.upsertFinding("tech", { ...measured, id: "new-finding" })).toThrow("REPORT_DUPLICATE_CHECK");
 });
 it("requires all body panels to be assessed rather than treating absent markers as normal", () => {
  expect(() => new DiagnosticReport(base, scope).upsertFinding("tech", measured).submit("tech", ["brakes"])).toThrow("REPORT_UNASSESSED_REQUIRED");
 });
 it("requires attribution for confirmed history and panel-bound map locations", () => {
  expect(() => new DiagnosticReport(base, scope).upsertFinding("tech", { ...measured, kind: "source_history" as const })).toThrow("REPORT_SOURCE_REQUIRED");
  expect(() => new DiagnosticReport(base, scope).upsertFinding("tech", { ...measured, location: { view: "left" as const, panelId: "other", x: 0.5, y: 0.5 } })).toThrow("REPORT_LOCATION_INVALID");
 });
 it("keeps zero findings as an explicit normal panel assessment", () => {
  const report = new DiagnosticReport(base, scope).upsertFinding("tech", measured).upsertFinding("tech", { id: "panel-1", checkId: "door", assessment: "normal", explanation: null, evidenceIds: [] });
  expect(report.submit("tech", ["brakes"]).state.findings).toHaveLength(2);
 });
});
