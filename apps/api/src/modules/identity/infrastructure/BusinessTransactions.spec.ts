import { describe, expect, it } from "vitest";
import { PreparedTransactionDatabase } from "../../../common/application/testing/PreparedTransactionDatabase";
import { PrismaBusinessRepository } from "./PrismaBusinessRepository";

const now = new Date("2026-10-24T12:00:00.000Z"), future = new Date("2026-10-25T12:00:00.000Z");
const founder = { userId: "founder", sessionId: "founder-session" }, owner = { userId: "owner", sessionId: "owner-session" }, sales = { userId: "sales", sessionId: "sales-session" };
const invitation = { tokenHash: "token", expiresAt: future };
function fixture(status = "active") {
 const memory = new PreparedTransactionDatabase();
 for (const userId of ["founder", "owner", "sales", "recipient", "foreign"]) {
  memory.seed("user", { id: userId, role: userId === "founder" ? "admin" : "seller", suspendedAt: null, deletionScheduledAt: null });
  memory.seed("session", { id: `${userId}-session`, userId, expiresAt: future, adminTotpExpiresAt: future });
 }
 memory.seed("staffGrant", { userId: "founder", capability: "founder.admission", revokedAt: null }, { userId: "founder", capability: "founder.recovery", revokedAt: null });
 memory.seed("dealership", { id: "business", name: "Business", slug: "business", status, admissionMode: "checked", admittedAt: now, cityId: null }, { id: "foreign-business", name: "Foreign", status: "active", admissionMode: "synthetic", admittedAt: null });
 memory.seed("dealershipMember", { id: "owner-member", userId: "owner", dealershipId: "business", role: "owner", status: "active" }, { id: "sales-member", userId: "sales", dealershipId: "business", role: "sales", status: "active" });
 memory.seed("measurementState", { key: "collector", epoch: "epoch" }, { key: "inventory_baseline:epoch", epoch: "proof" });
 return { memory, repository: new PrismaBusinessRepository(memory.client) };
}
describe("Business transaction entry and ordinary outcomes", () => {
 it("admits only a Business and owner invitation, leaving membership to recipient consent", async () => {
  const { memory, repository } = fixture();
  const result = await repository.admit({ ...founder, ...invitation, ownerUserId: "recipient", name: "New Business", slug: "new-business", mode: "checked", evidence: "checked evidence", reason: "Admission" }, now);
  expect(memory.rows("dealership").find(b => b["id"] === result.businessId)).toMatchObject({ status: "recovery", admittedAt: now });
  expect(memory.rows("dealershipInvitation")).toMatchObject([{ id: result.invitationId, recipientUserId: "recipient", role: "owner", redeemedAt: null }]);
  expect(memory.rows("dealershipMember").map(m => m["userId"])).toEqual(["owner", "sales"]);
  expect(memory.rows("auditLog")).toMatchObject([{ actorId: "founder", action: "BUSINESS_ADMITTED", targetId: result.businessId }]);
 });
 it("replaces pending Sales invitations and revokes exactly the selected invitation", async () => {
  const { memory, repository } = fixture();
  const first = await repository.invite({ ...owner, ...invitation, businessId: "business", recipientUserId: "recipient" }, now);
  const second = await repository.invite({ ...owner, ...invitation, tokenHash: "replacement", businessId: "business", recipientUserId: "recipient" }, now);
  expect(memory.rows("dealershipInvitation").map(i => [i["id"], i["revokedAt"]])).toEqual([[first.invitationId, now], [second.invitationId, null]]);
  await repository.revoke({ ...owner, businessId: "business", invitationId: second.invitationId }, now);
  expect(memory.rows("dealershipInvitation").every(i => i["revokedAt"] === now)).toBe(true);
  expect(memory.rows("auditLog").map(a => a["action"])).toEqual(["BUSINESS_INVITATION_CREATED", "BUSINESS_INVITATION_CREATED", "BUSINESS_INVITATION_REVOKED"]);
 });
 it("redeems an owner invitation with a new membership and invalidates only the shared inventory baseline", async () => {
  const { memory, repository } = fixture("recovery");
  memory.rows("dealershipMember").splice(0, 1);
  memory.seed("dealershipInvitation", { id: "invite", dealershipId: "business", recipientUserId: "recipient", role: "owner", tokenHash: "token", expiresAt: future, redeemedAt: null, revokedAt: null });
  await repository.redeem({ userId: "recipient", sessionId: "recipient-session", tokenHash: "token" }, now);
  expect(memory.rows("dealershipMember").find(m => m["userId"] === "recipient")).toMatchObject({ dealershipId: "business", role: "owner", status: "active" });
  expect(memory.rows("dealership").map(b => b["status"])).toEqual(["active", "active"]);
  expect(memory.rows("measurementState").map(s => s["key"])).toEqual(["collector"]);
  expect(memory.rows("dealershipInvitation")[0]?.["redeemedAt"]).toEqual(now);
 });
 it("keeps owner recovery invitation-only and replaces active Sales membership only when that User redeems", async () => {
  const { memory, repository } = fixture();
  memory.rows("user").find(u => u["id"] === "owner")!["suspendedAt"] = now;
  const result = await repository.recover({ ...founder, ...invitation, businessId: "business", ownerUserId: "sales", evidence: "recovery evidence", reason: "Recovery" }, now);
  expect(memory.rows("dealershipMember").map(m => [m["id"],m["role"]])).toEqual([["sales-member", "sales"]]);
  expect(memory.rows("dealership")[0]?.["status"]).toBe("recovery");
  await repository.redeem({ ...sales, tokenHash: "token" }, now);
  const member = memory.rows("dealershipMember").find(m => m["userId"] === "sales");
  expect(member).toMatchObject({ role: "owner", status: "active" }); expect(member?.["id"]).not.toBe("sales-member");
  expect(memory.rows("dealershipInvitation").find(i => i["id"] === result.invitationId)?.["redeemedAt"]).toEqual(now);
 });
 it.each(["admit", "invite", "redeem", "recover", "settings", "changeMember"] as const)("rolls back %s when its actual audit fails", async operation => {
  const { memory, repository } = fixture();
  memory.rows("user").find(u => u["id"] === "owner")!["suspendedAt"] = operation === "recover" ? now : null;
  memory.seed("dealershipInvitation", { id: "invite", dealershipId: "business", recipientUserId: "recipient", role: "sales", tokenHash: "token", expiresAt: future, redeemedAt: null, revokedAt: null });
  const before = memory.snapshot(); memory.failAudit = true;
  const work = operation === "admit" ? repository.admit({ ...founder, ...invitation, ownerUserId: "recipient", name: "New", slug: "new", mode: "synthetic", evidence: "synthetic", reason: "Admission" }, now)
   : operation === "invite" ? repository.invite({ ...owner, ...invitation, businessId: "business", recipientUserId: "recipient" }, now)
   : operation === "redeem" ? repository.redeem({ userId: "recipient", sessionId: "recipient-session", tokenHash: "token" }, now)
   : operation === "recover" ? repository.recover({ ...founder, ...invitation, businessId: "business", ownerUserId: "recipient", evidence: "recovery", reason: "Recovery" }, now)
   : operation === "settings" ? repository.settings({ ...owner, businessId: "business", name: "Renamed", cityId: null }, now)
   : repository.changeMember({ ...owner, businessId: "business", targetUserId: "sales", action: "remove" }, now);
  await expect(work).rejects.toThrow("audit_failed"); expect(memory.snapshot()).toEqual(before);
 });
 it("retains suspended Business, active owner, invalid recipient and sole-owner refusals", async () => {
  const { memory, repository } = fixture("suspended");
  const before = memory.snapshot();
  await expect(repository.recover({ ...founder, ...invitation, businessId: "business", ownerUserId: "recipient", evidence: "evidence", reason: "Recovery" }, now)).rejects.toMatchObject({ reason: "RECOVERY_REQUIRED" });
  memory.rows("user").find(u => u["id"] === "owner")!["suspendedAt"] = now;
  await expect(repository.recover({ ...founder, ...invitation, businessId: "business", ownerUserId: "recipient", evidence: "evidence", reason: "Recovery" }, now)).rejects.toMatchObject({ reason: "BUSINESS_INACTIVE" });
  expect(memory.rows("auditLog")).toEqual([]); expect(memory.rows("dealershipMember")).toEqual(before["dealershipMember"]);
 });
 it("recovers an absent owner without fabricating membership or deleting foreign baseline state", async () => {
  const { memory, repository } = fixture("recovery"); memory.rows("dealershipMember").splice(0, 1);
  memory.seed("measurementState", { key: "inventory_baseline:foreign", epoch: "foreign" });
  await repository.recover({ ...founder, ...invitation, businessId: "business", ownerUserId: "recipient", evidence: "checked recovery", reason: "Recovery" }, now);
  expect(memory.rows("dealershipMember").map(m => m["userId"])).toEqual(["sales"]);
  expect(memory.rows("dealershipInvitation")).toMatchObject([{ role: "owner", redeemedAt: null }]);
  expect(memory.rows("measurementState").map(r => r["key"])).toEqual(["collector", "inventory_baseline:foreign"]);
 });
 it("refuses an owner suspended after discovery without changing settings", async () => {
  const { memory, repository } = fixture(); memory.beforePrepared = () => { memory.rows("user").find(u => u["id"] === "owner")!["suspendedAt"] = now; };
  await expect(repository.settings({ ...owner, businessId: "business", name: "Renamed" }, now)).rejects.toMatchObject({ reason: "USER_INACTIVE" });
  expect(memory.rows("dealership")[0]?.["name"]).toBe("Business"); expect(memory.rows("auditLog")).toEqual([]);
 });

});
