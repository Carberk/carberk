import { describe, expect, it } from "vitest";
import { PreparedTransactionDatabase } from "../../../common/application/testing/PreparedTransactionDatabase";
import { PrismaIdentityAdminRepository } from "../../identity/infrastructure/PrismaIdentityAdminRepository";
import { PrismaIdentityReadAdapter } from "../../identity/infrastructure/PrismaIdentityReadAdapter";
import { PrismaListingsAdminRepository } from "../../listings/infrastructure/PrismaListingsAdminRepository";
import { PrismaListingsReadRepository } from "../../listings/infrastructure/PrismaListingsReadRepository";
import { PrismaConversationRepository } from "../../conversations/infrastructure/PrismaConversationRepository";
import { FakeMeasurementCommit } from "../../measurement/application/testing/FakeMeasurementCommit";
import { PrismaAuditLogRepository } from "../infrastructure/PrismaAuditLogRepository";
import { PrismaContentReportRepository } from "../infrastructure/PrismaContentReportRepository";
import { BanListing } from "./BanListing";
import { UnbanListing } from "./UnbanListing";
import { SuspendUser } from "./SuspendUser";
import { UnsuspendUser } from "./UnsuspendUser";

function fixture() {
 const memory = new PreparedTransactionDatabase(), db = memory.client;
 for (const id of ["admin", "seller", "reporter"]) memory.seed("user", { id, role: id === "admin" ? "admin" : "seller", phone: null, email: `${id}@example.test`, name: null, avatarKey: null, avatarUploadId: null, locale: "ru", suspendedAt: null, suspendedById: null, suspensionReason: null, deletionScheduledAt: null });
 memory.seed("listing", { id: "listing", sellerId: "seller", businessId: null, status: "active", deletedAt: null, vin: null, brandId: "brand", modelId: "model", year: 2020, brand: { nameRu: "Brand" }, model: { nameRu: "Model" } });
 memory.seed("session", { id: "seller-session", userId: "seller" });
 memory.seed("contentReport", { id: "report", reporterUserId: "reporter", targetType: "listing", targetId: "listing", status: "pending", reason: "spam", details: null, messageContext: null, reviewedById: null, reviewedAt: null, createdAt: new Date("2026-10-01T00:00:00Z") });
 const measurement = new FakeMeasurementCommit();
 const listingsAdmin = new PrismaListingsAdminRepository(db, measurement), identityAdmin = new PrismaIdentityAdminRepository(db);
 const listingRead = new PrismaListingsReadRepository(db, { listAll: async () => [] } as never);
 const identityRead = new PrismaIdentityReadAdapter(db), reports = new PrismaContentReportRepository(db), audits = new PrismaAuditLogRepository(db);
 return { memory, measurement, listingsAdmin, identityAdmin,
  ban: new BanListing(db, listingRead, listingsAdmin, reports, audits), unban: new UnbanListing(db, listingRead, listingsAdmin, audits),
  suspend: new SuspendUser(db, identityRead, identityAdmin, reports, audits, new PrismaConversationRepository(db)),
  unsuspend: new UnsuspendUser(db, identityRead, identityAdmin, audits) };
}
const input = { listingId: "listing", adminUserId: "admin", reason: "Reviewed spam" };
describe("caller-owned moderation transactions", () => {
 it("commits ban, report action, audit and visibility fact through the real adapters, then restores", async () => {
  const f = fixture();
  const banned = await f.ban.execute({ ...input, reportId: "report" });
  expect(f.memory.rows("listing")[0]?.["status"]).toBe("banned");
  expect(f.memory.rows("contentReport")[0]).toMatchObject({ status: "actioned", reviewedById: "admin" });
  expect(f.memory.rows("auditLog")[0]).toMatchObject({ id: banned.auditLogId, actorId: "admin", details: { reason: "Reviewed spam", before: { status: "active", reportStatus: "pending" }, after: { status: "banned", reportStatus: "actioned" } } });
  await f.unban.execute(input);
  expect(f.memory.rows("listing")[0]?.["status"]).toBe("active");
  expect(f.measurement.facts.map(fact => fact.event.eventName)).toEqual(["listing_visibility_changed", "listing_visibility_changed"]);
 });
 it.each(["ban", "unban", "suspend", "unsuspend"] as const)("rolls back actual %s mutations when the actual audit writer fails", async operation => {
  const f = fixture();
  if (operation === "unban") f.memory.rows("listing")[0]!["status"] = "banned";
  if (operation === "unsuspend") f.memory.rows("user")[1]!["suspendedAt"] = new Date("2026-10-01T00:00:00Z");
  const before = f.memory.snapshot(); f.memory.failAudit = true;
  const work = operation === "ban" ? f.ban.execute({ ...input, reportId: "report" }) : operation === "unban" ? f.unban.execute(input)
   : operation === "suspend" ? f.suspend.execute({ userId: "seller", adminUserId: "admin", reason: "Reviewed spam" }) : f.unsuspend.execute({ userId: "seller", adminUserId: "admin", reason: "Cleared" });
  await expect(work).rejects.toThrow("audit_failed"); expect(f.memory.snapshot()).toEqual(before);
 });
 it("revokes real Sessions on suspension and preserves the exact audit before/after on restoration", async () => {
  const f = fixture();
  const result = await f.suspend.execute({ userId: "seller", adminUserId: "admin", reason: "Reviewed spam" });
  expect(f.memory.rows("session")).toEqual([]);
  expect(f.memory.rows("user")[1]).toMatchObject({ suspendedAt: result.targetState.suspendedAt, suspendedById: "admin", suspensionReason: "Reviewed spam" });
  await f.unsuspend.execute({ userId: "seller", adminUserId: "admin", reason: "Cleared" });
  expect(f.memory.rows("user")[1]?.["suspendedAt"]).toBeNull();
  expect(f.memory.rows("auditLog")[1]).toMatchObject({ action: "USER_UNSUSPEND", details: { before: { suspendedAt: result.targetState.suspendedAt }, after: { suspendedAt: null }, reason: "Cleared" } });
 });
 it("refuses receipt-less and forged supplied transactions before moderation effects", async () => {
  const f = fixture(), before = f.memory.snapshot();
  await expect(f.memory.client.$transaction(tx => f.listingsAdmin.banActiveListing("listing", tx))).rejects.toThrow("diagnostic_source_receipt_required");
  await expect(f.memory.client.$transaction(tx => f.listingsAdmin.banActiveListing("listing", tx, { receiptId: "00000000-0000-4000-8000-000000000001" }))).rejects.toThrow("diagnostic_source_receipt");
  await expect(f.memory.client.$transaction(tx => f.identityAdmin.suspendUser("seller", "admin", "Spam", tx))).rejects.toThrow("diagnostic_source_receipt_required");
  expect(f.memory.snapshot()).toEqual(before);
 });
 it("keeps moderation but suppresses capture for a deletion-scheduled seller", async () => {
  const f = fixture(); f.memory.rows("user")[1]!["deletionScheduledAt"] = new Date();
  await f.ban.execute(input);
  expect(f.memory.rows("listing")[0]?.["status"]).toBe("banned"); expect(f.measurement.facts).toEqual([]);
 });
 it("refuses a report resolved after preflight without committing a Listing or audit", async () => {
  const f = fixture(); f.memory.beforePrepared = () => { f.memory.rows("contentReport")[0]!["status"] = "dismissed"; };
  await expect(f.ban.execute({ ...input, reportId: "report" })).rejects.toThrow("Report has already been resolved");
  expect(f.memory.rows("listing")[0]?.["status"]).toBe("active"); expect(f.memory.rows("auditLog")).toEqual([]);
 });
});
