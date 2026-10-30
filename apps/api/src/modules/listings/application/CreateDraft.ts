import { Optional , ConflictException, Inject, Injectable } from "@nestjs/common";
import { ListingOwnership, assertListingOwnership } from "./ListingOwnership";
import { randomUUID } from "node:crypto";
import { ListingsSchemas } from "@auto-tm/contracts";

import { ListingDraft } from "../domain/ListingDraft";
import { LISTING_ERROR_CODES } from "../domain/types";
import {
  LISTING_DRAFT_REPOSITORY,
  type ListingDraftRepository,
} from "../domain/ports/ListingDraftRepository";

export interface CreateDraftInput {
  userId: string;
  sessionId?: string | undefined;
  businessId?: string | undefined;
  initialPayload?: Record<string, unknown>;
}

export interface CreateDraftResult {
  draft: ListingDraft;
}

@Injectable()
export class CreateDraft {
  constructor(
    @Inject(LISTING_DRAFT_REPOSITORY)
    private readonly drafts: ListingDraftRepository,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async execute(input: CreateDraftInput): Promise<CreateDraftResult> {
    if (input.businessId) await assertListingOwnership(this.ownership, input, { businessId: input.businessId });
    const draft = ListingDraft.create({
      id: randomUUID(),
      userId: input.userId,
      ...(input.businessId ? { businessId: input.businessId } : {}),
      payload: input.initialPayload ?? {},
    });

    const saved = await this.drafts.saveWithinLimit(draft, ListingsSchemas.MAX_DRAFTS_PER_USER, input);
    if (!saved) {
      throw new ConflictException({
        code: LISTING_ERROR_CODES.DRAFT_LIMIT_REACHED,
        message: `A User can keep at most ${ListingsSchemas.MAX_DRAFTS_PER_USER} drafts`,
        details: { limit: ListingsSchemas.MAX_DRAFTS_PER_USER },
      });
    }
    return { draft: saved };
  }
}
