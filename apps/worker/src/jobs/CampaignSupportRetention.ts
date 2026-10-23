import type { Prisma, PrismaService } from "@auto-tm/db";

interface Resource { conversationId?: string; caseId?: string }
interface Claim { namespace: string; conversationId: string | null; caseId: string | null }
const tables = ["service_audits", "service_conversations", "service_erasure_fences", "service_messages", "service_outbox", "service_read_states", "support_cases"];
const dependents = ["service_attachments", "service_push_subscriptions"];

/** Catalog discovery is classification only. Exact journal claims, including tombstones,
 * are reread under reset-compatible locks before the namespace authorizes any work. */
export class CampaignSupportRetention {
 constructor(private readonly db: PrismaService, private readonly candidate: string | undefined) {}
 private async discover(tx: Prisma.TransactionClient | PrismaService, resource: Resource): Promise<Claim | null> {
  const graphs = await tx.$queryRaw<{ id: string; supportCaseId: string | null }[]>`SELECT id,"supportCaseId" FROM service_conversations WHERE id=${resource.conversationId ?? null} OR "supportCaseId"=${resource.caseId ?? null}`;
  if (graphs.length > 1) throw new Error("Campaign Support graph ambiguous");
  const graph = graphs[0];
  const conversationId = graph?.id ?? resource.conversationId ?? null, caseId = graph?.supportCaseId ?? resource.caseId ?? null;
  const namespaces = await tx.$queryRaw<{ name: string }[]>`SELECT nspname AS name FROM pg_namespace WHERE nspname ~ '^cf_[a-f0-9]{32}$' ORDER BY nspname`;
  const claims: Claim[] = [];
  for (const { name } of namespaces) {
   if (!/^cf_[a-f0-9]{32}$/.test(name)) throw new Error("Campaign Support namespace invalid");
   // Scalar matches also preserve malformed-key claims. The namespace authority
   // validates their exact JSON shape; unreadable journals never become ordinary work.
   const rows = await tx.$queryRawUnsafe<{ present: boolean }[]>(`SELECT true AS present FROM "${name}".campaign_records WHERE
    (table_name='service_conversations' AND row_key->>'id'=$1::text) OR
    (table_name='support_cases' AND row_key->>'id'=$2::text) OR
    (table_name='service_erasure_fences' AND row_key->>'conversationId'=$1::text) LIMIT 1`, conversationId, caseId);
   if (rows.length) claims.push({ namespace: name, conversationId, caseId });
  }
  if (claims.length > 1) throw new Error("Campaign Support ownership ambiguous");
  return claims[0] ?? null;
 }
 async run<T>(resource: Resource, now: Date, phase: "purge" | "cleanup", campaign: (tx: Prisma.TransactionClient) => Promise<T>, ordinary: () => Promise<T>): Promise<T | undefined> {
  const selected = await this.discover(this.db, resource);
  if (!selected) return ordinary();
  if (!this.candidate || !/^[a-f0-9]{40}$/.test(this.candidate)) throw new Error("Campaign Support candidate invalid");
  return this.db.$transaction(async tx => {
   await tx.$executeRawUnsafe(`LOCK TABLE ${tables.map(table => `public.${table}`).join(",")} IN SHARE ROW EXCLUSIVE MODE`);
   // Reset locks tracked tables first, then untracked incoming-FK tables.
   await tx.$executeRawUnsafe(`LOCK TABLE ${dependents.map(table => `public.${table}`).join(",")} IN SHARE ROW EXCLUSIVE MODE`);
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${selected.namespace},0))::text`;
   const current = await this.discover(tx, resource);
   if (!current || current.namespace !== selected.namespace) throw new Error("Campaign Support ownership changed");
   const authority = await tx.$queryRawUnsafe<{ admitted: boolean }[]>(`SELECT "${current.namespace}".campaign_support_lifecycle_authority($1::text,$2::text,$3::text,$4::text,$5::text) AS admitted`, current.conversationId, current.caseId, this.candidate, now.toISOString(), phase);
   if (authority.length !== 1 || typeof authority[0]?.admitted !== "boolean") throw new Error("Campaign Support authority invalid");
   if (!authority[0].admitted) return undefined;
   return campaign(tx);
  });
 }
}
