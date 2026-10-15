"use server";

import { unstable_rethrow } from "next/navigation";
import { CatalogSchemas } from "@auto-tm/contracts";

import { rejectExpiredSession } from "@/lib/action-session";
import { apiFetch, ApiError } from "@/lib/api-client";

type BrandSummary = CatalogSchemas.BrandSummary;
type BrandSummaryListResponse = CatalogSchemas.BrandSummaryListResponse;
type SetBrandLogoResponse = CatalogSchemas.SetBrandLogoResponse;
type PresignBrandLogoResponse = CatalogSchemas.PresignBrandLogoResponse;

export type BrandLogoActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_PAGES = 20;

const BRAND_LOGO_MAX_KB = CatalogSchemas.BRAND_LOGO_MAX_BYTES / 1024;

const REJECTION_MESSAGES: Record<CatalogSchemas.BrandLogoRejectionReason, string> = {
  LOGO_UNSUPPORTED_TYPE: "Загрузите файл SVG, PNG или WebP.",
  LOGO_TOO_LARGE: `Файл больше ${BRAND_LOGO_MAX_KB} КБ.`,
  LOGO_EMPTY: "Файл пустой.",
  LOGO_UNREADABLE: "Файл не читается как изображение.",
  LOGO_TYPE_MISMATCH: "Содержимое файла не совпадает с его типом.",
  LOGO_NOT_SQUARE: "Логотип должен быть почти квадратным (стороны не больше 1:1,25).",
  LOGO_UNSAFE_SVG:
    "SVG содержит DOCTYPE, элементы с префиксом пространства имён, скрипты, обработчики событий, внешние ссылки или встроенное содержимое.",
  LOGO_UPLOAD_MISSING: "Загруженный файл не найден. Попробуйте ещё раз.",
};

function toError(err: unknown): { ok: false; error: string } {
  unstable_rethrow(err);
  if (err instanceof ApiError) {
    const reason = (err.responseBody as { details?: { reason?: string } } | undefined)?.details
      ?.reason;
    const known = CatalogSchemas.BrandLogoRejectionReasonSchema.safeParse(reason);
    if (known.success) {
      return { ok: false, error: REJECTION_MESSAGES[known.data] };
    }
    if (err.status === 403) return { ok: false, error: "Недостаточно прав." };
    if (err.status === 404) return { ok: false, error: "Бренд не найден." };
    return { ok: false, error: "Временно недоступно. Попробуйте ещё раз." };
  }
  return { ok: false, error: "Неизвестная ошибка. Попробуйте позже." };
}

/** Every brand, following the catalog cursor until the last page. */
export async function listAllBrands(): Promise<BrandLogoActionResult<BrandSummary[]>> {
  await rejectExpiredSession();
  const brands: BrandSummary[] = [];
  let cursor: string | null = null;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ locale: "ru", limit: "500" });
      if (cursor) params.set("cursor", cursor);
      const data: BrandSummaryListResponse = await apiFetch<BrandSummaryListResponse>(
        `/catalog/brands?${params.toString()}`,
      );
      brands.push(...data.items);
      if (!data.hasMore || !data.nextCursor) break;
      cursor = data.nextCursor;
    }
    return { ok: true, data: brands };
  } catch (err) {
    return toError(err);
  }
}

export async function uploadBrandLogo(
  brandId: string,
  formData: FormData,
): Promise<BrandLogoActionResult<SetBrandLogoResponse>> {
  await rejectExpiredSession();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Выберите файл логотипа." };
  }
  if (!CatalogSchemas.BrandLogoContentTypeSchema.safeParse(file.type).success) {
    return { ok: false, error: REJECTION_MESSAGES.LOGO_UNSUPPORTED_TYPE };
  }
  if (file.size > CatalogSchemas.BRAND_LOGO_MAX_BYTES) {
    return { ok: false, error: REJECTION_MESSAGES.LOGO_TOO_LARGE };
  }

  try {
    const brandPath = `/admin/catalog/brands/${encodeURIComponent(brandId)}/logo`;
    // ADR-0008: the file goes to storage through a presigned PUT, then the API
    // reads it back to validate it and make it the logo.
    const presigned = await apiFetch<PresignBrandLogoResponse>(`${brandPath}/presign`, {
      method: "POST",
      body: { contentType: file.type, sizeBytes: file.size },
    });
    const put = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: presigned.headers,
      body: new Uint8Array(await file.arrayBuffer()),
    });
    if (!put.ok) {
      return { ok: false, error: "Не удалось загрузить файл в хранилище. Попробуйте ещё раз." };
    }
    const data = await apiFetch<SetBrandLogoResponse>(brandPath, {
      method: "PUT",
      body: { key: presigned.key },
    });
    return { ok: true, data };
  } catch (err) {
    return toError(err);
  }
}

export async function removeBrandLogo(
  brandId: string,
): Promise<BrandLogoActionResult<{ success: boolean }>> {
  await rejectExpiredSession();
  try {
    const data = await apiFetch<{ success: boolean }>(
      `/admin/catalog/brands/${encodeURIComponent(brandId)}/logo`,
      { method: "DELETE" },
    );
    return { ok: true, data };
  } catch (err) {
    return toError(err);
  }
}
