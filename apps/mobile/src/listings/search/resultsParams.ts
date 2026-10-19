/**
 * The brand/model selection Results receives from the pickers, Recent, and
 * "See other Brand Model" on a closed Listing. Route params are strings, so
 * several models travel as one comma-separated value.
 */

type RawParam = string | string[] | undefined;

export interface ResultsParamsInput {
  brandId?: RawParam;
  modelIds?: RawParam;
  /** Legacy single model, still sent by "See other Brand Model". */
  modelId?: RawParam;
  openFilters?: RawParam;
}

export interface ResultsSelection {
  brandId: string;
  /** Empty means every model of the brand. */
  modelIds: string[];
  /** Open Search parameters on arrival (Model picker "More filters"). */
  openFilters: boolean;
}

export type ResultsParams = {
  brandId: string;
  modelIds?: string;
  openFilters?: "1";
};

export function buildResultsParams(
  selection: { brandId: string; modelIds: readonly string[] },
  options: { openFilters?: boolean } = {},
): ResultsParams {
  const params: ResultsParams = { brandId: selection.brandId };
  if (selection.modelIds.length > 0) params.modelIds = selection.modelIds.join(",");
  if (options.openFilters) params.openFilters = "1";
  return params;
}

function single(value: RawParam): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v ? v : undefined;
}

/** Null when there is no brand: Results then stays the full feed. */
export function parseResultsParams(params: ResultsParamsInput): ResultsSelection | null {
  const brandId = single(params.brandId);
  if (!brandId) return null;

  const listed = (single(params.modelIds) ?? "").split(",").filter(Boolean);
  const legacy = single(params.modelId);
  const modelIds = listed.length > 0 ? listed : legacy ? [legacy] : [];

  return { brandId, modelIds, openFilters: single(params.openFilters) === "1" };
}
