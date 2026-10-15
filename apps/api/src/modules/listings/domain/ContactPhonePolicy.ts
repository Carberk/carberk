import type { BusinessContactPhoneRepository } from "./ports/BusinessContactPhoneRepository";
import type { AccountPhonePort } from "./ports/AccountPhonePort";
import type { VerifiedContactPhoneRepository } from "./ports/VerifiedContactPhoneRepository";
import type { VerifiedContactPhone } from "./VerifiedContactPhone";

/** Whether a contact phone may go on a Listing now, and why not (ADR-0081). */
export type ContactPhoneStanding =
  | { kind: "account" }
  | { kind: "confirmed"; confirmation: VerifiedContactPhone }
  | { kind: "missing" }
  | { kind: "not_confirmed" }
  | { kind: "expired" };

/**
 * The one rule publish, republish, edit and the code request use to decide
 * whether a number may go on a Listing now (ADR-0081): the seller's own
 * sign-in phone, or a number the seller confirmed in the last 7 days.
 */
export class ContactPhonePolicy {
  constructor(
    private readonly accountPhones: AccountPhonePort,
    private readonly confirmations: VerifiedContactPhoneRepository,
    private readonly businessPhones?: BusinessContactPhoneRepository,
  ) {}

  async standing(
    sellerId: string,
    phone: string | null | undefined,
    now: Date,
    businessId?: string,
    transaction?: unknown,
  ): Promise<ContactPhoneStanding> {
    if (phone == null || phone.trim() === "") return { kind: "missing" };
    if (businessId) {
      const confirmation = await this.businessPhones?.find(businessId, transaction);
      if (!confirmation || confirmation.phone !== phone) return { kind: "not_confirmed" };
      return confirmation.isReusableAt(now) ? { kind: "confirmed", confirmation } : { kind: "expired" };
    }
    if (await this.accountPhones.holdsSignInPhone(sellerId, phone)) {
      return { kind: "account" };
    }
    const confirmation = await this.confirmations.find(sellerId, phone);
    if (confirmation === null) return { kind: "not_confirmed" };
    return confirmation.isReusableAt(now)
      ? { kind: "confirmed", confirmation }
      : { kind: "expired" };
  }
}
