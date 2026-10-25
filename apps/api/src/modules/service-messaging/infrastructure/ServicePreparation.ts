import { withCampaignPreparation, type CampaignMutation, type DiagnosticSourceRoot, type Prisma } from "@auto-tm/db";
import type { ServiceSubject } from "../domain/ports/ServiceMessagingPort";
import { ServiceDenied } from "../domain/serviceAccess";

type Tx = Prisma.TransactionClient;
interface Selection {
 /** Re-evaluated after every prefix wait. A whole page is selected once. */
 conversations: () => Promise<string[]>;
 peerId?: string | undefined;
 listingId?: string | undefined;
 artifactId?: string | undefined;
 deviceToken?: string | undefined;
 /** accept also expires other held orders on the selected quote's day. */
 acceptQuoteId?: string | undefined;
}
type Scope = { table: string; key: Record<string, string>; row: unknown }[];
const prefixes = new WeakSet<Tx>();
const deny = () => new ServiceDenied("NO_ACCESS");

/** Supplied-tx History helpers may consume only their caller's prepared prefix. */
export function assertServicePrepared(tx: Tx): void { if (!prefixes.has(tx)) throw deny(); }

/** Finite service graph selection. The kernel follows retained source, Listing,
 * Session and grant dependencies. Explicit attribution and artifact references
 * below supplement the registry's intentionally narrower service FK mapping.
 * No source command or diagnostic ownership effect is invented for service work. */
async function retainedSelection(tx: Tx, subject: ServiceSubject, ids: string[], selection: Selection) {
 const [selected] = await tx.$queryRaw<{ roots: DiagnosticSourceRoot[]; fingerprint: unknown }[]>`
  /* service retained selection */
  WITH selected_conversations AS MATERIALIZED (
   SELECT c.* FROM public.service_conversations c WHERE c.id IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))
  ), base_requests AS MATERIALIZED (
   SELECT r.* FROM public.vehicle_history_requests r JOIN selected_conversations c ON c."historyRequestId"=r.id
  ), day_orders AS MATERIALIZED (
   SELECT o.* FROM public.history_orders o WHERE o.state='held' AND o.day IN (
    SELECT to_char(q."windowStart"+interval '5 hours','YYYY-MM-DD') FROM public.history_quotes q WHERE q.id=${selection.acceptQuoteId ?? null})
  ), selected_orders AS MATERIALIZED (
   SELECT o.* FROM public.history_orders o WHERE o."requestId" IN (SELECT id FROM base_requests)
    OR o.id IN (SELECT id FROM day_orders)
    OR o.id IN (SELECT a."acquiredForOrderId" FROM public.history_artifacts a WHERE a.id=${selection.artifactId ?? null})
  ), requests AS MATERIALIZED (
   SELECT r.* FROM public.vehicle_history_requests r WHERE r.id IN (SELECT id FROM base_requests UNION SELECT "requestId" FROM selected_orders)
  ), orders AS MATERIALIZED (
   SELECT o.* FROM public.history_orders o WHERE o."requestId" IN (SELECT id FROM requests)
  ), quotes AS MATERIALIZED (
   SELECT q.* FROM public.history_quotes q WHERE q."requestId" IN (SELECT id FROM requests)
  ), artifacts AS MATERIALIZED (
   SELECT a.* FROM public.history_artifacts a WHERE a.id=${selection.artifactId ?? null}
    OR a."acquiredForOrderId" IN (SELECT id FROM orders)
    OR a.id IN (SELECT d."artifactId" FROM public.history_deliveries d WHERE d."orderId" IN (SELECT id FROM orders))
    OR a.id IN (SELECT p."sourceArtifactId" FROM public.history_purchase_intents p WHERE p."orderId" IN (SELECT id FROM orders))
    OR a.vin IN (SELECT vin FROM quotes)
  ), resources AS MATERIALIZED (
   SELECT 'service_conversations' AS t,to_jsonb(c) AS r FROM selected_conversations c
   UNION ALL SELECT 'support_cases',to_jsonb(s) FROM public.support_cases s JOIN selected_conversations c ON c."supportCaseId"=s.id
   UNION ALL SELECT 'vehicle_history_requests',to_jsonb(r) FROM requests r
   UNION ALL SELECT 'history_quotes',to_jsonb(q) FROM quotes q
   UNION ALL SELECT 'history_orders',to_jsonb(o) FROM orders o
   UNION ALL SELECT 'history_payments',to_jsonb(p) FROM public.history_payments p WHERE p."orderId" IN (SELECT id FROM orders)
   UNION ALL SELECT 'history_purchase_intents',to_jsonb(p) FROM public.history_purchase_intents p WHERE p."orderId" IN (SELECT id FROM orders)
   UNION ALL SELECT 'history_refunds',to_jsonb(r) FROM public.history_refunds r WHERE r."orderId" IN (SELECT id FROM orders)
   UNION ALL SELECT 'history_bookings',to_jsonb(b) FROM public.history_bookings b WHERE b."orderId" IN (SELECT id FROM orders)
   UNION ALL SELECT 'history_deliveries',to_jsonb(d) FROM public.history_deliveries d WHERE d."orderId" IN (SELECT id FROM orders)
   UNION ALL SELECT 'history_artifacts',to_jsonb(a) FROM artifacts a
   UNION ALL SELECT 'service_attachments',to_jsonb(a) FROM public.service_attachments a WHERE a."conversationId" IN (SELECT id FROM selected_conversations)
   UNION ALL SELECT 'service_messages',to_jsonb(m) FROM public.service_messages m WHERE m."conversationId" IN (SELECT id FROM selected_conversations)
   UNION ALL SELECT 'service_read_states',to_jsonb(s) FROM public.service_read_states s WHERE s."conversationId" IN (SELECT id FROM selected_conversations)
   UNION ALL SELECT 'service_push_subscriptions',to_jsonb(s) FROM public.service_push_subscriptions s WHERE s."conversationId" IN (SELECT id FROM selected_conversations)
   UNION ALL SELECT 'service_outbox',to_jsonb(o) FROM public.service_outbox o WHERE o."conversationId" IN (SELECT id FROM selected_conversations)
   UNION ALL SELECT 'service_erasure_fences',to_jsonb(f) FROM public.service_erasure_fences f WHERE f."conversationId" IN (SELECT id FROM selected_conversations)
   UNION ALL SELECT 'service_audits',to_jsonb(a) FROM public.service_audits a WHERE a."resourceId" IN (
    SELECT "supportCaseId" FROM selected_conversations UNION SELECT id FROM requests)
   UNION ALL SELECT 'fcm_devices',to_jsonb(d) FROM public.fcm_devices d WHERE d.token=${selection.deviceToken ?? null}
  ), principals AS (
   SELECT ${subject.userId}::text AS id UNION SELECT ${selection.peerId ?? null}::text
   UNION SELECT v.value#>>'{}' FROM resources r CROSS JOIN LATERAL jsonb_each(r.r) v
    WHERE v.key IN ('customerId','assigneeId','senderId','uploaderId','userId','actorId','targetStaffId','offeredById','confirmedById','createdById','approvedById','executedById','verifiedById','deliveredById') AND v.value<>'null'
  ), roots AS (
   SELECT jsonb_build_object('table',t,'key',public.diagnostic_source_key(t,r)) AS root FROM resources
   UNION SELECT jsonb_build_object('table','users','key',jsonb_build_object('id',id)) FROM principals WHERE id IS NOT NULL
   UNION SELECT jsonb_build_object('table','staff_grants','key',jsonb_build_object('userId',p.id,'capability',cap))
    FROM principals p CROSS JOIN unnest(ARRAY['support.operations','history.fulfilment','history.payment.verify','history.payment.history','founder.refund.approve']) cap WHERE p.id IS NOT NULL
   UNION SELECT jsonb_build_object('table','listings','key',jsonb_build_object('id',v.value))
    FROM resources r CROSS JOIN LATERAL jsonb_each(r.r) v WHERE v.key='sourceListingId' AND v.value<>'null'
   UNION SELECT jsonb_build_object('table','history_orders','key',jsonb_build_object('id',"acquiredForOrderId")) FROM artifacts WHERE "acquiredForOrderId" IS NOT NULL
   UNION SELECT jsonb_build_object('table','sessions','key',jsonb_build_object('id',${subject.sessionId}))
  ) SELECT coalesce((SELECT jsonb_agg(root ORDER BY root::text) FROM roots),'[]') AS roots,
   coalesce((SELECT jsonb_agg(jsonb_build_object('table',t,'row',r) ORDER BY t,r::text) FROM resources),'[]') AS fingerprint
 `;
 if (!selected) return null;
 return selected;
}

/** One outer transaction union, ordinary campaign prelude, then the kernel's
 * physical namespace/key and row suborder. Rediscovery is a separate statement
 * after waits and aborts atomically, without extending scope or retrying.
 * Reads can create staff audits; the campaign receipt remains open through work. */
export async function withServicePreparation<T>(tx: Tx, subject: ServiceSubject, selection: Selection, work: (ids: string[]) => Promise<T>): Promise<T> {
 if (prefixes.has(tx)) throw deny();
 const ids = await selection.conversations();
 const discover = async () => {
  const selected = await retainedSelection(tx, subject, ids, selection);
  if (!selected) return null;
  const roots: DiagnosticSourceRoot[] = [...selected.roots, ...(selection.listingId ? [{ table: "listings" as const, key: { id: selection.listingId } }] : []), ...(selection.artifactId ? [{ table: "history_artifacts" as const, key: { id: selection.artifactId } }] : [])];
  // A read/dependency query of the kernel, never parsed/prepared as a write command.
  const command = { operation: "order_change", roots, rows: [], actorUserId: null, sessionId: null, cutoff: null, campaign: null };
  const [source] = await tx.$queryRaw<{ scope: Scope; keys: unknown; campaigns: string[]; mutations: CampaignMutation[] }[]>`
   WITH discovered AS MATERIALIZED (SELECT public.diagnostic_source_scope(${JSON.stringify(command)}::jsonb) AS scope)
   SELECT scope,public.diagnostic_source_lock_keys(scope,${JSON.stringify(command)}::jsonb) AS keys,
    public.diagnostic_source_campaigns(scope,${JSON.stringify(command)}::jsonb) AS campaigns,
    public.campaign_source_mutations(scope,${JSON.stringify(command)}::jsonb) AS mutations FROM discovered
  `;
  if (!source || source.scope.length > 1000) return null;
  return { selected, source };
 };
 const before = await discover();
 if (!before) return work(ids);
 const tables = await tx.$queryRaw<{ table: string; namespace: number }[]>`
  SELECT m->>'table' AS table,(m->>'namespace')::int AS namespace FROM jsonb_array_elements(public.diagnostic_source_registry()) m ORDER BY (m->>'namespace')::int
 `;
 return withCampaignPreparation(tx, before.source.mutations, async () => {
  for (const table of tables) {
   if (!/^[a-z_]+$/.test(table.table)) throw deny();
   if (table.namespace === 898310) {
    // Existing ordinary marketplace Message writers can already own this fence
    // while waiting for Conversation. Preserve the kernel's nonwaiting refusal.
    const locks = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock((k->>'namespace')::int,(k->>'key')::int) AS acquired
     FROM jsonb_array_elements(${JSON.stringify(before.source.keys)}::jsonb) k WHERE (k->>'namespace')::int=${table.namespace} ORDER BY (k->>'key')::int`;
    if (locks.some(lock => !lock.acquired)) throw deny();
   } else await tx.$queryRaw`SELECT pg_advisory_xact_lock((k->>'namespace')::int,(k->>'key')::int)
    FROM jsonb_array_elements(${JSON.stringify(before.source.keys)}::jsonb) k WHERE (k->>'namespace')::int=${table.namespace} ORDER BY (k->>'key')::int`;
   for (const row of before.source.scope.filter(row => row.table === table.table).sort((a,b) => JSON.stringify(a.key) < JSON.stringify(b.key) ? -1 : JSON.stringify(a.key) > JSON.stringify(b.key) ? 1 : 0)) {
    await tx.$queryRawUnsafe(`SELECT 1 FROM public.${table.table} s WHERE to_jsonb(s) @> $1::jsonb FOR UPDATE`, JSON.stringify(row.key));
   }
  }
  if (JSON.stringify(await selection.conversations()) !== JSON.stringify(ids) || JSON.stringify(await discover()) !== JSON.stringify(before)) throw deny();
  prefixes.add(tx);
  try { return await work(ids); } finally { prefixes.delete(tx); }
 });
}
