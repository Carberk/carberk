import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@auto-tm/db";
import type { ServiceSubject } from "../domain/ports/ServiceMessagingPort";

type Tx = Prisma.TransactionClient;
export interface CampaignServiceScope { namespace: string; candidate: string }
const roster = /^(buyer-a|buyer-b|owner|sales-a|sales-b|coordinator|support|history-fulfiller|payment-verifier|reception-steward|technician|independent-reviewer|private-reviewer|aggregate-viewer|investigator)\.([a-f0-9]{32})\.([a-f0-9]{12})@campaign897\.invalid$/;
// Reset's sorted SHARE ROW EXCLUSIVE order. Table locks precede the namespace fence, as in reset.
const textTables = ["service_audits", "service_conversations", "service_messages", "service_outbox", "service_read_states", "support_cases"];

/** Full-v3 synthetic Support text admission. The reservation is derived only from the
 * principal's stored roster email and the serving candidate; the namespace authority then
 * proves current journal ownership of the principal, its Session and any requested graph.
 * It never widens the ordinary runtime gate, History, attachments, push or queues. */
@Injectable()
export class CampaignServiceAdmission {
 constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

 async begin(tx: Tx, subject: ServiceSubject): Promise<CampaignServiceScope | null> {
  const user = await tx.user.findUnique({ where: { id: subject.userId }, select: { email: true } });
  const match = user?.email ? roster.exec(user.email) : null;
  const candidate: unknown = this.config.get("AUTOTM_COMMIT_SHA");
  if (!match?.[2] || !match[3] || this.config.get("APP_ENV") === "production" || typeof candidate !== "string" ||
    !/^[a-f0-9]{40}$/.test(candidate) || !candidate.startsWith(match[3])) return null;
  const namespace = `cf_${match[2]}`;
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout='5s'");
  await tx.$executeRawUnsafe(`LOCK TABLE ${textTables.map(table => `public.${table}`).join(",")} IN ROW EXCLUSIVE MODE`);
  await tx.$queryRawUnsafe("SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1,0))", namespace);
  const [contract] = await tx.$queryRawUnsafe<{ present: boolean }[]>("SELECT to_regprocedure($1) IS NOT NULL AS present", `"${namespace}".campaign_service_authority(text,text,text,text,text)`);
  return contract?.present === true ? { namespace, candidate } : null;
 }

 async admit(tx: Tx, scope: CampaignServiceScope, subject: ServiceSubject, graph?: { conversationId?: string | undefined; peerId?: string | undefined }): Promise<boolean> {
  // Namespace comes only from the fixed hex grammar above; values remain parameters.
  const rows = await tx.$queryRawUnsafe<{ admitted: unknown }[]>(
   `SELECT "${scope.namespace}".campaign_service_authority($1,$2,$3::text,$4::text,$5) AS admitted FROM "${scope.namespace}".campaign_manifest m
    WHERE m.state='identities' AND m.candidate=$5 AND m.profile='campaign897-full-v3' AND m.delivery_version=3
     AND m.service_contract_hash=md5(pg_get_functiondef('"${scope.namespace}".campaign_service_authority(text,text,text,text,text)'::regprocedure))`,
   subject.userId, subject.sessionId, graph?.conversationId ?? null, graph?.peerId ?? null, scope.candidate);
  return rows.length === 1 && rows[0]?.admitted === true;
 }
}
