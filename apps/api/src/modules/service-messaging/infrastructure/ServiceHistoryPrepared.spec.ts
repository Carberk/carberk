import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { StaffAuthorityDenied, type StaffAuthorityPort } from "../../identity/identity.public";
import { PrismaServiceMessaging } from "./PrismaServiceMessaging";
import { CampaignServiceAdmission } from "./campaignServiceAdmission";

const subject = { userId: "customer", sessionId: "session" };
const now = new Date("2026-10-25T12:00:00Z");
type Data = Record<string, unknown>;
/** Database boundary. Enforces preparation before resource access and models
 * transaction rollback. It does not model PostgreSQL locks or discovery. */
function database() {
 const owner = { id: "case", customerId: "customer", assigneeId: "staff", assignmentVersion: 1, sourceListingId: "listing", status: "open" };
 const conversation = { id: "conversation", purpose: "support", supportCaseId: "case", historyRequestId: null, supportCase: owner, historyRequest: null, erasedAt: null, lifecycleEpoch: 0, lastSequence: 8, createdAt: now };
 const state = { readThrough: 0, audits: [] as Data[], subscriptions: [] as Data[] };
 const control = { afterWait: undefined as (() => void) | undefined, refuseFinish: false, sessionValid: true, capable: true, discovery: "valid" as "valid" | "missing-selection" | "missing-source" | "oversized", preparations: 0, scopes: [] as unknown[] };
 const db = { $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
  const draft = structuredClone(state); let prepared = false;
  const query = async (strings: TemplateStringsArray | string, ...values: unknown[]) => {
   const sql = typeof strings === "string" ? strings : strings.join("?");
   if (sql.includes("pg_advisory_xact_lock(") && !sql.includes("::int)::text")) throw new Error("unsupported_void_result");
   if (sql.includes("service retained selection") && control.discovery === "missing-selection") return [];
   if (sql.includes("service retained selection")) return [{ roots: [], fingerprint: { assignmentVersion: owner.assignmentVersion, assigneeId: owner.assigneeId, epoch: conversation.lifecycleEpoch } }];
   if (sql.includes("diagnostic_source_scope")) {
    const command = JSON.parse(values[0] as string) as Data;
    control.scopes.push(command);
    if (control.discovery === "missing-source") return [];
    if (control.discovery === "oversized") return [{ scope: Array.from({ length: 1001 }, () => ({ table: "users", key: { id: "customer" } })), keys: [], campaigns: [], mutations: [] }];
    return [{ scope: [], keys: [], campaigns: [], mutations: [] }];
   }
   if (sql.includes("diagnostic_source_registry")) return [{ table: "users", namespace: 897100 }];
   if (sql.includes("campaign_prepare")) { prepared = true; control.preparations++; control.afterWait?.(); return [{ receipt: "receipt" }]; }
   if (sql.includes("FOR UPDATE") || sql.includes("pg_advisory_xact_lock")) { if (!prepared) throw new Error("resource before preparation"); }
   if (sql.includes("campaign_finish") && control.refuseFinish) throw new Error("completion refused");
   return [];
  };
  const writes = () => { if (!prepared) throw new Error("write before preparation"); };
  const tx = {
   $queryRaw: query, $queryRawUnsafe: query, $executeRaw: query,
   serviceConversation: { findUnique: async () => conversation, findUniqueOrThrow: async () => conversation, findMany: async () => [conversation] },
   user: { findUnique: async ({ where }: { where: Data }) => ({ id: where["id"], email: null, deletionScheduledAt: null, suspendedAt: null, staffGrants: control.capable ? [{}] : [] }) },
   session: { findUnique: async () => ({ userId: subject.userId, expiresAt: control.sessionValid ? new Date("2027-01-01Z") : now }) },
   serviceReadState: {
    upsert: async () => { writes(); },
    updateMany: async ({ where, data }: { where: Data; data: Data }) => { writes(); const op = where["lastSequence"] as { lt: number }; if (draft.readThrough < op.lt) draft.readThrough = data["lastSequence"] as number; },
   },
   serviceAudit: { create: async ({ data }: { data: Data }) => { writes(); draft.audits.push(data); } },
   supportCase: { findUnique: async () => ({ ...owner, conversation }), update: async ({ data }: { data: { assigneeId: string } }) => { writes(); owner.assigneeId = data.assigneeId; owner.assignmentVersion++; } },
   serviceOutbox: { create: async () => { writes(); } },
   fcmDevice: { findUnique: async () => ({ id: "device", userId: subject.userId, token: "token", invalidatedAt: null }) },
   servicePushSubscription: { upsert: async ({ create }: { create: Data }) => { writes(); draft.subscriptions.push(create); } },
  };
  const result = await work(tx); Object.assign(state, draft); return result;
 } };
 const staff: StaffAuthorityPort = { authorize: async () => { if (!control.capable) throw new StaffAuthorityDenied("CAPABILITY_REQUIRED"); }, summary: async () => ({ capabilities: [], elevated: false }) };
 const service = new PrismaServiceMessaging(db as never, staff, {} as never, { now: () => now, id: () => "new-id", syntheticEnabled: () => true, syntheticSubjectAllowed: () => true }, new CampaignServiceAdmission(new ConfigService()));
 return { service, state, control, owner, conversation };
}

describe("service outer entry owns its complete preparation", () => {
 it.each(["missing-selection", "missing-source", "oversized"] as const)("refuses %s discovery before any watermark, subscription or staff audit", async discovery => {
  const h = database(); h.control.discovery = discovery;
  h.owner.customerId = "someone-else"; h.owner.assigneeId = "customer";
  await expect(h.service.markRead(subject, "conversation", 5)).rejects.toMatchObject({ code: "NO_ACCESS" });
  expect(h.state).toEqual({ readThrough: 0, audits: [], subscriptions: [] });
  expect(h.control.preparations).toBe(0);
 });
 it("commits the customer watermark through the existing public entry", async () => {
  const h = database(); await h.service.markRead(subject, "conversation", 99);
  expect(h.state.readThrough).toBe(8); expect(h.state.audits).toEqual([]);
 });
 it("treats staff read state as an audited write", async () => {
  const h = database(); h.owner.customerId = "someone-else"; h.owner.assigneeId = "customer";
  await h.service.markRead(subject, "conversation", 5);
  expect(h.state.readThrough).toBe(5);
  expect(h.state.audits).toEqual([{ actorId: "customer", purpose: "support", resourceId: "case", action: "SERVICE_READ", assignmentVersion: 1 }]);
 });
 it("rolls back watermark and staff audit if preparation completion refuses", async () => {
  const h = database(); h.owner.customerId = "someone-else"; h.owner.assigneeId = "customer"; h.control.refuseFinish = true;
  await expect(h.service.markRead(subject, "conversation", 5)).rejects.toThrow("completion refused");
  expect(h.state).toEqual({ readThrough: 0, audits: [], subscriptions: [] });
 });
 it.each(["assignment", "epoch"])("refuses stale %s discovery after a wait without extending or retrying", async change => {
  const h = database(); h.control.afterWait = () => { if (change === "assignment") h.owner.assignmentVersion++; else h.conversation.lifecycleEpoch++; };
  await expect(h.service.markRead(subject, "conversation", 5)).rejects.toMatchObject({ code: "NO_ACCESS" });
  expect(h.state.readThrough).toBe(0); expect(h.state.audits).toEqual([]); expect(h.control.preparations).toBe(1);
 });
 it("rechecks Session expiry after preparation waits", async () => {
  const h = database(); h.control.afterWait = () => { h.control.sessionValid = false; };
  await expect(h.service.markRead(subject, "conversation", 5)).rejects.toMatchObject({ code: "NO_ACCESS" });
  expect(h.state.readThrough).toBe(0);
 });
 it("keeps a lost staff capability from writing audit or content", async () => {
  const h = database(); h.owner.customerId = "someone-else"; h.owner.assigneeId = "customer";
  h.control.afterWait = () => { h.control.capable = false; };
  await expect(h.service.markRead(subject, "conversation", 5)).rejects.toMatchObject({ code: "NO_ACCESS" });
  expect(h.state.audits).toEqual([]); expect(h.state.readThrough).toBe(0);
 });
 it("prepares a push subscription before Session/device resource locks", async () => {
  const h = database(); await h.service.subscribePush(subject, "conversation", "token");
  expect(h.state.subscriptions).toEqual([{ sessionId: "session", deviceId: "device", conversationId: "conversation", lifecycleEpoch: 0 }]);
 });
 it("prepares the entire mine page once and returns the existing DTO", async () => {
  const h = database(); expect(await h.service.mine(subject)).toEqual([{ id: "conversation", purpose: "support", createdAt: "2026-10-25T12:00:00.000Z" }]);
  expect(h.control.preparations).toBe(1);
 });
});
