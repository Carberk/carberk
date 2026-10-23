/** Database boundary for a stale selected Support case. Disposal occurs after
 * selection, leaving a tombstone claim but no target graph. No reset/lock
 * choreography is simulated; SQL authority supplies the terminal refusal. */
export function terminalSupportDatabase(namespace: string) {
 let state: "active" | "disposed" = "active";
 const selected = { id: "selected-case", customerId: "selected-tenant", status: "closed", closedAt: new Date("2026-01-01T00:00:00Z") };
 const foreign = {
  supportCase: { id: "foreign-case", customerId: "foreign-tenant", status: "open", closedAt: null, assignmentVersion: 0 },
  conversation: { id: "foreign-conversation", erasedAt: null, lifecycleEpoch: 0 },
  messages: [{ body: "Foreign private Support message", senderId: "foreign-tenant" }],
  attachments: [{ objectKey: "service-private/foreign-conversation/private-byte", state: "adopted" }],
  fences: [],
 };
 const authority: { state: string; values: unknown[] }[] = [];
 const purgeWork: string[] = [];
 const db = {
  supportCase: { findMany: async () => {
   const snapshot = [selected, foreign.supportCase].filter(value => value.status === "closed").map(value => ({ ...value }));
   state = "disposed";
   return snapshot;
  }, findUnique: async ({ where }: { where: { id: string } }) => where.id === foreign.supportCase.id ? { ...foreign.supportCase } : null },
  serviceConversation: { findUnique: async ({ where }: { where: { id: string } }) => where.id === foreign.conversation.id ? { ...foreign.conversation } : null },
  serviceAttachment: { findMany: async () => [] },
  historyArtifactCleanup: { findMany: async () => [] },
  serviceErasureFence: { findMany: async () => [] },
  $queryRaw: async (parts: TemplateStringsArray) => {
   const sql = parts.join("?");
   if (sql.includes("pg_namespace")) return [{ name: namespace }];
   if (sql.includes('SELECT id,"supportCaseId" FROM service_conversations')) return [];
   if (sql.includes("FROM service_attachments")) return [];
   if (sql.includes("FOR UPDATE")) {
    purgeWork.push(sql);
    throw new Error("Disposed Support namespace must not enter purge work");
   }
   if (sql.includes("pg_advisory_xact_lock")) return [];
   throw new Error("Unexpected database query");
  },
  $executeRawUnsafe: async (sql: string) => {
   if (!sql.startsWith("LOCK TABLE ")) throw new Error("Unexpected database write");
   return 0;
  },
  $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
   if (sql.includes("campaign_records")) return values[1] === "selected-case" ? [{ present: true }] : [];
   if (sql.includes("campaign_support_lifecycle_authority")) {
    authority.push({ state, values });
    return [{ admitted: state !== "disposed" }];
   }
   throw new Error("Unexpected database query");
  },
  $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
 };
 return { db, foreign, authority, purgeWork };
}
