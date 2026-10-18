import { beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as SecureStore from "expo-secure-store";

import { act, fireEvent, queryAllHosts, renderMobile } from "../../../test/render";
import { server } from "../../../test/msw";
import { clearAuthSession, storeAuthSession } from "../../auth/session";

import { BusinessChatImage } from "./BusinessChatImage";

vi.mock("expo-secure-store", () => { const store = new Map<string, string>(); return { getItemAsync: async (key: string) => store.get(key) ?? null, setItemAsync: async (key: string, value: string) => { store.set(key, value); }, deleteItemAsync: async (key: string) => { store.delete(key); } }; });
const key = "business-chat-private/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original.webp";
const userId = "33333333-3333-4333-8333-333333333333";
beforeEach(async () => { await clearAuthSession(); await storeAuthSession({ accessToken: "synthetic", refreshToken: "refresh", user: { id: userId, phone: null, email: null, displayName: null, role: "buyer" } }); });
it("renders protected pixels in the bubble and full screen only after current authenticated reads, then clears them on sign out", async () => {
 let reads = 0;
 server.use(http.get("*/conversations/:id/attachments/:file", ({ request }) => { expect(request.headers.get("Authorization")).toBe("Bearer synthetic"); reads++; return new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/webp", "Content-Length": "3" } }); }));
 const screen = await renderMobile(<BusinessChatImage objectKey={key}/>);
 await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
 if (!screen.root) throw new Error("Missing image view");
 expect(queryAllHosts(screen.root, "Image").some(image => image.props["source"]?.uri === "data:image/webp;base64,AQID")).toBe(true);
 await fireEvent.press(screen.getByRole("imagebutton"));
 await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
 expect(reads).toBe(2); expect(queryAllHosts(screen.root, "Modal")).toHaveLength(1);
 await act(async () => { await clearAuthSession(); });
 expect(queryAllHosts(screen.root, "Image")).toHaveLength(0); expect(queryAllHosts(screen.root, "Modal")).toHaveLength(0);
});
it("does not display already downloaded bytes when a fresh full-screen read loses membership", async () => {
 let reads = 0;
 server.use(http.get("*/conversations/:id/attachments/:file", () => ++reads === 1 ? new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Length": "3" } }) : HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })));
 const screen = await renderMobile(<BusinessChatImage objectKey={key}/>);
 await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
 await fireEvent.press(screen.getByRole("imagebutton"));
 await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
 if (!screen.root) throw new Error("Missing image view");
 expect(queryAllHosts(screen.root, "Image")).toHaveLength(0); expect(queryAllHosts(screen.root, "Modal")).toHaveLength(0);
});
it("discards a pending previous-session image after the account changes", async () => {
 let release: () => void = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
 let started = false;
 server.use(http.get("*/conversations/:id/attachments/:file", async () => { started = true; await gate; return new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Length": "3" } }); }));
 const screen = await renderMobile(<BusinessChatImage objectKey={key}/>);
 await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); expect(started).toBe(true);
 await act(async () => { await storeAuthSession({ accessToken: "other", refreshToken: "other-refresh", user: { id: "44444444-4444-4444-8444-444444444444", phone: null, email: null, displayName: null, role: "buyer" } }); release(); await new Promise(resolve => setTimeout(resolve, 20)); });
 if (!screen.root) throw new Error("Missing image view");
 expect(queryAllHosts(screen.root, "Image")).toHaveLength(0); expect(queryAllHosts(screen.root, "Modal")).toHaveLength(0);
});

it("loads a protected image after cold secure-storage hydration without a remembered session", async () => {
 await clearAuthSession();
 await SecureStore.setItemAsync("auto_tm_auth_session", JSON.stringify({ accessToken: "synthetic", refreshToken: "refresh", storedAt: "2026-10-18T00:00:00Z", user: { id: userId, phone: null, email: null, displayName: null, role: "buyer" } }));
 server.use(http.get("*/conversations/:id/attachments/:file", () => new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Length": "3" } })));
 const screen = await renderMobile(<BusinessChatImage objectKey={key}/>);
 await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
 if (!screen.root) throw new Error("Missing image view");
 expect(queryAllHosts(screen.root, "Image")[0]?.props["source"]?.uri).toBe("data:image/webp;base64,AQID");
});
