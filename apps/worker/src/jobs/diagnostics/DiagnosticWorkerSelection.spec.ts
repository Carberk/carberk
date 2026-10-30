import { createHash, randomUUID } from "node:crypto";

import { diagnosticReaderFixture, diagnosticTestId as id, diagnosticTestNow, DiagnosticMemoryDatabase, DiagnosticMemoryObjects } from "@auto-tm/db/testing";
import { expect, it } from "vitest";

import { DiagnosticArtifactWorker } from "./DiagnosticArtifactWorker";

it("keeps residual component capacity separate from the oldest frozen grant selection", async () => {
  const memory = new DiagnosticMemoryDatabase(), db = memory.client;
  const old = new Date("2001-01-01T00:00:00.000Z"), end = new Date("2001-01-02T00:00:00.000Z");
  // Literal opposing IDs distinguish oldest-first selection from ID-first work.
  memory.seed("diagnosticOwnershipGrant", { id: "a-newer", state: "available", rightsUntil: end });
  memory.seed("diagnosticOwnershipGrant", { id: "z-oldest", state: "available", rightsUntil: old });
  for (let index = 0; index < 99; index += 1) memory.seed("diagnosticOwnershipGrant", { id: `old-${String(index).padStart(3, "0")}`, state: "available", rightsUntil: old });
  const selected = await db.diagnosticOwnershipGrant.findMany({ where: { state: "available", rightsUntil: { lte: end } },
    orderBy: [{ rightsUntil: "asc" }, { id: "asc" }], take: 100, select: { id: true } });
  expect(selected.map(row => row.id)).toEqual([...Array.from({ length: 99 }, (_, index) => `old-${String(index).padStart(3, "0")}`), "z-oldest"]);
  const grants = selected.map(row => row.id);
  for (const [index, grantId] of grants.entries()) memory.seed("diagnosticOwnershipComponent", { identityRecordId: `derived-${index}`, grantId, state: "available", rightsUntil: old });
  memory.seed("diagnosticOwnershipComponent", { identityRecordId: "independent", grantId: null, state: "available", rightsUntil: old });
  memory.seed("diagnosticOwnershipComponent", { identityRecordId: "outside-selection", grantId: "a-newer", state: "available", rightsUntil: old });
  memory.seed("diagnosticOwnershipComponent", { identityRecordId: "not-due", grantId: null, state: "available", rightsUntil: new Date("2001-01-03T00:00:00.000Z") });
  expect((await db.diagnosticOwnershipComponent.findMany({ where: { state: "available", rightsUntil: { lte: end },
    OR: [{ grantId: null }, { grantId: { notIn: grants } }] }, orderBy: [{ rightsUntil: "asc" }, { identityRecordId: "asc" }], take: 100 })).map(row => row.identityRecordId))
    .toEqual(["independent", "outside-selection"]);
  expect(await db.diagnosticOwnershipComponent.findMany({ where: { grantId: { notIn: grants } }, select: { identityRecordId: true } }))
    .toEqual([{ identityRecordId: "outside-selection" }]);
  memory.seed("diagnosticOwnershipGrant", { id: "0-late-arrival", state: "available", rightsUntil: old });
  expect(grants).toHaveLength(100);
  expect(grants).not.toContain("0-late-arrival");
});

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
