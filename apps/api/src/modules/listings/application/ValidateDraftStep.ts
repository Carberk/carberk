import { Optional , Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ListingOwnership, assertListingOwnership } from "./ListingOwnership";

import {
  WizardSchemas,
  type ListingsSchemas,
} from "@auto-tm/contracts";

import {
  LISTING_DRAFT_REPOSITORY,
  type ListingDraftRepository,
} from "../domain/ports/ListingDraftRepository";

export interface ValidateDraftStepInput {
  draftId: string;
  userId: string;
  sessionId?: string | undefined;
  businessId?: string | undefined;
  step: WizardSchemas.WizardStep;
  payload: ListingsSchemas.ListingDraftPayload;
}

export interface ValidateDraftStepResult {
  valid: boolean;
  errors: string[];
  invalidatedSteps: WizardSchemas.WizardStep[];
}

@Injectable()
export class ValidateDraftStep {
  constructor(
    @Inject(LISTING_DRAFT_REPOSITORY)
    private readonly drafts: ListingDraftRepository,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async execute(input: ValidateDraftStepInput): Promise<ValidateDraftStepResult> {
    const existing = await this.drafts.findById(input.draftId);
    if (!existing) {
      throw new NotFoundException("Draft not found");
    }
    if (!existing.businessId && existing.userId !== input.userId) throw new NotFoundException("Resource not found");
    await assertListingOwnership(this.ownership, input, existing);

    const validation = WizardSchemas.validateStep(input.step, input.payload);

    // Compute which steps would be invalidated if this payload were saved
    const changedFields = this.detectChangedFields(
      existing.payload as ListingsSchemas.ListingDraftPayload,
      input.payload,
    );
    const invalidatedSteps =
      changedFields.length > 0
        ? WizardSchemas.getInvalidatedSteps(changedFields)
        : [];

    return {
      valid: validation.valid,
      errors: validation.errors,
      invalidatedSteps,
    };
  }

  private detectChangedFields(
    oldPayload: ListingsSchemas.ListingDraftPayload,
    newPayload: ListingsSchemas.ListingDraftPayload,
  ): string[] {
    const changed: string[] = [];
    const relevantKeys = new Set([
      ...Object.keys(oldPayload),
      ...Object.keys(newPayload),
    ]);

    for (const key of [...relevantKeys] as (keyof ListingsSchemas.ListingDraftPayload)[]) {
      if (JSON.stringify(oldPayload[key]) !== JSON.stringify(newPayload[key])) {
        changed.push(key);
      }
    }

    return changed;
  }
}
