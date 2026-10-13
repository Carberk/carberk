import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile, first } from "../../../test/render";

import Step7DescContact from "./Step7DescContact";

vi.mock("../../api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useCities", () => ({ useCities: () => ({ data: { items: [] } }) }));
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

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

const confirmedPhones = [
  {
    phone: "+99361000001",
    source: "confirmed" as const,
    confirmedAt: "2026-09-29T12:00:00.000Z",
    reusableUntil: inDays(3.4),
  },
  {
    phone: "+99361000002",
    source: "confirmed" as const,
    confirmedAt: "2026-10-04T12:00:00.000Z",
    reusableUntil: inDays(6.2),
  },
];

async function renderStep(props: Partial<Parameters<typeof Step7DescContact>[0]> = {}) {
  const onChange = vi.fn();
  const screen = await renderMobile(
    <Step7DescContact
      payload={{ allowCalls: true, allowChat: true }}
      onChange={onChange}
      {...props}
    />,
  );
  return { screen, onChange };
}

describe("Contact step", () => {
  it("preselects the sign-in phone, which needs no code", async () => {
    const { screen, onChange } = await renderStep({
      accountPhone: "+99365000000",
      confirmedPhones: [],
    });

    expect(screen.getByText("+99365000000")).toBeTruthy();
    expect(screen.getByText("Your sign-in phone. No code needed.")).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith({ contactPhone: "+99365000000" });
  });

  it("lists confirmed numbers with the days left", async () => {
    const { screen } = await renderStep({
      payload: { contactPhone: "+99365000000", allowCalls: true, allowChat: true },
      accountPhone: "+99365000000",
      confirmedPhones,
    });

    expect(
      screen.getByText("Confirmed. 4 days left without a new code."),
    ).toBeTruthy();
    expect(
      screen.getByText("Confirmed. 7 days left without a new code."),
    ).toBeTruthy();
    expect(screen.getByText("Another number")).toBeTruthy();
  });

  it("selects a quick pick on tap", async () => {
    const { screen, onChange } = await renderStep({
      payload: { contactPhone: "+99365000000", allowCalls: true, allowChat: true },
      accountPhone: "+99365000000",
      confirmedPhones,
    });

    await fireEvent.press(
      screen.getByRole("radio", {
        name: "+99361000001, Confirmed. 4 days left without a new code.",
      }),
    );
    expect(onChange).toHaveBeenCalledWith({ contactPhone: "+99361000001" });
  });

  it("reads each row with its sub line, as a radio that says whether it is chosen", async () => {
    const { screen } = await renderStep({
      payload: { contactPhone: "+99361000002", allowCalls: true, allowChat: true },
      accountPhone: "+99365000000",
      confirmedPhones,
    });

    const account = screen.getByRole("radio", {
      name: "+99365000000, Your sign-in phone. No code needed.",
    });
    expect(account.props.accessibilityState).toMatchObject({ checked: false });
    const chosen = screen.getByRole("radio", {
      name: "+99361000002, Confirmed. 7 days left without a new code.",
    });
    expect(chosen.props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("reads the Listing's current number with its sub line in edit mode", async () => {
    const { screen } = await renderStep({
      payload: { contactPhone: "+99362000002", allowCalls: true, allowChat: true },
      accountPhone: "+99365000000",
      currentListingPhone: "+99362000002",
      confirmedPhones: [],
    });

    expect(
      screen.getByRole("radio", {
        name: "+99362000002, Current number of this listing",
      }).props.accessibilityState,
    ).toMatchObject({ checked: true });
  });

  it("marks a saved number past its 7 days and offers to confirm it again", async () => {
    const onConfirmExpired = vi.fn();
    const { screen } = await renderStep({
      payload: { contactPhone: "+99362999999", allowCalls: true, allowChat: true },
      accountPhone: "+99365000000",
      confirmedPhones,
      onConfirmExpired,
    });

    expect(
      screen.getByText("Confirmation expired. Tap to confirm again."),
    ).toBeTruthy();

    // The expired row starts a confirmation; it is a button, not a choice.
    expect(screen.queryByRole("radio", { name: /^\+99362999999/ })).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "+99362999999, Confirmation expired. Tap to confirm again.",
      }),
    );
    expect(onConfirmExpired).toHaveBeenCalledWith("+99362999999");
  });

  it("shows a listed number with no days left once, as the expired row", async () => {
    const { screen } = await renderStep({
      payload: { contactPhone: "+99361000009", allowCalls: true, allowChat: true },
      accountPhone: "+99365000000",
      confirmedPhones: [
        ...confirmedPhones,
        {
          phone: "+99361000009",
          source: "confirmed" as const,
          confirmedAt: "2026-09-28T12:00:00.000Z",
          reusableUntil: inDays(-0.1),
        },
      ],
    });

    expect(screen.getAllByText("+99361000009")).toHaveLength(1);
    expect(
      screen.getByRole("button", {
        name: "+99361000009, Confirmation expired. Tap to confirm again.",
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/0 days left/)).toBeNull();
  });

  it("leaves out a listed number with no days left that is not the chosen one", async () => {
    const { screen } = await renderStep({
      payload: { contactPhone: "+99365000000", allowCalls: true, allowChat: true },
      accountPhone: "+99365000000",
      confirmedPhones: [
        {
          phone: "+99361000009",
          source: "confirmed" as const,
          confirmedAt: "2026-09-28T12:00:00.000Z",
          reusableUntil: inDays(-0.1),
        },
      ],
    });

    expect(screen.queryByText("+99361000009")).toBeNull();
    expect(screen.queryByText(/0 days left/)).toBeNull();
  });

  it("does not call a saved number expired while the confirmed list is not known", async () => {
    const onConfirmExpired = vi.fn();
    const { screen, onChange } = await renderStep({
      payload: { contactPhone: "+99362999999", allowCalls: true, allowChat: true },
      accountPhone: "+99365000000",
      confirmedPhones: undefined,
      onConfirmExpired,
    });

    expect(
      screen.queryByText("Confirmation expired. Tap to confirm again."),
    ).toBeNull();
    const saved = screen.getByRole("radio", { name: "+99362999999" });
    expect(saved.props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(saved);
    expect(onConfirmExpired).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith({ contactPhone: "+99362999999" });
  });

  it("offers to confirm the saved number again once a publish refused it, list or no list", async () => {
    const onConfirmExpired = vi.fn();
    const { screen } = await renderStep({
      payload: { contactPhone: "+99362999999", allowCalls: true, allowChat: true },
      accountPhone: "+99365000000",
      confirmedPhones: undefined,
      publishPhoneError: true,
      onConfirmExpired,
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "+99362999999, Confirmation expired. Tap to confirm again.",
      }),
    );
    expect(onConfirmExpired).toHaveBeenCalledWith("+99362999999");
  });

  it("tells an email-only User to confirm a phone and preselects nothing", async () => {
    const { screen, onChange } = await renderStep({
      accountPhone: null,
      confirmedPhones: [],
    });

    expect(
      screen.getByText(
        "You signed in with email. Confirm a phone for this listing. It will not become a way to sign in.",
      ),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the publish rejection above the picker", async () => {
    const { screen } = await renderStep({
      payload: { contactPhone: "+99365000000", allowCalls: true, allowChat: true },
      accountPhone: "+99365000000",
      publishPhoneError: true,
    });

    expect(
      screen.getByText("Confirm the contact phone again to publish."),
    ).toBeTruthy();
  });

  it("shows the Continue error under the picker", async () => {
    const { screen } = await renderStep({
      accountPhone: null,
      confirmedPhones: [],
      selectionError: "Choose or confirm a contact phone",
    });

    expect(screen.getByText("Choose or confirm a contact phone")).toBeTruthy();
  });

  it("offers the Listing's current number without a code in edit mode", async () => {
    const { screen } = await renderStep({
      payload: { contactPhone: "+99362000002", allowCalls: true, allowChat: true },
      accountPhone: "+99365000000",
      currentListingPhone: "+99362000002",
      confirmedPhones: [],
    });

    expect(screen.getByText("Current number of this listing")).toBeTruthy();
    expect(
      screen.queryByText("Confirmation expired. Tap to confirm again."),
    ).toBeNull();
  });

  it("keeps the calls and chat switches", async () => {
    const { screen, onChange } = await renderStep({
      accountPhone: "+99365000000",
      confirmedPhones: [],
    });

    expect(screen.getByText("Phone calls")).toBeTruthy();
    expect(screen.getByText("In-app chat")).toBeTruthy();
    await fireEvent.press(first(screen.getAllByRole("switch", { checked: true })));
    expect(onChange).toHaveBeenCalledWith({ allowCalls: false });
  });

  it("draws Another number in the link colour the other text links use", async () => {
    const { screen } = await renderStep({ accountPhone: "+99365000000", confirmedPhones: [] });
    const className = screen.getByText("Another number").props.className as string;
    expect(className).toContain("text-info-500");
    expect(className).not.toContain("text-primary");
  });

  it("opens the number screen from Another number", async () => {
    const onAnotherNumber = vi.fn();
    const { screen } = await renderStep({
      payload: { contactPhone: "+99365000000", allowCalls: true, allowChat: true },
      accountPhone: "+99365000000",
      confirmedPhones: [],
      onAnotherNumber,
    });

    await fireEvent.press(screen.getByLabelText("Another number"));
    expect(onAnotherNumber).toHaveBeenCalled();
  });
});
