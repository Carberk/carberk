import { ListingsSchemas } from "@auto-tm/contracts";
import type { TFunction } from "i18next";

import { ApiError } from "../../api/client";
import { isUncertainWrite } from "../../api/uncertainWrite";

/** Why a publish did not go through, as Check and publish words it. */
export type PublishFailure = "offline" | "uncertain" | "rateMissing" | "photos" | "photoUnavailable" | "server";

/**
 * Sorts a publish error into the three failures Check and publish explains. The
 * server's own message is never shown.
 *
 * The contact phone (#593, ADR-0056): `CONTACT_PHONE_NOT_CONFIRMED` and
 * `CONTACT_PHONE_REQUIRED` are not sorted here. The route catches them before
 * calling this and sends the seller to Contact, so they never reach Check.
 */
export function publishFailureOf(error: unknown): PublishFailure {
  if (isUncertainWrite(error)) return "uncertain";
  if (error instanceof ApiError) {
    const details = error.details as { formErrors?: unknown } | undefined;
    if (error.code === ListingsSchemas.ListingsErrorCode.PhotoMinimumRequired ||
      (error.code === "INVALID_DRAFT_PAYLOAD" && Array.isArray(details?.formErrors) &&
        details.formErrors.some((code) => code === "AT_LEAST_THREE_PHOTOS_REQUIRED" || code === "AT_LEAST_ONE_PHOTO_REQUIRED"))) return "photos";
    if (error.code === "NETWORK_ERROR" || error.status === 0) return "offline";
    if (error.code === ListingsSchemas.ListingsErrorCode.ExchangeRateMissing) return "rateMissing";
    // #735: the photo's upload is gone (retired); the seller re-adds that photo.
    if (error.code === ListingsSchemas.ListingsErrorCode.UploadNotAvailable ||
      error.code === ListingsSchemas.ListingsErrorCode.UploadObjectInvalid) return "photoUnavailable";
  }
  return "server";
}

/** The line shown above Publish. `currency` is the draft's, for the missing-rate message. */
export function publishFailureMessage(t: TFunction, failure: PublishFailure | null, currency = "USD"): string {
  if (failure === "uncertain") return t("publishResultUncertain");
  if (failure === "photos") return t("wizardErrors.photosRequired", { minimum: ListingsSchemas.MIN_LISTING_PHOTOS });
  if (failure === "offline") return t("publishErrorOffline");
  if (failure === "rateMissing") return t("publishErrorRateMissing", { currency });
  if (failure === "photoUnavailable") return t("publishErrorPhotoUnavailable");
  return t("publishErrorServer");
}
