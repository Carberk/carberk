import { createHash, randomUUID } from "node:crypto";

import { diagnosticReaderFixture, diagnosticTestId as id, diagnosticTestNow, DiagnosticMemoryObjects } from "@auto-tm/db/testing";
import { expect, it } from "vitest";

import { DiagnosticArtifactWorker } from "./DiagnosticArtifactWorker";

it.each(["pdf", "evidence"] as const)("marks the complete %s child closure beyond the 100-row maintenance batch", async kind => {
  const { db } = await diagnosticReaderFixture();
  const objects = new DiagnosticMemoryObjects();
  const worker = new DiagnosticArtifactWorker(db, objects, { regular: Buffer.alloc(0), bold: Buffer.alloc(0) }, { now: () => diagnosticTestNow, id: randomUUID, enabled: () => true });
  await db.diagnosticReportRecord.update({ where: { id: id(2) }, data: { erasedAt: diagnosticTestNow } });
  const ids: string[] = [];
  for (let index = 0; index < 101; index += 1) {
    const artifactId = randomUUID(); ids.push(artifactId);
    const bytes = Buffer.from(`closure-${index}`), hash = createHash("sha256").update(bytes).digest("hex");
    const key = `diagnostic-pdf/${id(2)}/${artifactId}.pdf`;
    objects.bytes.set(key, bytes);
    if (kind === "evidence") await db.diagnosticEvidence.create({ data: { id: artifactId, reportId: id(2), findingId: id(20), objectKey: `diagnostic-evidence/${artifactId}/${hash}`,
      sha256: hash, sizeBytes: bytes.length, mime: "image/webp", state: "staged", createdAt: diagnosticTestNow, cleanupAttempts: 0, writeLeaseUntil: new Date(diagnosticTestNow.getTime() + 120_000), cleanupLeaseUntil: null } });
    else await db.diagnosticPdfArtifact.create({ data: { id: artifactId, reportId: id(2), snapshotHash: "a".repeat(64), locale: "en", rendererVersion: "v1",
      objectKey: key, state: "pending", sha256: hash, sizeBytes: bytes.length, createdAt: diagnosticTestNow } });
  }
  expect(await worker.cleanup()).toBe(kind === "pdf" ? 100 : 3);
  const remaining = kind === "pdf" ? await db.diagnosticPdfArtifact.findMany({ where: { id: { in: ids }, cleanupRequestedAt: null } })
    : await db.diagnosticEvidence.findMany({ where: { id: { in: ids }, cleanupRequestedAt: null } });
  expect(remaining).toHaveLength(0);
});
