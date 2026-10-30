import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { diagnosticReaderFixture, diagnosticTestId as id, diagnosticTestNow } from "@auto-tm/db/testing";
import { CheckBusinessAuthority } from "../application/CheckBusinessAuthority";
import { CheckStaffAuthority } from "../application/CheckStaffAuthority";
import { PrismaBusinessAuthority } from "../infrastructure/PrismaBusinessAuthority";
import { PrismaStaffAuthority } from "../infrastructure/PrismaStaffAuthority";
import { DiagnosticAuthority } from "../../diagnostics/infrastructure/DiagnosticAuthority";
import { DiagnosticReportAccess } from "../../diagnostics/infrastructure/DiagnosticReportAccess";
import { PrismaDiagnosticReports } from "../../diagnostics/infrastructure/PrismaDiagnosticReports";
import { PrismaDiagnosticDocuments } from "../../diagnostics/infrastructure/PrismaDiagnosticDocuments";

async function fixture() {
  const f = await diagnosticReaderFixture();
  const future = new Date("2026-10-24T00:00:00.000Z");
  const runtime = { now: () => diagnosticTestNow, id: randomUUID, syntheticAllowed: () => true };
  for (const n of [7, 30, 99]) f.memory.seed("session", { id: id(n + 100), userId: id(n), expiresAt: future, adminTotpExpiresAt: future,
    user: { id: id(n), role: "user", suspendedAt: null, deletionScheduledAt: null, dealershipMemberships: [], staffGrants: n === 30 ? [{ capability: "diagnostics.technician" }] : [] } });
  f.memory.seed("diagnosticOrderAssignment", { id: id(200), orderId: id(4), userId: id(30), capability: "diagnostics.technician", revokedAt: null });
  f.memory.seed("diagnosticCenterAssignment", { centerId: id(12), userId: id(30), capability: "diagnostics.technician", revokedAt: null, qualifiedUntil: future });
  const authority = new DiagnosticAuthority(new CheckStaffAuthority(new PrismaStaffAuthority(f.db), runtime), new CheckBusinessAuthority(new PrismaBusinessAuthority(f.db), runtime), runtime, null!);
  const access = new DiagnosticReportAccess(authority, runtime);
  const reports = new PrismaDiagnosticReports(f.db, authority, runtime, access, null!, null!);
  const documents = new PrismaDiagnosticDocuments(f.db, access, null!);
  return { ...f, reports, documents, subject: (n: number) => ({ userId: id(n), sessionId: id(n + 100) }) };
}
it("projects commissioner and currently assigned staff reads, preserving the exact technician mutation receipt and B source", async () => {
  const f = await fixture();
  const input = { reportId: id(2), predecessorId: id(1), reason: "Independent visit", proofId: id(60), expectedOrderVersion: 8 };
  await f.db.diagnosticReportRecord.update({ where: { id: id(2) }, data: { continuityProofId: id(60), reinspectionOrderVersion: 8 } });
  const before = await f.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: id(2) } });
  const retry = () => f.db.$transaction(async tx => { await f.reports.reinspectionLocks(tx, f.subject(30), id(4), id(1)); return f.reports.reinspectionRetry(tx, f.subject(30), id(4), input); });
  const receipt = await retry();
  await f.eraseA();
  for (const n of [7, 30]) {
    const current = await f.reports.read(f.subject(n), id(2));
    expect(current).toMatchObject({ id: id(2), successorOf: null, findings: [{ id: id(20) }], mileageKm: 124100 });
    expect(JSON.stringify(current)).not.toContain(id(1));
    expect((await f.reports.forOrder(f.subject(n), id(4)))[0]).toEqual(current);
    const documents = await f.documents.list(f.subject(n), id(2));
    expect(documents).toHaveLength(3); expect(documents.every(d => d.state === "unavailable")).toBe(true);
  }
  expect(await retry()).toEqual(receipt);
  expect(await f.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: id(2) } })).toEqual(before);
  await expect(f.reports.read(f.subject(99), id(2))).rejects.toMatchObject({ code: "DIAGNOSTIC_NO_ACCESS" });
  await f.db.diagnosticOrderAssignment.update({ where: { id: id(200) }, data: { revokedAt: diagnosticTestNow } });
  await expect(f.reports.read(f.subject(30), id(2))).rejects.toMatchObject({ code: "DIAGNOSTIC_NO_ACCESS" });
  await expect(retry()).rejects.toMatchObject({ code: "DIAGNOSTIC_NO_ACCESS" });
});
