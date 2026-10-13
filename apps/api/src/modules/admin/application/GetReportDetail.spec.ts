import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";

import type { ContentReportRepository } from "../domain/ports/ContentReportRepository";
import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import type { IdentityUserSummary, IdentityReadPort } from "../../identity/identity.public";
import { ContentReport } from "../domain/ContentReport";

import { FakeMessageModerationReadPort } from "../../conversations/application/testing/FakeMessageModerationReadPort";
import { FakeAuditLogRepository } from "./testing/FakeAuditLogRepository";

import { GetReportDetail } from "./GetReportDetail";

class FakeContentReportRepository implements ContentReportRepository {
  reports: ContentReport[] = [];

  async save(report: ContentReport): Promise<ContentReport> {
    this.reports.push(report);
    return report;
  }

  async findById(id: string): Promise<ContentReport | null> {
    return this.reports.find((r) => r.id === id) ?? null;
  }

  async findPendingByReporterAndTarget(): Promise<ContentReport | null> {
    return null;
  }

  async findMany(): Promise<{ items: ContentReport[]; total: number }> {
    return { items: [], total: 0 };
  }

  async countPendingByTarget(_targetType: string, _targetId: string): Promise<number> {
    return 0;
  }

  async countByReporter(_reporterUserId: string): Promise<number> {
    return 0;
  }

  async updateStatus(): Promise<ContentReport> {
    throw new Error("Not implemented");
  }
}

class FakeListingsReadPort implements ListingsReadPort {
  listings: Record<string, { id: string; sellerId: string; status: string; year: number | null; brandName: string; modelName: string }> = {};

  async getListingSummary(): Promise<null> {
    return null;
  }

  async getListingSummaries(): Promise<[]> {
    return [];
  }

  async getListingAdminSummaries(ids: string[]): Promise<Array<{ id: string; sellerId: string; status: string; year: number | null; brandName: string; modelName: string }>> {
    return ids.map((id) => this.listings[id]).filter((x): x is { id: string; sellerId: string; status: string; year: number | null; brandName: string; modelName: string } => !!x);
  }

  async getListingsForOwner() {
    return { items: [] };
  }

  seed(id: string, data: { sellerId: string; status: string; year: number | null; brandName: string; modelName: string }) {
    this.listings[id] = { id, ...data };
  }
}

class FakeIdentityReadPort implements IdentityReadPort {
  users: Record<string, IdentityUserSummary> = {};

  async findUserById(id: string): Promise<IdentityUserSummary | null> {
    return this.users[id] ?? null;
  }

  async findUsersByIds(ids: string[]): Promise<Array<IdentityUserSummary>> {
    return ids.map((id) => this.users[id]).filter((x): x is IdentityUserSummary => !!x);
  }

  async findBlockedUserIds(): Promise<string[]> {
    return [];
  }

  async isUserBlockedBy(): Promise<boolean> {
    return false;
  }

  seed(id: string, user: { displayName?: string | null; role?: string; avatarKey?: string | null; avatarIndex?: number; suspendedAt?: Date | null; suspendedById?: string | null; suspensionReason?: string | null }) {
    this.users[id] = {
      id,
      displayName: user.displayName ?? null,
      nameNumber: 1000,
      avatarIndex: user.avatarIndex ?? 0,
      avatarKey: user.avatarKey ?? null,
      deleted: false,
      role: user.role ?? "buyer",
      suspendedAt: user.suspendedAt ?? null,
      suspendedById: user.suspendedById ?? null,
      suspensionReason: user.suspensionReason ?? null,
    };
  }
}

function makeReport(
  id: string,
  targetType: "listing" | "user" | "message",
  targetId: string,
  opts: { status?: string; reporterUserId?: string | null; reviewedById?: string; reason?: string; details?: string; messageContext?: ContentReport["messageContext"] } = {},
) {
  return ContentReport.reconstruct({
    id,
    reporterUserId: opts.reporterUserId === undefined ? "reporter-1" : opts.reporterUserId,
    targetType,
    targetId,
    reason: (opts.reason ?? "spam") as ContentReport["reason"],
    details: opts.details ?? null,
    status: (opts.status ?? "pending") as ContentReport["status"],
    reviewedById: opts.reviewedById ?? null,
    reviewedAt: opts.reviewedById ? new Date("2026-01-02T00:00:00Z") : null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    messageContext: opts.messageContext ?? null,
  });
}

function makeUseCase(
  repo?: FakeContentReportRepository,
  listings?: FakeListingsReadPort,
  identity?: FakeIdentityReadPort,
  messages = new FakeMessageModerationReadPort(),
  audit = new FakeAuditLogRepository(),
) {
  return new GetReportDetail(
    repo ?? new FakeContentReportRepository(),
    listings ?? new FakeListingsReadPort(),
    identity ?? new FakeIdentityReadPort(),
    messages,
    audit,
  );
}

describe("GetReportDetail", () => {
  let repo: FakeContentReportRepository;
  let listings: FakeListingsReadPort;
  let identity: FakeIdentityReadPort;

  beforeEach(() => {
    repo = new FakeContentReportRepository();
    listings = new FakeListingsReadPort();
    identity = new FakeIdentityReadPort();
  });

  it("returns 404 for missing report", async () => {
    const uc = makeUseCase(repo, listings, identity);
    await expect(uc.execute({ adminUserId: "admin-1", reportId: "missing" })).rejects.toThrow(NotFoundException);
  });

  it("returns listing report detail with live counts", async () => {
    repo.reports = [makeReport("r1", "listing", "l1")];
    listings.seed("l1", { sellerId: "s1", status: "active", year: 2020, brandName: "Toyota", modelName: "Camry" });
    identity.seed("reporter-1", { displayName: "Alice" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ adminUserId: "admin-1", reportId: "r1" });

    expect(result.id).toBe("r1");
    expect(result.target.available).toBe(true);
    expect(result.target.label).toBe("2020 Toyota Camry");
    expect(result.target.status).toBe("active");
    expect(result.reporter.available).toBe(true);
    expect(result.reporter.label).toBe("Alice");
    expect(result.pendingReportsOnTargetCount).toBe(0);
    expect(result.reportsSubmittedByReporterCount).toBe(0);
  });

  it("returns user report detail with admin-only role", async () => {
    repo.reports = [makeReport("r1", "user", "u1")];
    identity.seed("u1", { displayName: "Bob", role: "buyer" });
    identity.seed("reporter-1", { displayName: "Alice" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ adminUserId: "admin-1", reportId: "r1" });

    expect(result.target.available).toBe(true);
    expect(result.target.role).toBe("buyer");
    expect(result.target.label).toBe("Bob");
  });

  it("carries the user target's Profile Photo key", async () => {
    repo.reports = [makeReport("r1", "user", "u1")];
    identity.seed("u1", { displayName: "Bob", role: "buyer", avatarKey: "pending/u1-photo/original.webp", avatarIndex: 3 });
    identity.seed("reporter-1", { displayName: "Alice" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ adminUserId: "admin-1", reportId: "r1" });

    expect(result.target.avatarKey).toBe("pending/u1-photo/original.webp");
    expect(result.target.avatarIndex).toBe(3);
  });

  it("answers a null photo key when the user target has only the Assigned Avatar", async () => {
    repo.reports = [makeReport("r1", "user", "u1")];
    identity.seed("u1", { displayName: "Bob", role: "buyer" });
    identity.seed("reporter-1", { displayName: "Alice" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ adminUserId: "admin-1", reportId: "r1" });

    expect(result.target.avatarKey).toBeNull();
  });

  it("handles deleted reporter", async () => {
    repo.reports = [makeReport("r1", "listing", "l1", { reporterUserId: null })];
    listings.seed("l1", { sellerId: "s1", status: "active", year: 2020, brandName: "Toyota", modelName: "Camry" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ adminUserId: "admin-1", reportId: "r1" });

    expect(result.reporter.available).toBe(false);
    expect(result.reporter.label).toBe("Deleted user");
    expect(result.reportsSubmittedByReporterCount).toBeUndefined();
  });

  it("handles unavailable target", async () => {
    repo.reports = [makeReport("r1", "listing", "missing")];

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ adminUserId: "admin-1", reportId: "r1" });

    expect(result.target.available).toBe(false);
    expect(result.target.label).toBe("Unavailable target");
    expect(result.targetModerationState).toBeUndefined();
  });

  it("includes reviewer when present", async () => {
    repo.reports = [makeReport("r1", "listing", "l1", { status: "dismissed", reviewedById: "admin-1" })];
    listings.seed("l1", { sellerId: "s1", status: "active", year: 2020, brandName: "Toyota", modelName: "Camry" });
    identity.seed("admin-1", { displayName: "Admin One", role: "admin" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ adminUserId: "admin-1", reportId: "r1" });

    expect(result.reviewer).toBeDefined();
    expect(result.reviewer?.available).toBe(true);
    expect(result.reviewer?.label).toBe("Admin One");
  });

  it("handles deleted reviewer", async () => {
    repo.reports = [makeReport("r1", "listing", "l1", { status: "dismissed", reviewedById: "deleted-admin" })];
    listings.seed("l1", { sellerId: "s1", status: "active", year: 2020, brandName: "Toyota", modelName: "Camry" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ adminUserId: "admin-1", reportId: "r1" });

    expect(result.reviewer?.available).toBe(false);
    expect(result.reviewer?.label).toBe("Deleted user");
  });

  it("computes pendingReportsOnTargetCount live", async () => {
    repo.reports = [
      makeReport("r1", "listing", "l1"),
      makeReport("r2", "listing", "l1"),
      makeReport("r3", "listing", "l2"),
    ];
    repo.countPendingByTarget = async () => 2;
    listings.seed("l1", { sellerId: "s1", status: "active", year: 2020, brandName: "Toyota", modelName: "Camry" });
    identity.seed("reporter-1", { displayName: "Alice" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ adminUserId: "admin-1", reportId: "r1" });

    expect(result.pendingReportsOnTargetCount).toBe(2);
  });

  it("computes reportsSubmittedByReporterCount live", async () => {
    repo.reports = [makeReport("r1", "listing", "l1")];
    repo.countByReporter = async () => 5;
    listings.seed("l1", { sellerId: "s1", status: "active", year: 2020, brandName: "Toyota", modelName: "Camry" });
    identity.seed("reporter-1", { displayName: "Alice" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ adminUserId: "admin-1", reportId: "r1" });

    expect(result.reportsSubmittedByReporterCount).toBe(5);
  });

  it("includes target moderation state for user targets", async () => {
    repo.reports = [makeReport("r1", "user", "u1")];
    identity.seed("u1", { displayName: "Bob", role: "buyer", suspendedAt: new Date("2026-01-01T00:00:00Z"), suspendedById: "admin-1", suspensionReason: "Spam" });
    identity.seed("reporter-1", { displayName: "Alice" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ adminUserId: "admin-1", reportId: "r1" });

    expect(result.targetModerationState).toBeDefined();
    expect(result.targetModerationState?.suspendedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(result.targetModerationState?.suspendedById).toBe("admin-1");
    expect(result.targetModerationState?.suspensionReason).toBe("Spam");
  });

  it("reads only the reported Message through Conversations and audits the staff access without text", async () => {
    repo.reports = [makeReport("r1", "message", "msg-1")];
    identity.seed("sender-1", { displayName: "Bob" });
    const messages = new FakeMessageModerationReadPort();
    messages.messages["msg-1"] = {
      id: "msg-1", senderId: "sender-1", body: "Reported text", hasAttachment: true,
      createdAt: new Date("2026-01-01T12:00:00Z"), deletedAt: null,
    };
    const audit = new FakeAuditLogRepository();
    const result = await makeUseCase(repo, listings, identity, messages, audit).execute({ reportId: "r1", adminUserId: "admin-1" });
    expect(result.target).toMatchObject({ messageBody: "Reported text", messageHasAttachment: true, messageCreatedAt: new Date("2026-01-01T12:00:00Z"), sender: { available: true, label: "Bob", userId: "sender-1" } });
    expect(result).not.toHaveProperty("messageContext");
    expect(audit.rows).toMatchObject([{ actorId: "admin-1", action: "REPORTED_MESSAGE_READ", targetType: "message", targetId: "msg-1", details: { reportId: "r1", messageId: "msg-1" } }]);
    expect(JSON.stringify(audit.rows)).not.toContain("Reported text");
  });

  it("fails the sensitive read closed when the audit cannot be stored", async () => {
    repo.reports = [makeReport("r1", "message", "msg-1")];
    const audit = new FakeAuditLogRepository();
    audit.fail = true;
    await expect(makeUseCase(repo, listings, identity, new FakeMessageModerationReadPort(), audit).execute({ reportId: "r1", adminUserId: "admin-1" })).rejects.toThrow("Audit unavailable");
  });

  it("keeps deleted Messages and deleted senders explicit and hides deleted text", async () => {
    repo.reports = [makeReport("r1", "message", "msg-1")];
    identity.seed("sender-1", { displayName: "Old name" });
    identity.users["sender-1"]!.deleted = true;
    const messages = new FakeMessageModerationReadPort();
    messages.messages["msg-1"] = { id: "msg-1", senderId: "sender-1", body: "Deleted text", hasAttachment: false, createdAt: new Date(), deletedAt: new Date() };
    const result = await makeUseCase(repo, listings, identity, messages).execute({ reportId: "r1", adminUserId: "admin-1" });
    expect(result.target.messageBody).toBeUndefined();
    expect(result.target.label).toBe("Сообщение удалено");
    expect(result.target.sender).toEqual({ available: false, label: "Пользователь удалён" });
    expect(result.targetModerationState).toBeUndefined();
  });

  it("offers no sender action when a missing Message has an unrelated saved snapshot", async () => {
    repo.reports = [makeReport("r1", "message", "msg-1", { messageContext: {
      messageId: "other-message", conversationId: "conv-1", listingId: "l1", buyerId: "buyer-1", sellerId: "sender-1", senderId: "sender-1", createdAt: new Date(), body: null, deletedAt: null, surroundingMessages: [],
    } })];
    identity.seed("sender-1", { displayName: "Bob" });
    const result = await makeUseCase(repo, listings, identity).execute({ reportId: "r1", adminUserId: "admin-1" });
    expect(result.target.sender).toEqual({ available: false, label: "Пользователь удалён" });
    expect(result.targetModerationState).toBeUndefined();
  });

  it("keeps a missing Message report readable without returning its saved Conversation window", async () => {
    repo.reports = [makeReport("r1", "message", "msg-1", { messageContext: {
      messageId: "msg-1", conversationId: "conv-1", listingId: "l1", buyerId: "buyer-1", sellerId: "sender-1", senderId: "sender-1", createdAt: new Date(), body: "Old text", deletedAt: null,
      surroundingMessages: [{ id: "other", senderId: "buyer-1", body: "Private neighbour", createdAt: new Date(), deletedAt: null }],
    } })];
    identity.seed("sender-1", { displayName: "Bob" });
    const result = await makeUseCase(repo, listings, identity).execute({ reportId: "r1", adminUserId: "admin-1" });
    expect(result.target).toMatchObject({ available: false, label: "Сообщение удалено или недоступно", sender: { available: true, userId: "sender-1" } });
    expect(JSON.stringify(result)).not.toContain("Private neighbour");
    expect(result.target.messageBody).toBeUndefined();
  });
});
