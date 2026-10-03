import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../../test/render";

import Step8Review from "./Step8Review";

vi.mock("lucide-react-native", async () => {
  const Icon = (await import("react-native")).View;
  return { Check: Icon, AlertCircle: Icon, Eye: Icon, ListChecks: Icon };
});
vi.mock("expo-image", async () => ({ Image: (await import("react-native")).View }));
vi.mock("../../api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useColors", () => ({ useColors: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useBodyTypes", () => ({ useBodyTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useTransmissions", () => ({ useTransmissions: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useDriveTypes", () => ({ useDriveTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useEngineTypes", () => ({ useEngineTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useRegions", () => ({ useRegions: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useCities", () => ({ useCities: () => ({ data: { items: [] } }) }));

const titles = ["Car", "Details and condition", "Photos", "Price", "Description and place", "Contact"];

describe("Check and publish checklist", () => {
  it("lists the sections in the seven-step order, with VIN under Car and Description under Description and place", () => {
    const onGoToStep = vi.fn();
    const screen = renderMobile(
      <Step8Review
        payload={{ vin: "WBA1234567890ABCD", description: "One owner", allowCalls: true, allowChat: true }}
        validatedSteps={[]}
        onGoToStep={onGoToStep}
        photos={[]}
      />,
    );

    const editButtons = screen.getAllByRole("button").filter((b) =>
      String(b.props.accessibilityLabel ?? "").startsWith("Edit "),
    );
    expect(editButtons.map((b) => b.props.accessibilityLabel)).toEqual(titles.map((title) => `Edit ${title}`));

    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf("WBA1234567890ABCD")).toBeGreaterThan(json.indexOf('"Car"'));
    expect(json.indexOf("WBA1234567890ABCD")).toBeLessThan(json.indexOf('"Details and condition"'));
    expect(json.indexOf("One owner")).toBeGreaterThan(json.indexOf('"Description and place"'));
    expect(json.indexOf("One owner")).toBeLessThan(json.indexOf('"Contact"'));

    fireEvent.press(screen.getByRole("button", { name: "Edit Description and place" }));
    expect(onGoToStep).toHaveBeenCalledWith("location");
  });
});
