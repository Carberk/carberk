import { describe, expect, it } from "vitest";
import { StaffAuthorityDenied } from "../../identity/identity.public";
import type { ServiceRuntime } from "../domain/ports/ServiceMessagingPort";
import type { CampaignServiceAdmission, CampaignServiceScope } from "./campaignServiceAdmission";
import { PrismaServiceMessaging } from "./PrismaServiceMessaging";

const subject = { userId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222" };
const conversationId = "33333333-3333-4333-8333-333333333333", caseId = "44444444-4444-4444-8444-444444444444";
const scope: CampaignServiceScope = { namespace: `cf_${"f1".repeat(16)}`, candidate: "a".repeat(40) };

function harness(options: { ordinary?: boolean; enabled?: boolean; begin?: CampaignServiceScope | null; admitted?: boolean[] } = {}) {
 const writes: string[] = [], campaign: string[] = [];
 const admitted = [...(options.admitted ?? [true, true])];
 const conversation = { id: conversationId, purpose: "support", supportCaseId: caseId, historyRequestId: null, lifecycleEpoch: 0, lastSequence: 0, erasedAt: null,
  supportCase: { id: caseId, customerId: subject.userId, assigneeId: null, assignmentVersion: 0, status: "open" }, historyRequest: null };
 const reads: Record<string, unknown> = {
  "user.findUnique": { id: subject.userId, deletionScheduledAt: null, suspendedAt: null },
  "session.findUnique": { id: subject.sessionId, userId: subject.userId, expiresAt: new Date(Date.now() + 3600000) },
  "serviceConversation.findUnique": conversation, "serviceConversation.findUniqueOrThrow": conversation,
  "supportCase.findUnique": null, "serviceConversation.findMany": [],
  "supportCase.create": { id: caseId }, "serviceConversation.create": { id: conversationId },
 };
 const model = (name: string) => new Proxy({}, { get: (_target, method: string) => async () => {
  if (!/^find/.test(method)) writes.push(`${name}.${method}`);
  return reads[`${name}.${method}`] ?? { count: 0 };
 } });
 const query = async (strings: TemplateStringsArray) => {
  const sql = strings.join("?");
  if (sql.includes("service retained selection")) return [{ roots: [], fingerprint: [] }];
  if (sql.includes("diagnostic_source_scope")) return [{ scope: [], keys: [], campaigns: [], mutations: [] }];
  if (sql.includes("campaign_prepare")) return [{ receipt: "receipt" }];
  return [];
 };
 const tx = new Proxy({ $queryRaw: query, $executeRaw: async () => 0 } as Record<string, unknown>, { get: (target, key: string) => key in target ? target[key] : model(key) });
 const db = { $transaction: async (work: (client: unknown) => Promise<unknown>) => work(tx) };
 const staff = { authorize: async () => { throw new StaffAuthorityDenied("CAPABILITY_REQUIRED"); } };
 const runtime: ServiceRuntime = { now: () => new Date(), id: () => conversationId, syntheticEnabled: () => options.enabled ?? false, syntheticSubjectAllowed: () => options.ordinary ?? false };
 const admission = {
  begin: async () => { campaign.push("begin"); return options.begin === undefined ? scope : options.begin; },
  admit: async (_tx: unknown, granted: CampaignServiceScope, _subject: unknown, graph?: { conversationId?: string; peerId?: string }) => {
   expect(granted).toBe(scope);
   campaign.push(graph ? `graph:${graph.conversationId ?? ""}:${graph.peerId ?? ""}` : "principal");
   return admitted.shift() ?? false;
  },
 } as unknown as CampaignServiceAdmission;
 const service = new PrismaServiceMessaging(db as never, staff as never, {} as never, runtime, admission);
 return { service, writes, campaign };
}
const code = (promise: Promise<unknown>) => promise.then(() => "resolved", (error: { code?: string }) => error.code);

describe("campaign Support text admission at the service boundary", () => {
 it("opens Support only after principal admission when the ordinary runtime refuses", async () => {
  const { service, writes, campaign } = harness();
  expect(await service.open(subject, "support")).toEqual({ id: conversationId, resourceId: caseId });
  expect(campaign).toEqual(["begin", "principal"]);
  expect(writes).toEqual(["supportCase.create", "serviceConversation.create"]);
 });
 it("lists only the admitted principal's own conversations without graph admission", async () => {
  const { service, writes, campaign } = harness();
  expect(await service.mine(subject)).toEqual([]);
  expect(campaign).toEqual(["begin", "principal"]);
  expect(writes).toEqual([]);
  expect(await code(harness({ admitted: [false] }).service.mine(subject))).toBe("COLLECTION_DISABLED");
 });
 it("refuses Support open without writes when the principal is not admitted or not a reservation principal", async () => {
  for (const options of [{ admitted: [false] }, { begin: null }]) {
   const { service, writes } = harness(options);
   expect(await code(service.open(subject, "support"))).toBe("COLLECTION_DISABLED");
   expect(writes).toEqual([]);
  }
 });
 it("keeps History, attachments, push, files and queue closed without consulting campaign admission", async () => {
  const { service, writes, campaign } = harness();
  const attempts = [
   service.open(subject, "history"),
   service.queue(subject, "support"),
   service.stage(subject, conversationId, { category: "support_communication", visibility: "customer", contentType: "image/png", sizeBytes: 1, filename: "a.png", rights: { use: ["service"], hold: null } } as never),
   service.upload(subject, conversationId, caseId, new Uint8Array([1])),
   service.file(subject, conversationId, caseId),
   service.subscribePush(subject, conversationId, "device"),
   service.send(subject, conversationId, { clientMessageId: "m1", visibility: "customer", attachmentId: caseId } as never),
   service.supportCommand(subject, conversationId, { kind: "investigate" }),
   service.historySnapshot(subject, conversationId),
  ];
  expect(await Promise.all(attempts.map(code))).toEqual(Array(9).fill("COLLECTION_DISABLED"));
  expect(campaign).toEqual([]);
  expect(writes).toEqual([]);
 });
 it("binds text commands to the reservation-owned conversation and peer before any write", async () => {
  const admitted = harness();
  await admitted.service.markRead(subject, conversationId, 1);
  expect(admitted.campaign).toEqual(["begin", "principal", `graph:${conversationId}:`]);
  expect(admitted.writes).toEqual(["serviceReadState.upsert", "serviceReadState.updateMany"]);
  const foreign = harness({ admitted: [true, false] });
  expect(await code(foreign.service.assign(subject, conversationId, 0, "55555555-5555-4555-8555-555555555555"))).toBe("NO_ACCESS");
  expect(foreign.campaign).toEqual(["begin", "principal", `graph:${conversationId}:55555555-5555-4555-8555-555555555555`]);
  expect(foreign.writes).toEqual([]);
 });
 it("leaves an ordinarily admitted runtime subject on the unchanged ordinary path", async () => {
  const { service, campaign } = harness({ ordinary: true, enabled: true });
  await service.markRead(subject, conversationId, 1);
  expect(await service.open(subject, "support")).toEqual({ id: conversationId, resourceId: caseId });
  expect(campaign).toEqual([]);
 });
});
