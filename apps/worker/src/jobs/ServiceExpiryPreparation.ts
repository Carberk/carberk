import { withCampaignPreparation, type CampaignMutation, type DiagnosticSourceRoot, type Prisma } from "@auto-tm/db";

type Tx = Prisma.TransactionClient;
interface Selection { caseId?: string; conversationId?: string; attachmentId?: string; artifactId?: string; auditId?: string }
type Scope = { table: string; key: Record<string, string>; row: unknown }[];
const active = new WeakSet<Tx>();
const changed = () => new Error("Service expiry preparation changed");

/** Worker-owned finite retained graph. Registry refs are supplemented for scalar
 * History attribution and all incoming service rows, including absent fence keys.
 * Discovery takes no domain locks and grants no diagnostic write authority. */
async function retainedSelection(tx: Tx, selection: Selection) {
 const [selected] = await tx.$queryRaw<{ roots: DiagnosticSourceRoot[]; fingerprint: unknown }[]>`
  /* expiry retained selection */
  WITH selected_conversations AS MATERIALIZED (
   SELECT c.* FROM public.service_conversations c WHERE c.id=${selection.conversationId ?? null} OR c."supportCaseId"=${selection.caseId ?? null}
    OR c.id IN (SELECT a."conversationId" FROM public.service_attachments a WHERE a.id=${selection.attachmentId ?? null})
    OR c."historyRequestId" IN (
     SELECT o."requestId" FROM public.history_orders o WHERE o.id IN (
      SELECT a."acquiredForOrderId" FROM public.history_artifacts a WHERE a.id=${selection.artifactId ?? null}
      UNION SELECT d."orderId" FROM public.history_deliveries d WHERE d."artifactId"=${selection.artifactId ?? null}
      UNION SELECT p."orderId" FROM public.history_purchase_intents p WHERE p."sourceArtifactId"=${selection.artifactId ?? null}))
  ), base_requests AS MATERIALIZED (
   SELECT r.* FROM public.vehicle_history_requests r JOIN selected_conversations c ON c."historyRequestId"=r.id
  ), selected_orders AS MATERIALIZED (
   SELECT o.* FROM public.history_orders o WHERE o."requestId" IN (SELECT id FROM base_requests)
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
   UNION ALL SELECT 'history_artifact_cleanup',to_jsonb(w) FROM public.history_artifact_cleanup w WHERE w."artifactId" IN (SELECT id FROM artifacts)
   UNION ALL SELECT 'sessions',to_jsonb(s) FROM public.sessions s WHERE s.id IN (SELECT p."sessionId" FROM public.service_push_subscriptions p WHERE p."conversationId" IN (SELECT id FROM selected_conversations))
   UNION ALL SELECT 'fcm_devices',to_jsonb(d) FROM public.fcm_devices d WHERE d.id IN (SELECT p."deviceId" FROM public.service_push_subscriptions p WHERE p."conversationId" IN (SELECT id FROM selected_conversations))
  ), principals AS (
   SELECT v.value#>>'{}' AS id FROM resources r CROSS JOIN LATERAL jsonb_each(r.r) v
    WHERE v.key IN ('customerId','assigneeId','senderId','uploaderId','userId','actorId','targetStaffId','offeredById','confirmedById','createdById','approvedById','executedById','verifiedById','deliveredById') AND v.value<>'null'
  ), roots AS (
   SELECT jsonb_build_object('table',t,'key',public.diagnostic_source_key(t,r)) AS root FROM resources
   UNION SELECT jsonb_build_object('table','users','key',jsonb_build_object('id',id)) FROM principals WHERE id IS NOT NULL
   UNION SELECT jsonb_build_object('table','staff_grants','key',jsonb_build_object('userId',p.id,'capability',cap))
    FROM principals p CROSS JOIN unnest(ARRAY['support.operations','history.fulfilment','history.payment.verify','history.payment.history','founder.refund.approve']) cap WHERE p.id IS NOT NULL
   UNION SELECT jsonb_build_object('table','listings','key',jsonb_build_object('id',v.value))
    FROM resources r CROSS JOIN LATERAL jsonb_each(r.r) v WHERE v.key='sourceListingId' AND v.value<>'null'
   UNION SELECT jsonb_build_object('table','history_orders','key',jsonb_build_object('id',"acquiredForOrderId")) FROM artifacts WHERE "acquiredForOrderId" IS NOT NULL
   UNION SELECT jsonb_build_object('table','support_cases','key',jsonb_build_object('id',${selection.caseId ?? null}::text)) WHERE ${selection.caseId ?? null}::text IS NOT NULL
   UNION SELECT jsonb_build_object('table','service_attachments','key',jsonb_build_object('id',${selection.attachmentId ?? null}::text)) WHERE ${selection.attachmentId ?? null}::text IS NOT NULL
   UNION SELECT jsonb_build_object('table','service_erasure_fences','key',jsonb_build_object('conversationId',id)) FROM selected_conversations
   UNION SELECT jsonb_build_object('table','history_artifacts','key',jsonb_build_object('id',${selection.artifactId ?? null}::text)) WHERE ${selection.artifactId ?? null}::text IS NOT NULL
   UNION SELECT jsonb_build_object('table','history_artifact_cleanup','key',jsonb_build_object('artifactId',${selection.artifactId ?? null}::text)) WHERE ${selection.artifactId ?? null}::text IS NOT NULL
   UNION SELECT jsonb_build_object('table','service_audits','key',jsonb_build_object('id',${selection.auditId ?? null}::text)) WHERE ${selection.auditId ?? null}::text IS NOT NULL
  ) SELECT coalesce((SELECT jsonb_agg(root ORDER BY root::text) FROM roots),'[]') AS roots,
   coalesce((SELECT jsonb_agg(jsonb_build_object('table',t,'row',r) ORDER BY t,r::text) FROM resources),'[]') AS fingerprint
 `;
 if (!selected) throw changed();
 return selected;
}

/** Exactly one ordinary campaign prelude before the entire ordered dependency
 * prefix. Fresh full-row discovery after waits refuses drift without retry or
 * extension. The accepted campaign/tombstone path does not enter this helper. */
export async function withExpiryPreparation<T>(tx: Tx, selection: Selection, work: () => Promise<T>): Promise<T> {
 if (active.has(tx)) throw changed();
 const discover = async () => {
  const selected = await retainedSelection(tx, selection);
  // Read-only kernel derivation, never a prepared/parsed source write command.
  const command = { operation: "order_change", roots: selected.roots, rows: [], actorUserId: null, sessionId: null, cutoff: null, campaign: null };
  const [source] = await tx.$queryRaw<{ scope: Scope; keys: unknown; mutations: CampaignMutation[] }[]>`
   WITH discovered AS MATERIALIZED (SELECT public.diagnostic_source_scope(${JSON.stringify(command)}::jsonb) AS scope)
   SELECT scope,public.diagnostic_source_lock_keys(scope,${JSON.stringify(command)}::jsonb) AS keys,
    public.campaign_source_mutations(scope,${JSON.stringify(command)}::jsonb) AS mutations FROM discovered
  `;
  if (!source || source.scope.length > 1000) throw changed();
  // The future purge audit is attributable to the selected owner before it exists.
  const mutations = source.mutations.map(mutation => mutation.table === "service_audits" && mutation.key["id"] === selection.auditId
   ? { ...mutation, next: { purpose: "support", resourceId: selection.caseId ?? null, action: "SERVICE_CONTENT_PURGED" } } : mutation);
  return { selected, source, mutations };
 };
 const before = await discover();
 const tables = await tx.$queryRaw<{ table: string; namespace: number }[]>`
  SELECT m->>'table' AS table,(m->>'namespace')::int AS namespace FROM jsonb_array_elements(public.diagnostic_source_registry()) m ORDER BY (m->>'namespace')::int
 `;
 return withCampaignPreparation(tx, before.mutations, async () => {
  for (const table of tables) {
   if (!/^[a-z_]+$/.test(table.table)) throw changed();
   if (table.namespace === 898310) {
    const locks = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock((k->>'namespace')::int,(k->>'key')::int) AS acquired
     FROM jsonb_array_elements(${JSON.stringify(before.source.keys)}::jsonb) k WHERE (k->>'namespace')::int=${table.namespace} ORDER BY (k->>'key')::int`;
    if (locks.some(lock => !lock.acquired)) throw changed();
   } else await tx.$queryRaw`SELECT pg_advisory_xact_lock((k->>'namespace')::int,(k->>'key')::int)::text
    FROM jsonb_array_elements(${JSON.stringify(before.source.keys)}::jsonb) k WHERE (k->>'namespace')::int=${table.namespace} ORDER BY (k->>'key')::int`;
   for (const row of before.source.scope.filter(row => row.table === table.table).sort((a, b) => JSON.stringify(a.key) < JSON.stringify(b.key) ? -1 : JSON.stringify(a.key) > JSON.stringify(b.key) ? 1 : 0)) {
    await tx.$queryRawUnsafe(`SELECT 1 FROM public.${table.table} s WHERE to_jsonb(s) @> $1::jsonb FOR UPDATE`, JSON.stringify(row.key));
   }
  }
  if (JSON.stringify(await discover()) !== JSON.stringify(before)) throw changed();
  active.add(tx);
  try { return await work(); } finally { active.delete(tx); }
 });
}
