import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { diagnosticReaderFixture, diagnosticTestId as id, diagnosticTestNow, DiagnosticMemoryObjects } from "@auto-tm/db/testing";
import { expect, it } from "vitest";

import { DiagnosticArtifactWorker } from "./DiagnosticArtifactWorker";
import { readDiagnosticPdfText } from "./testing/readDiagnosticPdfText";

const locales = ["tk", "ru", "en"] as const;
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const descriptor = (row: { objectKey: string; sizeBytes: number | null; sha256: string | null }) => {
  if (!row.sizeBytes || !row.sha256) throw new Error("Missing PDF descriptor");
  return [row.objectKey, row.sizeBytes, row.sha256] as const;
};

it.each(locales)("recovers an issued %s PDF in one ordinary maintenance pass despite older generation work", async issuedLocale => {
  const { memory, db, snapshot, eraseA } = await diagnosticReaderFixture();
  const objects = new DiagnosticMemoryObjects();
  const fonts = { regular: await readFile(join(__dirname, "../../../assets/fonts/NotoSans-Regular.ttf")), bold: await readFile(join(__dirname, "../../../assets/fonts/NotoSans-Bold.ttf")) };
  const worker = new DiagnosticArtifactWorker(db, objects, fonts, { now: () => diagnosticTestNow, id: randomUUID, enabled: () => true });
  const issuedId = id(40 + locales.indexOf(issuedLocale));
  expect(await worker.generate(issuedId)).toBe(true);
  const issued = await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: issuedId } });
  const issuedBytes = await objects.read(...descriptor(issued));
  expect(await readDiagnosticPdfText(issuedBytes)).toContain(id(1));
  const beforeB = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: id(2) } });

  // Earlier releases in the protected HTTP suite retain pending locale intents.
  // Use real, independently renderable releases, including due retry/recovery.
  const ordinaryIds: string[] = [];
  for (const n of [100, 200]) {
    const report = { ...snapshot.report, id: id(n), orderId: id(n + 1), successorOf: null, correctionReason: null };
    const source = { ...snapshot, report };
    const hash = createHash("sha256").update(canonical(source)).digest("hex");
    memory.seed("inspectionOrder", { id: id(n + 1), synthetic: true, erasedAt: null, commissionerId: id(7) });
    memory.seed("diagnosticReportRecord", { id: id(n), orderId: id(n + 1), audience: "listing_public", predecessorId: null, snapshot: source, snapshotHash: hash, erasedAt: null });
    for (const [index, locale] of locales.entries()) {
      const artifactId = id(n + 10 + index); ordinaryIds.push(artifactId);
      await db.diagnosticPdfArtifact.create({ data: { id: artifactId, reportId: id(n), snapshotHash: hash, locale, rendererVersion: "v1", objectKey: `diagnostic-pdf/${id(n)}/${artifactId}.pdf`,
        createdAt: new Date("2026-10-22T00:00:00Z"), state: index === 0 ? "pending" : index === 1 ? "failed" : "processing", attempts: index === 0 ? 0 : 1,
        retryAt: index === 1 ? new Date("2026-10-22T01:00:00Z") : null, leaseUntil: index === 2 ? new Date("2026-10-22T01:00:00Z") : null } });
    }
  }
  const unrelatedKey = "diagnostic-pdf/unrelated/retained.pdf";
  await objects.put(unrelatedKey, Buffer.from("retained"));
  // Erasure occurs after reading the original exact bytes, as in the held read.
  await eraseA();
  for (const [index, locale] of locales.entries()) if (locale !== issuedLocale) expect(await worker.generate(id(40 + index))).toBe(true);
  await worker.execute();

  const replacements = await db.diagnosticPdfArtifact.findMany({ where: { reportId: id(2), rendererVersion: "v1-erased-lineage" } });
  expect(replacements).toHaveLength(3);
  for (const locale of locales) {
    const artifact = replacements.find(row => row.locale === locale)!;
    expect(artifact.state, `Current ${locale} PDF must recover after ordinary artifact maintenance`).toBe("ready");
    expect(artifact.id).not.toBe(id(40 + locales.indexOf(locale)));
    expect(artifact.attempts).toBe(1);
    const text = await readDiagnosticPdfText(await objects.read(...descriptor(artifact)));
    expect(text).not.toContain(id(1));
    for (const own of [id(2), id(20), id(5), "124100 km", "2026-10-21T11:00:00.000Z"]) expect(text).toContain(own);
  }
  const ordinaryReady = await db.diagnosticPdfArtifact.findMany({ where: { id: { in: ordinaryIds }, state: "ready" } });
  expect(ordinaryReady).toHaveLength(4);
  expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: id(2) } })).toEqual(beforeB);
  expect(await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: issued.id } })).toEqual(issued);
  expect(await objects.read(...descriptor(issued))).toEqual(issuedBytes);
  expect(objects.bytes.get(unrelatedKey)).toEqual(Buffer.from("retained"));
  // A later normal sweep drains the ordinary tail without new replacement work.
  await worker.execute();
  expect(await db.diagnosticPdfArtifact.findMany({ where: { id: { in: ordinaryIds }, state: "ready" } })).toHaveLength(6);
  expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: id(2), rendererVersion: "v1-erased-lineage" } })).toEqual(replacements);
});
