// Relocated out of `app/` (was app/conversations/open-listing.spec.tsx): a *.spec under
// the Expo Router app dir gets bundled by require.context — importing Node `fs` breaks the
// native bundle and registers a bogus route. Test files must live outside `app/`
// (Expo Router docs); metro.config.js resolver.blockList is the backstop. Node/vitest.
import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, it, expect, vi } from "vitest";
import { waitFor } from "@testing-library/react-native";

import { renderMobile, routeParams, routerMock } from "../render";
import OpenListingRoute from "../../app/conversations/open-listing";
import { queryKeys } from "../../src/api/queryKeys";
import type * as ClientModule from "../../src/api/client";

const post = vi.hoisted(() => vi.fn());
vi.mock("../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  apiClient: { post, get: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../src/navigation/useSafeBack", () => ({ useSafeBack: () => vi.fn() }));

const source = readFileSync(
  resolve(__dirname, "../../app/conversations/open-listing.tsx"),
  "utf-8",
);

describe("OpenListingConversationScreen", () => {
  it("exports default redirector screen", () => {
    expect(source).toContain("export default function OpenListingConversationScreen");
  });

  it("reads listingId from search params", () => {
    expect(source).toContain("useLocalSearchParams");
    expect(source).toContain('listingId: string');
  });

  it("uses useOpenConversation hook", () => {
    expect(source).toContain(
      'import { useOpenConversation } from "../../src/api/conversations/useOpenConversation"',
    );
  });

  it("calls openConversation mutate on mount", () => {
    expect(source).toContain("mutate({ listingId })");
  });

  it("navigates to conversation detail on success", () => {
    expect(source).toContain("router.replace");
    expect(source).toContain("/conversations/");
  });

  it("shows loading state while opening", () => {
    expect(source).toContain("ActivityIndicator");
    expect(source).toContain('t("openingConversation")');
  });

  it("shows shared ErrorState on failure", () => {
    expect(source).toContain("isError");
    expect(source).toContain("<ErrorState");
    expect(source).toContain("error={error}");
  });
});

describe("OpenListingConversationScreen behaviour", () => {
  it("replaces itself with the Conversation by ID and seeds the by-ID cache", async () => {
    const summary = {
      id: "00000000-0000-4000-8000-0000000000c1",
      listing: null,
      buyerId: "00000000-0000-4000-8000-0000000000b1",
      sellerId: "00000000-0000-4000-8000-0000000000b2",
      myRole: "buyer",
      peer: { id: "00000000-0000-4000-8000-0000000000b2", displayName: null, nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false },
      blockedByMe: false,
      updatedAt: "2026-10-01T10:00:00.000Z",
      unreadCount: 0,
    };
    post.mockResolvedValue(summary);
    routeParams.listingId = "00000000-0000-4000-8000-0000000000a1";

    const screen = await renderMobile(<OpenListingRoute />);

    // The mutation's success reaches the screen on a later timer tick, not within one act().
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith({
        pathname: "/conversations/[id]",
        params: { id: summary.id },
      }),
    );
    expect(screen.queryClient.getQueryData(queryKeys.conversations.detail(summary.id))).toEqual(summary);
  });
});
