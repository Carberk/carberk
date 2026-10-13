import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Linking from "expo-linking";

import { act, fireEvent, first, renderMobile, getHost, queryHost, queryAllHosts } from "../../../test/render";
import type { ConversationDetail } from "../../api/conversations/useConversation";

import { ConversationHeader } from "./ConversationHeader";

vi.mock("expo-linking", () => ({
  canOpenURL: vi.fn(async () => true),
  openURL: vi.fn(async () => {}),
}));

const SELLER = "00000000-0000-4000-8000-0000000000b2";
const BUYER = "00000000-0000-4000-8000-0000000000b1";

type View = Awaited<ReturnType<typeof renderMobile>>;
type Host = { type: unknown; props: Record<string, unknown>; parent: Host | null };

/** Rendered host nodes of one native type, such as the avatar's `Svg`. */
const hosts = (view: View, type: string) => queryAllHosts(view.container, type) as unknown as Host[];
const marks = (view: View) => hosts(view, "Path").map((path) => path.props.d);
const personIcons = (view: View) => hosts(view, "Icon").filter((icon) => icon.props.name === "User");
/** The native view that holds the car mark: the avatar's circle. */
function avatarCircle(view: View): Record<string, unknown> {
  let node = first(hosts(view, "Svg")).parent;
  while (node && typeof node.type !== "string") node = node.parent;
  return node?.props ?? {};
}
/** Where a piece of the drawn header first appears, to compare left-to-right order. */
const position = (view: View, piece: string) => JSON.stringify(view.toJSON()).indexOf(piece);

// The first stroke of the key, the mark for avatar index 7.
const KEY_MARK = "M11.5 12H21M17 12v3M20 12v2.4M6.5 12h.01";
const PHOTO_KEY = "avatars/u2/original.jpg";
const PHOTO_URL = "https://media.autotm.tm/listing-photos/avatars/u2/thumbnail.jpg";

/** Merdan Ataýew, avatar index 7, name number 2057, no photo. */
function peer(id: string, updates: Partial<ConversationDetail["peer"]> = {}): ConversationDetail["peer"] {
  return { id, displayName: "Merdan Ataýew", nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false, ...updates };
}

function conversation(updates: Partial<ConversationDetail> = {}): ConversationDetail {
  return {
    id: "00000000-0000-4000-8000-0000000000c1",
    listing: null,
    buyerId: BUYER,
    sellerId: SELLER,
    myRole: "buyer",
    peer: peer(SELLER),
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
  it("shows the other participant's car mark at 36 points left of the one-line name, and last seen", async () => {
    const screen = await header();

    expect(marks(screen)[0]).toBe(KEY_MARK);
    expect(avatarCircle(screen).style).toMatchObject({ width: 36, height: 36 });
    expect(position(screen, KEY_MARK)).toBeGreaterThan(-1);
    expect(position(screen, KEY_MARK)).toBeLessThan(position(screen, "Merdan Ataýew"));
    expect(screen.queryByText("M", { includeHiddenElements: true })).toBeNull();
    expect(personIcons(screen)).toHaveLength(0);
    const name = screen.getByText("Merdan Ataýew");
    expect(name.props.numberOfLines).toBe(1);
    expect(screen.getByText("last seen 5 min ago")).toBeTruthy();
  });

  it("shows the other participant's photo at 36 points instead of the car mark", async () => {
    const screen = await header({ conversation: conversation({ peer: peer(SELLER, { avatarKey: PHOTO_KEY }) }) });

    const photo = getHost(screen.container, "Image");
    expect(photo.props.source).toEqual({ uri: PHOTO_URL });
    expect(photo.props.style).toMatchObject({ width: 36, height: 36 });
    expect(hosts(screen, "Svg")).toHaveLength(0);
  });

  it("goes back to the car mark when the photo does not load", async () => {
    const screen = await header({ conversation: conversation({ peer: peer(SELLER, { avatarKey: PHOTO_KEY }) }) });

    await fireEvent(getHost(screen.container, "Image"), "error");
    expect(queryHost(screen.container, "Image")).toBeNull();
    expect(marks(screen)[0]).toBe(KEY_MARK);
  });

  it("is heard as the name once: the avatar is not read on its own", async () => {
    const screen = await header();

    expect(screen.getAllByText("Merdan Ataýew")).toHaveLength(1);
    expect(screen.queryByRole("image")).toBeNull();
    expect(screen.queryByLabelText("Merdan Ataýew")).toBeNull();
    expect(avatarCircle(screen)).toMatchObject({
      accessible: false, accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants",
    });
  });

  it.each([
    ["en", "Abdyrahman Gurbanguly Atamyrad"],
    ["ru", "Абдырахман Гурбангулыев Атамыр"],
    ["tk", "Abdyrahman Gurbangulyýew Çaryý"],
  ])("keeps a 30-character name on one line that ends in an ellipsis in %s", async (locale, name) => {
    expect(name).toHaveLength(30);
    const screen = await renderMobile(
      <ConversationHeader
        conversation={conversation({ peer: peer(SELLER, { displayName: name }) })}
        loading={false}
        presence={{ online: true }}
        isMuted={false}
        isBlocked={false}
        {...handlers}
      />,
      { locale },
    );
    expect(screen.getByText(name).props).toMatchObject({ numberOfLines: 1, ellipsizeMode: "tail" });
  });

  it("labels Back, Call and the menu, each on a 44 pt target", async () => {
    const screen = await header({ callPhone: "+99361000000" });

    for (const name of ["Go back", "Call the seller", "Conversation actions"]) {
      expect(screen.getByRole("button", { name }).props.className).toContain("h-11 w-11");
    }
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(handlers.onBack).toHaveBeenCalledOnce();
  });

  it("dials the given Listing contact phone", async () => {
    const screen = await header({ callPhone: "+99361000000" });

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Call the seller" }));
    });
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+99361000000");
  });

  it("has no Call without a phone", async () => {
    expect((await header()).queryByRole("button", { name: "Call the seller" })).toBeNull();
  });

  it("names a seller without a name of their own by their generated name, not Private seller", async () => {
    const screen = await header({ conversation: conversation({ peer: peer(SELLER, { displayName: null }) }) });
    expect(screen.getByText("Driver 2057")).toBeTruthy();
    expect(screen.queryByText("Private seller")).toBeNull();
  });

  it("names a buyer without a name of their own by their generated name, not Buyer", async () => {
    const screen = await header({
      conversation: conversation({ myRole: "seller", peer: peer(BUYER, { displayName: "  ", nameNumber: 4821 }) }),
    });
    expect(screen.getByText("Driver 4821")).toBeTruthy();
    expect(screen.queryByText("Buyer")).toBeNull();
  });

  it("names a deleted seller Deleted user, with the person icon and no car", async () => {
    const screen = await header({ conversation: conversation({ peer: peer(SELLER, { displayName: null, deleted: true }) }) });
    expect(screen.getByText("Deleted user")).toBeTruthy();
    expect(screen.queryByText("Private seller")).toBeNull();
    expect(screen.queryByText("Driver 2057")).toBeNull();
    expect(personIcons(screen)).toHaveLength(1);
    expect(hosts(screen, "Svg")).toHaveLength(0);
  });

  it("names a deleted buyer Deleted user, with the person icon and no car", async () => {
    const screen = await header({
      conversation: conversation({ myRole: "seller", peer: peer(BUYER, { displayName: null, deleted: true }) }),
    });
    expect(screen.getByText("Deleted user")).toBeTruthy();
    expect(screen.queryByText("Buyer")).toBeNull();
    expect(personIcons(screen)).toHaveLength(1);
    expect(hosts(screen, "Svg")).toHaveLength(0);
  });

  it("shows the muted bell when muted", async () => {
    expect((await header({ isMuted: true })).getByLabelText("Notifications muted")).toBeTruthy();
    expect((await header()).queryByLabelText("Notifications muted")).toBeNull();
  });

  it("opens the menu sheet with Mute, Report and Block from the ⋯ button", async () => {
    const onReport = vi.fn();
    const screen = await header({ onReport });
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Conversation actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Report" }));
    expect(onReport).toHaveBeenCalledOnce();
    // Each item closes the sheet before its action runs.
    expect(screen.queryByRole("button", { name: "Block user" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Conversation actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Mute notifications" }));
    await fireEvent.press(screen.getByRole("button", { name: "Conversation actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Block user" }));
    expect(handlers.onToggleMute).toHaveBeenCalledOnce();
    expect(handlers.onBlock).toHaveBeenCalledOnce();
  });

  it("leaves Report out of the menu without a report action", async () => {
    const screen = await header();
    await fireEvent.press(screen.getByRole("button", { name: "Conversation actions" }));

    expect(screen.getByRole("button", { name: "Block user" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  });

  it("offers Unmute and Unblock when muted and blocked", async () => {
    const screen = await header({ isMuted: true, isBlocked: true });
    await fireEvent.press(screen.getByRole("button", { name: "Conversation actions" }));
    expect(screen.getByRole("button", { name: "Unmute notifications" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Unblock user" }));
    expect(handlers.onUnblock).toHaveBeenCalledOnce();
  });

  it("shows skeletons and only Back while loading", async () => {
    const screen = await header({ conversation: undefined, loading: true });

    expect(screen.getByTestId("conversation-header-skeleton")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go back" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conversation actions" })).toBeNull();
  });

  it("shows only Back when the Conversation failed to load", async () => {
    const screen = await header({ conversation: undefined, loading: false });

    expect(screen.queryByTestId("conversation-header-skeleton")).toBeNull();
    expect(screen.getByRole("button", { name: "Go back" })).toBeTruthy();
  });

  it.each([
    ["ru", "Водитель 2057", "Позвонить продавцу"],
    ["tk", "Sürüji 2057", null],
  ])("is localized in %s, generated name included", async (locale, name, call) => {
    const screen = await renderMobile(
      <ConversationHeader
        conversation={conversation({ peer: peer(SELLER, { displayName: null }) })}
        loading={false}
        presence={{ online: true }}
        callPhone="+99361000000"
        isMuted={false}
        isBlocked={false}
        {...handlers}
      />,
      { locale },
    );
    expect(screen.getByText(name)).toBeTruthy();
    if (call) expect(screen.getByRole("button", { name: call })).toBeTruthy();
  });

  it("names a deleted User in Russian as the account deletion screen does", async () => {
    const screen = await renderMobile(
      <ConversationHeader
        conversation={conversation({ peer: peer(SELLER, { displayName: null, deleted: true }) })}
        loading={false}
        presence={{ online: true }}
        isMuted={false}
        isBlocked={false}
        {...handlers}
      />,
      { locale: "ru" },
    );
    expect(screen.getByText("Удалённый пользователь")).toBeTruthy();
  });
});
