import type * as Native from "react-native";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Linking from "expo-linking";
import { Enums } from "@auto-tm/contracts";

import { renderMobile, fireEvent, routerMock, act } from "../../../test/render";

import { ContactCtaBar } from "./ContactCtaBar";

const state = vi.hoisted(() => ({
  authenticated: true as boolean | null,
  pending: false,
  error: null as Error | null,
  mutate: vi.fn(),
  requireSignIn: vi.fn(),
  replay: undefined as (() => void) | undefined,
}));
vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: state.authenticated }),
}));
vi.mock("../../auth/intentStore", () => ({
  useAuthIntentStore: {
    getState: () => ({ requireSignIn: state.requireSignIn }),
  },
  useReplayAuthAction: (_kind: string, _id: string, action: () => void) => {
    state.replay = action;
  },
}));
vi.mock("../../api/conversations/useOpenConversation", () => ({
  useOpenConversation: () => ({
    mutate: state.mutate,
    isPending: state.pending,
    error: state.error,
  }),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("expo-linking", () => ({
  canOpenURL: vi.fn(async () => true),
  openURL: vi.fn(async () => {}),
}));

const props = {
  listingId: "listing-373",
  contactPhone: "+99361000001",
  allowCalls: true,
  allowChat: true,
  status: Enums.ListingStatus.Active,
};
beforeEach(() => {
  state.authenticated = true;
  state.pending = false;
  state.error = null;
  state.mutate.mockReset();
  state.requireSignIn.mockReset();
  vi.mocked(Linking.openURL).mockClear();
});

describe("ContactCtaBar", () => {
  it("puts a solid card under the floating bar's error, since the bar draws no material", async () => {
    state.error = new Error("boom");
    const screen = await renderMobile(<ContactCtaBar {...props} variant="floating" />);
    let node = screen.getByText("Something went wrong").parent;
    while (node && !/\bbg-card\b/.test(String(node.props.className ?? ""))) node = node.parent;
    expect(node).toBeTruthy();
  });
  it("opens the seller phone directly for an anonymous buyer", async () => {
    state.authenticated = false;
    const screen = await renderMobile(<ContactCtaBar {...props} />);
    await act(async () =>
      fireEvent.press(screen.getByRole("button", { name: "Call" })),
    );
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+99361000001");
    expect(state.requireSignIn).not.toHaveBeenCalled();
  });
  it.each([Enums.ListingStatus.Sold, Enums.ListingStatus.Archived])(
    "disables contact for %s listings",
    async (status) => {
      const screen = await renderMobile(<ContactCtaBar {...props} status={status} />);
      expect(
        screen.getByRole("button", { name: "Message" }).props.accessibilityState
          .disabled,
      ).toBe(true);
      await fireEvent.press(screen.getByRole("button", { name: "Message" }));
      expect(state.mutate).not.toHaveBeenCalled();
    },
  );
  it("disables Message when chat is unavailable or a request is pending", async () => {
    const screen = await renderMobile(<ContactCtaBar {...props} allowChat={false} />);
    expect(
      screen.getByRole("button", { name: "Message" }).props.accessibilityState
        .disabled,
    ).toBe(true);
    state.pending = true;
    await screen.rerender(<ContactCtaBar {...props} />);
    expect(
      screen.getByRole("button", { name: "Message" }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });
  it("parks the listing Message intent for an anonymous buyer", async () => {
    state.authenticated = false;
    const screen = await renderMobile(<ContactCtaBar {...props} />);
    await fireEvent.press(screen.getByRole("button", { name: "Message" }));
    expect(state.requireSignIn).toHaveBeenCalledWith(routerMock, {
      returnTo: "/(public)/listings/listing-373",
      action: { kind: "message", listingId: "listing-373" },
    });
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("opens the same conversation from a signed-in tap and post-sign-in replay", async () => {
    const screen = await renderMobile(<ContactCtaBar {...props} />);
    await fireEvent.press(screen.getByRole("button", { name: "Message" }));
    expect(state.mutate).toHaveBeenCalledWith(
      { listingId: "listing-373" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    state.authenticated = false;
    await screen.rerender(<ContactCtaBar {...props} />);
    state.replay?.();
    expect(state.mutate).toHaveBeenCalledTimes(2);
  });
  it("does not silently open a conversation before the session check finishes", async () => {
    state.authenticated = null;
    const screen = await renderMobile(<ContactCtaBar {...props} />);
    await fireEvent.press(screen.getByRole("button", { name: "Message" }));
    expect(state.mutate).not.toHaveBeenCalled();
    expect(state.requireSignIn).not.toHaveBeenCalled();
  });
});

describe("ContactCtaBar without calls", () => {
  it.each([
    ["the seller turned calls off", { allowCalls: false }],
    ["the Listing has no contact phone", { contactPhone: undefined }],
  ])("drops Call and gives Message the full width when %s", async (_reason, override) => {
    for (const variant of ["floating", "viewer"] as const) {
      const screen = await renderMobile(<ContactCtaBar {...props} {...override} variant={variant} />);
      expect(screen.queryByRole("button", { name: "Call" })).toBeNull();
      expect(screen.getAllByRole("button")).toHaveLength(1);
      const message = screen.getByRole("button", { name: "Message", disabled: false });
      expect(message.props.className).toContain("flex-1");
      await screen.unmount();
    }
  });
  it("keeps a disabled Call while the Listing is still loading", async () => {
    const screen = await renderMobile(<ContactCtaBar {...props} allowCalls={false} allowChat={false} contactPhone={undefined} pending />);
    expect(screen.getByRole("button", { name: "Call", disabled: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Message", disabled: true })).toBeTruthy();
  });
  it.each([Enums.ListingStatus.Sold, Enums.ListingStatus.Archived])("keeps a disabled Call on a %s Listing, with or without calls", async (status) => {
    for (const allowCalls of [true, false]) {
      const screen = await renderMobile(<ContactCtaBar {...props} allowCalls={allowCalls} status={status} />);
      expect(screen.getByRole("button", { name: "Call", disabled: true })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Message", disabled: true })).toBeTruthy();
      await screen.unmount();
    }
  });
});

vi.mock("react-native", async (original) => ({
  ...await original<typeof Native>(),
  Alert: { alert: vi.fn() },
}));

describe("Android dialer", () => {
  it("dials despite a false package-visibility check", async () => {
    vi.mocked(Linking.canOpenURL).mockResolvedValueOnce(false);
    const view = await renderMobile(<ContactCtaBar {...props} />);
    await act(async () => { await fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+99361000001");
  });
  it.each([
    [" +993 (61) 000-001", "tel:+99361000001"],
    ["993-61-000-001", "tel:99361000001"],
    ["+99361#000001;ext=2", "tel:+993610000012"],
    ["993+61/000001", "tel:99361000001"],
  ])("strips dial-control and formatting characters from %s", async (phone, uri) => {
    const view = await renderMobile(<ContactCtaBar {...props} contactPhone={phone} />);
    await act(async () => { await fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(Linking.openURL).toHaveBeenCalledWith(uri);
  });
  it("shows the number when the dialer fails", async () => {
    vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error("No dialer"));
    const view = await renderMobile(<ContactCtaBar {...props} />);
    await act(async () => { await fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(Alert.alert).toHaveBeenCalledWith("Call", "Could not open the dialer. Call +99361000001 manually.");
  });
});
