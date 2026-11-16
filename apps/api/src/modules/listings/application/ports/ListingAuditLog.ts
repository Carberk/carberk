import type { Currency } from "../../domain/types";
import type { ListingStatus } from "../../domain/ListingStatus";

export type ListingAuditEntry = {
  actorId: string;
  targetId: string;
  targetType: "Listing";
} & (
  | { action: "listing.archived"; details: { previousStatus: ListingStatus } }
  | { action: "listing.deleted"; details: { status: ListingStatus; mediaCount: number } }
  | { action: "listing.marked_sold"; details: { priceAmount: number; priceCurrency: Currency; daysActive: number } }
  | { action: "listing.price_changed"; details: { oldPriceAmount: number; oldPriceCurrency: Currency; newPriceAmount: number; newPriceCurrency: Currency } }
  | { action: "listing.republished"; details: { previousArchivedAt: string | null } }
);

export interface ListingAuditLog {
  record(entry: ListingAuditEntry): Promise<void>;
}

export const LISTING_AUDIT_LOG = Symbol("ListingAuditLog");
