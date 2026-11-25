import type { PoolClient } from "pg";
import { HistoryReportArtifactSchemas as R } from "@auto-tm/contracts";
import type { Env } from "../../../env.schema";
import type { ArchivedHistoryReport, HistoryReportStore, StagedHistoryReport } from "../domain/HistoryReportArtifact";

export type ArchiveEvidenceAllowlist = Env["VEHICLE_HISTORY_SYNTHETIC_ARCHIVE_EVIDENCE"];

const fields = 'artifact, sha256, link, "archiveSourceId", "orderId", "intentId", "acceptedRevision", "validatedAt", "deliveredAt"';
const parse = <T extends StagedHistoryReport>(row: T | undefined): T | null =>
  row ? { ...row, artifact: R.HistoryReportArtifactSchema.parse(row.artifact) } : null;
const pairedLinkEvidence = "encode(sha256(convert_to(link || chr(10) || sha256, 'UTF8')), 'hex')";
const permittedArchive = `"deliveredAt" IS NOT NULL AND "validatedAt" IS NOT NULL
  AND "archiveSourceId" IS NULL AND artifact->'report'->'permittedUse' = 'true'::jsonb`;
const recordedPdf = 'sha256 = "archivePdfSha256"';
const allowedPdf = 'sha256 = ANY($4::text[])';
const allowedLink = '"archiveLinkEvidenceSha256" = ANY($5::text[])';
const effectiveFormat = `CASE WHEN artifact->>'format' = 'both' AND ${allowedPdf} AND ${allowedLink} THEN 'both'
  WHEN artifact->>'format' IN ('pdf', 'both') AND ${allowedPdf} THEN 'pdf'
  WHEN artifact->>'format' IN ('link', 'both') AND ${allowedLink} THEN 'link' ELSE '' END`;
const qualifiedArchive = `CASE artifact->>'format'
  WHEN 'pdf' THEN link IS NULL AND ${recordedPdf}
  WHEN 'link' THEN sha256 IS NULL AND link IS NOT NULL
  WHEN 'both' THEN ${recordedPdf} AND "archiveLinkEvidenceSha256" = ${pairedLinkEvidence}
  ELSE FALSE END AND ${effectiveFormat} IN (COALESCE($6::text, ${effectiveFormat}), 'both')
  AND ${effectiveFormat} <> ''`;

export function historyReportStore(client: PoolClient, requestId: string, assertActive: () => void,
  { pdf, link }: ArchiveEvidenceAllowlist = { pdf: [], link: [] }): HistoryReportStore {
  return {
    async archive(vin, selectedId, format) {
      assertActive();
      const { rows } = await client.query(`SELECT id, ${effectiveFormat} AS format,
        artifact->'report'->>'vin' AS vin, artifact->'report'->>'provider' AS provider,
        artifact->'report'->>'language' AS language, artifact->'report'->>'originalReportDate' AS "originalReportDate"
        FROM history_report_artifacts WHERE "requestId" <> $1 AND artifact->'report'->>'vin' = $2
          AND ($3::uuid IS NULL OR id = $3) AND ($6::text IS NULL OR artifact->>'format' IN ($6, 'both'))
          AND ${permittedArchive} AND ${qualifiedArchive}
        ORDER BY "originalReportDate" DESC, id LIMIT 25`, [requestId, vin, selectedId ?? null, pdf, link, format ?? null]);
      return R.HistoryArchiveSchema.shape.items.parse(rows);
    },
    async archiveOriginal(id, vin, format) {
      assertActive();
      const { rows: [row] } = await client.query<ArchivedHistoryReport>(`
        SELECT ${fields}, "requestId", "archiveLinkEvidenceSha256", ${effectiveFormat} AS "availableFormat"
        FROM history_report_artifacts WHERE id = $1 AND "requestId" <> $2
          AND artifact->'report'->>'vin' = $3 AND ${permittedArchive} AND ${qualifiedArchive} FOR SHARE`,
      [id, requestId, vin, pdf, link, format ?? null]);
      return parse(row);
    },
    async selectedArchiveId() {
      assertActive();
      const { rows: [row] } = await client.query<{ selectedArchiveId: string | null }>(
        'SELECT "selectedArchiveId" FROM vehicle_history_requests WHERE id = $1', [requestId]);
      return row?.selectedArchiveId ?? null;
    },
    async previousPurchase(requesterId, vin) {
      assertActive();
      const { rows: [previous] } = await client.query(`SELECT a."requestId", a.artifact->>'format' AS format,
        a.artifact->'report'->>'vin' AS vin, a.artifact->'report'->>'provider' AS provider,
        a.artifact->'report'->>'originalReportDate' AS "originalReportDate"
        FROM vehicle_history_requests r JOIN history_report_artifacts a ON a."requestId" = r.id
        WHERE r."requesterId" = $1 AND r.id <> $2 AND a.artifact->'report'->>'vin' = $3 AND a."deliveredAt" IS NOT NULL
        ORDER BY a."deliveredAt" DESC, a.id LIMIT 1`, [requesterId, requestId, vin]);
      return R.HistoryPreviousPurchaseSchema.parse({ previous: previous ?? null });
    },
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
        (id, "requestId", "orderId", "intentId", "intentVersion", "acceptedRevision", artifact, sha256, link, "stagedBy", "archiveSourceId")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [report.artifact.id, requestId, target.orderId, target.intentId, target.intentVersion, target.acceptedRevision,
        JSON.stringify(report.artifact), report.sha256, report.link, actorId, report.archiveSourceId ?? null]);
    },
    async validate(intentVersion, actorId, assignmentVersion, now) {
      assertActive();
      const result = await client.query(`UPDATE history_report_artifacts SET "validatedAt" = $3, "validatedBy" = $4,
        "validatedAssignmentVersion" = $5 WHERE "requestId" = $1 AND "intentVersion" = $2 AND "validatedAt" IS NULL`,
      [requestId, intentVersion, now, actorId, assignmentVersion]);
      if (result.rowCount !== 1) throw new Error("History report validation write failed");
    },
    async deliver(target, actorId, now, linkEvidenceSha256) {
      assertActive();
      const result = await client.query(`UPDATE history_report_artifacts
        SET "deliveredAt" = $3, "deliveredBy" = $4, "deliveredAssignmentVersion" = $5,
          "archivePdfSha256" = CASE WHEN "archiveSourceId" IS NULL AND sha256 = ANY($6::text[]) THEN sha256 END,
          "archiveLinkEvidenceSha256" = CASE WHEN "archiveSourceId" IS NULL AND link IS NOT NULL
            AND (sha256 IS NULL OR $7::text = ${pairedLinkEvidence}) THEN $7::text END
        WHERE "requestId" = $1 AND id = $2 AND "validatedAt" IS NOT NULL AND "deliveredAt" IS NULL`,
      [requestId, target.artifactId, now, actorId, target.expectedAssignmentVersion, pdf,
        linkEvidenceSha256 && link.includes(linkEvidenceSha256) ? linkEvidenceSha256 : null]);
      if (result.rowCount !== 1) throw new Error("History report delivery write failed");
    },
  };
}
