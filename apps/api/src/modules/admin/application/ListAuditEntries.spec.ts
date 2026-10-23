import { describe, it, expect, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";

import { FakeAuditLogRepository } from "./testing/FakeAuditLogRepository";
import type { AuditLogRow } from "../domain/ports/AuditLogRepository";
import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import type { IdentityUserSummary, IdentityReadPort } from "../../identity/identity.public";

import { ListAuditEntries } from "./ListAuditEntries";

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

  seed(id: string, user: { displayName?: string | null; role?: string; suspendedAt?: Date | null }) {
    this.users[id] = {
      id,
      displayName: user.displayName ?? null,
      nameNumber: 1000,
      avatarIndex: 0,
      avatarKey: null,
      deleted: false,
      role: user.role ?? "buyer",
      suspendedAt: user.suspendedAt ?? null,
      suspendedById: null,
      suspensionReason: null,
    };
  }
}

function makeRow(
  id: string,
  action: string,
  targetType: string,
  targetId: string,
  opts: { actorId?: string | null; details?: Record<string, unknown>; createdAt?: Date } = {},
): AuditLogRow {
  return {
    id,
    actorId: opts.actorId ?? null,
    action,
    targetType,
    targetId,
    details: opts.details ?? null,
    createdAt: opts.createdAt ?? new Date("2026-01-01T00:00:00Z"),
  };
}

function makeUseCase(
  repo?: FakeAuditLogRepository,
  listings?: FakeListingsReadPort,
  identity?: FakeIdentityReadPort,
) {
  return new ListAuditEntries(
    repo ?? new FakeAuditLogRepository(),
    listings ?? new FakeListingsReadPort(),
    identity ?? new FakeIdentityReadPort(),
  );
}

describe("ListAuditEntries", () => {
  let repo: FakeAuditLogRepository;
  let listings: FakeListingsReadPort;
  let identity: FakeIdentityReadPort;

  beforeEach(() => {
    repo = new FakeAuditLogRepository();
    listings = new FakeListingsReadPort();
    identity = new FakeIdentityReadPort();
  });

  it("preserves the released marketplace audit contract and hides purpose-private staff transitions", async () => {
    repo.rows = [makeRow("a1", "LISTING_BAN", "listing", "l1"), makeRow("a2", "STAFF_CAPABILITY_GRANTED", "User", "staff")];
    const result = await makeUseCase(repo, listings, identity).execute({});
    expect(result.items.map((row) => row.action)).toEqual(["LISTING_BAN"]);
    expect(result.total).toBe(1);
  });

  it("defaults to newest-first order", async () => {
    repo.rows = [
      makeRow("a1", "LISTING_BAN", "listing", "l1", { createdAt: new Date("2026-01-01T00:00:00Z") }),
      makeRow("a2", "LISTING_BAN", "listing", "l2", { createdAt: new Date("2026-01-02T00:00:00Z") }),
    ];

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({});

    expect(result.items[0]!.id).toBe("a2");
    expect(result.items[1]!.id).toBe("a1");
  });

  it("filters by action", async () => {
    repo.rows = [
      makeRow("a1", "LISTING_BAN", "listing", "l1"),
      makeRow("a2", "USER_SUSPEND", "user", "u1"),
    ];

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ action: "USER_SUSPEND" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("a2");
  });

  it("filters by targetType", async () => {
    repo.rows = [
      makeRow("a1", "LISTING_BAN", "listing", "l1"),
      makeRow("a2", "USER_SUSPEND", "user", "u1"),
    ];

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ targetType: "listing" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("a1");
  });

  it("filters by targetId", async () => {
    repo.rows = [
      makeRow("a1", "LISTING_BAN", "listing", "l1"),
      makeRow("a2", "LISTING_BAN", "listing", "l2"),
    ];

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ targetId: "l2" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("a2");
  });

  it("renders actorSummary for existing admin", async () => {
    repo.rows = [makeRow("a1", "LISTING_BAN", "listing", "l1", { actorId: "admin-1" })];
    identity.seed("admin-1", { displayName: "Admin One", role: "admin" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({});

    expect(result.items[0]!.actorSummary.label).toBe("Admin One");
    expect(result.items[0]!.actorSummary.id).toBe("admin-1");
  });

  it("renders Deleted admin for null actor on normal action", async () => {
    repo.rows = [makeRow("a1", "LISTING_BAN", "listing", "l1", { actorId: null })];

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({});

    expect(result.items[0]!.actorSummary.label).toBe("Deleted admin");
  });

  it("renders Operator script for ADMIN_BOOTSTRAP_PROMOTE", async () => {
    repo.rows = [makeRow("a1", "ADMIN_BOOTSTRAP_PROMOTE", "user", "u1", { actorId: null })];

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({});

    expect(result.items[0]!.actorSummary.label).toBe("Operator script");
  });

  it("renders Deleted admin for deleted actor", async () => {
    repo.rows = [makeRow("a1", "LISTING_BAN", "listing", "l1", { actorId: "deleted-admin" })];

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({});

    expect(result.items[0]!.actorSummary.label).toBe("Deleted admin");
  });

  it("tolerates missing target", async () => {
    repo.rows = [makeRow("a1", "LISTING_BAN", "listing", "missing")];

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({});

    expect(result.items[0]!.targetLabel).toBeUndefined();
  });

  it("resolves listing target label", async () => {
    repo.rows = [makeRow("a1", "LISTING_BAN", "listing", "l1")];
    listings.seed("l1", { sellerId: "s1", status: "banned", year: 2020, brandName: "Toyota", modelName: "Camry" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({});

    expect(result.items[0]!.targetLabel).toBe("2020 Toyota Camry");
  });

  it("resolves user target label", async () => {
    repo.rows = [makeRow("a1", "USER_SUSPEND", "user", "u1")];
    identity.seed("u1", { displayName: "Alice" });

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({});

    expect(result.items[0]!.targetLabel).toBe("Alice");
  });

  it("includes reasonPreview from details", async () => {
    repo.rows = [makeRow("a1", "LISTING_BAN", "listing", "l1", { details: { reason: "Spam\ncontent" } })];

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({});

    expect(result.items[0]!.reasonPreview).toBe("Spam content");
  });

  it("returns 400 for invalid action", async () => {
    const uc = makeUseCase(repo, listings, identity);
    await expect(uc.execute({ action: "INVALID_ACTION" })).rejects.toThrow(BadRequestException);
  });

  it("returns 400 for invalid targetType", async () => {
    const uc = makeUseCase(repo, listings, identity);
    await expect(uc.execute({ targetType: "invalid" })).rejects.toThrow(BadRequestException);
  });

  it("returns 400 for invalid page", async () => {
    const uc = makeUseCase(repo, listings, identity);
    await expect(uc.execute({ page: 0 })).rejects.toThrow(BadRequestException);
  });

  it("returns empty rows for out-of-range page", async () => {
    repo.rows = [makeRow("a1", "LISTING_BAN", "listing", "l1")];

    const uc = makeUseCase(repo, listings, identity);
    const result = await uc.execute({ page: 5 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(1);
  });
});
