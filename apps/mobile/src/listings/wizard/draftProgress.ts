import { WizardSchemas } from "@auto-tm/contracts";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { completedSteps } from "./wizardMachine";

/** The wizard's data steps; Review only checks them. */
const DATA_STEPS = WizardSchemas.WIZARD_STEPS.filter((step) => step !== "review");

export interface DraftProgress {
  filled: number;
  total: number;
  percent: number;
}

/**
 * How far a saved draft is, using the wizard resume rule: each data step
 * whose saved fields validate counts, regardless of stored step metadata.
 */
export function draftProgress(payload: ListingsSchemas.ListingDraft["payload"]): DraftProgress {
  const filled = completedSteps(payload).length;
  const total = DATA_STEPS.length;
  return { filled, total, percent: Math.round((filled / total) * 100) };
}
