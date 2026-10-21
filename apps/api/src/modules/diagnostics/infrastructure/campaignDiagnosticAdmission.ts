import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@auto-tm/db";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";

type Tx = Prisma.TransactionClient;
export interface CampaignDiagnosticScope { namespace: string; candidate: string }
export interface CampaignDiagnosticGraph { centerId?: string; templateVersionId?: string; orderId?: string; peerId?: string }
const roster = /^(buyer-a|buyer-b|owner|sales-a|sales-b|coordinator|support|history-fulfiller|payment-verifier|reception-steward|technician|independent-reviewer|private-reviewer|aggregate-viewer|investigator)\.([a-f0-9]{32})\.([a-f0-9]{12})@campaign897\.invalid$/;
// Reset's sorted SHARE ROW EXCLUSIVE order. Table locks precede the namespace fence, as in reset.
const diagnosticTables = ["diagnostic_audits", "diagnostic_center_assignments", "diagnostic_centers", "diagnostic_order_assignments", "diagnostic_template_versions", "inspection_orders"];
const authority = (namespace: string) => `"${namespace}".campaign_diagnostic_authority(text,text,text,text,text,text,text)`;

/** Full-v3 first diagnostics slice admission: template publication, private intake and their reads.
 * The reservation is derived only from the principal's stored roster email and the serving candidate;
 * the namespace authority then proves the live journaled principal, its Session and any requested
 * center, template, order or reception peer. Its first request for the reservation-derived center issues
 * the protected two-hour synthetic binding. It never widens the ordinary runtime gate or replaces grants,
 * qualifications or order assignments. */
@Injectable()
export class CampaignDiagnosticAdmission {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async begin(tx: Tx, subject: DiagnosticSubject): Promise<CampaignDiagnosticScope | null> {
    const user = await tx.user.findUnique({ where: { id: subject.userId }, select: { email: true } });
    const match = user?.email ? roster.exec(user.email) : null;
    const candidate: unknown = this.config.get("AUTOTM_COMMIT_SHA");
    if (!match?.[2] || !match[3] || this.config.get("APP_ENV") === "production" || typeof candidate !== "string" ||
      !/^[a-f0-9]{40}$/.test(candidate) || !candidate.startsWith(match[3])) return null;
    const namespace = `cf_${match[2]}`;
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout='5s'");
    await tx.$executeRawUnsafe(`LOCK TABLE ${diagnosticTables.map(table => `public.${table}`).join(",")} IN ROW EXCLUSIVE MODE`);
    await tx.$queryRawUnsafe("SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1,0))", namespace);
    const [contract] = await tx.$queryRawUnsafe<{ present: boolean }[]>("SELECT to_regprocedure($1) IS NOT NULL AS present", authority(namespace));
    return contract?.present === true ? { namespace, candidate } : null;
  }

  async admit(tx: Tx, scope: CampaignDiagnosticScope, subject: DiagnosticSubject, graph: CampaignDiagnosticGraph = {}): Promise<boolean> {
    // Namespace comes only from the fixed hex grammar above; values remain parameters.
    const rows = await tx.$queryRawUnsafe<{ admitted: unknown }[]>(
      `SELECT "${scope.namespace}".campaign_diagnostic_authority($1,$2,$3::text,$4::text,$5::text,$6::text,$7) AS admitted FROM "${scope.namespace}".campaign_manifest m
    WHERE m.state='identities' AND m.candidate=$7 AND m.profile='campaign897-full-v3' AND m.delivery_version=3
     AND m.diagnostic_contract_hash=md5(pg_get_functiondef('${authority(scope.namespace)}'::regprocedure))`,
      subject.userId, subject.sessionId, graph.centerId ?? null, graph.templateVersionId ?? null, graph.orderId ?? null, graph.peerId ?? null, scope.candidate);
    return rows.length === 1 && rows[0]?.admitted === true;
  }
}
