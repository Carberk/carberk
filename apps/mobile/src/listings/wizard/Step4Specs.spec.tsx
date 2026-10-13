import { useState } from "react";
import { WizardSchemas } from "@auto-tm/contracts";
import { describe, expect, it, vi } from "vitest";
import { useTranslation } from "react-i18next";

import { renderMobile, fireEvent } from "../../../test/render";

import { translateWizardFieldErrors } from "./wizardErrors";
import Step4Specs from "./Step4Specs";

vi.mock("../../api/catalog/useColors", () => ({ useColors: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useBodyTypes", () => ({ useBodyTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useTransmissions", () => ({ useTransmissions: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useDriveTypes", () => ({ useDriveTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useEngineTypes", () => ({ useEngineTypes: () => ({ data: { items: [] } }) }));

function ValidatedSpecs({ initial = { condition: "used", mileageKm: 1000 }, disabled = false, showErrors = false, onPayload }: {
  initial?: WizardSchemas.WizardDraftPayload; disabled?: boolean; showErrors?: boolean;
  onPayload?: (payload: WizardSchemas.WizardDraftPayload) => void;
}) {
  const { t } = useTranslation();
  const [payload, setPayload] = useState(initial);
  onPayload?.(payload);
  const { fieldErrors } = WizardSchemas.validateStep("specs", payload);
  return <Step4Specs payload={payload} disabled={disabled} showErrors={showErrors}
    onChange={(updates) => setPayload((previous) => ({ ...previous, ...updates }))}
    fieldErrors={translateWizardFieldErrors(t, fieldErrors)} />;
}

describe("Step4Specs condition disclosure", () => {
  it("keeps untouched required errors quiet, then shows only the touched field error", async () => {
    const screen = await renderMobile(<ValidatedSpecs initial={{ condition: "used" }} />);
    expect(screen.queryByText("Answer whether the car is damaged or needs repair")).toBeNull();
    expect(screen.queryByText("Mileage is required for used cars")).toBeNull();
    await fireEvent(screen.getByRole("radio", { name: "Damaged / needs repair: Yes" }), "blur");
    expect(screen.getByText("Answer whether the car is damaged or needs repair")).toBeTruthy();
    expect(screen.queryByText("Mileage is required for used cars")).toBeNull();
    await fireEvent(screen.getByPlaceholderText("e.g. 50000"), "blur");
    expect(screen.getByText("Mileage is required for used cars")).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. 50000"), "1000");
    expect(screen.queryByText("Mileage is required for used cars")).toBeNull();
    expect(screen.getByRole("radio", { name: "Damaged / needs repair: Yes", checked: false })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Damaged / needs repair: No", checked: false })).toBeTruthy();
  });

  it.each(["Yes", "No"])("selects %s, preserves Known issues, and removes the required error", async (answer) => {
    const screen = await renderMobile(<ValidatedSpecs initial={{ condition: "used", mileageKm: 1000, conditionDisclosure: { knownIssuesText: "Rust on the sill" } }} />);
    await fireEvent.press(screen.getByRole("radio", { name: `Damaged / needs repair: ${answer}` }));
    expect(screen.getByRole("radio", { name: `Damaged / needs repair: ${answer}`, checked: true })).toBeTruthy();
    expect(screen.getByRole("radio", { name: `Damaged / needs repair: ${answer === "Yes" ? "No" : "Yes"}`, checked: false })).toBeTruthy();
    expect(screen.queryByText("Answer whether the car is damaged or needs repair")).toBeNull();
    expect(screen.getByDisplayValue("Rust on the sill")).toBeTruthy();
  });

  it("shows Known issues validation after Damaged is answered", async () => {
    const screen = await renderMobile(<ValidatedSpecs initial={{ condition: "used", mileageKm: 1000, conditionDisclosure: { damaged: true, knownIssuesText: "x".repeat(1001) } }} />);
    expect(screen.queryByText("Invalid value")).toBeNull();
    await fireEvent(screen.getByDisplayValue("x".repeat(1001)), "blur");
    expect(screen.getByText("Invalid value")).toBeTruthy();
    expect(screen.queryByText("Answer whether the car is damaged or needs repair")).toBeNull();
    const input = screen.getByDisplayValue("x".repeat(1001));
    expect(input.props.maxLength).toBe(1000);
    await fireEvent.changeText(input, "Rust");
    expect(screen.queryByText("Invalid value")).toBeNull();
    expect(screen.getByRole("radio", { name: "Damaged / needs repair: Yes", checked: true })).toBeTruthy();
  });

  it("shows both required errors only when this step is attempted", async () => {
    const initial: WizardSchemas.WizardDraftPayload = { condition: "used" };
    const screen = await renderMobile(<ValidatedSpecs initial={initial} />);
    expect(screen.queryByText("Mileage is required for used cars")).toBeNull();
    expect(screen.queryByText("Answer whether the car is damaged or needs repair")).toBeNull();
    await screen.rerender(<ValidatedSpecs initial={initial} showErrors />);
    expect(screen.getByText("Mileage is required for used cars")).toBeTruthy();
    expect(screen.getByText("Answer whether the car is damaged or needs repair")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "New" }));
    expect(screen.queryByText("Mileage is required for used cars")).toBeNull();
    expect(screen.queryByText("Answer whether the car is damaged or needs repair")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Used" }));
    expect(screen.getByText("Mileage is required for used cars")).toBeTruthy();
    expect(screen.getByText("Answer whether the car is damaged or needs repair")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Damaged / needs repair: No", checked: false })).toBeTruthy();
  });

  it("resets field touch when New hides the Used questions", async () => {
    const screen = await renderMobile(<ValidatedSpecs initial={{ condition: "used" }} />);
    await fireEvent(screen.getByPlaceholderText("e.g. 50000"), "blur");
    await fireEvent(screen.getByRole("radio", { name: "Damaged / needs repair: Yes" }), "blur");
    expect(screen.getByText("Answer whether the car is damaged or needs repair")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "New" }));
    await fireEvent.press(screen.getByRole("button", { name: "Used" }));
    expect(screen.queryByText("Mileage is required for used cars")).toBeNull();
    expect(screen.queryByText("Answer whether the car is damaged or needs repair")).toBeNull();
    expect(screen.getByRole("radio", { name: "Damaged / needs repair: No", checked: false })).toBeTruthy();
  });

  it("does not change a disabled answer", async () => {
    const onChange = vi.fn();
    const screen = await renderMobile(<Step4Specs payload={{ condition: "used" }} onChange={onChange} disabled />);
    await fireEvent.press(screen.getByRole("radio", { name: "Damaged / needs repair: Yes" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ADR-0080: a New car is not asked Damaged and stores not damaged.
describe("Step4Specs for a New car", () => {
  const damagedRadios = /Damaged \/ needs repair/;

  async function renderTracked(initial: WizardSchemas.WizardDraftPayload) {
    let latest = initial;
    const screen = await renderMobile(<ValidatedSpecs initial={initial} onPayload={(p) => { latest = p; }} />);
    return { screen, payload: () => latest };
  }

  it("hides the Damaged question, stores not damaged, and keeps Known issues optional", async () => {
    const { screen, payload } = await renderTracked({ condition: "used", mileageKm: 1000 });
    await fireEvent.press(screen.getByRole("button", { name: "New" }));

    expect(screen.queryAllByRole("radio", { name: damagedRadios })).toHaveLength(0);
    expect(screen.queryByText("Damaged / needs repair")).toBeNull();
    expect(screen.queryByText("Answer whether the car is damaged or needs repair")).toBeNull();
    expect(payload().conditionDisclosure).toEqual({ damaged: false });
    expect(WizardSchemas.validateStep("specs", payload()).valid).toBe(true);
    expect(screen.getByText("Known issues")).toBeTruthy();
  });

  it("keeps not damaged when the seller writes Known issues", async () => {
    const { screen, payload } = await renderTracked({ condition: "new" });
    await fireEvent.changeText(screen.getByPlaceholderText("Describe known problems or damage..."), "Paint chip");

    expect(payload().conditionDisclosure).toEqual({ damaged: false, knownIssuesText: "Paint chip" });
    expect(WizardSchemas.validateStep("specs", payload()).valid).toBe(true);
  });

  it("stores not damaged when a Used car answered Yes switches to New", async () => {
    const { screen, payload } = await renderTracked({
      condition: "used", mileageKm: 1000, conditionDisclosure: { damaged: true, knownIssuesText: "Dent" },
    });
    await fireEvent.press(screen.getByRole("button", { name: "New" }));

    expect(payload().conditionDisclosure).toEqual({ damaged: false, knownIssuesText: "Dent" });
  });

  it("clears the answer on New to Used and asks the question again", async () => {
    const { screen, payload } = await renderTracked({ condition: "new", conditionDisclosure: { damaged: false, knownIssuesText: "Dent" } });
    await fireEvent.press(screen.getByRole("button", { name: "Used" }));

    expect(payload().conditionDisclosure).toEqual({ knownIssuesText: "Dent" });
    expect(screen.getByRole("radio", { name: "Damaged / needs repair: Yes", checked: false })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Damaged / needs repair: No", checked: false })).toBeTruthy();
    expect(screen.queryByText("Answer whether the car is damaged or needs repair")).toBeNull();
    expect(screen.queryByText("Mileage is required for used cars")).toBeNull();
    expect(WizardSchemas.validateStep("specs", payload()).valid).toBe(false);
    expect(screen.getByDisplayValue("Dent")).toBeTruthy();
  });

  it("keeps an existing Used answer when Used is tapped again", async () => {
    const { screen, payload } = await renderTracked({ condition: "used", mileageKm: 1000, conditionDisclosure: { damaged: true } });
    await fireEvent.press(screen.getByRole("button", { name: "Used" }));

    expect(payload().conditionDisclosure).toEqual({ damaged: true });
  });

  it("explains a damaged New draft under Condition and lets New clear it", async () => {
    const { screen, payload } = await renderTracked({ condition: "new", conditionDisclosure: { damaged: true } });

    expect(screen.getByText("A new car can't be damaged. Choose Used.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "New" }));
    expect(payload().conditionDisclosure).toEqual({ damaged: false });
    expect(screen.queryByText("A new car can't be damaged. Choose Used.")).toBeNull();
  });

  it("announces New as selected and has no Damaged control in the accessibility tree", async () => {
    const { screen } = await renderTracked({ condition: "new", conditionDisclosure: { damaged: false } });

    expect(screen.getByRole("button", { name: "New", selected: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Used", selected: false })).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
});

describe("Step4Specs Engine power feedback", () => {
  const error = "Engine power must be greater than zero";
  const initial: WizardSchemas.WizardDraftPayload = {
    condition: "used", mileageKm: 1000, conditionDisclosure: { damaged: false }, enginePower: 0,
  };

  it("keeps an untouched invalid value quiet, reveals it on blur, and clears it on correction", async () => {
    let latest = initial;
    const screen = await renderMobile(<ValidatedSpecs initial={initial} onPayload={(p) => { latest = p; }} />);
    expect(screen.getByText("Power")).toBeTruthy();
    expect(screen.queryByText(error)).toBeNull();
    await fireEvent(screen.getByPlaceholderText("e.g. 150"), "blur");
    expect(screen.getByText(error)).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. 150"), "150.9");
    expect(latest.enginePower).toBe(150);
    expect(screen.queryByText(error)).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. 150"), "");
    expect(latest.enginePower).toBeUndefined();
    expect(WizardSchemas.validateStep("specs", latest).valid).toBe(true);
    expect(screen.queryByText(error)).toBeNull();
  });

  it("shows the error as soon as the seller enters zero", async () => {
    const screen = await renderMobile(<ValidatedSpecs initial={{ ...initial, enginePower: undefined }} />);
    expect(screen.queryByText(error)).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. 150"), "0");
    expect(screen.getByText(error)).toBeTruthy();
  });
});
