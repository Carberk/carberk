import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../../test/render";

import Step3VehicleId from "./Step3VehicleId";

vi.mock("../../api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useGenerations", () => ({ useGenerations: () => ({ data: { items: [] } }) }));

const vinHelper = {
  en: "Optional. 17 characters. Shown in the Listing's specifications.",
  ru: "Необязательно. 17 символов. Показывается в характеристиках объявления.",
  tk: "Hökman däl. 17 belgi. Bildirişiň aýratynlyklarynda görkezilýär.",
} as const;

describe("Car step", () => {
  it("shows Brand, Model, Generation and Year, then an optional VIN field at the bottom", () => {
    const screen = renderMobile(<Step3VehicleId payload={{}} onChange={() => {}} />);

    const labels = ["Brand", "Model", "Generation", "Year", "VIN"].map(
      (label) => screen.getAllByText(new RegExp(`^${label}( \\*)?$`))[0],
    );
    const json = JSON.stringify(screen.toJSON());
    const positions = ["Brand", "Model", "Generation", "Year", "VIN"].map((label) =>
      json.indexOf(`"${label}`),
    );
    expect(labels.every(Boolean)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    const vin = screen.getByLabelText("VIN");
    expect(vin.props.maxLength).toBe(17);
    expect(vin.props.accessibilityHint).toBe(vinHelper.en);
    expect(screen.getByText(vinHelper.en)).toBeTruthy();
    expect(screen.queryByText(/auto-fill/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it.each(["ru", "tk"] as const)("shows the VIN helper in %s", (locale) => {
    const screen = renderMobile(<Step3VehicleId payload={{}} onChange={() => {}} />, { locale });
    expect(screen.getByText(vinHelper[locale])).toBeTruthy();
    expect(screen.getByHintText(vinHelper[locale])).toBeTruthy();
  });

  it("saves the typed VIN and clears it when emptied", () => {
    const onChange = vi.fn();
    const screen = renderMobile(<Step3VehicleId payload={{}} onChange={onChange} />);

    fireEvent.changeText(screen.getByLabelText("VIN"), "WBA1234567890ABCD");
    fireEvent.changeText(screen.getByLabelText("VIN"), "  ");

    expect(onChange).toHaveBeenNthCalledWith(1, { vin: "WBA1234567890ABCD" });
    expect(onChange).toHaveBeenNthCalledWith(2, { vin: undefined });
  });

  it("shows a VIN error under the field after the first Continue tap", () => {
    const fieldErrors = { vin: "Use 17 characters or fewer" };
    const screen = renderMobile(
      <Step3VehicleId payload={{ vin: "A".repeat(18) }} onChange={() => {}} fieldErrors={fieldErrors} />,
    );
    expect(screen.queryByText("Use 17 characters or fewer")).toBeNull();

    screen.rerender(
      <Step3VehicleId payload={{ vin: "A".repeat(18) }} onChange={() => {}} fieldErrors={fieldErrors} showErrors />,
    );
    expect(screen.getByText("Use 17 characters or fewer")).toBeTruthy();
  });

  it("locks the VIN with the rest of Car when editing a published Listing", () => {
    const screen = renderMobile(
      <Step3VehicleId payload={{ vin: "WBA1234567890ABCD" }} onChange={() => {}} disabled />,
    );
    expect(screen.getByLabelText("VIN").props.editable).toBe(false);
  });
});
