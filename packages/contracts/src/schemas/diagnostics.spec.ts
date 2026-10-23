import { describe, expect, it } from "vitest";

import { DiagnosticReportSchema, DiagnosticReleasedSnapshotSchema, PublicDiagnosticReportSchema } from "./diagnostics";

const id = "11111111-1111-4111-8111-111111111111";
const text = {en: "Synthetic", ru: "Пример", tk: "Nusga"};
const report = {id, orderId: id, audience: "listing_public", status: "finalized", templateVersionId: id, observedAt: "2026-10-17T10:00:00.000Z", mileageKm: 1, findings: [], authorId: null, reviewerId: null, successorOf: null, correctionReason: null, returnReason: null, finalizedAt: "2026-10-17T10:00:00.000Z", withdrawnAt: null, withdrawalReason: null, version: 1, synthetic: true, template: {title: text, limitations: text, syntheticNotice: text, checks: [{id: "brakes", label: text, required: true, evidenceRequired: false, measurement: null}], panels: []}};
describe("live diagnostic lineage projection", () => {
 it.each(["original", "correction", "reinspection"])("preserves explicit %s on live private and public contracts", kind => {
  const live = {...report, lineageKind: kind, supersededBy: id, successorKind: "reinspection"};
  for (const schema of [DiagnosticReportSchema, PublicDiagnosticReportSchema]) expect(schema.parse(live)).toMatchObject({lineageKind: kind, successorKind: "reinspection", supersededBy: id});
 });
 it("accepts legacy responses without inventing a kind", () => {
  expect(DiagnosticReportSchema.parse(report)).not.toHaveProperty("lineageKind");
  expect(DiagnosticReportSchema.parse(report)).not.toHaveProperty("successorKind");
 });
 it("treats unrecognized live metadata as unknown for a neutral reader fallback", () => {
  for (const schema of [DiagnosticReportSchema, PublicDiagnosticReportSchema]) {
   const parsed = schema.parse({...report, lineageKind: "future-kind", successorKind: "future-kind"});
   expect(parsed.lineageKind).toBeUndefined(); expect(parsed.successorKind).toBeUndefined();
  }
 });
 it("keeps live lineage out of stored release schema and serialized output", () => {
  const input = {report, template: report.template, synthetic: true};
  const baseline = JSON.stringify(DiagnosticReleasedSnapshotSchema.parse(input));
  const output = DiagnosticReleasedSnapshotSchema.parse({...input, report: {...report, lineageKind: "reinspection", successorKind: "correction", supersededBy: id}});
  expect(JSON.stringify(output)).toBe(baseline);
  for (const key of ["lineageKind", "successorKind", "supersededBy"]) {
   expect(DiagnosticReleasedSnapshotSchema.shape.report.shape).not.toHaveProperty(key);
   expect(output.report).not.toHaveProperty(key);
  }
 });
});
