import { describe, expect, it } from "vitest";
import { RemoveUserPhoto } from "./RemoveUserPhoto";
import { PrismaProfilePhotoLink } from "../../listings/infrastructure/PrismaProfilePhotoLink";
import { PrismaUploadClaims } from "../../listings/infrastructure/PrismaUploadClaims";
import { PrismaContentReportRepository } from "../infrastructure/PrismaContentReportRepository";
import { PrismaAuditLogRepository } from "../infrastructure/PrismaAuditLogRepository";
import { avatarDatabase, clock, NOW, identityPorts } from "../../listings/application/testing/AvatarContactDatabase";
import type { ProfilePhotoPort } from "../../identity/identity.public";

const input = { userId: "seller", adminUserId: "admin", reason: "Offensive photo" };
function setup(report = false) {
  const db = avatarDatabase();
  if (report) db.seed("content_reports", { id: "report", reporterUserId: "foreign", targetType: "user", targetId: "seller",
    reason: "other", details: "Offensive photo", status: "pending", reviewedById: null, reviewedAt: null, createdAt: NOW, messageContext: null });
  const link = new PrismaProfilePhotoLink(db.service, new PrismaUploadClaims(db.service, clock));
  // The existing ProfilePhotoPort boundary forwards the actual release to the
  // real link/claim adapters. Adoption's storage pipeline is not under test.
  const photos: ProfilePhotoPort = { adopt: async () => { throw new Error("unused storage entry"); },
    release: async (userId, tx) => ({ removedKey: await link.unbind(userId, tx) }) };
  const useCase = new RemoveUserPhoto(db.service, identityPorts(db.service).read, photos,
    new PrismaContentReportRepository(db.service), new PrismaAuditLogRepository(db.service));
  return { db, useCase };
}

describe("RemoveUserPhoto complete production transaction at the database boundary", () => {
  it.each([false, true])("removes the photo and atomically audits it, report=%s", async report => {
    const { db, useCase } = setup(report);
    const foreign = structuredClone(db.row("media_uploads", "foreign-upload"));
    const result = await useCase.execute({ ...input, ...(report ? { reportId: "report" } : {}) });
    expect(result).toMatchObject({ targetId: "seller", targetState: { avatarKey: null, avatarIndex: 7 }, ...(report ? { reportId: "report", reportStatus: "actioned" } : {}) });
    expect(db.row("users", "seller")).toMatchObject({ avatarKey: null, avatarUploadId: null, avatarIndex: 7 });
    expect(db.row("media_uploads", "old")).toMatchObject({ state: "RETIRED" });
    expect(db.rows("media_upload_cleanups")).toHaveLength(1);
    expect(db.rows("audit_logs")).toEqual([expect.objectContaining({ id: result.auditLogId, actorId: "admin", action: "USER_PHOTO_REMOVE",
      targetId: "seller", details: { reason: "Offensive photo", avatarIndex: 7, ...(report ? { reportId: "report" } : {}),
        before: { avatarKey: "old.webp", ...(report ? { reportStatus: "pending" } : {}) }, after: { avatarKey: null, ...(report ? { reportStatus: "actioned" } : {}) } } })]);
    if (report) expect(db.row("content_reports", "report")).toMatchObject({ status: "actioned", reviewedById: "admin", reviewedAt: expect.any(Date) });
    expect(db.row("media_uploads", "foreign-upload")).toEqual(foreign);
  });
  it.each(["prepare", "retire", "cleanup", "users", "content_reports", "audit_logs", "finish"])("leaves no photo/report/audit/cleanup residue after %s refusal", async failAt => {
    const { db, useCase } = setup(true); const before = structuredClone(db.tables); db.failAt = failAt;
    await expect(useCase.execute({ ...input, reportId: "report" })).rejects.toThrow(`refused:${failAt}`);
    expect(db.tables).toEqual(before);
  });
  it("removes a suspended User's photo", async () => {
    const { db, useCase } = setup(); db.row("users", "seller")!["suspendedAt"] = NOW;
    await expect(useCase.execute(input)).resolves.toMatchObject({ targetState: { avatarKey: null, avatarIndex: 7 } });
  });
  it.each([false, true])("preserves no-photo refusal, report=%s", async report => {
    const { db, useCase } = setup(report); db.row("users", "seller")!["avatarKey"] = null;
    const before = structuredClone(db.tables);
    await expect(useCase.execute({ ...input, ...(report ? { reportId: "report" } : {}) })).rejects.toMatchObject({ response: { details: {
      reason: report ? "REPORT_TARGET_NOT_ACTIONABLE" : "MODERATION_TARGET_STATE_CONFLICT",
    } } });
    expect(db.tables).toEqual(before);
  });
  it.each([
    ["targetType", "listing", "REPORT_TARGET_MISMATCH"],
    ["targetId", "foreign", "REPORT_TARGET_MISMATCH"],
    ["status", "dismissed", "REPORT_ALREADY_RESOLVED"],
  ])("preserves %s report refusal", async (field, value, reason) => {
    const { db, useCase } = setup(true); db.row("content_reports", "report")![field] = value;
    const before = structuredClone(db.tables);
    await expect(useCase.execute({ ...input, reportId: "report" })).rejects.toMatchObject({ response: { details: { reason } } });
    expect(db.tables).toEqual(before);
  });
  it("preserves missing User and missing report 404", async () => {
    const { db, useCase } = setup(); const before = structuredClone(db.tables);
    await expect(useCase.execute({ ...input, userId: "missing" })).rejects.toMatchObject({ status: 404 });
    await expect(useCase.execute({ ...input, reportId: "missing" })).rejects.toMatchObject({ status: 404 });
    expect(db.tables).toEqual(before);
  });
  it("preserves admin target and self-moderation refusal", async () => {
    const { db, useCase } = setup(); const before = structuredClone(db.tables);
    await expect(useCase.execute({ ...input, userId: "admin" })).rejects.toMatchObject({ response: { details: { reason: "ADMIN_TARGET_NOT_MODERATABLE" } } });
    await expect(useCase.execute({ ...input, adminUserId: "seller" })).rejects.toMatchObject({ response: { details: { reason: "SELF_MODERATION_NOT_ALLOWED" } } });
    expect(db.tables).toEqual(before);
  });
  it("refuses a photo changed during preparation and keeps all writes rolled back", async () => {
    const { db, useCase } = setup(true); const before = structuredClone(db.tables);
    db.afterPreparation = () => { Object.assign(db.row("users", "seller")!, { avatarKey: null, avatarUploadId: null }); };
    await expect(useCase.execute({ ...input, reportId: "report" })).rejects.toThrow("avatar_contact_scope_changed");
    expect(db.tables).toEqual(before);
  });
});
