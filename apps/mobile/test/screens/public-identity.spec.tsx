import { Image } from "expo-image";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { useConversation } from "../../src/api/conversations/useConversation";
import { useListingDetail } from "../../src/api/listings/useListingDetail";
import { ConversationHeader } from "../../src/conversations/components/ConversationHeader";
import { ConversationList } from "../../src/conversations/components/ConversationList";
import { SellerBlock } from "../../src/listings/components/SellerBlock";
import { server } from "../msw";
import { first, renderMobile, getAllHosts, getHost, queryHost, queryAllHosts } from "../render";

// The three places one User sees another, fed by the real API client and
// query hooks from an in-memory API. Every answer below is the JSON the API
// sends, so it reaches the screen only by passing the contract schema.

const LISTING_ID = "00000000-0000-4000-8000-0000000000a1";
const CONVERSATION_ID = "00000000-0000-4000-8000-0000000000c1";
const BUYER_ID = "00000000-0000-4000-8000-0000000000b1";
const SELLER_ID = "00000000-0000-4000-8000-0000000000b2";

// The first stroke of the key (index 7) and of the SUV (index 2).
const KEY_MARK = "M11.5 12H21M17 12v3M20 12v2.4M6.5 12h.01";
const SUV_MARK = "M3 15V9.4C3 8.6 3.6 8 4.4 8H15l3.2 3.6 2.8.6V15";

type View = Awaited<ReturnType<typeof renderMobile>>;
type Host = { type: unknown; props: Record<string, unknown>; parent: Host | null };

const hosts = (view: View, type: string) => queryAllHosts(view.container, type) as unknown as Host[];
const marks = (view: View) => hosts(view, "Path").map((path) => path.props.d);
const personIcons = (view: View) => hosts(view, "Icon").filter((icon) => icon.props.name === "User");

function identityJson(overrides: Record<string, unknown> = {}) {
  return { displayName: null, nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false, ...overrides };
}

function listingJson(seller: Record<string, unknown>) {
  return {
    id: LISTING_ID, publicNumber: 373, sellerId: SELLER_ID,
    seller: { ...seller, memberSince: "2024-01-01T00:00:00.000Z" },
    status: "active",
    brandId: "00000000-0000-4000-8000-0000000000d1", modelId: "00000000-0000-4000-8000-0000000000d2",
    regionId: "00000000-0000-4000-8000-0000000000d3", cityId: "00000000-0000-4000-8000-0000000000d4",
    priceAmount: 10000, priceCurrency: "USD", displayPriceTmt: 35000,
    allowCalls: true, allowChat: true, acceptsExchange: false, installmentAvailable: false,
    media: [], viewCount: 19, favoriteCount: 4,
    publishedAt: "2026-09-20T00:00:00.000Z", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-22T00:00:00.000Z",
  };
}

function conversationJson(id: string, peer: Record<string, unknown>) {
  return {
    id, listing: null, buyerId: BUYER_ID, sellerId: SELLER_ID, myRole: "buyer",
    peer: { id: SELLER_ID, ...peer },
    blockedByMe: false, updatedAt: "2026-10-01T10:00:00.000Z", unreadCount: 0, mutedAt: null,
  };
}

/** Requests the in-memory API answered, by path. */
const requests: string[] = [];

beforeEach(() => {
  requests.length = 0;
});

function serve(path: string, json: Record<string, unknown>) {
  server.use(http.get(`*${path}`, ({ request }) => {
    requests.push(new URL(request.url).pathname.replace(/^\/api\/v1/, ""));
    return HttpResponse.json(json);
  }));
}

function ListingSeller() {
  const { data } = useListingDetail(LISTING_ID);
  return data ? <SellerBlock seller={data.seller} /> : null;
}

function OpenConversationHeader() {
  const { data, isPending } = useConversation(CONVERSATION_ID);
  return (
    <ConversationHeader
      conversation={data}
      loading={isPending}
      presence={{ online: true }}
      isMuted={false}
      isBlocked={false}
      onBack={() => {}}
      onToggleMute={() => {}}
      onBlock={() => {}}
      onUnblock={() => {}}
    />
  );
}

describe("Seller block from GET /listings/:id", () => {
  it.each([
    ["en", "Driver 2057", "Private seller"],
    ["ru", "Водитель 2057", "Частный продавец"],
    ["tk", "Sürüji 2057", "Şahsy satyjy"],
  ])("shows a seller without a name their generated name and car mark in %s", async (locale, name, role) => {
    serve(`/listings/${LISTING_ID}`, listingJson(identityJson()));
    const view = await renderMobile(<ListingSeller />, { locale });

    expect(await view.findByText(name)).toBeTruthy();
    expect(view.getAllByText(role)).toHaveLength(1);
    expect(marks(view)[0]).toBe(KEY_MARK);
  });

  it("shows a seller's own name and photo", async () => {
    serve(`/listings/${LISTING_ID}`, listingJson(identityJson({ displayName: "Aman", avatarKey: "avatars/u2/original.jpg" })));
    const view = await renderMobile(<ListingSeller />);

    expect(await view.findByText("Aman")).toBeTruthy();
    expect(view.getByText("Private seller")).toBeTruthy();
    expect(getHost(view.container, "Image").props.source).toEqual({
      uri: "https://media.autotm.tm/listing-photos/avatars/u2/thumbnail.jpg",
    });
  });

  it("shows a seller's own name with their car mark when they have no photo", async () => {
    serve(`/listings/${LISTING_ID}`, listingJson(identityJson({ displayName: "Aman", avatarIndex: 2 })));
    const view = await renderMobile(<ListingSeller />);

    expect(await view.findByText("Aman")).toBeTruthy();
    expect(marks(view)[0]).toBe(SUV_MARK);
    expect(queryHost(view.container, "Image")).toBeNull();
  });

  it("shows nothing of what the contract does not carry, such as a phone", async () => {
    serve(`/listings/${LISTING_ID}`, listingJson(identityJson({ displayName: "Aman", phone: "+99365000000" })));
    const view = await renderMobile(<ListingSeller />);

    await view.findByText("Aman");
    expect(JSON.stringify(view.queryClient.getQueryCache().getAll().map((query) => query.state.data))).not.toContain("+99365000000");
  });
});

describe("Conversation header from GET /conversations/:id", () => {
  it.each([
    ["en", "Driver 2057"],
    ["ru", "Водитель 2057"],
    ["tk", "Sürüji 2057"],
  ])("shows a participant without a name their generated name and car mark in %s", async (locale, name) => {
    serve(`/conversations/${CONVERSATION_ID}`, { ...conversationJson(CONVERSATION_ID, identityJson()), sendRestriction: null });
    const view = await renderMobile(<OpenConversationHeader />, { locale });

    expect(await view.findByText(name)).toBeTruthy();
    expect(marks(view)[0]).toBe(KEY_MARK);
  });

  it("shows a participant's own name and photo", async () => {
    serve(`/conversations/${CONVERSATION_ID}`, {
      ...conversationJson(CONVERSATION_ID, identityJson({ displayName: "Aman", avatarKey: "avatars/u2/original.jpg" })),
      sendRestriction: null,
    });
    const view = await renderMobile(<OpenConversationHeader />);

    expect(await view.findByText("Aman")).toBeTruthy();
    expect(getHost(view.container, "Image").props.source).toEqual({
      uri: "https://media.autotm.tm/listing-photos/avatars/u2/thumbnail.jpg",
    });
  });

  it("names a deleted seller Deleted user, with the person icon", async () => {
    serve(`/conversations/${CONVERSATION_ID}`, {
      ...conversationJson(CONVERSATION_ID, identityJson({ deleted: true })),
      sendRestriction: null,
    });
    const view = await renderMobile(<OpenConversationHeader />);

    expect(await view.findByText("Deleted user")).toBeTruthy();
    expect(personIcons(view)).toHaveLength(1);
    expect(hosts(view, "Svg")).toHaveLength(0);
  });
});

describe("Messages rows from GET /conversations", () => {
  const second = "00000000-0000-4000-8000-0000000000c2";
  const third = "00000000-0000-4000-8000-0000000000c3";

  it("shows each participant's name and badge from the one list request", async () => {
    serve("/conversations", {
      items: [
        conversationJson(CONVERSATION_ID, identityJson()),
        conversationJson(second, identityJson({ displayName: "Aman", avatarKey: "avatars/u2/original.jpg" })),
        conversationJson(third, identityJson({ deleted: true })),
      ],
      nextCursor: null,
    });
    const view = await renderMobile(<ConversationList />);

    expect(await view.findByText("Driver 2057")).toBeTruthy();
    expect(view.getByText("Aman")).toBeTruthy();
    expect(view.getByText("Deleted user")).toBeTruthy();
    expect(marks(view)[0]).toBe(KEY_MARK);
    const photo = first(getAllHosts(view.container, "Image"));
    expect(photo.props.source).toEqual({ uri: "https://media.autotm.tm/listing-photos/avatars/u2/thumbnail.jpg" });
    expect(photo.props.style).toMatchObject({ width: 24, height: 24 });
    expect(personIcons(view)).toHaveLength(1);
    // Three rows, one request: no row asks the API for its own participant.
    expect(requests).toEqual(["/conversations"]);
  });
});
