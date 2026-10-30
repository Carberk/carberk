import { describe, expect, it } from "vitest";

import { DiagnosticReportSchema, DiagnosticReportTransitionSchema, DiagnosticReleasedSnapshotSchema, PublicDiagnosticReportSchema } from "./diagnostics";

const id = "11111111-1111-4111-8111-111111111111";
const text = {en: "Synthetic", ru: "Пример", tk: "Nusga"};
const report = {id, orderId: id, audience: "listing_public", status: "finalized", templateVersionId: id, observedAt: "2026-10-17T10:00:00.000Z", mileageKm: 1, findings: [], authorId: null, reviewerId: null, successorOf: null, correctionReason: null, returnReason: null, finalizedAt: "2026-10-17T10:00:00.000Z", withdrawnAt: null, withdrawalReason: null, version: 1, synthetic: true, template: {title: text, limitations: text, syntheticNotice: text, checks: [{id: "brakes", label: text, required: true, evidenceRequired: false, measurement: null}], panels: []}};
describe("released diagnostic identity compatibility", () => {
 const releaseIdentity = {
  version: 1,
  center: { id, names: { tk: "Aşgabat synag merkezi", ru: "Тестовый центр Ашхабада", en: "Ashgabat test center" } },
  vehicle: { method: "vin", maskedVin: "*************1234", display: null, catalog: null },
 };
 it("accepts deliberate typed customer vehicle facts only during finalization", () => {
  const vehicleDisplay = { make: "Toyota", model: "Camry", year: 2018 };
  expect(DiagnosticReportTransitionSchema.parse({ expectedVersion: 2, action: "finalize", vehicleDisplay })).toEqual({ expectedVersion: 2, action: "finalize", vehicleDisplay });
  for (const action of ["submit", "return", "withdraw"]) expect(DiagnosticReportTransitionSchema.safeParse({ expectedVersion: 2, action, vehicleDisplay }).success).toBe(false);
  for (const unsafe of [{ ...vehicleDisplay, year: 0 }, { ...vehicleDisplay, make: "" }, { ...vehicleDisplay, manualReference: "Restricted" }]) {
   expect(DiagnosticReportTransitionSchema.safeParse({ expectedVersion: 2, action: "finalize", vehicleDisplay: unsafe }).success).toBe(false);
  }
 });
 it.each(["buyer_private", "listing_public"])("retains a legacy %s snapshot without inventing vehicle or center facts", audience => {
  const legacyReport = { ...report, audience };
  const legacy = { report: legacyReport, template: report.template, synthetic: true };
  const parsed = DiagnosticReleasedSnapshotSchema.parse(legacy);
  expect(parsed).not.toHaveProperty("releaseIdentity");
  expect(parsed.report).not.toHaveProperty("releaseIdentity");
  expect(parsed.report.audience).toBe(audience);
  expect(parsed.report.observedAt).toBe("2026-10-17T10:00:00.000Z");
  expect(parsed.report.mileageKm).toBe(1);
  expect(DiagnosticReleasedSnapshotSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
 });
 it.each(["buyer_private", "listing_public"])("retains only the versioned safe release identity for %s readers and PDF input", audience => {
  const releasedReport = { ...report, audience, releaseIdentity };
  for (const schema of [DiagnosticReportSchema, PublicDiagnosticReportSchema]) {
   expect(schema.parse(releasedReport)).toMatchObject({ releaseIdentity });
  }
  const snapshot = DiagnosticReleasedSnapshotSchema.parse({ report: releasedReport, template: report.template, synthetic: true });
  expect(snapshot.report).toMatchObject({ releaseIdentity });
  expect(DiagnosticReleasedSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
 });
 it.each([
  { ...releaseIdentity, version: 2 },
  { ...releaseIdentity, vehicle: { ...releaseIdentity.vehicle, maskedVin: "1HGCM82633A001234" } },
  { ...releaseIdentity, vehicle: { ...releaseIdentity.vehicle, manualReference: "Restricted workshop note" } },
  { ...releaseIdentity, vehicle: { ...releaseIdentity.vehicle, identityRecordId: id } },
 ])("refuses unsupported identity versions and restricted identifier material", unsafe => {
  const result = DiagnosticReleasedSnapshotSchema.safeParse({ report: { ...report, releaseIdentity: unsafe }, template: report.template, synthetic: true });
  expect(result.success).toBe(false);
 });
});
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
