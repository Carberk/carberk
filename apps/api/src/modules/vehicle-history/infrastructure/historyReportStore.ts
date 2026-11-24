import type { PoolClient } from "pg";
import { HistoryReportArtifactSchemas as R } from "@auto-tm/contracts";
import type { HistoryReportStore, StagedHistoryReport } from "../domain/HistoryReportArtifact";

export function historyReportStore(client: PoolClient, requestId: string, assertActive: () => void): HistoryReportStore {
  return {
    async find(intentVersion) {
      assertActive();
      const { rows: [row] } = await client.query<StagedHistoryReport>(`SELECT artifact, sha256, link, "validatedAt"
        FROM history_report_artifacts WHERE "requestId" = $1 AND "intentVersion" = $2`, [requestId, intentVersion]);
      return row ? { ...row, artifact: R.HistoryReportArtifactSchema.parse(row.artifact) } : null;
    },
    async stage(target, report, actorId) {
      assertActive();
      await client.query(`INSERT INTO history_report_artifacts
        (id, "requestId", "orderId", "intentId", "intentVersion", "acceptedRevision", artifact, sha256, link, "stagedBy")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [report.artifact.id, requestId, target.orderId, target.intentId, target.intentVersion, target.acceptedRevision,
        JSON.stringify(report.artifact), report.sha256, report.link, actorId]);
    },
    async validate(intentVersion, actorId, assignmentVersion, now) {
      assertActive();
      const result = await client.query(`UPDATE history_report_artifacts SET "validatedAt" = $3, "validatedBy" = $4,
        "validatedAssignmentVersion" = $5 WHERE "requestId" = $1 AND "intentVersion" = $2 AND "validatedAt" IS NULL`,
      [requestId, intentVersion, now, actorId, assignmentVersion]);
      if (result.rowCount !== 1) throw new Error("History report validation write failed");
    },
  };
}
