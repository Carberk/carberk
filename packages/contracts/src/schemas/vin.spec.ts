import { describe, expect, it } from "vitest";

import { StepVehicleSchema, validateStep } from "./wizard";
const vehicle = { brandId: "00000000-0000-4000-8000-000000000001", modelId: "00000000-0000-4000-8000-000000000002", year: 2018 };
describe("Optional VIN", () => {
  it.each(["Corolla", "A".repeat(16), "A".repeat(18), "WBA1234567890ABCI", "WBA1234567890ABCO", "WBA1234567890ABCQ", "WBA1234567890ABC!", " WBA1234567890ABC", "А".repeat(17)])("rejects invalid VIN %s in the vehicle contract", (vin) => {
    expect(StepVehicleSchema.safeParse({ ...vehicle, vin }).success).toBe(false);
    expect(validateStep("vehicle", { ...vehicle, vin }).valid).toBe(false);
  });
  it.each([undefined, null, "", "WBA1234567890ABCD", "wba1234567890abcd"])("accepts optional or valid VIN %s", (vin) => {
    expect(StepVehicleSchema.safeParse({ ...vehicle, vin }).success).toBe(true);
    expect(validateStep("vehicle", { ...vehicle, vin }).valid).toBe(true);
  });
});

it("returns only the established length error for an overlength VIN", () => {
  expect(validateStep("vehicle", { ...vehicle, vin: "A".repeat(18) }).errors)
    .toEqual(["wizardErrors.vinTooLong"]);
});


it("normalises a lowercase VIN before validating and returning it", () => {
  expect(StepVehicleSchema.parse({ ...vehicle, vin: "wba1234567890abcd" }).vin)
    .toBe("WBA1234567890ABCD");
});


it("does not normalise a non-ASCII VIN character into a valid ASCII letter", () => {
  expect(StepVehicleSchema.safeParse({ ...vehicle, vin: "wba1234567890abcſ" }).success).toBe(false);
});
