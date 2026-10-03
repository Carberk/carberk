import { WizardSchemas } from "@auto-tm/contracts";
import { describe, expect, it } from "vitest";

import { draftProgress } from "./draftProgress";
import { createInitialState, wizardMachineReducer } from "./wizardMachine";

const id = "550e8400-e29b-41d4-a716-446655440000";
const contact = { contactPhone: "+99361234567", allowCalls: true, allowChat: true };
const completePayload = {
  brandId: id, modelId: id, year: 2020,
  condition: "used" as const, mileageKm: 10000, conditionDisclosure: { damaged: false },
  photos: [{ photoId: id, key: "pending/car.jpg", sortOrder: 0 }],
  priceAmount: 100000, priceCurrency: "TMT" as const,
  regionId: id, cityId: id, description: "Great car",
  ...contact,
};

describe("draftProgress", () => {
  it("counts filled fields saved without Continue, using the seven-step schema", () => {
    expect(WizardSchemas.WIZARD_STEPS).toEqual([
      "vehicle", "specs", "photos", "price", "location", "contact", "review",
    ]);
    expect(draftProgress(completePayload)).toEqual({ filled: 6, total: 6, percent: 100 });
    const resumed = wizardMachineReducer(createInitialState(), {
      type: "INIT", draftId: id, payload: completePayload,
    });
    expect(resumed.currentStep).toBe("review");
    expect(draftProgress(completePayload).filled).toBe(resumed.validatedSteps.length);
  });

  it.each([1, 7, 8])("ignores legacy currentStep %s and incorrect stored steps", (currentStep) => {
    expect(draftProgress({ ...completePayload, currentStep, validatedSteps: [] })).toEqual({
      filled: 6, total: 6, percent: 100,
    });
    expect(draftProgress({ currentStep, validatedSteps: ["vin", "review", "vehicle", "gone"] }))
      .toEqual({ filled: 0, total: 6, percent: 0 });
  });

  it.each([{}, { brandId: id }, { priceCurrency: "TMT" as const }])(
    "counts no complete step for an empty or partial payload %j", (payload) => {
      expect(draftProgress(payload)).toEqual({ filled: 0, total: 6, percent: 0 });
    },
  );

  it("counts valid default Contact even without seller input or a stored step", () => {
    expect(draftProgress(contact)).toEqual({ filled: 1, total: 6, percent: 17 });
  });

  it.each([
    { year: 1800 },
    { vin: "X".repeat(18) },
    { conditionDisclosure: {} },
    { photos: [{ photoId: id, sortOrder: 0 }] },
    { priceAmount: 0 },
    { description: "" },
    { contactPhone: "invalid" },
    { allowCalls: false, allowChat: false },
  ])("removes a step when its fields become invalid: %j", (updates) => {
    expect(draftProgress({
      ...completePayload, ...updates, currentStep: 7,
      validatedSteps: WizardSchemas.WIZARD_STEPS,
    })).toEqual({ filled: 5, total: 6, percent: 83 });
  });
});
