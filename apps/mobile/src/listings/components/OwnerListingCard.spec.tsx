import type { ListingsSchemas } from "@auto-tm/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { renderMobile, fireEvent, act } from "../../../test/render";
import { server } from "../../../test/msw";
import { storeAuthSession, clearAuthSession } from "../../auth/session";

import { OwnerListingCard } from "./OwnerListingCard";

vi.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value); },
    deleteItemAsync: async (key: string) => { values.delete(key); },
  };
});
afterEach(clearAuthSession);

function listing(status: ListingsSchemas.ListingSummary["status"]): ListingsSchemas.ListingSummary {
  return {
    id: "camry-1", sellerId: "me", status, brandId: "toyota", modelId: "camry", year: 2018, priceAmount: 1,
    priceCurrency: "TMT", displayPriceTmt: 100000, photoKeys: [], photoCount: 0, cityId: "city",
    publishedAt: "2026-09-30T04:00:00.000Z",
  };
}
async function renderCard(status: ListingsSchemas.ListingSummary["status"]) {
  const onOpen = vi.fn();
  const onMore = vi.fn();
  const view = await renderMobile(
    <OwnerListingCard listing={listing(status)} brandName="Toyota" modelName="Camry" cityName="Ashgabat" onOpen={onOpen} onMore={onMore} />,
  );
  return { view, onOpen, onMore };
}

describe("OwnerListingCard", () => {
  it("reads own Ready and replacement while new uploads are paused, then honors an empty status over stale card data", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const user = { id, phone: null, email: "owner@example.com", displayName: null, role: "seller" as const };
    await storeAuthSession({ accessToken: "test-access", refreshToken: "test-refresh", user });
    const video: ListingsSchemas.ReadyListingVideo = { id, generationId: "22222222-2222-4222-8222-222222222222", galleryIndex: 1, durationMs: 6000, qualities: [240], cover: { thumbnail: "cover:thumbnail", list: "cover:list", detail: "cover:detail", fullscreen: "cover:fullscreen" } };
    const pendingVideo = { id, generationId: "33333333-3333-4333-8333-333333333333", sourceId: id, sessionId: id, status: "processing" as const, canReprocess: false };
    let removed = false;
    server.use(
      http.get("*/me", () => HttpResponse.json({ ...user, phoneVerified: false, nameNumber: 1234, avatarIndex: 0, avatarKey: null, avatarUrl: null, locale: "en", createdAt: "2026-11-01T00:00:00.000Z", deletionScheduledAt: null, isVideoUploadTester: true, canUploadVideo: false })),
      http.get("*/listings/video-uploads/target/listing/:id", () => HttpResponse.json(removed ? {} : { video, pendingVideo })),
    );
    const view = await renderMobile(<OwnerListingCard listing={{ ...listing("active"), id, sellerId: id, video }} onOpen={() => {}} onMore={() => {}} />);
    expect(await view.findByText("Video · Ready · Replacement: Processing")).toBeTruthy();
    removed = true;
    await act(async () => { await view.queryClient.refetchQueries(); });
    expect(view.queryByText(/^Video ·/)).toBeNull();
  });

  it("opens the Listing on tap and hands ⋯ its title", async () => {
    const { view, onOpen, onMore } = await renderCard("active");
    expect(view.getByText("Ashgabat")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Toyota Camry, 2018" }));
    expect(onOpen).toHaveBeenCalledWith("camry-1");
    await fireEvent.press(view.getByRole("button", { name: "Actions for Toyota Camry, 2018" }));
    expect(onMore).toHaveBeenCalledWith(expect.objectContaining({ id: "camry-1" }), "Toyota Camry, 2018");
  });

  it.each([
    ["sold", "Sold"],
    ["archived", "Removed from sale"],
  ] as const)("labels a %s Listing and keeps its actions", async (status, label) => {
    const { view } = await renderCard(status);
    expect(view.getByText(label)).toBeTruthy();
    expect(view.getByRole("button", { name: `Toyota Camry, 2018, ${label}` })).toBeTruthy();
    expect(view.getByRole("button", { name: "Actions for Toyota Camry, 2018" })).toBeTruthy();
  });

  it("shows a blocked Listing with a neutral note, no ⋯ and no tap", async () => {
    const { view, onOpen } = await renderCard("banned");
    expect(view.getByText("Blocked")).toBeTruthy();
    expect(view.getByText("Blocked by moderation. Buyers do not see it.")).toBeTruthy();
    expect(view.queryByRole("button")).toBeNull();
    await fireEvent.press(view.getByText("Toyota Camry, 2018"));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("draws an active Listing's price in the normal text colour, at the same size and weight (#775 F)", async () => {
    const { view } = await renderCard("active");
    const className = String(view.getByText("100,000 TMT").props.className);
    expect(className).toContain("text-foreground");
    expect(className).not.toMatch(/text-primary(?!-)/);
    expect(className).toContain("text-subhead");
    expect(className).toContain("font-heading");
  });

  it.each(["sold", "archived"] as const)("keeps the muted price of a %s Listing (#775 F)", async (status) => {
    const { view } = await renderCard(status);
    expect(String(view.getByText("100,000 TMT").props.className)).toContain("text-muted-foreground");
  });
});
