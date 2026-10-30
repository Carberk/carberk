import { Optional , Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ListingOwnership, assertListingOwnership } from "./ListingOwnership";

import {
  LISTING_DRAFT_REPOSITORY,
  type ListingDraftRepository,
} from "../domain/ports/ListingDraftRepository";

export interface DiscardDraftInput {
  draftId: string;
  userId: string;
  sessionId?: string | undefined;
  businessId?: string | undefined;
}

@Injectable()
export class DiscardDraft {
  constructor(
    @Inject(LISTING_DRAFT_REPOSITORY)
    private readonly drafts: ListingDraftRepository,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async execute(input: DiscardDraftInput): Promise<void> {
    const existing = await this.drafts.findById(input.draftId);
    if (!existing) {
      throw new NotFoundException("Draft not found");
    }
    if (!existing.businessId && existing.userId !== input.userId) throw new NotFoundException("Draft not found");
    await assertListingOwnership(this.ownership, input, existing);

    await this.drafts.delete(input.draftId, input);
  }
}
