import { createHash } from "node:crypto";
import type { HistoryOfferSchemas as O, HistoryReportArtifactSchemas as R } from "@auto-tm/contracts";
import { coversHistoryFormat } from "./HistoryFulfilment";
import { HistoryRequestError } from "./HistoryRequestError";

export interface HistoryReportOriginal {
  artifact: R.HistoryReportArtifact;
  sha256: string | null;
  link: string | null;
  archiveSourceId?: string | null;
}

export interface StagedHistoryReport extends HistoryReportOriginal {
  orderId: string;
  intentId: string;
  acceptedRevision: number;
  validatedAt: Date | null;
  deliveredAt: Date | null;
}

export interface ArchivedHistoryReport extends StagedHistoryReport {
  requestId: string;
  archiveLinkEvidenceSha256: string | null;
  availableFormat: R.HistoryReportArtifact["format"];
}

export interface HistoryReportStore {
  archive(vin: string, selectedId?: string, format?: R.HistoryReportArtifact["format"]): Promise<R.HistoryArchiveItem[]>;
  archiveOriginal(id: string, vin: string, format?: R.HistoryReportArtifact["format"]): Promise<ArchivedHistoryReport | null>;
  selectedArchiveId(): Promise<string | null>;
  previousPurchase(requesterId: string, vin: string): Promise<R.HistoryPreviousPurchase>;
  find(intentVersion: number): Promise<StagedHistoryReport | null>;
  delivered(orderId: string): Promise<StagedHistoryReport | null>;
  stage(target: R.HistoryReportTarget, report: HistoryReportOriginal, actorId: string): Promise<void>;
  validate(intentVersion: number, actorId: string, assignmentVersion: number, now: Date): Promise<void>;
  deliver(target: R.DeliverHistoryReport, actorId: string, now: Date, linkEvidenceSha256: string | null): Promise<void>;
}

export async function checkHistoryArchiveQuote(
  store: HistoryReportStore, vin: string, reports: Extract<NonNullable<O.HistoryOffer["preflight"]>, { status: "available" }>,
  format: R.HistoryReportArtifact["format"],
) {
  if (!reports.archiveFormat) return;
  const id = await store.selectedArchiveId();
  const original = id && await store.archiveOriginal(id, vin, format);
  const provider = reports.providers[0];
  if (!original || reports.providers.length !== 1 || original.artifact.report.provider !== provider?.name
    || original.artifact.report.originalReportDate !== provider.originalReportDate
    || !coversHistoryFormat(format, reports.archiveFormat) || !coversHistoryFormat(format, original.availableFormat)) {
    throw new HistoryRequestError("HISTORY_OFFER_CONFLICT");
  }
}

export const HISTORY_REPORT_ORIGINALS = Symbol("HISTORY_REPORT_ORIGINALS");
export interface HistoryReportOriginals {
  readPdf(bytes: Buffer): Promise<{ facts: R.HistoryReportFacts; pages: number }>;
  verifyLink(address: string): Promise<{ facts: R.HistoryReportFacts; evidenceSha256: string }>;
}

export const HISTORY_REPORT_STORAGE = Symbol("HISTORY_REPORT_STORAGE");
export type HistoryReportPdfArtifact = Exclude<R.HistoryReportArtifact, { format: "link" }>;
export interface HistoryReportStorage {
  put(requestId: string, artifact: HistoryReportPdfArtifact, sha256: string, bytes: Buffer): Promise<void>;
  read(requestId: string, artifact: HistoryReportPdfArtifact, sha256: string): Promise<Buffer>;
}

export const historyReportDigest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
