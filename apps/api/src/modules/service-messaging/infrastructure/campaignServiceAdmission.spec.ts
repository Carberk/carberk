import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { CampaignServiceAdmission } from "./campaignServiceAdmission";

const reservation = "f1".repeat(16), candidate = "a".repeat(40);
const subject = { userId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222" };
const roster = `support.${reservation}.${candidate.slice(0, 12)}@campaign897.invalid`;
const namespace = `cf_${reservation}`;
const authority = `"${namespace}".campaign_service_authority(text,text,text,text,text)`;

function fakeTx(email: string | null, options: { present?: boolean; admitted?: boolean[] } = {}) {
 const calls: { sql: string; values: unknown[] }[] = [];
 const admitted = [...(options.admitted ?? [])];
 const tx = {
  user: { findUnique: async () => { calls.push({ sql: "user.email", values: [] }); return email === null ? null : { email }; } },
  $executeRawUnsafe: async (sql: string, ...values: unknown[]) => { calls.push({ sql, values }); return 0; },
  $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
   calls.push({ sql, values });
   if (sql.includes("to_regprocedure")) return [{ present: options.present ?? true }];
   if (sql.includes("campaign_service_authority($1")) { const next = admitted.shift(); return next === undefined ? [] : [{ admitted: next }]; }
   return [{ locked: 1 }];
  },
 };
 return { tx, calls };
}
const admission = (env: Record<string, unknown> = { AUTOTM_COMMIT_SHA: candidate }) => new CampaignServiceAdmission(new ConfigService(env));

describe("campaign Support text admission", () => {
 it("ignores ordinary and non-roster principals without locks or namespace SQL", async () => {
  for (const email of [null, "buyer@example.com", `support.${reservation}.${candidate.slice(0, 12)}@campaign897.invalid.example`, `unknown.${reservation}.${candidate.slice(0, 12)}@campaign897.invalid`, `support.${"F1".repeat(16)}.${candidate.slice(0, 12)}@campaign897.invalid`]) {
   const { tx, calls } = fakeTx(email);
   expect(await admission().begin(tx as never, subject)).toBeNull();
   expect(calls.map(call => call.sql)).toEqual(["user.email"]);
  }
 });
 it("refuses a roster email whose candidate is not the serving runtime, or production", async () => {
  for (const env of [{}, { AUTOTM_COMMIT_SHA: "b".repeat(40) }, { AUTOTM_COMMIT_SHA: "A".repeat(40) }, { AUTOTM_COMMIT_SHA: candidate, APP_ENV: "production" }]) {
   const { tx, calls } = fakeTx(roster);
   expect(await admission(env).begin(tx as never, subject)).toBeNull();
   expect(calls.map(call => call.sql)).toEqual(["user.email"]);
  }
 });
 it("derives the reservation server-side and takes table locks in reset order before the namespace fence", async () => {
  const { tx, calls } = fakeTx(roster);
  expect(await admission().begin(tx as never, subject)).toEqual({ namespace, candidate });
  expect(calls.map(call => call.sql)).toEqual([
   "user.email",
   "SET LOCAL lock_timeout='5s'",
   "LOCK TABLE public.service_audits,public.service_conversations,public.service_messages,public.service_outbox,public.service_read_states,public.support_cases IN ROW EXCLUSIVE MODE",
   "SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1,0))",
   "SELECT to_regprocedure($1) IS NOT NULL AS present",
  ]);
  expect(calls[3]?.values).toEqual([namespace]);
  expect(calls[4]?.values).toEqual([authority]);
 });
 it("closes a namespace without the service authority contract", async () => {
  const { tx } = fakeTx(roster, { present: false });
  expect(await admission().begin(tx as never, subject)).toBeNull();
 });
 it("admits only through the contract-hashed authority for the exact principal, Session, graph and candidate", async () => {
  const { tx, calls } = fakeTx(roster, { admitted: [true, false] });
  const scope = { namespace, candidate };
  expect(await admission().admit(tx as never, scope, subject)).toBe(true);
  expect(await admission().admit(tx as never, scope, subject, { conversationId: "33333333-3333-4333-8333-333333333333", peerId: "44444444-4444-4444-8444-444444444444" })).toBe(false);
  const [principal, graph] = calls;
  expect(principal?.sql).toContain(`SELECT "${namespace}".campaign_service_authority($1,$2,$3::text,$4::text,$5) AS admitted FROM "${namespace}".campaign_manifest m`);
  expect(principal?.sql).toContain("m.state='identities' AND m.candidate=$5 AND m.profile='campaign897-full-v3' AND m.delivery_version=3");
  expect(principal?.sql).toContain(`m.service_contract_hash=md5(pg_get_functiondef('${authority}'::regprocedure))`);
  expect(principal?.values).toEqual([subject.userId, subject.sessionId, null, null, candidate]);
  expect(graph?.values).toEqual([subject.userId, subject.sessionId, "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", candidate]);
 });
 it("refuses missing, duplicate or non-boolean authority rows", async () => {
  for (const rows of [[], [{ admitted: true }, { admitted: true }], [{ admitted: "true" }]]) {
   const tx = { $queryRawUnsafe: async () => rows };
   expect(await admission().admit(tx as never, { namespace, candidate }, subject)).toBe(false);
  }
 });
});
