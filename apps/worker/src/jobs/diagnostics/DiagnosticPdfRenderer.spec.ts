import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { expect, it } from "vitest";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";

import { renderDiagnosticPdf } from "./DiagnosticPdfRenderer";
import { readDiagnosticPdfText } from "./testing/readDiagnosticPdfText";
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-18T00:00:00.000Z");
const glyphs = "äçňöşüýž ÄÇŇÖŞÜÝŽ Кириллица Latin";
const localized = { tk: `Synag ${glyphs}`, ru: "Синтетический образец", en: "Synthetic sample" };
function snapshot(count = 1): D.DiagnosticReleasedSnapshot {
  return D.DiagnosticReleasedSnapshotSchema.parse({ synthetic: true, template: { title: localized, limitations: localized, syntheticNotice: localized,
    checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: { unit: "mm", method: localized } }],
    panels: Array.from({ length: Math.max(0, count - 1) }, (_, i) => ({ id: `panel_${i + 1}`, label: { tk: `Bölek ${i + 1}`, ru: `Панель ${i + 1}`, en: `Panel ${i + 1}` }, views: ["front", "rear", "left", "right", "top"], evidenceRequired: false })) },
    report: { id: id(1), orderId: id(2), templateVersionId: id(3), audience: "buyer_private", status: "finalized", observedAt: "2026-10-17T00:00:00.000Z", mileageKm: 123456, authorId: id(4), reviewerId: id(5), successorOf: null, correctionReason: null, returnReason: null, finalizedAt: now.toISOString(), withdrawnAt: null, withdrawalReason: null,
      findings: Array.from({ length: count }, (_, i) => ({ id: id(10 + i), checkId: i === 0 ? "brakes" : `panel_${i}`, assessment: "normal", explanation: `Observation ${i + 1}: ${glyphs}`, evidenceIds: [], kind: null, source: null, measurement: i === 0 ? { value: 2.5, unit: "mm", method: "Caliper", uncertainty: "±0.1 mm" } : null, location: i === 0 ? null : { panelId: `panel_${i}`, view: (["front", "rear", "left", "right", "top"] as const)[(i - 1) % 5], x: 0.2 + (i % 4) * 0.15, y: 0.3 + (i % 3) * 0.15 } })) } });
}
const fonts = async () => ({ regular: await readFile(join(__dirname, "../../../assets/fonts/NotoSans-Regular.ttf")), bold: await readFile(join(__dirname, "../../../assets/fonts/NotoSans-Bold.ttf")) });
it.each(["tk", "ru", "en"] as const)("renders actual A4 %s bytes with embedded fonts and protects evidence completeness", async locale => {
  const bytes = await renderDiagnosticPdf({ snapshot: snapshot(2), locale, generatedAt: now, verificationReference: "/private/diagnostics/record", photos: [] }, await fonts());
  expect(await renderDiagnosticPdf({ snapshot: snapshot(2), locale, generatedAt: now, verificationReference: "/private/diagnostics/record", photos: [] }, await fonts())).toEqual(bytes);
  expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
  const loaded = await PDFDocument.load(bytes); expect(loaded.getPageCount()).toBeGreaterThanOrEqual(3);
  for (const page of loaded.getPages()) { expect(page.getSize().width).toBeCloseTo(595.28); expect(page.getSize().height).toBeCloseTo(841.89); }
  const evidence = snapshot();
  const first = evidence.report.findings[0]; if (!first) throw new Error("Missing fixture finding");
  first.evidenceIds = [id(99)];
  await expect(renderDiagnosticPdf({ snapshot: evidence, locale, generatedAt: now, verificationReference: "/private/record", photos: [] }, await fonts())).rejects.toThrow("DIAGNOSTIC_PDF_EVIDENCE_MISSING");
});
it("renders representative complete files for page/text inspection when explicitly requested", async () => {
  const directory = process.env["DIAGNOSTIC_PDF_PROOF_DIR"];
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  const image = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#cccccc" } }).webp().toBuffer();
  for (const locale of ["tk", "ru", "en"] as const) for (const variant of ["short", "long", "zero-photo", "many-findings", "alternate-body", "draft"] as const) {
    const current = snapshot(variant === "many-findings" ? 12 : variant === "short" ? 1 : 2);
    const finding = current.report.findings[0]; if (!finding) throw new Error("Missing fixture finding");
    if (variant === "long") finding.explanation = (`${glyphs} Long observation remains unchanged. `).repeat(45);
    if (variant === "draft") current.report.status = "draft";
    if (variant === "alternate-body") {
      const panel = current.template.panels[0]; if (!panel) throw new Error("Missing fixture panel");
      panel.label = { tk: "Beýleki kuzow", ru: "Другой кузов", en: "Other body style" };
    }
    const photos = variant === "zero-photo" ? [] : [{ id: id(99), bytes: image }];
    if (photos.length) {
      finding.evidenceIds = [id(99)]; finding.assessment = "note";
      finding.kind = "source_history"; finding.source = "Synthetic service record, 2026-10-17";
    }
    const bytes = await renderDiagnosticPdf({ snapshot: current, locale, generatedAt: now, verificationReference: "/private/diagnostics/record", photos }, await fonts());
    const file = `${directory}/${variant}-${locale}.pdf`; await writeFile(file, bytes);
    const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
    expect(text).toContain("123456 km"); expect(text).toContain("2026-10-17T00:00:00.000Z");
    for (const finding of current.report.findings) expect(text).toContain(finding.id);
    expect(text.replace(/\s/g, "")).toContain(glyphs.replace(/\s/g, ""));
    if (variant === "draft") expect(text).toContain(locale === "en" ? "DRAFT" : locale === "ru" ? "ЧЕРНОВИК" : "TASLAMA");
  }
}, 60_000);

// Captured from the original renderer with default font positioning. These hashes
// lock line breaks, glyph subsets, drawing operators and embedded font bytes.
it.each([
  ["tk", "858e29b3df9bdb6f888971605ac1a4243e1c59dd3b9725c46817e795601b57b5"],
  ["ru", "59b988d5ca4a51c1c7f408a777be78ae40b54997cfeff6672ff5752eea610c53"],
  ["en", "ef01ff5ef09ab09765338fea96062fb95a53d84873d0b9d96718c4134c722e27"],
] as const)("preserves issued %s bytes with combining glyphs and wrapped paragraphs", async (locale, sha256) => {
  const current = snapshot(2);
  const explanation = "AVATAR office affinity e\u0301 a\u0308 n\u0303 Й Ё äçňöşüýž\n\n" + "Long localized observation remains intact. ".repeat(10) + "\n" + "W".repeat(140) + "\nLast paragraph";
  const first = current.report.findings[0];
  if (!first) throw new Error("Missing fixture finding");
  first.explanation = explanation;
  const bytes = await renderDiagnosticPdf({ snapshot: current, locale, generatedAt: now, verificationReference: "/private/diagnostics/record", photos: [] }, await fonts());
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
  const text = await readDiagnosticPdfText(bytes);
  expect(text.replace(/\s/g, "")).toContain(explanation.replace(/\s/g, ""));
  expect(text).toContain("123456 km");
  expect(text).toContain("2026-10-17T00:00:00.000Z");
  for (const finding of current.report.findings) expect(text).toContain(finding.id);
  const loaded = await PDFDocument.load(bytes);
  expect(loaded.getPageCount()).toBe(3);
});
