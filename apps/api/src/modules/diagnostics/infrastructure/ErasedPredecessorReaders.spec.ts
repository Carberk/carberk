import { expect, it } from "vitest";
import { diagnosticReaderFixture, diagnosticTestId as id, diagnosticTestNow, diagnosticTestSha, DiagnosticMemoryObjects } from "@auto-tm/db/testing";
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
  const objects = new DiagnosticMemoryObjects();
  await objects.put(`diagnostic-pdf/${id(2)}/${id(42)}.pdf`, bytes);
  objects.afterRead = eraseA;
  const documents = new PrismaDiagnosticDocuments(db, access, { read: objects.read.bind(objects), sanitize: null!, put: objects.put.bind(objects), remove: null! });
  await expect(documents.download(null, id(2), "en")).rejects.toMatchObject({ code: "DIAGNOSTIC_PDF_NOT_READY" });
});

it("delivers only the current safe locale artifact and still refuses a changed public authority after I/O", async () => {
  const { db, eraseA } = await diagnosticReaderFixture(), objects = new DiagnosticMemoryObjects();
  await eraseA();
  const original = await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: id(42) } });
  const bytes = Buffer.from(`Safe B ${id(2)} own observation`);
  await objects.put(`diagnostic-pdf/${id(2)}/${id(70)}.pdf`, bytes);
  await db.diagnosticPdfArtifact.create({ data: { id: id(70), reportId: id(2), snapshotHash: original.snapshotHash,
    rendererVersion: "v1-erased-lineage", generation: 2, locale: "en", objectKey: `diagnostic-pdf/${id(2)}/${id(70)}.pdf`,
    state: "ready", sha256: diagnosticTestSha(bytes), sizeBytes: bytes.length, verifiedAt: diagnosticTestNow } });
  const access = new DiagnosticReportAccess(null!, runtime);
  const documents = new PrismaDiagnosticDocuments(db, access, { read: objects.read.bind(objects), sanitize: null!, put: objects.put.bind(objects), remove: null! });
  expect((await documents.list(null, id(2))).find(d => d.locale === "en")).toMatchObject({ id: id(70), state: "ready", generation: 2 });
  expect(await documents.download(null, id(2), "en")).toEqual(bytes);
  objects.afterRead = async () => { await db.listing.update({ where: { id: id(8) }, data: { status: "archived" } }); };
  await expect(documents.download(null, id(2), "en")).rejects.toMatchObject({ code: "DIAGNOSTIC_PUBLIC_UNAVAILABLE" });
});
