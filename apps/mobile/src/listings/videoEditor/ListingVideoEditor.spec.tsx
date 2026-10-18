import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile } from "../../../test/render";
import { server } from "../../../test/msw";
import { storeAuthSession } from "../../auth/session";

import { ListingVideoEditor } from "./ListingVideoEditor";

const secure = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({ getItemAsync: async (key: string) => secure.get(key) ?? null, setItemAsync: async (key: string, value: string) => { secure.set(key, value); }, deleteItemAsync: async (key: string) => { secure.delete(key); } }));
const ownerId = "00000000-0000-4000-8000-000000000020", target = { kind: "draft" as const, id: "00000000-0000-4000-8000-000000000021" };
beforeEach(async () => {
 secure.clear();
 await storeAuthSession({ accessToken: "synthetic", refreshToken: "synthetic-refresh", user: { id: ownerId, phone: null, email: null, displayName: null, role: "buyer" } });
});
describe("optional video editor current capabilities", () => {
 it("shows library selection only when the current server admits uploading", async () => {
  server.use(http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: true, canView: true })));
  const screen = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={target} />);
  expect(await screen.findByRole("button", { name: "Add video" })).toBeTruthy();
 });
 it("keeps video selection unavailable to an ineligible account", async () => {
  server.use(http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: false, canView: false })));
  const screen = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={target} />);
  expect(screen.queryByRole("button", { name: "Add video" })).toBeNull();
 });
});
