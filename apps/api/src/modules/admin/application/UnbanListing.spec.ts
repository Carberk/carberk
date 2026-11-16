import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, ConflictException } from "@nestjs/common";

import { UnbanListing } from "./UnbanListing";
import { FakeModerationUnitOfWork } from "./testing/FakeModerationUnitOfWork";
import type { AuditLogRepository, AuditLogRow } from "../domain/ports/AuditLogRepository";
import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import type { ListingsAdminPort } from "../../listings/domain/ports/ListingsAdminPort";
import { AdminSchemas } from "@auto-tm/contracts";

class FakeAuditLogRepository implements AuditLogRepository {
  rows: AuditLogRow[] = [];

  async findMany(): Promise<{ items: AuditLogRow[]; total: number }> {
    return { items: [], total: 0 };
  }

  async create(
    data: {
      actorId: string | null;
      action: string;
      targetType: string;
      targetId: string;
      details?: Record<string, unknown> | null;
    },
  ): Promise<AuditLogRow> {
    const row: AuditLogRow = {
      id: `audit-${this.rows.length + 1}`,
      actorId: data.actorId,
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId,
      details: data.details ?? null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
}

class FakeListingsReadPort implements ListingsReadPort {
  listings: Record<
    string,
    { id: string; sellerId: string; status: string; year: number | null; brandName: string; modelName: string }
  > = {};

  async getListingSummary(): Promise<null> {
    return null;
  }

  async getListingSummaries(): Promise<[]> {
    return [];
  }

  async getListingAdminSummaries(
    ids: string[],
  ): Promise<Array<{ id: string; sellerId: string; status: string; year: number | null; brandName: string; modelName: string }>> {
    return ids.map((id) => this.listings[id]).filter((x): x is { id: string; sellerId: string; status: string; year: number | null; brandName: string; modelName: string } => !!x);
  }

  async getListingsForOwner() {
    return { items: [] };
  }

  seed(id: string, data: { sellerId: string; status: string }) {
    this.listings[id] = {
      id,
      sellerId: data.sellerId,
      status: data.status,
      year: null,
      brandName: "Toyota",
      modelName: "Camry",
    };
  }
}

class FakeListingsAdminPort implements ListingsAdminPort {
  states: Record<string, string> = {};

  async banActiveListing(listingId: string): Promise<{ status: string }> {
    this.states[listingId] = "banned";
    return { status: "banned" };
  }

  async unbanBannedListing(listingId: string): Promise<{ status: string }> {
    if (this.states[listingId] !== "banned") {
      throw new Error("Listing is not banned");
    }
    this.states[listingId] = "active";
    return { status: "active" };
  }

  seed(id: string, status: string) {
    this.states[id] = status;
  }
}

function makeUseCase(
  listingsRead = new FakeListingsReadPort(),
  listingsAdmin = new FakeListingsAdminPort(),
  auditRepo = new FakeAuditLogRepository(),
) {
  return new UnbanListing(
    new FakeModerationUnitOfWork({ listings: listingsAdmin, audit: auditRepo }),
    listingsRead,
  );
}

describe("UnbanListing", () => {
  let listingsRead: FakeListingsReadPort;
  let listingsAdmin: FakeListingsAdminPort;
  let auditRepo: FakeAuditLogRepository;

  beforeEach(() => {
    listingsRead = new FakeListingsReadPort();
    listingsAdmin = new FakeListingsAdminPort();
    auditRepo = new FakeAuditLogRepository();
  });

  it("unbans a banned listing and writes audit", async () => {
    listingsRead.seed("l1", { sellerId: "s1", status: "banned" });
    listingsAdmin.seed("l1", "banned");

    const uc = makeUseCase(listingsRead, listingsAdmin, auditRepo);
    const result = await uc.execute({
      listingId: "l1",
      adminUserId: "admin-1",
      reason: "Mistake",
    });

    expect(result.targetId).toBe("l1");
    expect(result.targetState.status).toBe("active");
    expect(result.auditLogId).toBeDefined();
    expect(auditRepo.rows).toHaveLength(1);
    expect(auditRepo.rows[0]!.action).toBe(AdminSchemas.AdminAuditAction.ListingUnban);
    expect(auditRepo.rows[0]!.details).toMatchObject({
      reason: "Mistake",
      before: { status: "banned" },
      after: { status: "active" },
    });
  });

  it("returns NOT_FOUND for missing listing", async () => {
    const uc = makeUseCase(listingsRead, listingsAdmin, auditRepo);
    await expect(
      uc.execute({ listingId: "missing", adminUserId: "admin-1", reason: "Mistake" }),
    ).rejects.toThrow(NotFoundException);
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns MODERATION_TARGET_STATE_CONFLICT for non-banned listing", async () => {
    listingsRead.seed("l1", { sellerId: "s1", status: "active" });

    const uc = makeUseCase(listingsRead, listingsAdmin, auditRepo);
    try {
      await uc.execute({ listingId: "l1", adminUserId: "admin-1", reason: "Mistake" });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as ConflictException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response["code"]).toBe("CONFLICT");
      expect(response["details"]).toMatchObject({
        reason: AdminSchemas.AdminErrorReason.ModerationTargetStateConflict,
      });
    }
    expect(auditRepo.rows).toHaveLength(0);
  });
});
