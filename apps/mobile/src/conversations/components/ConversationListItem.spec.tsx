import { describe, it, expect } from "vitest";

import { fireEvent, renderMobile, routerMock } from "../../../test/render";
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

/** The viewer is the buyer unless `myRole` says otherwise; the peer is Merdan, the seller. */
function summary(overrides: Partial<ConversationSummaryData> = {}): ConversationSummaryData {
  return {
    id: CONVERSATION,
    listing,
    buyerId: BUYER,
    sellerId: SELLER,
    myRole: "buyer",
    peer: { id: SELLER, displayName: "Merdan" },
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
  it("shows the other participant, the Listing line and the last Message", () => {
    const row = renderRow(summary());

    expect(row.getByText("Merdan")).toBeTruthy();
    expect(row.getByText(/^2018 Toyota Camry · 285,000 TMT$/)).toBeTruthy();
    expect(row.getByText("Yes, it is still for sale")).toBeTruthy();
    expect(row.getByTestId("conversation-row-thumbnail").props.className).not.toContain("opacity");
    expect(row.queryByText("You are buyer")).toBeNull();
    expect(row.queryByText("You are seller")).toBeNull();
  });

  it("keeps the Listing line to one line", () => {
    const row = renderRow(summary());
    expect(row.getByText(/^2018 Toyota Camry/).props.numberOfLines).toBe(1);
  });

  it("shows a bold preview and the unread count when there are unread Messages", () => {
    const row = renderRow(summary({ unreadCount: 2 }));

    expect(row.getByText("2")).toBeTruthy();
    expect(row.getByText("Yes, it is still for sale").props.className).toContain("font-semibold");
  });

  it("caps the unread badge at 99+", () => {
    const row = renderRow(summary({ unreadCount: 150 }));
    expect(row.getByText("99+")).toBeTruthy();
  });

  it("shows a regular preview with no badge when everything is read", () => {
    const row = renderRow(summary());
    expect(row.getByText("Yes, it is still for sale").props.className).not.toContain("font-semibold");
    expect(row.queryByTestId("conversation-row-unread")).toBeNull();
  });

  it("shows the muted bell for a muted Conversation only", () => {
    expect(renderRow(summary({ mutedAt: "2026-09-30T10:00:00.000Z" })).getByTestId("conversation-row-muted")).toBeTruthy();
    expect(renderRow(summary({ mutedAt: null })).queryByTestId("conversation-row-muted")).toBeNull();
  });

  it("shows one tick for the viewer's own sent last Message", () => {
    const row = renderRow(summary({ lastMessage: message(BUYER) }));
    expect(row.getByTestId("conversation-row-tick-sent")).toBeTruthy();
  });

  it("shows two ticks once the other participant received or read the viewer's last Message", () => {
    const delivered = renderRow(summary({ lastMessage: message(BUYER), peerLastDeliveredAt: "2026-10-01T10:00:05.000Z" }));
    expect(delivered.getByTestId("conversation-row-tick-delivered")).toBeTruthy();

    const read = renderRow(summary({ lastMessage: message(BUYER), peerLastReadAt: "2026-10-01T10:00:05.000Z" }));
    expect(read.getByTestId("conversation-row-tick-read")).toBeTruthy();
  });

  it("shows no tick when the last Message is the other participant's", () => {
    const row = renderRow(summary({ peerLastReadAt: "2026-10-01T10:00:05.000Z" }));
    expect(row.queryByTestId(/^conversation-row-tick/)).toBeNull();
  });

  it("works out the viewer's own Messages from the seller side too", () => {
    const row = renderRow(summary({ myRole: "seller", peer: { id: BUYER, displayName: "Aman" }, lastMessage: message(SELLER) }));
    expect(row.getByTestId("conversation-row-tick-sent")).toBeTruthy();
  });

  it("dims the thumbnail and shows a Sold badge for a sold Listing", () => {
    const row = renderRow(summary({ listing: { ...listing, status: "sold" } }));
    expect(row.getByText("Sold")).toBeTruthy();
    expect(row.getByTestId("conversation-row-thumbnail").props.className).toContain("opacity-60");
  });

  it("dims the thumbnail and shows Removed from sale for an archived Listing", () => {
    const row = renderRow(summary({ listing: { ...listing, status: "archived" } }));
    expect(row.getByText("Removed from sale")).toBeTruthy();
    expect(row.getByTestId("conversation-row-thumbnail").props.className).toContain("opacity-60");
  });

  it("dims the thumbnail and reads Unavailable for any other closed Listing", () => {
    for (const status of ["pending_review", "rejected", "banned"] as const) {
      const row = renderRow(summary({ listing: { ...listing, status } }));
      expect(row.getByText("Unavailable")).toBeTruthy();
      expect(row.getByTestId("conversation-row-thumbnail").props.className).toContain("opacity-60");
    }
  });

  it("replaces the preview with User blocked when the viewer blocked the other participant", () => {
    const row = renderRow(summary({ blockedByMe: true }));
    expect(row.getByText("User blocked")).toBeTruthy();
    expect(row.queryByText("Yes, it is still for sale")).toBeNull();
  });

  it("shows the unavailable label and a placeholder with no Listing", () => {
    const row = renderRow(summary({ listing: null }));
    expect(row.getByText("Listing unavailable")).toBeTruthy();
    expect(row.getByTestId("conversation-row-placeholder")).toBeTruthy();
  });

  it("shows a placeholder when the Listing has no photo", () => {
    const row = renderRow(summary({ listing: { ...listing, coverMediaKey: undefined } }));
    expect(row.getByTestId("conversation-row-placeholder")).toBeTruthy();
  });

  it("names a seller with no display name Private seller, and a buyer Buyer", () => {
    expect(renderRow(summary({ peer: { id: SELLER, displayName: null } })).getByText("Private seller")).toBeTruthy();
    expect(
      renderRow(summary({ myRole: "seller", peer: { id: BUYER, displayName: "  " } })).getByText("Buyer"),
    ).toBeTruthy();
  });

  it("keeps the photo, Listing and deleted previews", () => {
    expect(renderRow(summary({ lastMessage: message(SELLER, { kind: "image", text: null }) })).getByText("Photo")).toBeTruthy();
    expect(renderRow(summary({ lastMessage: message(SELLER, { kind: "post_ref", text: null }) })).getByText("Listing")).toBeTruthy();
    expect(
      renderRow(summary({ lastMessage: message(SELLER, { deletedAt: "2026-10-01T10:01:00.000Z" }) })).getByText("Message deleted"),
    ).toBeTruthy();
  });

  it("reads the name, the Listing, the preview and the unread count as one label", () => {
    const row = renderRow(summary({ unreadCount: 3 }));
    expect(row.getByRole("button").props.accessibilityLabel).toBe(
      "Merdan, 2018 Toyota Camry · 285,000 TMT, Yes, it is still for sale, Unread: 3",
    );
  });

  it("leaves the unread count out of the label when everything is read", () => {
    const row = renderRow(summary({ blockedByMe: true }));
    expect(row.getByRole("button").props.accessibilityLabel).toBe(
      "Merdan, 2018 Toyota Camry · 285,000 TMT, User blocked",
    );
  });

  it("shows Russian and Turkmen copy", () => {
    const ru = renderRow(summary({ listing: { ...listing, status: "sold" }, blockedByMe: true }), "ru");
    expect(ru.getByText("Продано")).toBeTruthy();
    expect(ru.getByText("Пользователь заблокирован")).toBeTruthy();

    const tk = renderRow(summary({ listing: null, peer: { id: SELLER, displayName: null } }), "tk");
    expect(tk.getByText("Şahsy satyjy")).toBeTruthy();
    expect(tk.getByText("Bildiriş elýeterli däl")).toBeTruthy();
  });
});

describe("ConversationListItem press", () => {
  it("opens the Conversation by ID and seeds the by-ID cache with the row's summary", () => {
    const conversation = summary();
    const row = renderRow(conversation);

    fireEvent.press(row.getByRole("button"));

    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/conversations/[id]",
      params: { id: conversation.id },
    });
    expect(row.queryClient.getQueryData(queryKeys.conversations.detail(conversation.id))).toEqual(conversation);
  });
});
