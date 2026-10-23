import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

import type { Prisma } from "../generated/prisma/client/client";

export const DIAGNOSTIC_ERASED_LINEAGE_RENDERER = "v1-erased-lineage";
export const DIAGNOSTIC_PDF_RENDERERS = ["v1", DIAGNOSTIC_ERASED_LINEAGE_RENDERER];
type Content = Pick<D.DiagnosticReleasedSnapshot["report"], "id" | "orderId" | "successorOf" | "correctionReason">;
/** Current delivery projection only. Never persists into a report or changes its
 * immutable source hash. Callers retain their own current authority gates.
 * No predecessor locks: purge locks the complete affected order/report union in
 * sorted order, so a reader/worker already holding B must not acquire A behind it. */
export async function diagnosticReaderProjection<T extends Content>(tx: Prisma.TransactionClient,
  row: { id: string; orderId: string; predecessorId: string | null }, content: T): Promise<{ report: T; rendererVersion: string }> {
  if (content.id !== row.id || content.orderId !== row.orderId || content.successorOf !== row.predecessorId) throw new Error("DIAGNOSTIC_REPORT_SOURCE_MISMATCH");
  if (!row.predecessorId) return { report: content, rendererVersion: "v1" };
  const predecessor = await tx.diagnosticReportRecord.findUnique({ where: { id: row.predecessorId }, include: { order: true } });
  // Missing linkage is closed too; neither a stale snapshot nor a reason field
  // can restore erased predecessor disclosure. Own findings and evidence remain.
  if (!predecessor || predecessor.erasedAt || predecessor.order.erasedAt) return {
    report: { ...content, successorOf: null, correctionReason: null }, rendererVersion: DIAGNOSTIC_ERASED_LINEAGE_RENDERER,
  };
  return { report: content, rendererVersion: "v1" };
}
