import { Enums, WizardSchemas } from "@auto-tm/contracts";

const {
  WIZARD_STEPS,
  validateStep,
  getStepDependencies,
  getInvalidatedSteps,
} = WizardSchemas;

export type WizardMachineStep = WizardSchemas.WizardStep;

export type WizardMachineStatus =
  | "idle"
  | "loading"
  | "step"
  | "publishing"
  | "publishError"
  | "complete";

export interface WizardMachineState {
  status: WizardMachineStatus;
  draftId: string | null;
  listingId: string | null;
  mode: "create" | "edit";
  editEntryAtReview: boolean;
  currentStep: WizardMachineStep;
  payload: WizardSchemas.WizardDraftPayload;
  validatedSteps: WizardSchemas.WizardStep[];
  saveError: string | null;
  publishError: string | null;
  completedListingId: string | null;
}

export interface WizardMachineContext {
  state: WizardMachineState;
  canContinue: boolean;
  canPublish: boolean;
  canGoBack: boolean;
  editDetourActive: boolean;
  stepErrors: string[];
  fieldErrors: Record<string, string>;
  isLastStep: boolean;
  progressPercent: number;
  stepNumber: number;
  stepCount: number;
}

// ── Actions ──

export type WizardMachineAction =
  | {
      type: "INIT";
      draftId: string | null;
      listingId?: string | null;
      payload: WizardSchemas.WizardDraftPayload;
      mode?: "create" | "edit";
      entryStep?: WizardMachineStep;
    }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "UPDATE_FIELDS"; updates: Partial<WizardSchemas.WizardDraftPayload> }
  | { type: "GO_TO_STEP"; step: WizardMachineStep }
  | { type: "PUBLISH_START" }
  | { type: "PUBLISH_SUCCESS"; listingId: string }
  | { type: "PUBLISH_ERROR"; error: string }
  | { type: "DISCARD" };

// ── Helpers ──

function stepIndex(step: WizardMachineStep): number {
  return WIZARD_STEPS.indexOf(step);
}

function getStepAtIndex(index: number): WizardMachineStep {
  const clamped = Math.max(0, Math.min(index, WIZARD_STEPS.length - 1));
  return WIZARD_STEPS[clamped] ?? "vehicle";
}

function isStepValid(
  step: WizardSchemas.WizardStep,
  payload: WizardSchemas.WizardDraftPayload,
): boolean {
  return validateStep(step, payload).valid;
}

/** Data steps are every step except the trailing review summary. */
const DATA_STEPS: WizardSchemas.WizardStep[] = WIZARD_STEPS.filter(
  (s) => s !== "review",
);

function computeValidatedSteps(
  payload: WizardSchemas.WizardDraftPayload,
  previouslyValidated: WizardSchemas.WizardStep[],
): WizardSchemas.WizardStep[] {
  return previouslyValidated.filter((step) => isStepValid(step, payload));
}

/**
 * Completion comes from the saved fields, not from stored step names, so a
 * draft saved by the eight-step wizard (whose names and order differ) resumes
 * correctly: every data step whose schema passes counts as complete.
 */
function completedSteps(
  payload: WizardSchemas.WizardDraftPayload,
): WizardSchemas.WizardStep[] {
  return DATA_STEPS.filter((step) => isStepValid(step, payload));
}

// ── Initial state ──

export function createInitialState(): WizardMachineState {
  return {
    status: "idle",
    draftId: null,
    listingId: null,
    mode: "create",
    editEntryAtReview: false,
    currentStep: "vehicle",
    payload: {},
    validatedSteps: [],
    saveError: null,
    publishError: null,
    completedListingId: null,
  };
}

// ── Reducer ──

export function wizardMachineReducer(
  state: WizardMachineState,
  action: WizardMachineAction,
): WizardMachineState {
  switch (action.type) {
    case "INIT": {
      const mode = action.mode ?? "create";
      const payload =
        mode === "create"
          ? {
              ...action.payload,
              condition: action.payload.condition ?? Enums.ListingCondition.Used,
            }
          : action.payload;
      const validatedSteps = completedSteps(payload);

      if (mode === "edit" && action.entryStep === "review") {
        return {
          ...state,
          status: "step",
          draftId: action.draftId,
          listingId: action.listingId ?? null,
          mode,
          editEntryAtReview: true,
          payload,
          validatedSteps: DATA_STEPS,
          currentStep: payload.conditionDisclosure?.damaged === undefined ? "specs" : "review",
          saveError: null,
          publishError: null,
        };
      }

      // Resume at the first incomplete step up to the entry step; with no
      // entry step, at the first incomplete step or at review when all are done.
      // `currentStep` in the payload is not a real position yet; a later slice
      // saves the step the seller left.
      const target: WizardMachineStep = action.entryStep ?? "review";
      const resumeStep =
        WIZARD_STEPS.slice(0, stepIndex(target)).find(
          (step) => !validatedSteps.includes(step),
        ) ?? target;

      return {
        ...state,
        status: "step",
        draftId: action.draftId,
        listingId: action.listingId ?? null,
        mode,
        editEntryAtReview: false,
        payload,
        validatedSteps,
        currentStep: resumeStep,
        saveError: null,
        publishError: null,
      };
    }

    case "NEXT": {
      if (state.status !== "step") return state;

      const currentIdx = stepIndex(state.currentStep);
      const isLast = currentIdx >= WIZARD_STEPS.length - 1;

      // Review has no fields of its own; advancing FROM review means Publish,
      // which is handled by handlePublish, not NEXT.
      if (state.currentStep === "review") return state;

      const validation = validateStep(state.currentStep, state.payload);
      if (!validation.valid) {
        return { ...state, status: "step" };
      }

      const newValidated = state.validatedSteps.includes(state.currentStep)
        ? state.validatedSteps
        : [...state.validatedSteps, state.currentStep];

      if (isLast) {
        return { ...state, validatedSteps: newValidated, saveError: null };
      }

      return {
        ...state,
        currentStep: getStepAtIndex(currentIdx + 1),
        validatedSteps: newValidated,
        saveError: null,
      };
    }

    case "BACK": {
      if (state.status !== "step") return state;
      const currentIdx = stepIndex(state.currentStep);
      if (currentIdx <= 0) return state;
      return {
        ...state,
        currentStep: getStepAtIndex(currentIdx - 1),
        saveError: null,
      };
    }

    case "UPDATE_FIELDS": {
      const newPayload = { ...state.payload, ...action.updates };

      const changedFields = Object.keys(action.updates).filter(
        (key) =>
          key !== "validatedSteps" &&
          key !== "currentStep" &&
          JSON.stringify(state.payload[key as keyof typeof state.payload]) !==
            JSON.stringify(action.updates[key as keyof typeof action.updates]),
      );

      if (changedFields.length === 0) {
        return state;
      }

      const invalidated = getInvalidatedSteps(changedFields);

      const newValidatedSteps =
        state.mode === "edit"
          ? computeValidatedSteps(newPayload, DATA_STEPS)
          : state.validatedSteps.filter((s) => !invalidated.includes(s));

      return {
        ...state,
        payload: newPayload,
        validatedSteps: newValidatedSteps,
        saveError: null,
      };
    }

    case "GO_TO_STEP": {
      if (state.status !== "step") return state;

      const targetIdx = stepIndex(action.step);
      const currentIdx = stepIndex(state.currentStep);

      // Always allow going backward
      if (targetIdx < currentIdx) {
        return { ...state, currentStep: action.step, saveError: null };
      }

      // Going forward: target's dependencies must all be validated
      const deps = getStepDependencies(action.step);
      const allDepsValid = deps.every((d) => state.validatedSteps.includes(d));
      if (!allDepsValid) return state;

      return { ...state, currentStep: action.step, saveError: null };
    }

    case "PUBLISH_START": {
      if (state.status !== "step") return state;
      return { ...state, status: "publishing", publishError: null };
    }

    case "PUBLISH_SUCCESS": {
      if (state.status !== "publishing") return state;
      return {
        ...state,
        status: "complete",
        completedListingId: action.listingId,
        publishError: null,
      };
    }

    case "PUBLISH_ERROR": {
      if (state.status !== "publishing") return state;
      return { ...state, status: "publishError", publishError: action.error };
    }

    case "DISCARD": {
      return createInitialState();
    }

    default:
      return state;
  }
}

// ── Selectors ──

export function buildMachineContext(
  state: WizardMachineState,
): WizardMachineContext {
  const currentIdx = stepIndex(state.currentStep);
  const isLastStep = state.currentStep === "review";
  const editDetourActive = state.mode === "edit" && !isLastStep;

  const validation = validateStep(state.currentStep, state.payload);

  // Continue is enabled when the current step's fields are valid.
  // On review, Continue is irrelevant — Publish is the action.
  const canContinue = isLastStep ? false : validation.valid;

  // Publish requires all DATA steps validated (review has no fields of its own).
  const canPublish =
    isLastStep && DATA_STEPS.every((s) => state.validatedSteps.includes(s));

  const canGoBack =
    state.mode === "edit"
      ? false
      : currentIdx > 0 && state.status === "step";

  // Position-based progress: where in the wizard am I right now.
  const stepNumber = currentIdx + 1;
  const stepCount = WIZARD_STEPS.length;
  const progressPercent = (stepNumber / stepCount) * 100;

  return {
    state,
    canContinue,
    canPublish,
    canGoBack,
    editDetourActive,
    stepErrors: validation.errors,
    fieldErrors: validation.fieldErrors,
    isLastStep,
    progressPercent,
    stepNumber,
    stepCount,
  };
}
