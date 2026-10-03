import { useState } from "react";
import { WizardSchemas } from "@auto-tm/contracts";
import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../../test/render";

import { translateWizardFieldErrors } from "./wizardErrors";
import Step6Location from "./Step6Location";

vi.mock("../../api/catalog/useRegions", () => ({ useRegions: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useCities", () => ({ useCities: () => ({ data: { items: [] } }) }));

function ValidatedPlace({ initial = {} }: { initial?: WizardSchemas.WizardDraftPayload }) {
  const { t } = useTranslation();
  const [payload, setPayload] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const { fieldErrors } = WizardSchemas.validateStep("location", payload);
  return (
    <>
      <Step6Location
        payload={payload}
        onChange={(updates) => setPayload((previous) => ({ ...previous, ...updates }))}
        fieldErrors={translateWizardFieldErrors(t, fieldErrors)}
        showErrors={attempted}
      />
      <Pressable accessibilityRole="button" onPress={() => setAttempted(true)}>
        <Text>Continue</Text>
      </Pressable>
    </>
  );
}

describe("Description and place step", () => {
  it("holds Description first, then Region, City and Area", () => {
    const screen = renderMobile(<ValidatedPlace />);

    const json = JSON.stringify(screen.toJSON());
    const positions = ["Description", "Region", "City", "Area"].map((label) => json.indexOf(`"${label}`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    const description = screen.getByLabelText("Description");
    expect(description.props.maxLength).toBe(2000);
    expect(screen.getByText("0/2000")).toBeTruthy();
  });

  it("shows the required Description error under the field after the first Continue tap and clears it once typed", () => {
    const screen = renderMobile(<ValidatedPlace />);
    expect(screen.queryByText("Description is required")).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Description is required")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Description"), "One owner, garage kept");

    expect(screen.queryByText("Description is required")).toBeNull();
    expect(screen.getByText("22/2000")).toBeTruthy();
  });

  it("shows the required Description error once the seller leaves it empty, before Continue", () => {
    const screen = renderMobile(<ValidatedPlace />);

    fireEvent(screen.getByLabelText("Description"), "blur");

    expect(screen.getByText("Description is required")).toBeTruthy();
    expect(screen.queryByText("Region is required")).toBeNull();
  });

  it("keeps the Description read-only when the step is disabled", () => {
    const screen = renderMobile(
      <Step6Location payload={{ description: "Kept" }} onChange={() => {}} disabled />,
    );
    expect(screen.getByLabelText("Description").props.editable).toBe(false);
  });
});
