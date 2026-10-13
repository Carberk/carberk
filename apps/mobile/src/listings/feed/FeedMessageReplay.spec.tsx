import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, act, screenFocus } from "../../../test/render";
import { useAuthIntentStore, type AuthHref } from "../../auth/intentStore";

import { FeedMessageReplay } from "./FeedMessageReplay";

import { ToastProvider } from "@/components/ui/toast";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
const conversation = vi.hoisted(() => ({ open: vi.fn(), error: null as unknown }));
vi.mock("../../conversations/useOpenListingConversation", () => ({
  useOpenListingConversation: (listingId: string) => ({ open: () => conversation.open(listingId), retry: vi.fn(), isPending: false, error: conversation.error }),
}));

const results: AuthHref = { pathname: "/(tabs)/(search)/results", params: { sort: "newest" } };

function renderReplay() {
  return renderMobile(<ToastProvider><FeedMessageReplay returnTo={results} /></ToastProvider>);
}
async function signInReturns(returnTo: AuthHref, listingId = "listing") {
  await act(() => useAuthIntentStore.setState({ intent: null, replayAction: { kind: "message", listingId }, replayReturnTo: returnTo }));
}

beforeEach(() => {
  conversation.open.mockReset(); conversation.error = null; screenFocus.focused = true;
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
});

describe("Results Message after sign-in", () => {
  it("opens the Conversation about the Listing once when sign-in returns to Results", async () => {
    const view = await renderReplay();
    await signInReturns(results);
    expect(conversation.open).toHaveBeenCalledOnce();
    expect(conversation.open).toHaveBeenCalledWith("listing");
    expect(useAuthIntentStore.getState().replayAction).toBeNull();
    await view.rerender(<ToastProvider><FeedMessageReplay returnTo={results} /></ToastProvider>);
    expect(conversation.open).toHaveBeenCalledOnce();
  });
  it("leaves a Message that another screen asked for", async () => {
    await renderReplay();
    await signInReturns({ pathname: "/(public)/listings/[id]", params: { id: "listing" } });
    expect(conversation.open).not.toHaveBeenCalled();
    expect(useAuthIntentStore.getState().replayAction).not.toBeNull();
  });
  it("waits while another screen is on top of Results", async () => {
    screenFocus.focused = false;
    await renderReplay();
    await signInReturns(results);
    expect(conversation.open).not.toHaveBeenCalled();
  });
  it("says so when the Conversation cannot open", async () => {
    conversation.error = new Error("Network request failed");
    const view = await renderReplay();
    await signInReturns(results);
    expect(view.getByText("Something went wrong")).toBeTruthy();
  });
});
