import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, it } from "vitest";
import { diagnosticReaderFixture, diagnosticTestId as id, diagnosticTestNow } from "../../../../../packages/db/tests/support/DiagnosticMemoryDatabase";
import { DiagnosticMemoryObjects } from "../../../../../packages/db/tests/support/DiagnosticMemoryObjects";
import { DiagnosticArtifactWorker } from "./DiagnosticArtifactWorker";
const fonts = async () => ({ regular: await readFile(join(__dirname, "../../../assets/fonts/NotoSans-Regular.ttf")), bold: await readFile(join(__dirname, "../../../assets/fonts/NotoSans-Bold.ttf")) });
const text = (bytes: Uint8Array) => execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes, encoding: "utf8" });
const runtime = { now: () => diagnosticTestNow, id: randomUUID, enabled: () => true };
it("replaces an issued predecessor-bearing copy while rendering pending locales safely without rewriting either release", async () => {
  const { db, eraseA } = await diagnosticReaderFixture(), objects = new DiagnosticMemoryObjects();
  const worker = new DiagnosticArtifactWorker(db, objects, await fonts(), runtime);
  expect(await worker.generate(id(42))).toBe(true);
  const issued = await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: id(42) } });
  const issuedBytes = await objects.read(issued.objectKey, issued.sizeBytes!, issued.sha256!);
  expect(text(issuedBytes)).toContain(id(1));
  const beforeB = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: id(2) } });
  await eraseA();
  // Same ordinary maintenance path as the protected HTTP suite: pending TK/RU,
  // then a sweep which must discover and replace the obsolete ready EN.
  expect(await worker.generate(id(40))).toBe(true);
  expect(await worker.generate(id(41))).toBe(true);
  await worker.execute();
  const artifacts = await db.diagnosticPdfArtifact.findMany({ where: { reportId: id(2), state: "ready" }, orderBy: { generation: "desc" } });
  for (const locale of ["tk", "ru", "en"]) {
    const current = artifacts.find(a => a.locale === locale)!;
    const rendered = text(await objects.read(current.objectKey, current.sizeBytes!, current.sha256!));
    expect.soft(rendered).not.toContain(id(1));
    for (const own of [id(2), id(20), id(5), "124100 km", "2026-10-21T11:00:00.000Z"]) expect(rendered).toContain(own);
    if (locale === "en") expect.soft(current.id).not.toBe(issued.id);
  }
  expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: id(2) } })).toEqual(beforeB);
  expect(await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: issued.id } })).toEqual(issued);
  expect(await objects.read(issued.objectKey, issued.sizeBytes!, issued.sha256!)).toEqual(issuedBytes);
});
it("never adopts a late predecessor-bearing PUT as ready and cleans only its exact key after its lease", async () => {
  const { db, eraseA } = await diagnosticReaderFixture(), objects = new DiagnosticMemoryObjects();
  let now = diagnosticTestNow;
  const worker = new DiagnosticArtifactWorker(db, objects, await fonts(), { ...runtime, now: () => now });
  objects.afterPut = eraseA;
  expect(await worker.generate(id(42))).toBe(false);
  objects.afterPut = null;
  const old = await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: id(42) } });
  expect(old.state).toBe("cleanup_pending");
  expect(old.leaseUntil!.getTime()).toBeGreaterThan(now.getTime());
  const unrelated = "diagnostic-pdf/other/retained.pdf"; await objects.put(unrelated, Buffer.from("foreign"));
  await worker.cleanup(); expect(objects.bytes.has(old.objectKey)).toBe(true);
  now = new Date(now.getTime() + 121_000);
  await worker.cleanup(); expect(objects.bytes.has(old.objectKey)).toBe(false);
  expect(objects.bytes.has(unrelated)).toBe(true);
});
