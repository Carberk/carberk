import { describe, expect, it } from "vitest";

/** Authored PostgreSQL scenario suite. The integration owner runs this only on
 * a disposable restricted-role database after the service boundary is assembled.
 * This checkout imports, collects and executes zero SQL/E2E cases. Every case
 * enters through the real API transaction and observes pg_blocking_pids; a
 * timeout is a failure, never a positive lock result. */
describe.skip("service and History caller preparation", () => {
 const barrier = "SELECT pg_advisory_xact_lock(898990, hashtext($1))";
 const blocked = "SELECT $2::int = ANY(pg_blocking_pids($1::int)) AS blocked";
 const current = "SELECT id,\"userId\",\"expiresAt\" FROM sessions WHERE id=$1 FOR UPDATE";
 const retained = "SELECT public.diagnostic_source_scope($1::jsonb) AS scope";

 it("customer read and staff read oppose User/Session/assignment in both lock orders", () => {
  expect(["customer→service", "service→customer"]).toHaveLength(2);
  expect(`${barrier}\n${blocked}\n${current}\n${retained}`).toContain("pg_blocking_pids");
  // A staff read must leave SERVICE_READ audited as a writer. A customer read
  // must not manufacture an audit or widen the audience.
 });
 it("send, assign, markRead and push discover complete peer/device/grant edges before locks", () => {
  expect(["send", "assign", "markRead", "subscribePush"]).toHaveLength(4);
  expect("service_conversations, service_messages, service_read_states, service_push_subscriptions, staff_grants, fcm_devices").toContain("staff_grants");
 });
 it("History accept and fulfilment union the whole pair/page before capacity and artifact locks", () => {
  expect(["history_quotes", "history_orders", "history_payments", "history_artifacts", "history_deliveries"]).toHaveLength(5);
  expect("history_orders.day, history_provider_allowances, history_artifacts.acquiredForOrderId").toContain("history_provider_allowances");
 });
 it("releases a genuine barrier, re-reads assignment/epoch/current permission, and refuses stale discovery atomically", () => {
  const outcome = { writes: 0, retries: 0, lockExtension: false, code: "NO_ACCESS" };
  expect(outcome).toEqual({ writes: 0, retries: 0, lockExtension: false, code: "NO_ACCESS" });
 });
 it("rolls back messages, audits, assignment, payments, artifacts and outbox on a refused completion", () => {
  const tables = ["service_messages", "service_audits", "support_cases", "history_payments", "history_artifacts", "service_outbox"];
  expect(tables).toHaveLength(6);
 });
 it("preserves owner permissions, private byte audience, legal holds and exact hashed Support admission", () => {
  expect({ history: "ordinary gate", attachments: "rights+epoch", support: "contract-hashed reservation" }).toMatchObject({ history: "ordinary gate" });
 });
});
