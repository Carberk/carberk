import { describe, expect, it } from "vitest";

import { CampaignSupportRetention } from "./CampaignSupportRetention";

const namespace = `cf_${"a".repeat(32)}`, candidate = "b".repeat(40), now = new Date("2027-01-19T00:00:00Z");
function database(options: { claims?: string[]; admitted?: boolean; unreadable?: boolean; changed?: boolean; erased?: boolean; invalidAuthority?: boolean } = {}) {
 let locked = false;
 const db = {
  $queryRaw: async (parts: TemplateStringsArray) => {
   const sql = parts.join("?");
   if (sql.includes("pg_namespace")) return (options.claims ?? [namespace]).map(name => ({ name }));
   if (sql.includes("service_conversations")) return options.erased ? [] : [{ id: "conversation", supportCaseId: "case" }];
   return [];
  },
  $executeRawUnsafe: async () => { locked = true; return 0; },
  $queryRawUnsafe: async (sql: string) => {
   if (sql.includes("campaign_records")) {
    if (options.unreadable) throw new Error("permission denied");
    return options.changed && locked ? [] : [{ present: true }];
   }
   if (sql.includes("campaign_support_lifecycle_authority")) return options.invalidAuthority ? [] : [{ admitted: options.admitted ?? true }];
   throw new Error("Unexpected database query");
  },
  $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
 };
 return db;
}
async function execute(options: Parameters<typeof database>[0] = {}, serving: string | undefined = candidate) {
 const effects: string[] = [];
 const resolver = new CampaignSupportRetention(database(options) as never, serving);
 const result = await resolver.run({ conversationId: "conversation", caseId: "case" }, now, "cleanup", async () => { effects.push("storage"); return "completed"; }, async () => { effects.push("ordinary"); return "unchanged"; });
 return { result, effects };
}
describe("exact Support retention resource boundary", () => {
 it("preserves ordinary work only after every namespace is inspected without a claim", async () => {
  expect(await execute({ claims: [] })).toEqual({ result: "unchanged", effects: ["ordinary"] });
 });
 it("resolves cleanup after nullable principal linkage has been erased", async () => {
  expect(await execute({ erased: true })).toEqual({ result: "completed", effects: ["storage"] });
 });
 it("never reaches storage on disposed, stale-candidate or deleted authority", async () => {
  expect(await execute({ admitted: false })).toEqual({ result: undefined, effects: [] });
 });
 it("refuses competing, unreadable and changed ownership rather than adopting ordinary work", async () => {
  await expect(execute({ claims: [namespace, `cf_${"c".repeat(32)}`] })).rejects.toThrow("ambiguous");
  await expect(execute({ unreadable: true })).rejects.toThrow("permission denied");
  await expect(execute({ changed: true })).rejects.toThrow("ownership changed");
  await expect(execute({}, "unknown")).rejects.toThrow("candidate invalid");
  await expect(execute({ invalidAuthority: true })).rejects.toThrow("authority invalid");
 });
});
