import type { WizardSchemas } from "@auto-tm/contracts";
import { describe, it, expect } from "vitest";

import {
  wizardMachineReducer,
  createInitialState,
  buildMachineContext,
} from "./wizardMachine";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";
const validPhoto = { photoId: validUuid, key: "uploads/abc.jpg", sortOrder: 0 };
const completePayload = {
  photos: [validPhoto],
  brandId: validUuid,
  modelId: validUuid,
  year: 2020,
  condition: "used" as const,
  mileageKm: 10000,
  conditionDisclosure: { damaged: false },
  priceAmount: 100000,
  priceCurrency: "TMT" as const,
  regionId: validUuid,
  cityId: validUuid,
  description: "Great car",
  contactPhone: "+99361234567",
  allowCalls: true,
  allowChat: true,
};
const dataSteps = ["vehicle", "specs", "photos", "price", "location", "contact"];
const car = { brandId: validUuid, modelId: validUuid, year: 2020 };
const details = { condition: "used" as const, mileageKm: 10000, conditionDisclosure: { damaged: false } };
const price = { priceAmount: 100000, priceCurrency: "TMT" as const };
const place = { regionId: validUuid, cityId: validUuid };
// Step names as the eight-step wizard saved them; `vin` is no longer a step.
function oldStepNames(...names: string[]) {
  return names as WizardSchemas.WizardStep[];
}

describe("createInitialState", () => {
  it("returns idle state with empty payload", () => {
    const state = createInitialState();
    expect(state.status).toBe("idle");
    expect(state.draftId).toBeNull();
    expect(state.listingId).toBeNull();
    expect(state.mode).toBe("create");
    expect(state.editEntryAtReview).toBe(false);
    expect(state.payload).toEqual({});
    expect(state.validatedSteps).toEqual([]);
  });
});

describe("INIT", () => {
  it("transitions from idle to step with draft data", () => {
    const state = createInitialState();
    const next = wizardMachineReducer(state, {
      type: "INIT",
      draftId: "draft-1",
      payload: { vin: "WBA123" },
    });

    expect(next.status).toBe("step");
    expect(next.draftId).toBe("draft-1");
    expect(next.mode).toBe("create");
    expect(next.payload).toEqual({ vin: "WBA123", condition: "used" });
    expect(next.currentStep).toBe("vehicle");
  });

  it("preserves an explicit condition when resuming a create draft", () => {
    const next = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: { condition: "new" },
    });

    expect(next.payload.condition).toBe("new");
  });

  it("lets a resumed Used draft continue after mileage is entered", () => {
    const resumed = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      entryStep: "specs",
      payload: {
        ...car,
        conditionDisclosure: { damaged: true },
      },
    });
    const withMileage = wizardMachineReducer(resumed, {
      type: "UPDATE_FIELDS",
      updates: { mileageKm: 50000 },
    });

    expect(withMileage.currentStep).toBe("specs");
    expect(buildMachineContext(withMileage).canContinue).toBe(true);
  });

  it("keeps the specs step blocked until the Damaged question is answered", () => {
    const resumed = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      entryStep: "specs",
      payload: {
        ...car,
        condition: "used",
        mileageKm: 50000,
        conditionDisclosure: { knownIssuesText: "Rust" },
      },
    });
    expect(buildMachineContext(resumed).canContinue).toBe(false);

    const answered = wizardMachineReducer(resumed, {
      type: "UPDATE_FIELDS",
      updates: { conditionDisclosure: { damaged: false, knownIssuesText: "Rust" } },
    });
    expect(buildMachineContext(answered).canContinue).toBe(true);
  });

  it("initializes edit mode at review with all data steps validated", () => {
    const next = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: null,
      listingId: "listing-1",
      mode: "edit",
      entryStep: "review",
      payload: completePayload,
    });

    expect(next.status).toBe("step");
    expect(next.draftId).toBeNull();
    expect(next.listingId).toBe("listing-1");
    expect(next.mode).toBe("edit");
    expect(next.editEntryAtReview).toBe(true);
    expect(next.currentStep).toBe("review");
    expect(next.validatedSteps).toEqual(dataSteps);
  });

  it("supports edit detours from review and back to review", () => {
    let state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: null,
      listingId: "listing-1",
      mode: "edit",
      entryStep: "review",
      payload: completePayload,
    });

    state = wizardMachineReducer(state, { type: "GO_TO_STEP", step: "price" });
    expect(state.currentStep).toBe("price");
    expect(buildMachineContext(state).editDetourActive).toBe(true);

    state = wizardMachineReducer(state, {
      type: "UPDATE_FIELDS",
      updates: { priceAmount: 120000 },
    });
    expect(state.validatedSteps).toEqual(dataSteps);

    state = wizardMachineReducer(state, { type: "GO_TO_STEP", step: "review" });
    expect(state.currentStep).toBe("review");
    expect(buildMachineContext(state).editDetourActive).toBe(false);
  });

  it("opens a new draft on Car", () => {
    const next = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: { currentStep: 1, allowCalls: true, allowChat: true, priceCurrency: "TMT" },
    });

    expect(next.currentStep).toBe("vehicle");
    expect(buildMachineContext(next)).toMatchObject({ stepNumber: 1, stepCount: 7 });
  });

  it("resumes at the first step in the new order whose required fields are incomplete", () => {
    const next = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: { ...car, photos: [validPhoto], ...price, allowCalls: true, allowChat: true },
    });

    // Details has no mileage or Damaged answer, so the seller lands there,
    // even though Photos and Price are already complete.
    expect(next.currentStep).toBe("specs");
  });

  describe("drafts saved by the eight-step wizard", () => {
    it("ignores old step names and resumes from the saved fields", () => {
      const next = wizardMachineReducer(createInitialState(), {
        type: "INIT",
        draftId: "draft-1",
        payload: {
          currentStep: 1,
          vin: "WBA1234567890ABCD",
          photos: [validPhoto],
          ...car,
          // The old wizard validated vin, photos and vehicle; the new order puts
          // Details second and it is still empty.
          validatedSteps: oldStepNames("vin", "photos", "vehicle"),
        },
      });

      expect(next.currentStep).toBe("specs");
      expect(next.validatedSteps).not.toContain("vin");
      expect(next.validatedSteps).toEqual(["vehicle", "photos"]);
      expect(next.payload.vin).toBe("WBA1234567890ABCD");
    });

    it("sends an old draft whose place was done but description missing to Description and place", () => {
      const next = wizardMachineReducer(createInitialState(), {
        type: "INIT",
        draftId: "draft-1",
        payload: {
          ...car,
          ...details,
          photos: [validPhoto],
          ...price,
          ...place,
          allowCalls: true,
          allowChat: true,
          validatedSteps: oldStepNames("vin", "photos", "vehicle", "specs", "price", "location"),
        },
      });

      expect(next.currentStep).toBe("location");
      expect(buildMachineContext(next).fieldErrors.description).toBe(
        "wizardErrors.descriptionRequired",
      );
    });

    it("does not trust an old step name whose fields are incomplete", () => {
      const next = wizardMachineReducer(createInitialState(), {
        type: "INIT",
        draftId: "draft-1",
        payload: {
          brandId: validUuid,
          validatedSteps: oldStepNames("vin", "photos", "vehicle", "specs"),
        },
      });

      expect(next.currentStep).toBe("vehicle");
      expect(next.validatedSteps).toEqual([]);
    });

    it("opens a complete old draft at Check and publish with every field kept", () => {
      const saved = { ...completePayload, vin: "WBA1234567890ABCD", locationText: "Near the bazaar", contactPhone: "+99362001122" };
      const next = wizardMachineReducer(createInitialState(), {
        type: "INIT",
        draftId: "draft-1",
        payload: { ...saved, currentStep: 1, validatedSteps: oldStepNames("vin", "photos") },
      });

      expect(next.currentStep).toBe("review");
      expect(next.validatedSteps).toEqual(dataSteps);
      expect(next.payload).toMatchObject(saved);
      expect(buildMachineContext(next).canPublish).toBe(true);
    });
  });
});

describe("NEXT", () => {
  it("advances from Car to Details when Car is valid", () => {
    const initialized = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: { ...car, vin: "WBA1234567890ABCD" },
    });

    const next = wizardMachineReducer(initialized, { type: "NEXT" });
    expect(next.currentStep).toBe("specs");
    expect(next.validatedSteps).toContain("vehicle");
  });

  it("keeps Car when the VIN is longer than 17 characters", () => {
    const initialized = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: { ...car, vin: "A".repeat(18) },
    });

    expect(buildMachineContext(initialized).fieldErrors.vin).toBe("wizardErrors.vinTooLong");
    expect(wizardMachineReducer(initialized, { type: "NEXT" }).currentStep).toBe("vehicle");
  });

  it("walks the seven steps in order", () => {
    let state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: {},
    });
    const visited = [state.currentStep];
    const fill = [car, details, { photos: [validPhoto] }, price, { ...place, description: "Great car" }, { contactPhone: "+99361234567", allowCalls: true, allowChat: false }];
    for (const updates of fill) {
      state = wizardMachineReducer(state, { type: "UPDATE_FIELDS", updates });
      state = wizardMachineReducer(state, { type: "NEXT" });
      visited.push(state.currentStep);
    }

    expect(visited).toEqual(["vehicle", "specs", "photos", "price", "location", "contact", "review"]);
    expect(buildMachineContext(state)).toMatchObject({ stepNumber: 7, stepCount: 7, canPublish: true });
  });

  it("advances through all steps to review", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: {
        photos: [validPhoto],
        brandId: validUuid,
        modelId: validUuid,
        year: 2020,
        condition: "new",
        conditionDisclosure: { damaged: false },
        priceAmount: 100000,
        priceCurrency: "TMT",
        regionId: validUuid,
        cityId: validUuid,
        description: "Great car",
        contactPhone: "+99361234567",
        allowCalls: true,
        allowChat: true,
      },
    });

    // A complete draft resumes at review with all six data steps complete.
    expect(state.currentStep).toBe("review");
    expect(state.validatedSteps).toHaveLength(6);
  });

  it("does not advance if current step is invalid", () => {
    // Start on vehicle step with incomplete data
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: {
        brandId: validUuid, // missing modelId and year
      },
    });

    expect(state.currentStep).toBe("vehicle");

    const next = wizardMachineReducer(state, { type: "NEXT" });
    expect(next.currentStep).toBe("vehicle");
  });

  it("does nothing when not in step status", () => {
    const state = createInitialState();
    const next = wizardMachineReducer(state, { type: "NEXT" });
    expect(next.status).toBe("idle");
  });
});

describe("BACK", () => {
  it("goes back from Details to Car", () => {
    let state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: car,
    });
    state = wizardMachineReducer(state, { type: "NEXT" }); // to specs

    const back = wizardMachineReducer(state, { type: "BACK" });
    expect(back.currentStep).toBe("vehicle");
  });

  it("does not go back from Car", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: {},
    });

    const back = wizardMachineReducer(state, { type: "BACK" });
    expect(back.currentStep).toBe("vehicle");
  });
});

describe("UPDATE_FIELDS", () => {
  it("updates payload fields", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: {},
    });

    const next = wizardMachineReducer(state, {
      type: "UPDATE_FIELDS",
      updates: { vin: "WBA123" },
    });

    expect(next.payload.vin).toBe("WBA123");
  });

  it("invalidates downstream steps when brand changes", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: { ...car, ...details, photos: [validPhoto] },
    });
    expect(state.validatedSteps).toEqual(["vehicle", "specs", "photos"]);

    const next = wizardMachineReducer(state, {
      type: "UPDATE_FIELDS",
      updates: { brandId: "550e8400-e29b-41d4-a716-446655440001" },
    });

    expect(next.validatedSteps).toEqual([]);
  });

  it("does not invalidate steps when metadata changes", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: car,
    });

    const next = wizardMachineReducer(state, {
      type: "UPDATE_FIELDS",
      updates: { currentStep: 3, validatedSteps: ["vehicle", "specs"] },
    });

    expect(next.validatedSteps).toEqual(["vehicle"]);
  });
});

describe("GO_TO_STEP", () => {
  it("allows going backward to any step", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: { ...car, ...details },
    });
    expect(state.currentStep).toBe("photos");

    const back = wizardMachineReducer(state, { type: "GO_TO_STEP", step: "vehicle" });
    expect(back.currentStep).toBe("vehicle");
  });

  it("allows going forward if dependencies are valid", () => {
    let state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: { ...car, ...details },
    });
    state = wizardMachineReducer(state, { type: "GO_TO_STEP", step: "vehicle" });

    const next = wizardMachineReducer(state, { type: "GO_TO_STEP", step: "photos" });
    expect(next.currentStep).toBe("photos");
  });

  it("blocks going forward if dependencies are not valid", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: car, // Details not complete
    });

    const next = wizardMachineReducer(state, { type: "GO_TO_STEP", step: "photos" });
    expect(next.currentStep).toBe("specs");
  });

  it("blocks going to review when not all steps valid", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: car,
    });

    const next = wizardMachineReducer(state, { type: "GO_TO_STEP", step: "review" });
    expect(next.currentStep).toBe("specs");
  });
});

describe("PUBLISH lifecycle", () => {
  it("transitions to complete on success", () => {
    let state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: {},
    });

    state = wizardMachineReducer(state, { type: "PUBLISH_START" });
    expect(state.status).toBe("publishing");

    state = wizardMachineReducer(state, {
      type: "PUBLISH_SUCCESS",
      listingId: "listing-1",
    });
    expect(state.status).toBe("complete");
    expect(state.completedListingId).toBe("listing-1");
  });

  it("transitions to publishError on failure", () => {
    let state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: {},
    });

    state = wizardMachineReducer(state, { type: "PUBLISH_START" });
    state = wizardMachineReducer(state, {
      type: "PUBLISH_ERROR",
      error: "Publish failed",
    });

    expect(state.status).toBe("publishError");
    expect(state.publishError).toBe("Publish failed");
  });
});

describe("DISCARD", () => {
  it("resets to initial state", () => {
    let state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: { vin: "WBA123" },
    });

    state = wizardMachineReducer(state, { type: "DISCARD" });
    expect(state.status).toBe("idle");
    expect(state.draftId).toBeNull();
    expect(state.payload).toEqual({});
  });
});

describe("buildMachineContext", () => {
  it("computes canContinue correctly", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: car,
    });

    const ctx = buildMachineContext(
      wizardMachineReducer(state, { type: "GO_TO_STEP", step: "vehicle" }),
    );
    expect(ctx.state.currentStep).toBe("vehicle");
    expect(ctx.canContinue).toBe(true); // VIN is optional
    expect(ctx.canGoBack).toBe(false);
    expect(ctx.editDetourActive).toBe(false);
    expect(ctx.isLastStep).toBe(false);
    expect(ctx.stepErrors).toEqual([]);
    expect(ctx.stepNumber).toBe(1);
    expect(ctx.stepCount).toBe(7);
    expect(ctx.progressPercent).toBeCloseTo(100 / 7);
  });

  it("reports fieldErrors keyed by field path", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: { currentStep: 1 },
    });

    expect(state.currentStep).toBe("vehicle");

    const ctx = buildMachineContext(state);
    expect(ctx.fieldErrors.brandId).toBe("wizardErrors.brandRequired");
    expect(ctx.fieldErrors.modelId).toBe("wizardErrors.modelRequired");
    expect(ctx.fieldErrors.year).toBe("wizardErrors.yearRequired");
  });

  it("computes canPublish only on review with all steps valid", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: completePayload,
    });

    const ctx = buildMachineContext(state);
    expect(ctx.canPublish).toBe(true);
    expect(ctx.isLastStep).toBe(true);
    expect(ctx.progressPercent).toBe(100);
  });

  it("reports step errors for invalid step", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: "draft-1",
      payload: {
        brandId: validUuid, // missing modelId and year
      },
    });

    expect(state.currentStep).toBe("vehicle");

    const ctx = buildMachineContext(state);
    expect(ctx.canContinue).toBe(false);
    expect(ctx.stepErrors.length).toBeGreaterThan(0);
  });

  it("disables back on edit review and edit detours", () => {
    let state = wizardMachineReducer(createInitialState(), {
      type: "INIT",
      draftId: null,
      listingId: "listing-1",
      mode: "edit",
      entryStep: "review",
      payload: completePayload,
    });

    let ctx = buildMachineContext(state);
    expect(ctx.canGoBack).toBe(false);
    expect(ctx.editDetourActive).toBe(false);

    state = wizardMachineReducer(state, { type: "GO_TO_STEP", step: "price" });
    ctx = buildMachineContext(state);
    expect(ctx.canGoBack).toBe(false);
    expect(ctx.editDetourActive).toBe(true);
  });
});

describe("legacy Listing edit disclosure", () => {
  it.each([true, false])("asks for Damaged before save, then accepts answer %s and returns to review", (damaged) => {
    let state = wizardMachineReducer(createInitialState(), {
      type: "INIT", draftId: null, listingId: "listing-1", mode: "edit", entryStep: "review",
      payload: { ...completePayload, conditionDisclosure: undefined },
    });
    expect(state.currentStep).toBe("specs");
    expect(buildMachineContext(state)).toMatchObject({
      canPublish: false, canContinue: false,
      fieldErrors: { conditionDisclosure: "wizardErrors.damagedRequired" },
    });
    state = wizardMachineReducer(state, {
      type: "UPDATE_FIELDS", updates: { conditionDisclosure: { damaged } },
    });
    expect(buildMachineContext(state).canContinue).toBe(true);
    state = wizardMachineReducer(state, { type: "GO_TO_STEP", step: "review" });
    expect(buildMachineContext(state).canPublish).toBe(true);
  });
});

describe("New Listing edit entry (ADR-0080)", () => {
  it("opens a New Listing without a stored answer at review", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT", draftId: null, listingId: "listing-1", mode: "edit", entryStep: "review",
      payload: { ...completePayload, condition: "new", mileageKm: undefined, conditionDisclosure: undefined },
    });
    expect(state.currentStep).toBe("review");
    expect(buildMachineContext(state).canPublish).toBe(true);
  });
});

describe("New draft resume with field-derived completion (ADR-0080)", () => {
  const newCar = { ...car, condition: "new" as const };

  it("counts Details complete for a New draft without a Damaged answer and resumes past it", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT", draftId: "draft-1", payload: newCar,
    });
    expect(state.validatedSteps).toEqual(["vehicle", "specs"]);
    expect(state.currentStep).toBe("photos");
    expect(state.payload.conditionDisclosure).toEqual({ damaged: false });
  });

  it("does the same for a draft saved by the eight-step wizard", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT", draftId: "draft-1",
      payload: { ...newCar, vin: "WBA1234567890ABCD", validatedSteps: oldStepNames("vin", "photos", "vehicle") },
    });
    expect(state.currentStep).toBe("photos");
    expect(state.payload.vin).toBe("WBA1234567890ABCD");
  });

  it("keeps a damaged New draft on Details", () => {
    const state = wizardMachineReducer(createInitialState(), {
      type: "INIT", draftId: "draft-1",
      payload: { ...newCar, conditionDisclosure: { damaged: true } },
    });
    expect(state.validatedSteps).toEqual(["vehicle"]);
    expect(state.currentStep).toBe("specs");
  });
});
