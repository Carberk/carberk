import { expect, it, vi } from "vitest";
import { Share } from "react-native";
import { http, HttpResponse } from "msw";

import { renderMobile, fireEvent } from "../../test/render";
import { server } from "../../test/msw";

import { MarketplaceShareActions } from "./MarketplaceShareActions";
const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn(async () => true) }));
vi.mock("expo-clipboard", () => clipboard);
const id = "00000000-0000-4000-8000-000000000001";
it("keeps share and copy unavailable until deployed link prerequisites are accepted", async () => {
 vi.stubEnv("EXPO_PUBLIC_WEB_URL", "https://carberk.example.test");
 server.use(http.get("https://carberk.example.test/api/marketplace-sharing", () => HttpResponse.json({ enabled: false })));
 const screen = await renderMobile(<MarketplaceShareActions kind="showrooms" id={id} />);
 expect(screen.queryByRole("button", { name: "Share" })).toBeNull(); expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
 vi.unstubAllEnvs();
});
it("copies a current public target and exposes recovery when system sharing fails", async () => {
 vi.stubEnv("EXPO_PUBLIC_WEB_URL", "https://carberk.example.test");
 server.use(http.get("https://carberk.example.test/api/marketplace-sharing", () => HttpResponse.json({ enabled: true })), http.get("*/public-marketplace/showrooms/:id", () => HttpResponse.json({ business: { id, name: "Ahal", slug: "ahal", logoUrl: null, city: null, identityChecked: false, contactPhone: null }, listings: [], nextCursor: null })));
 const share = vi.spyOn(Share, "share").mockRejectedValue(new Error("Cancelled by provider"));
 const screen = await renderMobile(<MarketplaceShareActions kind="showrooms" id={id} />);
 await screen.findByRole("button", { name: "Copy link" }); await fireEvent.press(screen.getByRole("button", { name: "Copy link" }));
 expect(await screen.findByText("Link copied")).toBeTruthy(); expect(clipboard.setStringAsync).toHaveBeenCalledWith(`https://carberk.example.test/en/showrooms/${id}`);
 await fireEvent.press(screen.getByRole("button", { name: "Share" })); expect(await screen.findByText("Could not share. Try again.")).toBeTruthy();
 share.mockRestore(); vi.unstubAllEnvs();
});

it("refuses copying a target that became unavailable after the sharing controls loaded", async () => {
 vi.stubEnv("EXPO_PUBLIC_WEB_URL", "https://carberk.example.test"); clipboard.setStringAsync.mockClear();
 server.use(http.get("https://carberk.example.test/api/marketplace-sharing", () => HttpResponse.json({ enabled: true })), http.get("*/public-marketplace/showrooms/:id", () => HttpResponse.json({ code: "NOT_FOUND" }, { status: 404 })));
 const screen = await renderMobile(<MarketplaceShareActions kind="showrooms" id={id} />);
 await screen.findByRole("button", { name: "Copy link" }); await fireEvent.press(screen.getByRole("button", { name: "Copy link" }));
 expect(await screen.findByText("Could not share. Try again.")).toBeTruthy(); expect(clipboard.setStringAsync).not.toHaveBeenCalled(); vi.unstubAllEnvs();
});
