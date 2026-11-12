import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Enums } from "@auto-tm/contracts";
import { http, HttpResponse } from "msw";
import { waitFor } from "@testing-library/react-native";

import { server } from "../../../test/msw";
import { storeAuthSession, clearAuthSession } from "../../auth/session";
import { useAuthIntentStore } from "../../auth/intentStore";
import { queryKeys } from "../../api/queryKeys";
import {
  act,
  fireEvent,
  renderMobile,
  routerMock,
  first,
} from "../../../test/render";

import { AskSellerChips } from "./AskSellerChips";

const LISTING_ID = "00000000-0000-4000-8000-000000000374";
const QUESTIONS = [
  "Can I see the car?",
  "What is the final price?",
];

vi.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value); },
    deleteItemAsync: async (key: string) => { values.delete(key); },
  };
});
const requests: unknown[] = [];
let response: () => Response | Promise<Response>;
const user = { id: "00000000-0000-4000-8000-000000000001", phone: null, email: "buyer@example.com", displayName: null, role: "seller" as const };
const signIn = () => storeAuthSession({ accessToken: "test-access", refreshToken: "test-refresh", user });

const conversation = {
  id: "00000000-0000-4000-8000-000000000002",
  buyerId: user.id,
  sellerId: "00000000-0000-4000-8000-000000000003",
  myRole: "buyer",
  peer: { id: "00000000-0000-4000-8000-000000000003", displayName: "Seller", nameNumber: 1234, avatarIndex: 0, avatarKey: null, deleted: false },
  blockedByMe: false,
  updatedAt: "2026-11-01T00:00:00Z",
  listing: {
    id: LISTING_ID,
    brandId: "00000000-0000-4000-8000-000000000004",
    modelId: "00000000-0000-4000-8000-000000000005",
    year: 2020,
    displayPriceTmt: 35000,
    priceCurrency: "TMT",
    coverMediaKey: "listing-0/original.webp",
    status: "active",
  },
};

function chips(
  props: Partial<React.ComponentProps<typeof AskSellerChips>> = {},
) {
  return renderMobile(
    <AskSellerChips
      listingId={LISTING_ID}
      isOwner={false}
      status={"active" as Enums.ListingStatus}
      allowChat
      {...props}
    />,
  );
}

beforeEach(async () => {
  requests.length = 0;
  response = () => HttpResponse.json(conversation);
  server.use(http.post("*/conversations", async ({ request }) => {
    requests.push({ path: new URL(request.url).pathname, body: await request.json() });
    return response();
  }));
  await signIn();
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
});

describe("Ask the seller", () => {
  it("offers two draft suggestions under a heading", async () => {
    const screen = await chips();

    expect(screen.getByText("Ask the seller")).toBeTruthy();
    for (const question of QUESTIONS)
      expect(screen.getByRole("button", { name: question })).toBeTruthy();
  });

  it("opens the Conversation with the question ready to send, and sends nothing", async () => {
    const screen = await chips();

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Can I see the car?" }));
    });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests).toEqual([{ path: "/api/v1/conversations", body: { listingId: LISTING_ID } }]);
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/conversations/[id]",
      params: { id: conversation.id, draft: "Can I see the car?" },
    }));
    // The Conversation screen reads its header and strip from the seeded by-ID entry.
    expect(
      screen.queryClient.getQueryData(queryKeys.conversations.detail(conversation.id)),
    ).toEqual(expect.objectContaining({ listing: conversation.listing }));
  });

  it("parks a signed-out question behind sign-in, then finishes it on return", async () => {
    await clearAuthSession();
    const screen = await chips();

    await fireEvent.press(screen.getByRole("button", { name: "What is the final price?" }));

    expect(routerMock.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/(auth)/phone" }),
    );
    expect(requests).toEqual([]);
    expect(useAuthIntentStore.getState().intent).toEqual({
      returnTo: `/(public)/listings/${LISTING_ID}`,
      action: { kind: "ask", listingId: LISTING_ID, intent: "finalPrice" },
    });

    routerMock.push.mockClear();
    await act(async () => {
      await signIn();
      useAuthIntentStore.getState().completeSignIn({
        push: routerMock.push,
        dismissTo: vi.fn(),
      });
    });

    await waitFor(() => expect(requests).toHaveLength(1));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/conversations/[id]",
      params: expect.objectContaining({ draft: "What is the final price?" }),
    }));
    expect(useAuthIntentStore.getState().replayAction).toBeNull();
  });

  it("does not finish a question that was parked for another Listing", async () => {
    await chips();

    await act(async () => {
      useAuthIntentStore.setState({
        replayAction: {
          kind: "ask",
          listingId: "00000000-0000-4000-8000-000000000999",
          intent: "seeIt",
        },
      });
    });

    expect(requests).toEqual([]);
  });

  it("disables every chip while the Conversation opens", async () => {
    let open = () => {};
    response = () => new Promise<Response>((resolve) => { open = () => resolve(HttpResponse.json(conversation)); });
    const screen = await chips();

    await fireEvent.press(screen.getByRole("button", { name: "Can I see the car?" }));

    for (const question of QUESTIONS)
      expect(
        await screen.findByRole("button", { name: question, disabled: true }),
      ).toBeTruthy();
    await act(async () => open());
  });

  it("retries a failed open with the same question", async () => {
    response = () => HttpResponse.error();
    const screen = await chips();

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Can I see the car?" }));
    });
    expect(routerMock.push).not.toHaveBeenCalled();

    response = () => HttpResponse.json(conversation);
    await act(async () => {
      void fireEvent.press(await screen.findByRole("button", { name: "Retry" }));
    });

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/conversations/[id]",
      params: expect.objectContaining({ draft: "Can I see the car?" }),
    }));
  });

  it("is hidden from the owner", async () => {
    const screen = await chips({ isOwner: true });

    expect(screen.queryByText("Ask the seller")).toBeNull();
    expect(screen.queryByRole("button", { name: first(QUESTIONS) })).toBeNull();
  });

  it.each(["sold", "archived"] as const)("is hidden on a %s Listing", async (status) => {
    const screen = await chips({ status: status as Enums.ListingStatus });

    expect(screen.queryByText("Ask the seller")).toBeNull();
    expect(screen.queryByRole("button", { name: first(QUESTIONS) })).toBeNull();
  });

  it("is hidden when the seller turned chat off, as Message is", async () => {
    const screen = await chips({ allowChat: false });

    expect(screen.queryByText("Ask the seller")).toBeNull();
  });
});
