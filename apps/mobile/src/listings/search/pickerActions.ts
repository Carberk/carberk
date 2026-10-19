import type { BrandModelChoice } from "./recentSearches";
import { buildResultsParams, type ResultsParams } from "./resultsParams";

export const BRANDS_PATH = "/(tabs)/(search)/brands";
export const MODELS_PATH = "/(tabs)/(search)/models";
export const RESULTS_PATH = "/(tabs)/(search)/results";

export interface PickedBrand {
  id: string;
  name: string;
}

export type PickerHref =
  | typeof BRANDS_PATH
  | { pathname: typeof MODELS_PATH; params: { brandId: string; modelIds?: string } }
  | { pathname: typeof RESULTS_PATH; params: ResultsParams };

/** The part of expo-router's router the pickers use; tests pass a fake. */
export interface PickerRouter {
  push(href: PickerHref): void;
  dismissAll(): void;
  dismissTo(href: PickerHref): void;
  canDismiss(): boolean;
}

/**
 * What the Brand and Model pickers do when the buyer acts. The pickers only
 * render and call these; where each action leads depends on where they were
 * opened from.
 *
 * - `show` (from Home or Results): pushed routes. The Model picker ends with
 *   "Show N listings" and offers "More filters"; the Brand picker offers Recent.
 * - `done` (from Search parameters): steps inside the form. The Model picker
 *   ends with "Done" and hands the choice back to the form.
 */
export interface PickerActions {
  mode: "show" | "done";
  pickBrand(brand: PickedBrand): void;
  /** "Show N listings" or "Done". Saves the choice to Recent. */
  confirm(choice: BrandModelChoice): void;
  changeBrand(): void;
  moreFilters?: (choice: BrandModelChoice) => void;
  pickRecent?: (choice: BrandModelChoice) => void;
}

type RecordChoice = (choice: BrandModelChoice) => void;

export function modelsHref(brandId: string, modelIds: readonly string[] = []): PickerHref {
  return {
    pathname: MODELS_PATH,
    params: modelIds.length > 0 ? { brandId, modelIds: modelIds.join(",") } : { brandId },
  };
}

/**
 * Opens Results with the pickers taken off the stack, so Back from Results
 * goes to where the buyer started (Home) rather than into the pickers.
 */
function openResults(
  router: PickerRouter,
  choice: BrandModelChoice,
  options: { openFilters?: boolean } = {},
) {
  if (router.canDismiss()) router.dismissAll();
  router.push({ pathname: RESULTS_PATH, params: buildResultsParams(choice, options) });
}

export function createRoutePickerActions({
  router,
  record,
}: {
  router: PickerRouter;
  record: RecordChoice;
}): PickerActions {
  return {
    mode: "show",
    pickBrand: (brand) => router.push(modelsHref(brand.id)),
    confirm(choice) {
      record(choice);
      openResults(router, choice);
    },
    // Search parameters is still the Results filter sheet until its own
    // full-screen form lands (#371), so "More filters" opens Results with the
    // sheet open and the brand and models filled in.
    moreFilters: (choice) => openResults(router, choice, { openFilters: true }),
    changeBrand: () => router.dismissTo(BRANDS_PATH),
    pickRecent(choice) {
      record(choice);
      openResults(router, choice);
    },
  };
}

export type DonePickerStep = { step: "brand" } | { step: "model"; brand: PickedBrand };

export function createDonePickerActions({
  setStep,
  onDone,
  record,
}: {
  setStep: (step: DonePickerStep) => void;
  onDone: (choice: BrandModelChoice) => void;
  record: RecordChoice;
}): PickerActions {
  return {
    mode: "done",
    pickBrand: (brand) => setStep({ step: "model", brand }),
    confirm(choice) {
      record(choice);
      onDone(choice);
    },
    changeBrand: () => setStep({ step: "brand" }),
  };
}
