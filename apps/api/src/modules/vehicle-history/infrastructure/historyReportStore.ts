import type { PoolClient } from "pg";
import { HistoryReportArtifactSchemas as R } from "@auto-tm/contracts";
import type { HistoryReportStore, StagedHistoryReport } from "../domain/HistoryReportArtifact";

const fields = 'artifact, sha256, link, "orderId", "intentId", "acceptedRevision", "validatedAt", "deliveredAt"';
const parse = (row: StagedHistoryReport | undefined) => row ? { ...row, artifact: R.HistoryReportArtifactSchema.parse(row.artifact) } : null;

export function historyReportStore(client: PoolClient, requestId: string, assertActive: () => void): HistoryReportStore {
  return {
    async find(intentVersion) {
      assertActive();
      const { rows: [row] } = await client.query<StagedHistoryReport>(`SELECT ${fields}
        FROM history_report_artifacts WHERE "requestId" = $1 AND "intentVersion" = $2`, [requestId, intentVersion]);
      return parse(row);
    },
    async delivered(orderId) {
      assertActive();
      const { rows: [row] } = await client.query<StagedHistoryReport>(`SELECT ${fields}
        FROM history_report_artifacts WHERE "requestId" = $1 AND "orderId" = $2 AND "deliveredAt" IS NOT NULL`, [requestId, orderId]);
      return parse(row);
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
    async deliver(target, actorId, now) {
      assertActive();
      const result = await client.query(`UPDATE history_report_artifacts
        SET "deliveredAt" = $3, "deliveredBy" = $4, "deliveredAssignmentVersion" = $5
        WHERE "requestId" = $1 AND id = $2 AND "validatedAt" IS NOT NULL AND "deliveredAt" IS NULL`,
      [requestId, target.artifactId, now, actorId, target.expectedAssignmentVersion]);
      if (result.rowCount !== 1) throw new Error("History report delivery write failed");
    },
  };
}
