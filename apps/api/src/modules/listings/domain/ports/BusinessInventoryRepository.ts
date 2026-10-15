import type { InventoryActor } from "./ListingRepository";
export interface BusinessInventorySnapshot {
  businessId: string;
  status: "active" | "suspended" | "recovery";
  listings: Array<{ id: string; status: string; brandId: string; modelId: string; year: number | null; publishedAt: string | null; availabilityConfirmedAt: string | null; reviewDue: boolean }>;
  drafts: Array<{ id: string; userId: string; businessId: string; payload: Record<string, unknown>; createdAt: string; updatedAt: string }>;
  counts: { active: number; sold: number; archived: number; banned: number; drafts: number; reviewDue: number };
}
export interface BusinessInventoryRepository {
  read(actor: InventoryActor): Promise<BusinessInventorySnapshot>;
  confirmAvailability(actor: InventoryActor, listingId: string): Promise<void>;
  publicBusiness(businessId: string): Promise<{ id: string; name: string; status: string; createdAt: Date } | null>;
}
export const BUSINESS_INVENTORY_REPOSITORY = Symbol("BusinessInventoryRepository");
