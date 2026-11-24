import { createHash } from "node:crypto";
import type { HistoryReportArtifactSchemas as R } from "@auto-tm/contracts";

export interface StagedHistoryReport {
  artifact: R.HistoryReportArtifact;
  sha256: string | null;
  link: string | null;
  validatedAt: Date | null;
}

export interface HistoryReportStore {
  find(intentVersion: number): Promise<StagedHistoryReport | null>;
  stage(target: R.HistoryReportTarget, report: StagedHistoryReport, actorId: string): Promise<void>;
  validate(intentVersion: number, actorId: string, assignmentVersion: number, now: Date): Promise<void>;
}

export const HISTORY_REPORT_ORIGINALS = Symbol("HISTORY_REPORT_ORIGINALS");
export interface HistoryReportOriginals {
  readPdf(bytes: Buffer): Promise<{ facts: R.HistoryReportFacts; pages: number }>;
  verifyLink(address: string): Promise<R.HistoryReportFacts>;
}

export const HISTORY_REPORT_STORAGE = Symbol("HISTORY_REPORT_STORAGE");
export type HistoryReportPdfArtifact = Exclude<R.HistoryReportArtifact, { format: "link" }>;
export interface HistoryReportStorage {
  put(requestId: string, artifact: HistoryReportPdfArtifact, sha256: string, bytes: Buffer): Promise<void>;
  read(requestId: string, artifact: HistoryReportPdfArtifact, sha256: string): Promise<Buffer>;
}

export const historyReportDigest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
