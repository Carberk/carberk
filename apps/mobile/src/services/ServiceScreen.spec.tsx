import { beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as Notifications from "expo-notifications";

import { renderMobile, fireEvent, act, getAllHosts } from "../../test/render";
import { server } from "../../test/msw";
import { storeAuthSession, clearAuthSession } from "../auth/session";

import { ServiceScreen } from "./ServiceScreen";
vi.mock("expo-secure-store", () => { const store = new Map<string, string>(); return { getItemAsync: async (key: string) => store.get(key) ?? null, setItemAsync: async (key: string, value: string) => { store.set(key, value); }, deleteItemAsync: async (key: string) => { store.delete(key); } }; });
vi.mock("expo-crypto", () => ({ randomUUID: () => "44444444-4444-4444-8444-444444444444" }));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: "file:///synthetic.jpg" }] }) }));
vi.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: () => ({ renderAsync: async () => ({ width: 40, height: 20, saveAsync: async () => ({ uri: "file:///clean.jpg" }), release: () => {} }), resize: () => {}, release: () => {} }) } }));
vi.mock("expo-file-system", () => ({ File: class { size = 3; async bytes() { return new Uint8Array([1, 2, 3]); } delete() {} } }));
const id = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222";
let sent: Record<string, unknown>[] = [], fail = false;
const message = { id, clientMessageId: id, sequence: 1, sender: "carberk", operatorName: null, visibility: "customer", body: "Synthetic private service content", attachment: null, createdAt: "2026-10-15T10:00:00Z" };
beforeEach(async () => {
 await clearAuthSession(); await storeAuthSession({ accessToken: "synthetic", refreshToken: "refresh", user: { id: userId, phone: null, email: null, displayName: null, role: "buyer" } }); sent = []; fail = false;
 server.use(http.post("*/services/conversations/:id/read", () => HttpResponse.json({ ok: true })), http.get("*/services/conversations", () => HttpResponse.json([{ id, purpose: "support", createdAt: "2026-10-15T10:00:00Z" }])), http.get("*/services/conversations/:id", () => HttpResponse.json({ id, resourceId: id, purpose: "support", status: "open", assignmentVersion: 0, assigned: false, operatorName: null, sourceListingId: null, canSend: true, messages: [message], lastSequence: 1, readThrough: 0, unread: 1, hasMore: false })), http.post("*/services/conversations/:id/messages", async ({ request }) => { sent.push(await request.json() as Record<string, unknown>); if (fail && sent.length === 1) return HttpResponse.json({ code: "UNAVAILABLE" }, { status: 503 }); return HttpResponse.json(message); }));
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

it("keeps upload retry separate from message retry and adopts only uploaded bytes", async () => {
 let uploads = 0, stages = 0;
 server.use(http.post("*/services/conversations/:id/attachments", () => { stages++; return HttpResponse.json({ id: "33333333-3333-4333-8333-333333333333" }); }), http.post("*/services/conversations/:id/attachments/:file/bytes", () => { uploads++; return uploads === 1 ? HttpResponse.json({ code: "UNAVAILABLE" }, { status: 503 }) : HttpResponse.json({ ok: true }); }));
 const screen = await renderMobile(<ServiceScreen/>); await fireEvent.press(await screen.findByRole("button", { name: "General Support" })); await screen.findByText(message.body);
 await fireEvent.press(screen.getByRole("button", { name: "Upload attachment" }));
 expect(await screen.findByText("The upload failed. The message has not been sent.")).toBeTruthy(); expect(sent).toHaveLength(0);
 await fireEvent.press(screen.getByRole("button", { name: "Retry upload" })); expect(await screen.findByText("Attachment ready to send")).toBeTruthy(); expect(screen.getByLabelText("Selected image")).toBeTruthy();
 await fireEvent.press(screen.getByRole("button", { name: "Send message" })); expect(sent[0]?.["attachmentId"]).toBe("33333333-3333-4333-8333-333333333333"); expect(stages).toBe(1); expect(uploads).toBe(2);
});
it("retrieves a private image through the authenticated service boundary before displaying pixels", async () => {
 let reads = 0;
 const attachment = { id: "33333333-3333-4333-8333-333333333333", contentType: "image/jpeg", sizeBytes: 3, filename: "synthetic-private.jpg" };
 server.use(http.get("*/services/conversations/:id", () => HttpResponse.json({ id, resourceId: id, purpose: "support", status: "open", assignmentVersion: 0, assigned: false, operatorName: null, sourceListingId: null, canSend: true, messages: [{ ...message, attachment }], lastSequence: 1, readThrough: 0, unread: 1, hasMore: false })), http.get("*/services/conversations/:id/attachments/:file", ({ request }) => { reads++; expect(request.headers.get("Authorization")).toBe("Bearer synthetic"); return new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } }); }));
 const screen = await renderMobile(<ServiceScreen/>); await fireEvent.press(await screen.findByRole("button", { name: "General Support" })); await screen.findByText("synthetic-private.jpg");
 expect(reads).toBe(0); await fireEvent.press(screen.getByRole("button", { name: "Private attachment" })); expect(await screen.findByLabelText("synthetic-private.jpg")).toBeTruthy(); expect(reads).toBe(1); if (!screen.root) throw new Error("Missing service view"); expect(getAllHosts(screen.root, "Modal", { visible: true })).toHaveLength(1);
});
it("shows the public history explanation and price before sign-in without requesting private history", async () => {
 await clearAuthSession(); let privateReads = 0; server.use(http.get("*/services/conversations", () => { privateReads++; return HttpResponse.json([]); }));
 const screen = await renderMobile(<ServiceScreen/>); expect(await screen.findByText("Vehicle History: 100 TMT")).toBeTruthy(); expect(screen.getByText(/One available provider is sufficient/)).toBeTruthy(); expect(privateReads).toBe(0);
});
it("acknowledges only the service messages actually rendered to the current customer", async () => {
 let through = 0;
 server.use(http.post("*/services/conversations/:id/read", async ({ request }) => { through = (await request.json() as { throughSequence: number }).throughSequence; return HttpResponse.json({ ok: true }); }));
 const screen = await renderMobile(<ServiceScreen/>); await fireEvent.press(await screen.findByRole("button", { name: "General Support" })); await screen.findByText(message.body);
 await act(async () => { await Promise.resolve(); }); expect(through).toBe(1);
});

it("binds the current native token to the opened private service using authenticated requests", async () => {
 vi.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce({ granted: true, status: "granted" } as never);
 vi.mocked(Notifications.getDevicePushTokenAsync).mockResolvedValueOnce({ data: "synthetic-current-device" } as never);
 const calls: string[] = [];
 server.use(http.post("*/notifications/tokens", async ({ request }) => { expect(request.headers.get("Authorization")).toBe("Bearer synthetic"); calls.push("register"); return HttpResponse.json({ registered: true }); }), http.post("*/services/conversations/:id/push", async ({ request }) => { expect(await request.json()).toEqual({ deviceToken: "synthetic-current-device" }); calls.push("subscribe"); return HttpResponse.json({ ok: true }); }));
 const screen = await renderMobile(<ServiceScreen/>); await fireEvent.press(await screen.findByRole("button", { name: "General Support" })); await screen.findByText(message.body);
 await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); expect(calls).toEqual(["register", "subscribe"]);
});
it("opens the canonical Support case from a Support entry without creating a History enquiry", async () => {
 const { routeParams } = await import("../../test/render"); routeParams["purpose"] = "support";
 let creates = 0;
 server.use(http.post("*/services/conversations", async ({ request }) => { expect(await request.json()).toEqual({ purpose: "support", synthetic: true }); creates++; return HttpResponse.json({ id, resourceId: id }); }));
 try { const screen = await renderMobile(<ServiceScreen/>); expect(await screen.findByText(message.body)).toBeTruthy(); expect(creates).toBe(1); } finally { delete routeParams["purpose"]; }
});
it("shows a customer's sent versus read message from the current service recipient watermark", async () => {
 server.use(http.get("*/services/conversations/:id", () => HttpResponse.json({ id, resourceId: id, purpose: "support", status: "open", assignmentVersion: 1, assigned: true, operatorName: null, sourceListingId: null, canSend: true, messages: [{ ...message, sender: "customer" }], lastSequence: 1, readThrough: 1, peerReadThrough: 1, unread: 0, hasMore: false })));
 const screen = await renderMobile(<ServiceScreen/>); await fireEvent.press(await screen.findByRole("button", { name: "General Support" })); await screen.findByText(message.body); expect(await screen.findByText("Read")).toBeTruthy();
});
