import { WizardSchemas } from "@auto-tm/contracts";
import { describe, expect, it } from "vitest";

import { draftProgress } from "./draftProgress";
import { createInitialState, wizardMachineReducer } from "./wizardMachine";

const id = "550e8400-e29b-41d4-a716-446655440000";
const contact = { contactPhone: "+99361234567", allowCalls: true, allowChat: true };
const completePayload = {
  brandId: id, modelId: id, year: 2020,
  condition: "used" as const, mileageKm: 10000, conditionDisclosure: { damaged: false },
  photos: [0, 1, 2].map((index) => ({ photoId: index === 0 ? id : `550e8400-e29b-41d4-a716-${String(900 + index).padStart(12, "0")}`, key: index === 0 ? "pending/car.webp" : `support-${index}.webp`, sortOrder: index })),
  priceAmount: 100000, priceCurrency: "TMT" as const,
  regionId: id, cityId: id, description: "Great car",
  ...contact,
};

describe("draftProgress", () => {
  it("counts filled fields saved without Continue, out of the seven steps the wizard header counts", () => {
    expect(WizardSchemas.WIZARD_STEPS).toEqual([
      "vehicle", "specs", "photos", "price", "location", "contact", "review",
    ]);
    expect(draftProgress(completePayload)).toEqual({ filled: 6, total: 7, percent: 86 });
    const resumed = wizardMachineReducer(createInitialState(), {
      type: "INIT", draftId: id, payload: completePayload,
    });
    expect(resumed.currentStep).toBe("review");
    expect(draftProgress(completePayload).filled).toBe(resumed.validatedSteps.length);
  });

  it.each([1, 7, 8])("ignores legacy currentStep %s and incorrect stored steps", (currentStep) => {
    expect(draftProgress({ ...completePayload, currentStep, validatedSteps: [] })).toEqual({
      filled: 6, total: 7, percent: 86,
    });
    expect(draftProgress({ currentStep, validatedSteps: ["vin", "review", "vehicle", "gone"] }))
      .toEqual({ filled: 0, total: 7, percent: 0 });
  });

  it.each([{}, { brandId: id }, { priceCurrency: "TMT" as const }])(
    "counts no complete step for an empty or partial payload %j", (payload) => {
      expect(draftProgress(payload)).toEqual({ filled: 0, total: 7, percent: 0 });
    },
  );

  it("counts valid default Contact even without seller input or a stored step", () => {
    expect(draftProgress(contact)).toEqual({ filled: 1, total: 7, percent: 14 });
  });

  it.each([
    { year: 1800 },
    { vin: "X".repeat(18) },
    { conditionDisclosure: {} },
    { photos: [] },
    { priceAmount: 0 },
    { description: "" },
    { contactPhone: "invalid" },
    { allowCalls: false, allowChat: false },
  ])("removes a step when its fields become invalid: %j", (updates) => {
    expect(draftProgress({
      ...completePayload, ...updates, currentStep: 7,
      validatedSteps: WizardSchemas.WIZARD_STEPS,
    })).toEqual({ filled: 5, total: 7, percent: 71 });
  });
});
