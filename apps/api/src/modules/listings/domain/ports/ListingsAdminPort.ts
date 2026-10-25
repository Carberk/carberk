export interface ListingsAdminPort {
  banActiveListing(listingId: string, tx?: unknown, receipt?: unknown): Promise<{ status: string }>;
  unbanBannedListing(listingId: string, tx?: unknown, receipt?: unknown): Promise<{ status: string }>;
}

export const LISTINGS_ADMIN_PORT = Symbol("ListingsAdminPort");
