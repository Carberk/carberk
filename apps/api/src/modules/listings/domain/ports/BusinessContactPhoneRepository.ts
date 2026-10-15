import type { VerifiedContactPhone } from "../VerifiedContactPhone";
import type { InventoryActor } from "./ListingRepository";

/** One business-owned number. Personal account proof never fills this port. */
export interface BusinessContactPhoneRepository {
  find(businessId: string, transaction?: unknown): Promise<VerifiedContactPhone | null>;
  record(confirmation: VerifiedContactPhone, actor: InventoryActor): Promise<VerifiedContactPhone>;
}
export const BUSINESS_CONTACT_PHONE_REPOSITORY = Symbol("BusinessContactPhoneRepository");
