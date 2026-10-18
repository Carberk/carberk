import type { PublicMarketplaceSchemas } from "@auto-tm/contracts";
import type { PublicMarketplaceReadPort } from "../../domain/ports/PublicMarketplaceReadPort";
export class InMemoryPublicMarketplace implements PublicMarketplaceReadPort {
 readonly businesses = new Map<string, PublicMarketplaceSchemas.PublicBusiness>();
 async businessIdentities(ids: string[]) { return new Map([...this.businesses].filter(([id]) => ids.includes(id))); }
 async listing() { return null; }
 async showroom() { return null; }
}
