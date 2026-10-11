import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import {
  WizardSchemas,
  type ListingsSchemas,
} from "@auto-tm/contracts";

import type { ListingDraft } from "../domain/ListingDraft";
import {
  LISTING_DRAFT_REPOSITORY,
  type ListingDraftRepository,
} from "../domain/ports/ListingDraftRepository";

import { MEDIA_UPLOAD_REPOSITORY, type MediaUploadRepository } from "../domain/ports/MediaUploadRepository";

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
    @Inject(MEDIA_UPLOAD_REPOSITORY)
    private readonly uploads: MediaUploadRepository,
  ) {}

  async execute(input: UpdateDraftInput): Promise<UpdateDraftResult> {
    const existing = await this.drafts.findById(input.draftId);
    if (!existing || existing.userId !== input.userId) {
      throw new NotFoundException("Draft not found");
    }

    const oldPayload = existing.payload as ListingsSchemas.ListingDraftPayload & {
      validatedSteps?: WizardSchemas.WizardStep[];
    };

    const payload = await this.canonicalizePhotoAliases(input.payload, oldPayload, input.userId);

    // Detect changed fields (excluding metadata)
    const changedFields = this.detectChangedFields(oldPayload, payload);

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
      ...payload,
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

  /** Old autosaves may still carry JPEG keys after the operator converted them. */
  private async canonicalizePhotoAliases(payload: ListingsSchemas.ListingDraftPayload, stored: ListingsSchemas.ListingDraftPayload, userId: string) {
    if (!payload.photos?.some((photo) => photo.key?.endsWith(".jpg"))) return payload;
    const candidates = payload.photos.flatMap((photo) => photo.key && /^pending\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/original\.jpg$/.test(photo.key) ? [photo.key.replace(/\.jpg$/, ".webp")] : []);
    const uploads = candidates.length ? await this.uploads.findByKeys(candidates) : [];
    const photos = payload.photos.map((photo) => {
      if (!photo.key?.endsWith(".jpg")) return photo;
      const canonical = photo.key.replace(/\.jpg$/, ".webp");
      const knownDraftPhoto = stored.photos?.some((existing) => existing.photoId === photo.photoId && existing.key === canonical);
      const ownedUpload = uploads.some((upload) => upload.key === canonical && upload.userId === userId && upload.kind === "image" && upload.contentType === "image/webp" && upload.state === "AVAILABLE" && !upload.adopted);
      if (!knownDraftPhoto && !ownedUpload) throw new BadRequestException({ code: "INVALID_DRAFT_PAYLOAD", message: "Photo reference is no longer available" });
      return { ...photo, key: canonical };
    });
    return { ...payload, photos };
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
