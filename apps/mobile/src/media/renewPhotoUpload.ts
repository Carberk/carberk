import { UploadsSchemas } from "@auto-tm/contracts";

import { captureRouteSnapshot } from "../api/routes";
import { buildOriginalUrl } from "../listings/detail/buildVariantUrl";
import { ApiError, apiClient } from "../api/client";

import { photoRequest } from "./photoRoute";

export async function renewPhotoUpload(grant: UploadsSchemas.PresignResponse, sizeBytes: number, assertSession?: () => Promise<unknown>, route = captureRouteSnapshot()): Promise<UploadsSchemas.PresignResponse | null> {
  try {
    const renewed = await apiClient.post("/uploads/renew", { key: grant.key, contentType: "image/webp", sizeBytes }, UploadsSchemas.PresignResponseSchema, { assertSession });
    if (renewed.key !== grant.key) throw new ApiError("CONTRACT_VIOLATION", 502);
    return renewed;
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "UPLOAD_NOT_AVAILABLE") throw error;
    await assertSession?.();
    const request = await photoRequest(buildOriginalUrl(grant.key), {}, route);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try { response = await fetch(request.uri, { method: "HEAD", headers: request.headers, redirect: "error", signal: controller.signal }); }
    finally { clearTimeout(timer); }
    await assertSession?.();
    if (response.ok && response.headers.get("content-type") === "image/webp" && response.headers.get("content-length") === String(sizeBytes)) return null;
    throw error;
  }
}
