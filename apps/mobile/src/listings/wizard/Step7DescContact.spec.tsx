import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../../test/render";

import Step7DescContact from "./Step7DescContact";

vi.mock("../../api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));
// The real switch is an @rn-primitives component the test host cannot load.
vi.mock("@/components/ui/switch", async () => {
  const { Pressable } = await import("react-native");
  return {
    Switch: ({ checked, onCheckedChange, disabled }: {
      checked: boolean; onCheckedChange: (value: boolean) => void; disabled?: boolean;
    }) => (
      <Pressable accessibilityRole="switch" accessibilityState={{ checked, disabled }}
        disabled={disabled} onPress={() => onCheckedChange(!checked)} />
    ),
  };
});
vi.mock("../../api/catalog/useCities", () => ({ useCities: () => ({ data: { items: [] } }) }));

describe("Contact step", () => {
  it("holds the calls and chat switches and today's contact phone, without a description", () => {
    const onChange = vi.fn();
    const screen = renderMobile(
      <Step7DescContact
        payload={{ description: "Saved text", allowCalls: true, allowChat: true }}
        onChange={onChange}
        defaultPhone="+99362001122"
      />,
    );

    expect(screen.queryByLabelText("Description")).toBeNull();
    expect(screen.queryByDisplayValue("Saved text")).toBeNull();
    expect(screen.getByLabelText("Contact phone")).toBeTruthy();
    expect(screen.getByText("Phone calls")).toBeTruthy();
    expect(screen.getByText("In-app chat")).toBeTruthy();
    expect(screen.getAllByRole("switch", { checked: true })).toHaveLength(2);

    fireEvent.changeText(screen.getByLabelText("Contact phone"), "+99365001122");
    expect(onChange).toHaveBeenCalledWith({ contactPhone: "+99365001122" });
  });
});
