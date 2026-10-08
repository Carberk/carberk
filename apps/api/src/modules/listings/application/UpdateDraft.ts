import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import {
  WizardSchemas,
  type ListingsSchemas,
} from "@auto-tm/contracts";

import type { ListingDraft } from "../domain/ListingDraft";
import {
  LISTING_DRAFT_REPOSITORY,
  type ListingDraftRepository,
} from "../domain/ports/ListingDraftRepository";

export interface UpdateDraftInput {
  draftId: string;
  userId: string;
  payload: ListingsSchemas.ListingDraftPayload;
}

export interface UpdateDraftResult {
  draft: ListingDraft;
}

@Injectable()
export class UpdateDraft {
  constructor(
    @Inject(LISTING_DRAFT_REPOSITORY)
    private readonly drafts: ListingDraftRepository,
  ) {}

  async execute(input: UpdateDraftInput): Promise<UpdateDraftResult> {
    const existing = await this.drafts.findById(input.draftId);
    if (!existing || existing.userId !== input.userId) {
      throw new NotFoundException("Draft not found");
    }

    const oldPayload = existing.payload as ListingsSchemas.ListingDraftPayload & {
      validatedSteps?: WizardSchemas.WizardStep[];
    };

    // Detect changed fields (excluding metadata)
    const changedFields = this.detectChangedFields(oldPayload, input.payload);

    // Compute invalidated steps and filter validatedSteps
    const existingValidated = oldPayload.validatedSteps ?? [];
    const clientValidated = (input.payload.validatedSteps as WizardSchemas.WizardStep[] | undefined) ?? existingValidated;
    const invalidatedSteps =
      changedFields.length > 0
        ? WizardSchemas.getInvalidatedSteps(changedFields)
        : [];
    // Drafts saved by the eight-step wizard may still name its `vin` step.
    const newValidatedSteps = clientValidated.filter(
      (s): s is WizardSchemas.WizardStep =>
        WizardSchemas.WIZARD_STEPS.includes(s) && !invalidatedSteps.includes(s),
    );

    // Merge payload: keep all existing fields, overwrite with new ones,
    // update validatedSteps to the recomputed set
    const mergedPayload = {
      ...oldPayload,
      ...input.payload,
      validatedSteps: newValidatedSteps,
    };
    // An explicit null VIN clears the stored one; a missing key keeps it.
    if (input.payload.vin === null) {
      delete (mergedPayload as Record<string, unknown>)["vin"];
    }

    const updated = existing.updatePayload(mergedPayload, new Date());
    const saved = await this.drafts.update(updated);
    return { draft: saved };
  }

  private detectChangedFields(
    oldPayload: Record<string, unknown>,
    newPayload: Record<string, unknown>,
  ): string[] {
    const changed: string[] = [];
    const relevantKeys = new Set([
      ...Object.keys(oldPayload),
      ...Object.keys(newPayload),
    ]);

    for (const key of relevantKeys) {
      if (key === "validatedSteps" || key === "currentStep") continue;
      if (JSON.stringify(oldPayload[key]) !== JSON.stringify(newPayload[key])) {
        changed.push(key);
      }
    }

    return changed;
  }
}
