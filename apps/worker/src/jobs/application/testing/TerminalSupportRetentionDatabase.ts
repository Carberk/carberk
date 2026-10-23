type IdWhere = { where: { id: string } };
type ConversationWhere = { where: { conversationId: string } };
interface Fence { conversationId: string; epoch: number; objectKeys: string[]; erasedAt: Date; cleanupCompletedAt: Date | null }

/** SQL authority refusal is simulated, not the disposal predicate or locking.
 * Both absent stale selections and retained private rows use this database fake.
 * Normal purge writes are supported so a wrongly admitted worker changes data. */
export function terminalSupportDatabase(namespace: string, options: { targetPresent?: boolean; admitted?: boolean } = {}) {
 let state: "active" | "disposed" = "active";
 const fixture = (prefix: string, closed: boolean) => ({
  supportCase: { id: `${prefix}-case`, customerId: `${prefix}-tenant` as string | null, status: closed ? "closed" : "open", closedAt: closed ? new Date("2026-01-01T00:00:00Z") : null, assigneeId: "staff" as string | null, sourceListingId: "listing" as string | null, assignmentVersion: 0 },
  conversation: { id: `${prefix}-conversation`, supportCaseId: `${prefix}-case`, erasedAt: null as Date | null, lifecycleEpoch: 0 },
  messages: [{ body: `${prefix} private Support message`, senderId: `${prefix}-tenant` }],
  attachments: [{ id: `${prefix}-attachment`, objectKey: `service-private/${prefix}-conversation/private-byte`, state: "adopted", removedAt: null as Date | null, uploaderId: `${prefix}-tenant` as string | null, rights: { schedule: { kind: "support_case" }, hold: null } }],
  pushSubscriptions: [{ token: `${prefix}-token` }],
  outbox: [{ body: `${prefix} queued private message` }],
  readStates: [{ userId: `${prefix}-tenant`, lastReadSequence: 1 }],
  audits: [{ purpose: "support", resourceId: `${prefix}-case`, action: "SUPPORT_CLOSED", reason: `${prefix} private reason` as string | null }],
  fences: [] as Fence[],
 });
 const target = fixture("selected", true), foreign = fixture("foreign", false);
 const rows = options.targetPresent ? [target, foreign] : [foreign];
 const byCase = (id: string) => rows.find(row => row.supportCase.id === id);
 const byConversation = (id: string) => rows.find(row => row.conversation.id === id);
 const authority: { state: string; admitted: boolean }[] = [];
 const remove = (field: "messages" | "pushSubscriptions" | "outbox" | "readStates") => async ({ where }: ConversationWhere) => {
  const row = byConversation(where.conversationId);
  const count = row?.[field].length ?? 0;
  if (row) row[field] = [];
  return { count };
 };
 const db = {
  supportCase: {
   findMany: async () => {
    // The absent mode deliberately supplies the same stale selection on retries.
    const candidates = options.targetPresent ? rows.filter(row => row.supportCase.status === "closed" && !row.conversation.erasedAt) : [target];
    const snapshot = candidates.map(row => ({ ...row.supportCase }));
    state = "disposed";
    return snapshot;
   },
   findUnique: async ({ where }: IdWhere) => {
    const row = byCase(where.id);
    return row ? { ...row.supportCase, conversation: { ...row.conversation } } : null;
   },
   update: async ({ where, data }: IdWhere & { data: { customerId: null; assigneeId: null; sourceListingId: null; assignmentVersion: { increment: number } } }) => {
    const row = byCase(where.id);
    if (!row) throw new Error("Support case missing");
    const { assignmentVersion, ...values } = data;
    Object.assign(row.supportCase, values);
    row.supportCase.assignmentVersion += assignmentVersion.increment;
    return { ...row.supportCase };
   },
  },
  serviceConversation: {
   findUnique: async ({ where }: IdWhere) => { const row = byConversation(where.id); return row ? { ...row.conversation } : null; },
   update: async ({ where, data }: IdWhere & { data: { lifecycleEpoch: number; erasedAt: Date } }) => {
    const row = byConversation(where.id);
    if (!row) throw new Error("Conversation missing");
    Object.assign(row.conversation, data);
    return { ...row.conversation };
   },
  },
  serviceAttachment: {
   findMany: async ({ where }: { where: { conversationId?: string; id?: { in: string[] } } }) => rows.flatMap(row =>
    (where.conversationId === row.conversation.id || where.id?.in.includes(row.attachments[0]?.id ?? "")) ? row.attachments.filter(file => !file.removedAt).map(file => ({ ...file })) : []),
   updateMany: async ({ where, data }: ConversationWhere & { data: { state: string; removedAt: Date; uploaderId: null } }) => {
    const row = byConversation(where.conversationId);
    row?.attachments.forEach(file => Object.assign(file, data));
    return { count: row?.attachments.length ?? 0 };
   },
  },
  serviceMessage: { deleteMany: remove("messages") },
  servicePushSubscription: { deleteMany: remove("pushSubscriptions") },
  serviceOutbox: { deleteMany: remove("outbox") },
  serviceReadState: { deleteMany: remove("readStates") },
  serviceAudit: {
   updateMany: async ({ where, data }: { where: { purpose: string; resourceId: string }; data: { reason: null } }) => {
    const audits = byCase(where.resourceId)?.audits.filter(audit => audit.purpose === where.purpose) ?? [];
    audits.forEach(audit => Object.assign(audit, data));
    return { count: audits.length };
   },
   create: async ({ data }: { data: { id: string; purpose: string; resourceId: string; action: string; assignmentVersion: number } }) => {
    const row = byCase(data.resourceId);
    if (!row) throw new Error("Audit resource missing");
    row.audits.push({ ...data, reason: null });
    return data;
   },
  },
  historyArtifactCleanup: { findMany: async () => [] },
  serviceErasureFence: {
   findMany: async () => rows.flatMap(row => row.fences.filter(fence => !fence.cleanupCompletedAt).map(fence => ({ ...fence }))),
   findUnique: async ({ where }: ConversationWhere) => byConversation(where.conversationId)?.fences[0] ?? null,
   upsert: async ({ where, create, update }: ConversationWhere & { create: Omit<Fence, "cleanupCompletedAt">; update: Pick<Fence, "epoch" | "objectKeys" | "cleanupCompletedAt"> }) => {
    const row = byConversation(where.conversationId);
    if (!row) throw new Error("Fence conversation missing");
    const prior = row.fences[0];
    if (prior) Object.assign(prior, update);
    else row.fences.push({ ...create, cleanupCompletedAt: null });
    return row.fences[0];
   },
   updateMany: async ({ where, data }: ConversationWhere & { data: { cleanupCompletedAt: Date } }) => {
    const fence = byConversation(where.conversationId)?.fences[0];
    if (!fence || fence.cleanupCompletedAt) return { count: 0 };
    Object.assign(fence, data);
    return { count: 1 };
   },
  },
  $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
   const sql = parts.join("?");
   if (sql.includes("pg_namespace")) return [{ name: namespace }];
   if (sql.includes('SELECT id,"supportCaseId" FROM service_conversations')) return rows.filter(row => row.conversation.id === values[0] || row.supportCase.id === values[1]).map(row => ({ id: row.conversation.id, supportCaseId: row.supportCase.id }));
   if (sql.includes("FROM service_attachments")) return []; // No independently due attachment in these fixtures.
   if (sql.includes("FOR UPDATE") || sql.includes("pg_advisory_xact_lock")) return [];
   throw new Error("Unexpected database query");
  },
  $executeRawUnsafe: async (sql: string) => {
   if (!sql.startsWith("LOCK TABLE ")) throw new Error("Unexpected database write");
   return 0;
  },
  $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
   if (sql.includes("campaign_records")) return values[0] === target.conversation.id || values[1] === target.supportCase.id ? [{ present: true }] : [];
   if (sql.includes("campaign_support_lifecycle_authority")) {
    const admitted = options.admitted ?? false;
    authority.push({ state, admitted });
    return [{ admitted }];
   }
   throw new Error("Unexpected database query");
  },
  $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
 };
 return { db, target, foreign, authority };
}
