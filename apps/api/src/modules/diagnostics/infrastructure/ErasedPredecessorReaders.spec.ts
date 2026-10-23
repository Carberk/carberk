import { expect, it } from "vitest";
import { diagnosticReaderFixture, diagnosticTestId as id, diagnosticTestNow, diagnosticTestSha } from "../../../../../../packages/db/tests/support/DiagnosticMemoryDatabase";
import { DiagnosticReportAccess } from "./DiagnosticReportAccess";
import { PrismaDiagnosticPublic } from "./PrismaDiagnosticPublic";
import { PrismaDiagnosticDocuments } from "./PrismaDiagnosticDocuments";

const runtime = { now: () => diagnosticTestNow, id: () => id(90), syntheticAllowed: () => true, publicSyntheticAllowed: () => true };
it("serves B's own public JSON without the erased predecessor and preserves the release", async () => {
  const { db, eraseA } = await diagnosticReaderFixture();
  const access = new DiagnosticReportAccess(null!, runtime);
  const reader = new PrismaDiagnosticPublic(db, access, null!);
  const before = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: id(2) } });
  expect((await reader.read(id(2))).successorOf).toBe(id(1));
  await eraseA();
  const read = await reader.read(id(2));
  expect(read).toMatchObject({ id: id(2), successorOf: null, observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 124100 });
  expect(JSON.stringify(read)).not.toContain(id(1));
  expect(read.findings[0]?.id).toBe(id(20));
  expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: id(2) } })).toEqual(before);
});
it("does not return a held A-bearing PDF after erasure crosses storage I/O", async () => {
  const { db, eraseA } = await diagnosticReaderFixture();
  const bytes = Buffer.from(`Issued B ${id(2)} predecessor ${id(1)}`);
  await db.diagnosticPdfArtifact.update({ where: { id: id(42) }, data: { state: "ready", sha256: diagnosticTestSha(bytes), sizeBytes: bytes.length, verifiedAt: diagnosticTestNow } });
  const access = new DiagnosticReportAccess(null!, runtime);
  const documents = new PrismaDiagnosticDocuments(db, access, { async read() { await eraseA(); return bytes; }, sanitize: null!, put: null!, remove: null! });
  await expect(documents.download(null, id(2), "en")).rejects.toMatchObject({ code: "DIAGNOSTIC_PDF_NOT_READY" });
});
