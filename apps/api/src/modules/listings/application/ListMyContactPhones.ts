import { BUSINESS_CONTACT_PHONE_REPOSITORY, type BusinessContactPhoneRepository } from "../domain/ports/BusinessContactPhoneRepository";
import { Optional , Inject, Injectable } from "@nestjs/common";
import { ListingOwnership, type ListingActor } from "./ListingOwnership";

import {
  IDENTITY_CLOCK_PORT,
  type ClockPort,
} from "../../identity/identity.public";
import {
  ACCOUNT_PHONE_PORT,
  type AccountPhonePort,
} from "../domain/ports/AccountPhonePort";
import {
  VERIFIED_CONTACT_PHONE_REPOSITORY,
  type VerifiedContactPhoneRepository,
} from "../domain/ports/VerifiedContactPhoneRepository";
import { confirmedContactPhone, type UsableContactPhone } from "./UsableContactPhone";

/**
 * The seller's numbers whose 7 days have not ended, newest confirmation first.
 * Leaves out the sign-in phone: the app reads it from `GET /api/v1/me`.
 */
@Injectable()
export class ListMyContactPhones {
  constructor(
    @Inject(VERIFIED_CONTACT_PHONE_REPOSITORY)
    private readonly confirmations: VerifiedContactPhoneRepository,
    @Inject(ACCOUNT_PHONE_PORT)
    private readonly accountPhones: AccountPhonePort,
    @Inject(IDENTITY_CLOCK_PORT)
    private readonly clock: ClockPort,
    @Optional() @Inject(BUSINESS_CONTACT_PHONE_REPOSITORY) private readonly businessPhones?: BusinessContactPhoneRepository,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async execute(input: ListingActor): Promise<{ items: UsableContactPhone[] }> {
    const now = this.clock.now();
    if (input.businessId) {
      if (!this.ownership || !this.businessPhones) throw new Error("Business contact is unavailable");
      await this.ownership.authorize(input, { businessId: input.businessId });
      const phone = await this.businessPhones.find(input.businessId);
      return { items: phone?.isReusableAt(now) ? [confirmedContactPhone(phone)] : [] };
    }
    const reusable = (await this.confirmations.listBySeller(input.userId)).filter(
      (confirmation) => confirmation.isReusableAt(now),
    );
    const isSignInPhone = await Promise.all(
      reusable.map((c) => this.accountPhones.holdsSignInPhone(input.userId, c.phone)),
    );
    return {
      items: reusable
        .filter((_, index) => !isSignInPhone[index])
        .map(confirmedContactPhone),
    };
  }
}
