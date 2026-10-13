import { describe, it, expect } from "vitest";
import { Image } from "expo-image";

import { fireEvent, first, renderMobile, routerMock, within, queryAllHosts, getHost } from "../../../test/render";
import { contrast, cssTokens, rgb, type ThemeName } from "../../../test/tokens";
import { queryKeys } from "../../api/queryKeys";
import type { ConversationSummaryData } from "../../api/conversations/useConversation";

import { ConversationListItem } from "./ConversationListItem";

const BUYER = "00000000-0000-4000-8000-0000000000b1";
const SELLER = "00000000-0000-4000-8000-0000000000b2";
const CONVERSATION = "00000000-0000-4000-8000-0000000000c1";

const listing = {
  id: "00000000-0000-4000-8000-0000000000a1",
  brandId: "00000000-0000-4000-8000-0000000000d1",
  modelId: "00000000-0000-4000-8000-0000000000e1",
  year: 2018,
  displayPriceTmt: 285000,
  priceCurrency: "TMT" as const,
  coverMediaKey: "listings/a1/cover.jpg",
  status: "active" as const,
};

function message(senderId: string, overrides: Partial<NonNullable<ConversationSummaryData["lastMessage"]>> = {}) {
  return {
    id: "00000000-0000-4000-8000-0000000000f1",
    conversationId: CONVERSATION,
    senderId,
    kind: "text" as const,
    text: "Yes, it is still for sale",
    createdAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

type Row = Awaited<ReturnType<typeof renderMobile>>;
type Host = { type: unknown; props: Record<string, unknown>; parent: Host | null };

/** Rendered host nodes of one native type, such as the avatar's `Svg`. */
const hosts = (row: Row, type: string) => queryAllHosts(row.container, type) as unknown as Host[];
const marks = (row: Row) => hosts(row, "Path").map((path) => path.props.d);
const personIcons = (row: Row) => hosts(row, "Icon").filter((icon) => icon.props.name === "User");
/** The native view that holds the car mark: the avatar's circle. */
function avatarCircle(row: Row): Record<string, unknown> {
  let node = first(hosts(row, "Svg")).parent;
  while (node && typeof node.type !== "string") node = node.parent;
  return node?.props ?? {};
}
/** The photos drawn inside the badge on the thumbnail's corner. */
const badgePhotos = (row: Row) => queryAllHosts(row.getByTestId("conversation-row-peer-avatar"), "Image");

// The first stroke of the key, the mark for avatar index 7.
const KEY_MARK = "M11.5 12H21M17 12v3M20 12v2.4M6.5 12h.01";
const PHOTO_KEY = "avatars/u2/original.jpg";
const PHOTO_URL = "https://media.autotm.tm/listing-photos/avatars/u2/thumbnail.jpg";

/** Merdan, avatar index 7, name number 2057, no photo. */
function peer(id: string, updates: Partial<ConversationSummaryData["peer"]> = {}): ConversationSummaryData["peer"] {
  return { id, displayName: "Merdan", nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false, ...updates };
}

/** The viewer is the buyer unless `myRole` says otherwise; the peer is Merdan, the seller. */
function summary(overrides: Partial<ConversationSummaryData> = {}): ConversationSummaryData {
  return {
    id: CONVERSATION,
    listing,
    buyerId: BUYER,
    sellerId: SELLER,
    myRole: "buyer",
    peer: peer(SELLER),
    blockedByMe: false,
    lastMessage: message(SELLER),
    updatedAt: "2026-10-01T10:00:00.000Z",
    unreadCount: 0,
    ...overrides,
  };
}

function renderRow(conversation: ConversationSummaryData, locale = "en") {
  return renderMobile(
    <ConversationListItem conversation={conversation} brandName="Toyota" modelName="Camry" />,
    { locale },
  );
}

describe("ConversationListItem", () => {
  it("shows the other participant, the Listing line and the last Message", async () => {
    const row = await renderRow(summary());

    expect(row.getByText("Merdan")).toBeTruthy();
    expect(row.getByText(/^Toyota Camry, 2018 · 285,000 TMT$/)).toBeTruthy();
    expect(row.getByText("Yes, it is still for sale")).toBeTruthy();
    expect(row.getByTestId("conversation-row-thumbnail").props.className).not.toContain("opacity");
    expect(row.queryByText("You are buyer")).toBeNull();
    expect(row.queryByText("You are seller")).toBeNull();
  });

  it("keeps the Listing line to one line", async () => {
    const row = await renderRow(summary());
    expect(row.getByText(/^Toyota Camry, 2018/).props.numberOfLines).toBe(1);
  });

  it("shows a bold preview and the unread count when there are unread Messages", async () => {
    const row = await renderRow(summary({ unreadCount: 2 }));

    expect(row.getByText("2")).toBeTruthy();
    expect(row.getByText("Yes, it is still for sale").props.className).toContain("font-semibold");
  });

  it("caps the unread badge at 99+", async () => {
    const row = await renderRow(summary({ unreadCount: 150 }));
    expect(row.getByText("99+")).toBeTruthy();
  });

  it("shows a regular preview with no badge when everything is read", async () => {
    const row = await renderRow(summary());
    expect(row.getByText("Yes, it is still for sale").props.className).not.toContain("font-semibold");
    expect(row.queryByTestId("conversation-row-unread")).toBeNull();
  });

  it("shows the muted bell for a muted Conversation only", async () => {
    expect((await renderRow(summary({ mutedAt: "2026-09-30T10:00:00.000Z" }))).getByTestId("conversation-row-muted")).toBeTruthy();
    expect((await renderRow(summary({ mutedAt: null }))).queryByTestId("conversation-row-muted")).toBeNull();
  });

  it("shows one tick for the viewer's own sent last Message", async () => {
    const row = await renderRow(summary({ lastMessage: message(BUYER) }));
    expect(row.getByTestId("conversation-row-tick-sent")).toBeTruthy();
  });

  it("shows two ticks once the other participant received or read the viewer's last Message", async () => {
    const delivered = await renderRow(summary({ lastMessage: message(BUYER), peerLastDeliveredAt: "2026-10-01T10:00:05.000Z" }));
    expect(delivered.getByTestId("conversation-row-tick-delivered")).toBeTruthy();

    const read = await renderRow(summary({ lastMessage: message(BUYER), peerLastReadAt: "2026-10-01T10:00:05.000Z" }));
    expect(read.getByTestId("conversation-row-tick-read")).toBeTruthy();
  });

  it("colours the read ✓✓ blue and leaves sent and delivered grey (#821)", async () => {
    const iconClass = (row: Row, id: string) => {
      const icon = row.getByTestId(id).queryAll((node) => String(node.props.className ?? "").includes("size-3.5"), { includeSelf: true })[0];
      return String(icon?.props.className ?? "");
    };
    const sent = await renderRow(summary({ lastMessage: message(BUYER) }));
    expect(iconClass(sent, "conversation-row-tick-sent")).toContain("text-muted-foreground");
    const delivered = await renderRow(summary({ lastMessage: message(BUYER), peerLastDeliveredAt: "2026-10-01T10:00:05.000Z" }));
    expect(iconClass(delivered, "conversation-row-tick-delivered")).toContain("text-muted-foreground");
    const read = await renderRow(summary({ lastMessage: message(BUYER), peerLastReadAt: "2026-10-01T10:00:05.000Z" }));
    expect(iconClass(read, "conversation-row-tick-read")).toContain("text-message-read");
  });

  it.each(["light", "dark"] as ThemeName[])("reads the read ✓✓ on the %s page at 3:1 or better (#821)", (theme) => {
    const tokens = cssTokens(theme);
    expect(contrast(rgb(tokens["message-read"] ?? ""), rgb(tokens.background ?? ""))).toBeGreaterThanOrEqual(3);
  });

  it("shows no tick when the last Message is the other participant's", async () => {
    const row = await renderRow(summary({ peerLastReadAt: "2026-10-01T10:00:05.000Z" }));
    expect(row.queryByTestId(/^conversation-row-tick/)).toBeNull();
  });

  it("works out the viewer's own Messages from the seller side too", async () => {
    const row = await renderRow(summary({ myRole: "seller", peer: peer(BUYER, { displayName: "Aman" }), lastMessage: message(SELLER) }));
    expect(row.getByTestId("conversation-row-tick-sent")).toBeTruthy();
  });

  it("dims the thumbnail and shows a Sold badge for a sold Listing", async () => {
    const row = await renderRow(summary({ listing: { ...listing, status: "sold" } }));
    expect(row.getByText("Sold")).toBeTruthy();
    expect(row.getByTestId("conversation-row-thumbnail").props.className).toContain("opacity-60");
  });

  it("dims the thumbnail and shows Removed from sale for an archived Listing", async () => {
    const row = await renderRow(summary({ listing: { ...listing, status: "archived" } }));
    expect(row.getByText("Removed from sale")).toBeTruthy();
    expect(row.getByTestId("conversation-row-thumbnail").props.className).toContain("opacity-60");
  });

  it("dims the thumbnail and reads Unavailable for any other closed Listing", async () => {
    for (const status of ["pending_review", "rejected", "banned"] as const) {
      const row = await renderRow(summary({ listing: { ...listing, status } }));
      expect(row.getByText("Unavailable")).toBeTruthy();
      expect(row.getByTestId("conversation-row-thumbnail").props.className).toContain("opacity-60");
    }
  });

  it("replaces the preview with User blocked when the viewer blocked the other participant", async () => {
    const row = await renderRow(summary({ blockedByMe: true }));
    expect(row.getByText("User blocked")).toBeTruthy();
    expect(row.queryByText("Yes, it is still for sale")).toBeNull();
  });

  it("shows the unavailable label and a placeholder with no Listing", async () => {
    const row = await renderRow(summary({ listing: null }));
    expect(row.getByText("Listing unavailable")).toBeTruthy();
    expect(row.getByTestId("conversation-row-placeholder")).toBeTruthy();
  });

  it("shows a placeholder when the Listing has no photo", async () => {
    const row = await renderRow(summary({ listing: { ...listing, coverMediaKey: undefined } }));
    expect(row.getByTestId("conversation-row-placeholder")).toBeTruthy();
  });

  it("names a seller or a buyer without a name of their own by their generated name", async () => {
    const seller = await renderRow(summary({ peer: peer(SELLER, { displayName: null }) }));
    expect(seller.getByText("Driver 2057")).toBeTruthy();
    expect(seller.queryByText("Private seller")).toBeNull();

    const buyer = await renderRow(summary({ myRole: "seller", peer: peer(BUYER, { displayName: "  ", nameNumber: 4821 }) }));
    expect(buyer.getByText("Driver 4821")).toBeTruthy();
    expect(buyer.queryByText("Buyer")).toBeNull();
  });

  it.each([
    ["en", "Driver 2057"],
    ["ru", "Водитель 2057"],
    ["tk", "Sürüji 2057"],
  ])("writes the generated name in %s", async (locale, name) => {
    expect((await renderRow(summary({ peer: peer(SELLER, { displayName: null }) }), locale)).getByText(name)).toBeTruthy();
  });

  it("names a deleted seller or buyer Deleted user, with the person icon and no car", async () => {
    const seller = await renderRow(summary({ peer: peer(SELLER, { displayName: null, deleted: true }) }));
    expect(seller.getByText("Deleted user")).toBeTruthy();
    expect(seller.queryByText("Driver 2057")).toBeNull();
    expect(personIcons(seller)).toHaveLength(1);
    expect(hosts(seller, "Svg")).toHaveLength(0);

    const buyer = await renderRow(summary({ myRole: "seller", peer: peer(BUYER, { displayName: null, deleted: true }) }));
    expect(buyer.getByText("Deleted user")).toBeTruthy();
    expect(buyer.queryByText("Buyer")).toBeNull();
    expect(personIcons(buyer)).toHaveLength(1);
    expect(hosts(buyer, "Svg")).toHaveLength(0);
  });

  it.each([
    ["en", "Abdyrahman Gurbanguly Atamyrad"],
    ["ru", "Абдырахман Гурбангулыев Атамыр"],
    ["tk", "Abdyrahman Gurbangulyýew Çaryý"],
  ])("keeps a 30-character name on one line that ends in an ellipsis in %s", async (locale, name) => {
    expect(name).toHaveLength(30);
    const row = await renderRow(summary({ peer: peer(SELLER, { displayName: name }) }), locale);
    expect(row.getByText(name).props).toMatchObject({ numberOfLines: 1, ellipsizeMode: "tail" });
  });

  it("keeps the photo, Listing and deleted previews", async () => {
    expect((await renderRow(summary({ lastMessage: message(SELLER, { kind: "image", text: null }) }))).getByText("Photo")).toBeTruthy();
    expect((await renderRow(summary({ lastMessage: message(SELLER, { kind: "post_ref", text: null }) }))).getByText("Listing")).toBeTruthy();
    expect(
      (await renderRow(summary({ lastMessage: message(SELLER, { deletedAt: "2026-10-01T10:01:00.000Z" }) }))).getByText("Message deleted"),
    ).toBeTruthy();
  });

  it("reads the name, the Listing, the preview and the unread count as one label", async () => {
    const row = await renderRow(summary({ unreadCount: 3 }));
    expect(row.getByRole("button").props.accessibilityLabel).toBe(
      "Merdan, Toyota Camry, 2018 · 285,000 TMT, Yes, it is still for sale, Unread: 3",
    );
  });

  it("leaves the unread count out of the label when everything is read", async () => {
    const row = await renderRow(summary({ blockedByMe: true }));
    expect(row.getByRole("button").props.accessibilityLabel).toBe(
      "Merdan, Toyota Camry, 2018 · 285,000 TMT, User blocked",
    );
  });

  it("shows Russian and Turkmen copy", async () => {
    const ru = await renderRow(summary({ listing: { ...listing, status: "sold" }, blockedByMe: true }), "ru");
    expect(ru.getByText("Продано")).toBeTruthy();
    expect(ru.getByText("Пользователь заблокирован")).toBeTruthy();

    const tk = await renderRow(summary({ listing: null, peer: peer(SELLER, { displayName: null, deleted: true }) }), "tk");
    expect(tk.getByText("Pozulan ulanyjy")).toBeTruthy();
    expect(tk.getByText("Bildiriş elýeterli däl")).toBeTruthy();
  });
});

describe("ConversationListItem avatar badge", () => {
  it("puts the other participant's car mark on the thumbnail's lower corner as a 24-point badge", async () => {
    const row = await renderRow(summary());
    const badge = row.getByTestId("conversation-row-peer-avatar");

    expect(marks(row)[0]).toBe(KEY_MARK);
    expect(avatarCircle(row).style).toMatchObject({ width: 24, height: 24 });
    expect(badge.props.className).toContain("absolute");
    expect(badge.props.className).toContain("-bottom-1");
    expect(badge.props.className).toContain("-right-1");
    expect(personIcons(row)).toHaveLength(0);
  });

  it("rings the badge in the background colour so it reads on any photo", async () => {
    const badge = (await renderRow(summary())).getByTestId("conversation-row-peer-avatar");
    expect(badge.props.className).toContain("rounded-full");
    expect(badge.props.className).toContain("bg-background");
    expect(badge.props.className).toContain("p-0.5");
  });

  it("still leads the row with the Listing thumbnail, whose photo the badge does not replace", async () => {
    const row = await renderRow(summary({ peer: peer(SELLER, { avatarKey: PHOTO_KEY }) }));
    const thumbnail = getHost(row.getByTestId("conversation-row-thumbnail"), "Image");
    expect(thumbnail.props.source).toEqual({ uri: "https://media.autotm.tm/listing-photos/listings/a1/cover.jpg/thumbnail.jpg" });
    // The badge sits beside the clipped thumbnail, not inside it, so it is not clipped or dimmed.
    expect(within(row.getByTestId("conversation-row-thumbnail")).queryByTestId("conversation-row-peer-avatar")).toBeNull();
  });

  it("shows the other participant's photo in the badge, sized for 24 points", async () => {
    const row = await renderRow(summary({ peer: peer(SELLER, { avatarKey: PHOTO_KEY }) }));
    const photos = badgePhotos(row);

    expect(photos).toHaveLength(1);
    expect(first(photos).props.source).toEqual({ uri: PHOTO_URL });
    expect(first(photos).props.style).toMatchObject({ width: 24, height: 24 });
    expect(hosts(row, "Svg")).toHaveLength(0);
  });

  it("goes back to the car mark when the photo does not load", async () => {
    const row = await renderRow(summary({ peer: peer(SELLER, { avatarKey: PHOTO_KEY }) }));
    await fireEvent(first(badgePhotos(row)), "error");

    expect(badgePhotos(row)).toHaveLength(0);
    expect(marks(row)[0]).toBe(KEY_MARK);
  });

  it("is not read on its own: the row stays one button whose label carries the name", async () => {
    const row = await renderRow(summary());

    expect(row.getAllByRole("button")).toHaveLength(1);
    expect(row.queryByRole("image")).toBeNull();
    expect(avatarCircle(row)).toMatchObject({
      accessible: false, accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants",
    });
    expect(row.getByRole("button").props.accessibilityLabel).toBe(
      "Merdan, Toyota Camry, 2018 · 285,000 TMT, Yes, it is still for sale",
    );
  });
});

describe("ConversationListItem press", () => {
  it("opens the Conversation by ID and seeds the by-ID cache with the row's summary", async () => {
    const conversation = summary();
    const row = await renderRow(conversation);

    await fireEvent.press(row.getByRole("button"));

    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/conversations/[id]",
      params: { id: conversation.id },
    });
    expect(row.queryClient.getQueryData(queryKeys.conversations.detail(conversation.id))).toEqual(conversation);
  });
});
