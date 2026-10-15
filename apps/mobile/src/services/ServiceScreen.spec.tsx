import { beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { renderMobile, fireEvent, act } from "../../test/render";
import { server } from "../../test/msw";
import { storeAuthSession, clearAuthSession } from "../auth/session";

import { ServiceScreen } from "./ServiceScreen";
vi.mock("expo-secure-store", () => { const store = new Map<string, string>(); return { getItemAsync: async (key: string) => store.get(key) ?? null, setItemAsync: async (key: string, value: string) => { store.set(key, value); }, deleteItemAsync: async (key: string) => { store.delete(key); } }; });
vi.mock("expo-crypto", () => ({ randomUUID: () => "44444444-4444-4444-8444-444444444444" }));
const id = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222";
let sent: Record<string, unknown>[] = [], fail = false;
const message = { id, clientMessageId: id, sequence: 1, sender: "carberk", operatorName: null, visibility: "customer", body: "Synthetic private service content", attachment: null, createdAt: "2026-10-15T10:00:00Z" };
beforeEach(async () => {
 await clearAuthSession(); await storeAuthSession({ accessToken: "synthetic", refreshToken: "refresh", user: { id: userId, phone: null, email: null, displayName: null, role: "buyer" } }); sent = []; fail = false;
 server.use(http.get("*/services/conversations", () => HttpResponse.json([{ id, purpose: "support", createdAt: "2026-10-15T10:00:00Z" }])), http.get("*/services/conversations/:id", () => HttpResponse.json({ id, resourceId: id, purpose: "support", status: "open", assignmentVersion: 0, assigned: false, operatorName: null, sourceListingId: null, canSend: true, messages: [message], lastSequence: 1, readThrough: 0, unread: 1, hasMore: false })), http.post("*/services/conversations/:id/messages", async ({ request }) => { sent.push(await request.json() as Record<string, unknown>); if (fail && sent.length === 1) return HttpResponse.json({ code: "UNAVAILABLE" }, { status: 503 }); return HttpResponse.json(message); }));
});
it.each([["en", "Your services"], ["ru", "Ваши сервисы"], ["tk", "Siziň hyzmatlaryňyz"]])("renders the customer's separate service history in %s", async (locale, title) => {
 const screen = await renderMobile(<ServiceScreen/>, { locale }); expect(await screen.findByText(title ?? "")).toBeTruthy();
});
it("retains a failed draft and retries the exact message through actual hooks", async () => {
 fail = true; const screen = await renderMobile(<ServiceScreen/>);
 await fireEvent.press(await screen.findByRole("button", { name: "General Support" })); await screen.findByText(message.body);
 await fireEvent.changeText(screen.getByLabelText("Message"), "Synthetic retry draft"); await fireEvent.press(screen.getByRole("button", { name: "Send message" }));
 expect(await screen.findByDisplayValue("Synthetic retry draft")).toBeTruthy(); await fireEvent.press(screen.getByRole("button", { name: "Retry sending" }));
 expect(sent).toHaveLength(2); expect(sent[0]?.["clientMessageId"]).toBe(sent[1]?.["clientMessageId"]);
});
it("hides private cached messages immediately when the current customer signs out", async () => {
 const screen = await renderMobile(<ServiceScreen/>); await fireEvent.press(await screen.findByRole("button", { name: "General Support" })); await screen.findByText(message.body);
 await act(async () => { await clearAuthSession(); }); expect(await screen.findByText("Sign in to continue")).toBeTruthy(); expect(screen.queryByText(message.body)).toBeNull();
});
