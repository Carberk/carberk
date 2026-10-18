import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import type { DiagnosticSchemas } from "@auto-tm/contracts";

type Locale = "tk" | "ru" | "en";
type Snapshot = DiagnosticSchemas.DiagnosticReleasedSnapshot;
export interface DiagnosticPdfInput {
  snapshot: Snapshot; locale: Locale; generatedAt: Date; verificationReference: string;
  photos: { id: string; bytes: Uint8Array }[];
}
export interface DiagnosticPdfFonts { regular: Uint8Array; bold: Uint8Array }
const words = {
 tk: { title: "Barlag hasabaty", synthetic: "SYNAG NUSGASY. Hakyky barlag däl.", scope: "Barlagyň çägi", findings: "Netijeler", map: "Kuzowyň çyzgysy", generic: "Umumy çyzgy. Bölekleriň atlaryna we doly netijelere serediň.", observed: "Barlag wagty", mileage: "Ýazylan aralyk", template: "Şablon wersiýasy", verification: "Häzirki ýazgy", copies: "Göçürilen nusgalar soňraky üýtgeşmeleri görkezmez. Häzirki ýazgyny barlaň.", normal: "Kadaly", note: "Bellik", fault: "Näsazlyk", not_checked: "Barlanmady", not_applicable: "Degişli däl", explanation: "Düşündiriş", source: "Maglumat çeşmesi", measurement: "Ölçeg", uncertainty: "Näbellilik", evidence: "Surat", none: "Surat ýok", front: "Öň", rear: "Yz", left: "Çep", right: "Sag", top: "Ýokardan", draft: "TASLAMA", limit: "Bu hasabat barlag wagtyndaky synlamalary görkezýär. Kepillik ýa-da umumy howpsuzlyk tassyknamasy däl." },
 ru: { title: "Отчёт осмотра", synthetic: "ДЕМОНСТРАЦИОННЫЙ ОБРАЗЕЦ. Это не реальный осмотр.", scope: "Объём осмотра", findings: "Результаты", map: "Схема кузова", generic: "Условная схема. См. названия панелей и полную таблицу результатов.", observed: "Дата осмотра", mileage: "Зафиксированный пробег", template: "Версия шаблона", verification: "Текущая запись", copies: "Скачанные копии не отражают последующие изменения. Проверяйте текущую запись.", normal: "Норма", note: "Примечание", fault: "Неисправность", not_checked: "Не проверено", not_applicable: "Неприменимо", explanation: "Пояснение", source: "Источник", measurement: "Измерение", uncertainty: "Неопределённость", evidence: "Фото", none: "Нет фотографий", front: "Спереди", rear: "Сзади", left: "Слева", right: "Справа", top: "Сверху", draft: "ЧЕРНОВИК", limit: "Отчёт фиксирует наблюдения на момент осмотра. Это не гарантия и не сертификат общей безопасности." },
 en: { title: "Inspection report", synthetic: "SYNTHETIC SAMPLE. This is not a real inspection.", scope: "Inspection scope", findings: "Results", map: "Body diagram", generic: "Generic diagram. See panel labels and the complete results table.", observed: "Observation date", mileage: "Recorded mileage", template: "Template version", verification: "Current record", copies: "Downloaded copies do not reflect later changes. Check the current record.", normal: "Normal", note: "Note", fault: "Fault", not_checked: "Not checked", not_applicable: "Not applicable", explanation: "Explanation", source: "Source", measurement: "Measurement", uncertainty: "Uncertainty", evidence: "Photo", none: "No photographs", front: "Front", rear: "Rear", left: "Left", right: "Right", top: "Top", draft: "DRAFT", limit: "This report records observations at the inspection time. It is not a warranty or a general safety certificate." },
} as const;
const kindText = {
 tk: { observed_damage: "Synlanan zeper", observed_repair: "Synlanan abatlaýyş ýa-da boýag alamatlary", source_history: "Çeşmede tassyklanan taryh" },
 ru: { observed_damage: "Наблюдаемое повреждение", observed_repair: "Наблюдаемые признаки ремонта или окраски", source_history: "История с указанием источника" },
 en: { observed_damage: "Observed damage", observed_repair: "Observed repair or repaint evidence", source_history: "Attributed source history" },
};
const outlines = {
 front: "M 25 72 L 22 42 L 45 12 L 175 12 L 198 42 L 195 72 Z M 45 36 L 55 19 L 165 19 L 175 36 Z M 35 47 L 70 47 L 70 57 L 35 57 Z M 150 47 L 185 47 L 185 57 L 150 57 Z",
 rear: "M 25 72 L 22 42 L 45 12 L 175 12 L 198 42 L 195 72 Z M 45 36 L 55 19 L 165 19 L 175 36 Z M 35 47 L 58 47 L 58 60 L 35 60 Z M 162 47 L 185 47 L 185 60 L 162 60 Z",
 left: "M 8 63 L 17 43 L 59 35 L 80 12 L 145 12 L 171 35 L 207 42 L 215 63 L 211 73 L 8 73 Z M 67 35 L 85 18 L 140 18 L 160 35 Z",
 right: "M 212 63 L 203 43 L 161 35 L 140 12 L 75 12 L 49 35 L 13 42 L 5 63 L 9 73 L 212 73 Z M 153 35 L 135 18 L 80 18 L 60 35 Z",
 top: "M 25 24 C 25 4 195 4 195 24 L 195 59 C 195 80 25 80 25 59 Z M 68 18 L 150 18 L 160 62 L 58 62 Z",
} as const;
const width = 595.28, height = 841.89, margin = 42, textWidth = width - 2 * margin;
const safeText = (value: string) => value.replace(/\p{Cc}/gu, char => char === "\n" ? "\n" : char === "\t" ? "  " : "");

/** Produces issued bytes from one pinned release, never from mutable Listing data. */
export async function renderDiagnosticPdf(input: DiagnosticPdfInput, fonts: DiagnosticPdfFonts): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  pdf.setCreationDate(input.generatedAt); pdf.setModificationDate(input.generatedAt); pdf.setProducer("Carberk diagnostic renderer v1");
  pdf.setTitle(`${words[input.locale].title} ${input.snapshot.report.id}`);
  const regular = await pdf.embedFont(fonts.regular, { subset: true }); const bold = await pdf.embedFont(fonts.bold, { subset: true });
  const copy = words[input.locale], report = input.snapshot.report;
  let page!: PDFPage; let y = 0; let continuingFindings = false;
  const label = (id: string) => [...input.snapshot.template.checks, ...input.snapshot.template.panels].find(item => item.id === id)?.label[input.locale] ?? id;
  function addPage() {
    page = pdf.addPage([width, height]); y = height - margin;
    page.drawText("Carberk", { x: margin, y, size: 14, font: bold }); y -= 20;
    page.drawText(`${report.id} / ${input.locale.toUpperCase()}`, { x: margin, y, size: 8, font: regular }); y -= 22;
    if (input.snapshot.synthetic) { text(copy.synthetic, 9, bold); text(input.snapshot.template.syntheticNotice[input.locale], 9); }
    if (report.status !== "finalized") text(copy.draft, 12, bold);
    if (continuingFindings) text(copy.findings, 11, bold);
  }
  function ensure(amount: number) { if (y - amount < margin + 28) addPage(); }
  function lines(value: string, font: PDFFont, size: number): string[] {
    const result: string[] = [];
    for (const paragraph of safeText(value).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= textWidth) { line = candidate; continue; }
        if (line) result.push(line); line = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > textWidth) { result.push(line); line = ""; }
          line += char;
        }
      }
      result.push(line);
    }
    return result;
  }
  function text(value: string, size = 10, font = regular) {
    for (const line of lines(value, font, size)) { ensure(size + 5); page.drawText(line, { x: margin, y, size, font, color: rgb(0.08, 0.08, 0.08) }); y -= size + 5; }
  }
  function heading(value: string) { ensure(45); y -= 10; text(value, 14, bold); y -= 5; }
  addPage(); heading(copy.title);
  text(`${copy.observed}: ${report.observedAt}`); text(`${copy.mileage}: ${report.mileageKm} km`);
  text(`${copy.template}: ${report.templateVersionId}`); text(`${copy.title}: ${report.id}`);
  if (report.successorOf) text(`${copy.title} → ${report.successorOf}`);
  if (report.correctionReason) text(report.correctionReason);
  heading(copy.scope); text(input.snapshot.template.title[input.locale]); text(input.snapshot.template.limitations[input.locale]); text(copy.limit);
  heading(copy.findings);
  continuingFindings = true;
  report.findings.forEach((finding, index) => {
    ensure(60);
    text(`${index + 1}. ${label(finding.checkId)} [${finding.checkId}]`, 11, bold);
    text(`${copy[finding.assessment]} / ${finding.id}`, 9);
    if (finding.kind) text(kindText[input.locale][finding.kind], 9);
    if (finding.explanation) text(`${copy.explanation}: ${finding.explanation}`);
    if (finding.source) text(`${copy.source}: ${finding.source}`);
    if (finding.measurement) text(`${copy.measurement}: ${finding.measurement.value} ${finding.measurement.unit}; ${finding.measurement.method}; ${copy.uncertainty}: ${finding.measurement.uncertainty}`);
    if (finding.location) text(`${label(finding.location.panelId)} [${finding.location.panelId}] / ${copy[finding.location.view]} / ${finding.location.x}, ${finding.location.y}`, 9);
    text(finding.evidenceIds.length ? `${copy.evidence}: ${finding.evidenceIds.join(", ")}` : copy.none, 9);
    y -= 8;
  });
  // Every template area also has an explicit text outcome. Absence never becomes Normal.
  for (const check of [...input.snapshot.template.checks, ...input.snapshot.template.panels]) {
    if (!report.findings.some(finding => finding.checkId === check.id)) text(`${check.label[input.locale]} [${check.id}]: ${copy.not_checked}`);
  }
  continuingFindings = false;
  addPage(); heading(copy.map); text(copy.generic);
  const views = ["front", "rear", "left", "right", "top"] as const;
  for (const view of views) {
    ensure(142); const top = y - 22, x = margin + 80, w = 220, h = 80;
    text(copy[view], 11, bold);
    // Original simple vehicle outline, deliberately generic for unsupported body styles.
    page.drawSvgPath(outlines[view], { x, y: top, scale: 1, borderWidth: 1.2, borderColor: rgb(0, 0, 0) });
    if (view === "left" || view === "right") for (const wheelX of [x + 45, x + 175]) page.drawCircle({ x: wheelX, y: top - 68, size: 11, color: rgb(1, 1, 1), borderWidth: 1.2, borderColor: rgb(0, 0, 0) });
    report.findings.forEach((finding, index) => {
      if (finding.location?.view !== view) return;
      const markerX = x + finding.location.x * w, markerY = top - finding.location.y * h;
      page.drawCircle({ x: markerX, y: markerY, size: 9, color: rgb(1, 1, 1), borderColor: rgb(0, 0, 0), borderWidth: 1 });
      page.drawText(String(index + 1), { x: markerX - 3, y: markerY - 3, font: bold, size: 8 });
    });
    y = top - h - 24;
  }
  const photoById = new Map(input.photos.map(photo => [photo.id, photo]));
  for (const [index, finding] of report.findings.entries()) for (const id of finding.evidenceIds) {
    const photo = photoById.get(id); if (!photo) throw new Error("DIAGNOSTIC_PDF_EVIDENCE_MISSING");
    const jpeg = await sharp(photo.bytes, { limitInputPixels: 25_000_000 }).rotate().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    const image = await pdf.embedJpg(jpeg); const scale = Math.min(textWidth / image.width, 350 / image.height);
    const imageHeight = image.height * scale; ensure(imageHeight + 65);
    text(`${copy.evidence} ${index + 1}: ${id}`, 10, bold); text(`${label(finding.checkId)} [${finding.id}]`, 9);
    ensure(imageHeight + 10);
    page.drawImage(image, { x: margin, y: y - imageHeight, width: image.width * scale, height: imageHeight }); y -= imageHeight + 20;
  }
  heading(copy.verification); text(input.verificationReference, 9); text(copy.copies, 9);
  const pages = pdf.getPages(); pages.forEach((current, index) => current.drawText(`${index + 1} / ${pages.length}`, { x: width - margin - 50, y: 25, size: 9, font: regular }));
  const bytes = await pdf.save(); if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("DIAGNOSTIC_PDF_TOO_LARGE");
  return bytes;
}
