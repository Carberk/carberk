import { Inject, Injectable } from "@nestjs/common";
import { IDENTITY_CHECK_PORT, IDENTITY_CLOCK_PORT, type IdentityCheckPort, type ClockPort } from "../../identity/identity.public";
import { LISTING_VIEWS_PORT, type ListingViewsPort } from "../domain/ports/ListingViewsPort";

@Injectable()
export class RecordListingView {
  constructor(
    @Inject(LISTING_VIEWS_PORT) private readonly views: ListingViewsPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly identity: IdentityCheckPort,
    @Inject(IDENTITY_CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(_input: { listingId: string; installId?: string; requestingUserId?: string }): Promise<void> {
    // Interface checkpoint: signal is not recorded yet.
  }
}
