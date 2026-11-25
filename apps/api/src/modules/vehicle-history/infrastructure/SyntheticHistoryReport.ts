import { once } from "node:events";
import { get } from "node:https";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { Worker } from "node:worker_threads";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HistoryReportArtifactSchemas as R } from "@auto-tm/contracts";
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFStream } from "pdf-lib";
import type { Env } from "../../../env.schema";
import { historyReportDigest, type HistoryReportOriginals } from "../domain/HistoryReportArtifact";
import { HistoryRequestError } from "../domain/HistoryRequestError";

const subjectPrefix = "Carberk synthetic Vehicle History\n";

async function readSyntheticHistoryPdf(bytes: Buffer) {
  try {
    if (bytes.length > R.MAX_REPORT_PDF_BYTES || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error();
    const document = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
    const subject = document.getSubject();
    const pages = document.getPages();
    const hasContents = pages.every(({ node }) => {
      const contents = node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => document.context.lookup(ref)) : [contents];
      return streams.length > 0 && streams.every((stream) => stream instanceof PDFStream && stream.getContentsSize() > 0);
    });
    if (!subject?.startsWith(subjectPrefix) || pages.length < 1 || pages.length > 100
      || ["OpenAction", "AA", "Names", "AcroForm"].some((name) => document.catalog.has(PDFName.of(name)))
      || !hasContents || pages.some(({ node }) => (node.Annots()?.size() ?? 0) > 0 || node.has(PDFName.of("AA")))) throw new Error();
    for (const [, resource] of document.context.enumerateIndirectObjects()) {
      if (resource instanceof PDFStream && resource.dict.lookup(PDFName.of("Subtype")) === PDFName.of("Image")) {
        const dimensions = ["Width", "Height"].map((name) => resource.dict.lookupMaybe(PDFName.of(name), PDFNumber)?.asNumber());
        if (dimensions.some((size) => typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0)) throw new Error();
      }
    }
    const facts = R.HistoryReportFactsSchema.parse(JSON.parse(subject.slice(subjectPrefix.length)));
    await verifyVisiblePages(bytes, pages.length);
    return { facts, pages: pages.length };
  } catch {
    throw new HistoryRequestError("HISTORY_REPORT_PDF");
  }
}

async function reportedRenderWarning(stream: Readable) {
  let warned = false;
  for await (const line of createInterface({ input: stream })) warned ||= line.startsWith("Warning:");
  return warned;
}

async function verifyVisiblePages(bytes: Buffer, pages: number) {
  const worker = new Worker(join(__dirname, "renderHistoryReportPdf.mjs"), {
    workerData: { bytes: new Uint8Array(bytes), pages }, stdout: true, stderr: true,
    resourceLimits: { maxOldGenerationSizeMb: 128 },
  });
  const timeout = setTimeout(() => { void worker.terminate(); }, 10_000);
  try {
    const [[status], stdoutWarning, stderrWarning] = await Promise.all([
      once(worker, "exit"), reportedRenderWarning(worker.stdout), reportedRenderWarning(worker.stderr),
    ]);
    if (status !== 0 || stdoutWarning || stderrWarning) throw new Error();
  } finally {
    clearTimeout(timeout);
    await worker.terminate();
  }
}

@Injectable()
export class SyntheticHistoryReportOriginals implements HistoryReportOriginals {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  readPdf = readSyntheticHistoryPdf;

  async verifyLink(address: string) {
    try {
      const origin = this.config.get("VEHICLE_HISTORY_SYNTHETIC_REPORT_ORIGIN", { infer: true });
      const certificate = this.config.get("VEHICLE_HISTORY_SYNTHETIC_REPORT_CA", { infer: true });
      if (!origin || !/^https:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(origin) || !certificate
        || !address.startsWith(origin + "/") || /[^\x21-\x7e]|[\\<>"]|%(?![\da-f]{2})/i.test(address)) throw new Error();
      const target = new URL(address);
      const requestPath = address.slice(origin.length).split("#", 1)[0] ?? "";
      const match = /^\/report\/([A-Za-z0-9_-]{1,80})(?:\?.*)?$/.exec(requestPath);
      if (!match || target.origin !== origin || target.username || target.password) throw new Error();

      const bytes = await new Promise<Buffer>((resolve, reject) => {
        const request = get({ hostname: "127.0.0.1", port: target.port, path: requestPath, agent: false,
          ca: Buffer.from(certificate, "base64"), signal: AbortSignal.timeout(5000), headers: { Accept: "application/pdf" },
        }, (response) => {
          if (response.statusCode !== 200 || response.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/pdf") {
            response.destroy();
            reject(new Error());
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > R.MAX_REPORT_PDF_BYTES) response.destroy(new Error());
            else chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () => resolve(Buffer.concat(chunks, size)));
        });
        request.on("error", reject);
      });
      const { facts } = await readSyntheticHistoryPdf(bytes);
      if (facts.reportId !== match[1]) throw new Error();
      return { facts, evidenceSha256: historyReportDigest(Buffer.from(`${address}\n${historyReportDigest(bytes)}`)) };
    } catch {
      throw new HistoryRequestError("HISTORY_REPORT_LINK");
    }
  }
}
