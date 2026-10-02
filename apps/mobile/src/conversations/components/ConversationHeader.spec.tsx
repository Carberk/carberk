import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Linking from "expo-linking";

import { act, fireEvent, renderMobile } from "../../../test/render";
import type { ConversationDetail } from "../../api/conversations/useConversation";

import { ConversationHeader } from "./ConversationHeader";

vi.mock("expo-linking", () => ({
  canOpenURL: vi.fn(async () => true),
  openURL: vi.fn(async () => {}),
}));

const SELLER = "00000000-0000-4000-8000-0000000000b2";
const BUYER = "00000000-0000-4000-8000-0000000000b1";

function conversation(updates: Partial<ConversationDetail> = {}): ConversationDetail {
  return {
    id: "00000000-0000-4000-8000-0000000000c1",
    listing: null,
    buyerId: BUYER,
    sellerId: SELLER,
    myRole: "buyer",
    peer: { id: SELLER, displayName: "Merdan Ataýew" },
    blockedByMe: false,
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...updates,
  };
}

const handlers = {
  onBack: vi.fn(),
  onToggleMute: vi.fn(),
  onBlock: vi.fn(),
  onUnblock: vi.fn(),
};

function header(props: Partial<React.ComponentProps<typeof ConversationHeader>> = {}) {
  return renderMobile(
    <ConversationHeader
      conversation={conversation()}
      loading={false}
      presence={{ online: false, lastSeenAt: new Date(Date.now() - 5 * 60_000).toISOString() }}
      isMuted={false}
      isBlocked={false}
      {...handlers}
      {...props}
    />,
  );
}

beforeEach(() => {
  Object.values(handlers).forEach((handler) => handler.mockClear());
  vi.mocked(Linking.openURL).mockClear();
});

describe("ConversationHeader", () => {
  it("shows the other participant's initial, one-line name and last seen", () => {
    const screen = header();

    expect(screen.getByText("M", { includeHiddenElements: true })).toBeTruthy();
    const name = screen.getByText("Merdan Ataýew");
    expect(name.props.numberOfLines).toBe(1);
    expect(screen.getByText("last seen 5 min ago")).toBeTruthy();
  });

  it("labels Back, Call and the menu, each on a 44 pt target", () => {
    const screen = header({ callPhone: "+99361000000" });

    for (const name of ["Go back", "Call the seller", "Conversation actions"]) {
      expect(screen.getByRole("button", { name }).props.className).toContain("h-11 w-11");
    }
    fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(handlers.onBack).toHaveBeenCalledOnce();
  });

  it("dials the given Listing contact phone", async () => {
    const screen = header({ callPhone: "+99361000000" });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Call the seller" }));
    });
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+99361000000");
  });

  it("has no Call without a phone", () => {
    expect(header().queryByRole("button", { name: "Call the seller" })).toBeNull();
  });

  it("names a seller without a display name Private seller", () => {
    const screen = header({ conversation: conversation({ peer: { id: SELLER, displayName: null } }) });
    expect(screen.getByText("Private seller")).toBeTruthy();
  });

  it("names a buyer without a display name Buyer", () => {
    const screen = header({
      conversation: conversation({ myRole: "seller", peer: { id: BUYER, displayName: "  " } }),
    });
    expect(screen.getByText("Buyer")).toBeTruthy();
  });

  it("shows the muted bell when muted", () => {
    expect(header({ isMuted: true }).getByLabelText("Notifications muted")).toBeTruthy();
    expect(header().queryByLabelText("Notifications muted")).toBeNull();
  });

  it("opens the menu sheet with Mute, Report and Block from the ⋯ button", () => {
    const onReport = vi.fn();
    const screen = header({ onReport });
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "Conversation actions" }));
    fireEvent.press(screen.getByRole("button", { name: "Report" }));
    expect(onReport).toHaveBeenCalledOnce();
    // Each item closes the sheet before its action runs.
    expect(screen.queryByRole("button", { name: "Block user" })).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "Conversation actions" }));
    fireEvent.press(screen.getByRole("button", { name: "Mute notifications" }));
    fireEvent.press(screen.getByRole("button", { name: "Conversation actions" }));
    fireEvent.press(screen.getByRole("button", { name: "Block user" }));
    expect(handlers.onToggleMute).toHaveBeenCalledOnce();
    expect(handlers.onBlock).toHaveBeenCalledOnce();
  });

  it("leaves Report out of the menu without a report action", () => {
    const screen = header();
    fireEvent.press(screen.getByRole("button", { name: "Conversation actions" }));

    expect(screen.getByRole("button", { name: "Block user" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  });

  it("offers Unmute and Unblock when muted and blocked", () => {
    const screen = header({ isMuted: true, isBlocked: true });
    fireEvent.press(screen.getByRole("button", { name: "Conversation actions" }));
    expect(screen.getByRole("button", { name: "Unmute notifications" })).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Unblock user" }));
    expect(handlers.onUnblock).toHaveBeenCalledOnce();
  });

  it("shows skeletons and only Back while loading", () => {
    const screen = header({ conversation: undefined, loading: true });

    expect(screen.getByTestId("conversation-header-skeleton")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go back" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conversation actions" })).toBeNull();
  });

  it("shows only Back when the Conversation failed to load", () => {
    const screen = header({ conversation: undefined, loading: false });

    expect(screen.queryByTestId("conversation-header-skeleton")).toBeNull();
    expect(screen.getByRole("button", { name: "Go back" })).toBeTruthy();
  });

  it("is localized", () => {
    const screen = renderMobile(
      <ConversationHeader
        conversation={conversation({ peer: { id: SELLER, displayName: null } })}
        loading={false}
        presence={{ online: true }}
        callPhone="+99361000000"
        isMuted={false}
        isBlocked={false}
        {...handlers}
      />,
      { locale: "ru" },
    );
    expect(screen.getByText("Частный продавец")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Позвонить продавцу" })).toBeTruthy();
  });
});
