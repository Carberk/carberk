import { z } from "../zod";

import {
  MIN_LISTING_PHOTOS,
  MAX_LISTING_PHOTOS,
  ListingDraftPayloadSchema,
  CurrencySchema,
  ListingConditionSchema,
  DraftPhotoSchema,
  DraftConditionDisclosureSchema,
} from "./listings";
import { PHONE_TM_PATTERN } from "./auth";

// ── Wizard step enum ──
// Seven steps in founder order (#354 D2): Car (`vehicle`, VIN included),
// Details and condition (`specs`), Photos, Price, Description and place
// (`location`, description included), Contact, Check and publish (`review`).
// The eight-step wizard's `vin` step no longer exists.

export const WizardStepSchema = z.enum([
  "vehicle",
  "specs",
  "photos",
  "price",
  "location",
  "contact",
  "review",
]);
export type WizardStep = z.infer<typeof WizardStepSchema>;

export const WIZARD_STEPS: WizardStep[] = [...WizardStepSchema.options];

// ── Validation message keys ──
// Step schemas emit stable dotted keys, not English prose, so every client can
// render them in the user's own language. See ADR-0050. The keys are namespaced
// under `wizardErrors.` and the numeric limits below are exported so clients can
// interpolate them without duplicating the constants.

export const WIZARD_ERROR_KEY_PREFIX = "wizardErrors.";

const CURRENT_YEAR = new Date().getFullYear();

export const WIZARD_LIMITS = {
  vinMaxLength: 17,
  yearMin: 1900,
  yearMax: CURRENT_YEAR + 1,
  priceMax: 999_999_999,
  locationTextMaxLength: 200,
  descriptionMaxLength: 2000,
} as const;

const WIZARD_ERROR_NAMES = [
  "required",
  "invalidValue",
  "unknownStep",
  "vinTooLong",
  "vinInvalid",
  "photosRequired",
  "brandRequired",
  "modelRequired",
  "yearRequired",
  "yearWholeNumber",
  "yearTooEarly",
  "yearTooLate",
  "mileageNegative",
  "enginePowerNotPositive",
  "mileageRequiredForUsed",
  "damagedRequired",
  "damagedNotForNew",
  "priceRequired",
  "priceNotPositive",
  "priceTooLarge",
  "regionRequired",
  "cityRequired",
  "locationTextTooLong",
  "descriptionRequired",
  "descriptionTooLong",
  "contactChannelRequired",
  // Upload publish-gate blockers. The mobile upload queue emits these, not
  // validateStep, but they share the namespace and the translation table.
  "uploadsInProgress",
  "uploadsFailed",
  "noPhotoAttached",
] as const;

type WizardErrorName = (typeof WIZARD_ERROR_NAMES)[number];
export type WizardErrorKey = `${typeof WIZARD_ERROR_KEY_PREFIX}${WizardErrorName}`;

/** Every wizard error key, by name — the single source clients import from. */
export const WIZARD_ERROR_KEYS = Object.fromEntries(
  WIZARD_ERROR_NAMES.map((name) => [name, `${WIZARD_ERROR_KEY_PREFIX}${name}`]),
) as { readonly [N in WizardErrorName]: `${typeof WIZARD_ERROR_KEY_PREFIX}${N}` };

const ALL_WIZARD_ERROR_KEYS: ReadonlySet<string> = new Set(Object.values(WIZARD_ERROR_KEYS));

export function isWizardErrorKey(message: string): message is WizardErrorKey {
  return ALL_WIZARD_ERROR_KEYS.has(message);
}

const KEY = WIZARD_ERROR_KEYS;

// ── Per-step validation schemas ──
// Each schema validates exactly the fields required for its step.
// They are refinements of ListingDraftPayloadSchema — partial, step-scoped.

// Continue needs three picked photos, not one uploaded photo (#584): uploads keep
// running while the seller fills in the later steps. The mobile client lists every
// picked photo here, key or not, but saves only photos that have a key into the
// draft, and Publish still requires three keyed photos.
export const StepPhotosSchema = z.object({
  photos: z
    .array(DraftPhotoSchema, { error: (issue) => issue.input === undefined ? KEY.photosRequired : undefined })
    .min(MIN_LISTING_PHOTOS, KEY.photosRequired)
    .max(MAX_LISTING_PHOTOS),
});
export type StepPhotosInput = z.infer<typeof StepPhotosSchema>;

export const VinSchema = z.string()
  // Only ASCII letters normalise; Unicode lookalikes must remain invalid.
  .transform((vin) => vin.replace(/[a-z]/g, (letter) => letter.toUpperCase()))
  .pipe(z.string()
    .max(WIZARD_LIMITS.vinMaxLength, KEY.vinTooLong)
    // Keep the existing length error alone when max() already rejects the value.
    .refine(
      (vin) => vin.length > WIZARD_LIMITS.vinMaxLength || /^(?:[A-HJ-NPR-Z0-9]{17})?$/.test(vin),
      KEY.vinInvalid,
    ))
  // null is a cleared VIN on the draft update; validate and store it like absence.
  .nullish();

export const StepVehicleSchema = z.object({
  brandId: z.string({ error: (issue) => issue.input === undefined ? KEY.brandRequired : undefined }).guid({ message: KEY.brandRequired }),
  modelId: z.string({ error: (issue) => issue.input === undefined ? KEY.modelRequired : undefined }).guid({ message: KEY.modelRequired }),
  generationId: z.string().guid().optional(),
  year: z
    .number({ error: KEY.yearRequired })
    .int(KEY.yearWholeNumber)
    .min(WIZARD_LIMITS.yearMin, KEY.yearTooEarly)
    .max(WIZARD_LIMITS.yearMax, KEY.yearTooLate),
  vin: VinSchema,
});
export type StepVehicleInput = z.infer<typeof StepVehicleSchema>;

export const StepSpecsSchema = z
  .object({
    condition: ListingConditionSchema,
    mileageKm: z.number().int().nonnegative(KEY.mileageNegative).optional(),
    colorId: z.string().guid().optional(),
    bodyTypeId: z.string().guid().optional(),
    transmissionId: z.string().guid().optional(),
    driveTypeId: z.string().guid().optional(),
    engineTypeId: z.string().guid().optional(),
    enginePower: z.number().int().positive(KEY.enginePowerNotPositive).optional(),
    conditionDisclosure: DraftConditionDisclosureSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.condition === "used") {
        return data.mileageKm !== undefined;
      }
      return true;
    },
    { message: KEY.mileageRequiredForUsed, path: ["mileageKm"] },
  )
  // ADR-0080: only a Used car is asked Damaged; a New car is never damaged.
  .refine((data) => data.condition === "new" || data.conditionDisclosure?.damaged !== undefined, {
    message: KEY.damagedRequired,
    path: ["conditionDisclosure", "damaged"],
  })
  .refine((data) => data.condition !== "new" || data.conditionDisclosure?.damaged !== true, {
    message: KEY.damagedNotForNew,
    path: ["conditionDisclosure", "damaged"],
  });
export type StepSpecsInput = z.infer<typeof StepSpecsSchema>;

export const StepPriceSchema = z.object({
  priceAmount: z
    .number({ error: KEY.priceRequired })
    .positive(KEY.priceNotPositive)
    .max(WIZARD_LIMITS.priceMax, KEY.priceTooLarge),
  priceCurrency: CurrencySchema,
  acceptsExchange: z.boolean().optional(),
  installmentAvailable: z.boolean().optional(),
});
export type StepPriceInput = z.infer<typeof StepPriceSchema>;

export const StepLocationSchema = z.object({
  description: z
    .string({ error: (issue) => issue.input === undefined ? KEY.descriptionRequired : undefined })
    .min(1, KEY.descriptionRequired)
    .max(WIZARD_LIMITS.descriptionMaxLength, KEY.descriptionTooLong),
  regionId: z.string({ error: (issue) => issue.input === undefined ? KEY.regionRequired : undefined }).guid({ message: KEY.regionRequired }),
  cityId: z.string({ error: (issue) => issue.input === undefined ? KEY.cityRequired : undefined }).guid({ message: KEY.cityRequired }),
  locationText: z
    .string()
    .max(WIZARD_LIMITS.locationTextMaxLength, KEY.locationTextTooLong)
    .optional(),
});
export type StepLocationInput = z.infer<typeof StepLocationSchema>;

export const StepContactSchema = z
  .object({
    // Required even when calls are off (D7). The same rule as `PhoneTm`, with
    // translatable keys; whether the number is confirmed is the server's check
    // on publish, not this schema's (ADR-0081).
    contactPhone: z
      .string({ error: KEY.required })
      .regex(PHONE_TM_PATTERN, KEY.invalidValue),
    allowCalls: z.boolean(),
    allowChat: z.boolean(),
  })
  .refine(
    (data) => data.allowCalls || data.allowChat,
    {
      message: KEY.contactChannelRequired,
      path: ["allowCalls"],
    },
  );
export type StepContactInput = z.infer<typeof StepContactSchema>;

// Review step is a summary — has no fields of its own. Always validates true;
// the wizard machine guards Publish on all prior steps being validated.
export const StepReviewSchema = z.object({});
export type StepReviewInput = z.infer<typeof StepReviewSchema>;

// ── Step dependency graph ──
// Maps each step to the steps that must be valid before it can be reached.
// Used for navigation gating and invalidation cascading.

// Every step depends on all earlier ones.
const STEP_DEPENDENCIES = Object.fromEntries(
  WIZARD_STEPS.map((step, index) => [step, WIZARD_STEPS.slice(0, index)]),
) as Record<WizardStep, WizardStep[]>;

export function getStepDependencies(step: WizardStep): WizardStep[] {
  return STEP_DEPENDENCIES[step];
}

// ── Step invalidation rules ──
// Maps a changed field to the steps that become invalid when that field changes.
// A field change invalidates its own step and all downstream steps that depend on it.

const FIELD_TO_STEP: Record<string, WizardStep> = {
  vin: "vehicle",
  photos: "photos",
  brandId: "vehicle",
  modelId: "vehicle",
  generationId: "vehicle",
  year: "vehicle",
  condition: "specs",
  mileageKm: "specs",
  conditionDisclosure: "specs",
  colorId: "specs",
  bodyTypeId: "specs",
  transmissionId: "specs",
  driveTypeId: "specs",
  engineTypeId: "specs",
  enginePower: "specs",
  priceAmount: "price",
  priceCurrency: "price",
  acceptsExchange: "price",
  installmentAvailable: "price",
  regionId: "location",
  cityId: "location",
  locationText: "location",
  description: "location",
  contactPhone: "contact",
  allowCalls: "contact",
  allowChat: "contact",
};

/**
 * Given a set of changed fields, return the steps that should be invalidated.
 * Includes the step owning each field plus all downstream steps.
 */
export function getInvalidatedSteps(changedFields: string[]): WizardStep[] {
  const affected = new Set<WizardStep>();

  for (const field of changedFields) {
    const step = FIELD_TO_STEP[field];
    if (!step) continue;
    affected.add(step);

    // All steps that depend on this step are also invalidated
    for (const s of WIZARD_STEPS) {
      if (STEP_DEPENDENCIES[s].includes(step)) {
        affected.add(s);
      }
    }
  }

  // Preserve order
  return WIZARD_STEPS.filter((s) => affected.has(s));
}

// ── Step validator ──

export interface StepValidationResult {
  valid: boolean;
  /** Flat list of error messages — kept for API endpoint compatibility. */
  errors: string[];
  /**
   * First error per field, keyed by the Zod issue's top-level path segment.
   * Mobile UI consumes this to render inline errors directly under each field.
   * Schema-level issues with no path land under the empty-string key.
   */
  fieldErrors: Record<string, string>;
}

/**
 * Turns Zod's own built-in messages into wizard error keys. Schema-level
 * messages take precedence over this map, so it only covers the issues we
 * never spelled out: a missing field becomes `required`, and anything else
 * (a wrong type, a malformed uuid, a fractional number, an unknown enum
 * value) becomes `invalidValue`. Zod's English defaults never escape.
 */
const wizardErrorMap: z.ZodErrorMap = (issue) => {
  if ((issue.code === "invalid_type" || issue.code === "invalid_value") && issue.input === undefined) {
    return { message: KEY.required };
  }
  return { message: KEY.invalidValue };
};

const parseOptions = { error: wizardErrorMap };

/**
 * Validate a single wizard step against a draft payload.
 * Returns client-side validation result (no server calls).
 *
 * Messages are `wizardErrors.*` keys, not display text — clients translate
 * them (ADR-0050). `WIZARD_LIMITS` carries the numbers the length and range
 * messages interpolate.
 */
export function validateStep(
  step: WizardStep,
  payload: z.infer<typeof ListingDraftPayloadSchema>,
): StepValidationResult {
  let result: z.ZodSafeParseResult<unknown>;

  switch (step) {
    case "photos":
      result = StepPhotosSchema.safeParse(payload, parseOptions);
      break;
    case "vehicle":
      result = StepVehicleSchema.safeParse(payload, parseOptions);
      break;
    case "specs":
      result = StepSpecsSchema.safeParse(payload, parseOptions);
      break;
    case "price":
      result = StepPriceSchema.safeParse(payload, parseOptions);
      break;
    case "location":
      result = StepLocationSchema.safeParse(payload, parseOptions);
      break;
    case "contact":
      result = StepContactSchema.safeParse(payload, parseOptions);
      break;
    case "review":
      // Review has no fields; it's gated by prior steps being validated.
      result = StepReviewSchema.safeParse(payload, parseOptions);
      break;
    default:
      return { valid: false, errors: [KEY.unknownStep], fieldErrors: {} };
  }

  if (result.success) {
    return { valid: true, errors: [], fieldErrors: {} };
  }

  const errors: string[] = [];
  const fieldErrors: Record<string, string> = {};
  const fieldErrorDepth: Record<string, number> = {};
  for (const issue of result.error.issues) {
    // A message set directly on a check bypasses the error map, so enforce
    // the keys-only contract here as well.
    const message = isWizardErrorKey(issue.message) ? issue.message : KEY.invalidValue;
    errors.push(message);
    const key = (issue.path[0] ?? "").toString();
    // Prefer a direct field error over nested item errors. Zod 3 reported
    // array-level constraints before item details; keeping that precedence
    // preserves the existing wizard key for short, malformed collections.
    if (
      !(key in fieldErrors) ||
      issue.path.length < (fieldErrorDepth[key] ?? Number.POSITIVE_INFINITY)
    ) {
      fieldErrors[key] = message;
      fieldErrorDepth[key] = issue.path.length;
    }
  }
  return { valid: false, errors, fieldErrors };
}

// ── Draft payload extension ──
// Backward-compatible: adds validatedSteps alongside existing currentStep.

export const WizardDraftPayloadSchema = ListingDraftPayloadSchema.extend({
  validatedSteps: z.array(WizardStepSchema).optional(),
});
export type WizardDraftPayload = z.infer<typeof WizardDraftPayloadSchema>;

// ── Validate-step request / response ──

export const ValidateStepRequestSchema = z.object({
  step: WizardStepSchema,
  payload: WizardDraftPayloadSchema,
});
export type ValidateStepRequest = z.infer<typeof ValidateStepRequestSchema>;

export const ValidateStepResponseSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  fieldErrors: z.record(z.string(), z.string()).optional(),
  invalidatedSteps: z.array(WizardStepSchema),
});
export type ValidateStepResponse = z.infer<typeof ValidateStepResponseSchema>;
