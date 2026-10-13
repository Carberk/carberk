import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Enums } from "@auto-tm/contracts";

import type * as ClientModule from "../../api/client";
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
  "Is the car still available?",
  "Can I see the car?",
  "What is the final price?",
  "What is the condition of the car?",
];

const state = vi.hoisted(() => ({
  authenticated: true as boolean | null,
  post: vi.fn(),
}));
vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: state.authenticated }),
}));
vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  apiClient: { post: state.post, get: vi.fn(), delete: vi.fn() },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

const conversation = {
  id: "conversation-1",
  buyerId: "buyer",
  sellerId: "seller",
  listing: {
    id: LISTING_ID,
    brandId: "brand",
    modelId: "model",
    year: 2020,
    displayPriceTmt: 35000,
    priceCurrency: "TMT",
    coverMediaKey: "listing-0/original.jpg",
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

beforeEach(() => {
  state.authenticated = true;
  state.post.mockReset();
  state.post.mockResolvedValue(conversation);
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
});

describe("Ask the seller", () => {
  it("offers the four QuickReplies questions as chips under a heading", async () => {
    const screen = await chips();

    expect(screen.getByText("Ask the seller")).toBeTruthy();
    for (const question of QUESTIONS)
      expect(screen.getByRole("button", { name: question })).toBeTruthy();
  });

  it("opens the Conversation with the question ready to send, and sends nothing", async () => {
    const screen = await chips();

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Can I see the car?" }));
    });

    expect(state.post).toHaveBeenCalledTimes(1);
    expect(state.post).toHaveBeenCalledWith(
      "/conversations",
      { listingId: LISTING_ID },
      expect.anything(),
    );
    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/conversations/[id]",
      params: { id: "conversation-1", draft: "Can I see the car?" },
    });
    // The Conversation screen reads its header and strip from the seeded by-ID entry.
    expect(
      screen.queryClient.getQueryData(queryKeys.conversations.detail("conversation-1")),
    ).toEqual(expect.objectContaining({ listing: conversation.listing }));
  });

  it("parks a signed-out question behind sign-in, then finishes it on return", async () => {
    state.authenticated = false;
    const screen = await chips();

    await fireEvent.press(screen.getByRole("button", { name: "What is the final price?" }));

    expect(routerMock.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/(auth)/phone" }),
    );
    expect(state.post).not.toHaveBeenCalled();
    expect(useAuthIntentStore.getState().intent).toEqual({
      returnTo: `/(public)/listings/${LISTING_ID}`,
      action: { kind: "ask", listingId: LISTING_ID, intent: "finalPrice" },
    });

    routerMock.push.mockClear();
    await act(async () => {
      useAuthIntentStore.getState().completeSignIn({
        push: routerMock.push,
        dismissTo: vi.fn(),
      });
    });

    expect(state.post).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/conversations/[id]",
      params: expect.objectContaining({ draft: "What is the final price?" }),
    });
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

    expect(state.post).not.toHaveBeenCalled();
  });

  it("ignores taps until the session is known", async () => {
    state.authenticated = null;
    const screen = await chips();

    await fireEvent.press(screen.getByRole("button", { name: "Can I see the car?" }));

    expect(state.post).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("disables every chip while the Conversation opens", async () => {
    let open: (value: unknown) => void = () => {};
    state.post.mockReturnValue(new Promise((resolve) => { open = resolve; }));
    const screen = await chips();

    await fireEvent.press(screen.getByRole("button", { name: "Can I see the car?" }));

    for (const question of QUESTIONS)
      expect(
        await screen.findByRole("button", { name: question, disabled: true }),
      ).toBeTruthy();
    await act(async () => open(conversation));
  });

  it("retries a failed open with the same question", async () => {
    state.post.mockRejectedValueOnce(new Error("offline"));
    const screen = await chips();

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Can I see the car?" }));
    });
    expect(routerMock.push).not.toHaveBeenCalled();

    await act(async () => {
      await fireEvent.press(await screen.findByRole("button", { name: "Retry" }));
    });

    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/conversations/[id]",
      params: expect.objectContaining({ draft: "Can I see the car?" }),
    });
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
