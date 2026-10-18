import type { PublicMarketplaceSchemas } from "@auto-tm/contracts";

/** Anonymous whitelist. Never includes membership, identity evidence or private reports. */
export interface PublicMarketplaceReadPort {
 businessIdentities(ids: string[]): Promise<Map<string, PublicMarketplaceSchemas.PublicBusiness>>;
 listing(id: string): Promise<PublicMarketplaceSchemas.PublicListing | null>;
 showroom(id: string, cursor?: string): Promise<PublicMarketplaceSchemas.PublicShowroom | null>;
}
export const PUBLIC_MARKETPLACE_READ_PORT = Symbol("PublicMarketplaceReadPort");
