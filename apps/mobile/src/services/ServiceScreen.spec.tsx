import { beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as Notifications from "expo-notifications";

import { renderMobile, fireEvent, act, getAllHosts, routeParams } from "../../test/render";
import { server } from "../../test/msw";
import { storeAuthSession, clearAuthSession } from "../auth/session";

import { ServiceScreen } from "./ServiceScreen";
vi.mock("expo-secure-store", () => { const store = new Map<string, string>(); return { getItemAsync: async (key: string) => store.get(key) ?? null, setItemAsync: async (key: string, value: string) => { store.set(key, value); }, deleteItemAsync: async (key: string) => { store.delete(key); } }; });
vi.mock("expo-crypto", () => ({ randomUUID: () => "44444444-4444-4444-8444-444444444444" }));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: "file:///synthetic.jpg" }] }) }));
vi.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: () => ({ renderAsync: async () => ({ width: 40, height: 20, saveAsync: async () => ({ uri: "file:///clean.jpg" }), release: () => {} }), resize: () => {}, release: () => {} }) } }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: async () => true, shareAsync: async () => {} }));
vi.mock("expo-file-system", () => ({ Paths: { cache: "file:///cache" }, File: class { uri = "file:///cache/synthetic.pdf"; create() {} write() {} size = 3; async bytes() { return new Uint8Array([1, 2, 3]); } delete() {} } }));
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

it("requires re-entering exact quoted VIN and keeps receipt claims separate from verified payment", async () => {
 const quote = { id, vin: "1HGCM82633A004352", providers: ["carfax"], amount: 100, preflightOutcome: "available", refundRule: "Founder review if undeliverable", windowStart: "2026-10-20T04:00:00.000Z", windowEnd: "2026-10-20T05:00:00.000Z", feasible: true, acceptedAt: null, supersededAt: null };
 let order: object | null = null; const commands: Record<string, unknown>[] = [];
 server.use(http.get("*/services/conversations", () => HttpResponse.json([{ id, purpose: "history", createdAt: "2026-10-15T10:00:00Z" }])), http.get("*/services/conversations/:id", () => HttpResponse.json({ id, resourceId: id, purpose: "history", status: "enquiry", assignmentVersion: 1, assigned: true, operatorName: "Synthetic operator", sourceListingId: null, canSend: true, messages: [], lastSequence: 0, readThrough: 0, unread: 0, hasMore: false })), http.get("*/services/conversations/:id/history", () => HttpResponse.json({ synthetic: true, quotes: [quote], order, payments: [] })), http.post("*/services/conversations/:id/history", async ({ request }) => { const data = await request.json() as Record<string, unknown>; commands.push(data); order = { id, quoteId: id, state: "held", version: 0, day: "2026-10-20", holdExpiresAt: "2026-10-19T18:00:00.000Z", promiseAt: quote.windowEnd, paidAt: null, escalatedAt: null, recoveryDeadline: null, recoveryUsed: false, refundState: null }; return HttpResponse.json({ ok: true }); }));
 const screen = await renderMobile(<ServiceScreen/>); await fireEvent.press(await screen.findByRole("button", { name: "Vehicle History" }));
 await screen.findByText("Synthetic exercise. No real payment or provider purchase.");
 await fireEvent.changeText(await screen.findByLabelText("Re-enter the exact VIN"), "1HGCM82633A004353");
 await fireEvent.press(screen.getByRole("button", { name: "Confirm VIN, offer and window" })); expect(commands).toHaveLength(0);
 await fireEvent.changeText(screen.getByLabelText("Re-enter the exact VIN"), quote.vin);
 await fireEvent.press(screen.getByRole("button", { name: "Confirm VIN, offer and window" }));
 await screen.findByText("A receipt claim is not verified payment."); expect(commands[0]?.["kind"]).toBe("accept"); expect(commands[0]?.["vin"]).toBe(quote.vin);
 await fireEvent.changeText(screen.getByLabelText("Receipt claim"), "Synthetic transfer claim"); await fireEvent.press(screen.getByRole("button", { name: "Submit for reconciliation" }));
 expect(commands[1]?.["kind"]).toBe("payment"); expect(commands[1]).not.toHaveProperty("verifiedFunds");
});

it.each([["en", "Open, save or share PDF"], ["ru", "Открыть, сохранить или отправить PDF"], ["tk", "PDF-i aç, sakla ýa-da paýlaş"]])("reopens the same purchased original through authenticated bytes in %s", async (locale, label) => {
 let reads = 0;
 server.use(http.get("*/services/conversations", () => HttpResponse.json([{ id, purpose: "history", createdAt: "2026-10-15T10:00:00Z" }])), http.get("*/services/conversations/:id", () => HttpResponse.json({ id, resourceId: id, purpose: "history", status: "completed", assignmentVersion: 1, assigned: true, operatorName: "Synthetic operator", sourceListingId: null, canSend: true, messages: [], lastSequence: 0, readThrough: 0, unread: 0, hasMore: false })), http.get("*/services/conversations/:id/history", () => HttpResponse.json({ synthetic: true, quotes: [], order: { id, quoteId: id, state: "delivered", version: 2, day: "2026-10-15", holdExpiresAt: "2026-10-15T10:00:00Z", promiseAt: "2026-10-15T12:00:00Z", paidAt: "2026-10-15T11:00:00Z", escalatedAt: null, recoveryDeadline: null, recoveryUsed: false, refundState: null }, payments: [] })), http.get("*/services/conversations/:id/history/reports", () => HttpResponse.json({ delivered: [{ id, provider: "carfax", vin: "1HGCM82633A004352", originalDate: "2020-01-01T00:00:00Z", sizeBytes: 4, expectedPages: 1, sharedLink: "https://example.invalid/report", deliveredAt: "2026-10-15T12:00:00Z", state: "verified", canShare: true }], archive: [], staged: [] })), http.get("*/services/conversations/:id/history/artifacts/:artifact", () => { reads++; return HttpResponse.arrayBuffer(new Uint8Array([37,80,68,70]).buffer); }));
 const screen = await renderMobile(<ServiceScreen/>, { locale });
 const history = locale === "ru" ? "История автомобиля" : locale === "tk" ? "Awtoulag taryhy" : "Vehicle History";
 await fireEvent.press(await screen.findByRole("button", { name: history })); await fireEvent.press(await screen.findByRole("button", { name: label })); await screen.findByRole("button", { name: label });
 expect(reads).toBe(1); expect(sent).toEqual([]);
 await act(async () => { await clearAuthSession(); }); expect(screen.queryByRole("button", { name: label })).toBeNull();
});

it("requires explicit acceptance of the displayed recovery deadline and sends that deadline unchanged", async () => {
 const deadline = new Date(Date.now()+3600000).toISOString(), expires = new Date(Date.now()+60000).toISOString();
 const commands: Record<string, unknown>[] = [];
 server.use(http.get("*/services/conversations", () => HttpResponse.json([{ id, purpose: "history", createdAt: "2026-10-15T10:00:00Z" }])), http.get("*/services/conversations/:id", () => HttpResponse.json({ id, resourceId: id, purpose: "history", status: "enquiry", assignmentVersion: 1, assigned: true, operatorName: "Synthetic operator", sourceListingId: null, canSend: true, messages: [], lastSequence: 0, readThrough: 0, unread: 0, hasMore: false })), http.get("*/services/conversations/:id/history", () => HttpResponse.json({ synthetic: true, quotes: [], order: { id, quoteId: id, state: "fulfilling", version: 7, day: "2026-10-15", holdExpiresAt: "2026-10-15T10:00:00Z", promiseAt: "2026-10-15T12:00:00Z", paidAt: "2026-10-15T11:00:00Z", escalatedAt: "2026-10-15T12:00:01Z", recoveryDeadline: null, recoveryOfferedDeadline: deadline, recoveryOfferExpiresAt: expires, recoveryUsed: false, refundState: null }, payments: [] })), http.post("*/services/conversations/:id/history", async ({ request }) => { commands.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ ok: true }); }));
 const screen = await renderMobile(<ServiceScreen/>); await fireEvent.press(await screen.findByRole("button", { name: "Vehicle History" }));
 await screen.findByRole("button", { name: "Accept this exact recovery deadline" }); expect(commands).toHaveLength(0);
 await fireEvent.press(screen.getByRole("button", { name: "Accept this exact recovery deadline" }));
 expect(commands).toEqual([{ kind: "recovery", orderId: id, expectedVersion: 7, agree: true, deadline }]);
});

it("keeps the owned educational example readable before sign-in", async () => {
 await clearAuthSession(); const screen = await renderMobile(<ServiceScreen/>);
 await fireEvent.press(await screen.findByRole("button", { name: "Read educational sample" }));
 expect(await screen.findByText("Owned synthetic example. This is not a Carfax or AutoCheck report.")).toBeTruthy();
 expect(screen.getByText(/64,000 km/)).toBeTruthy(); expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeTruthy();
});
it("warns about the same purchased VIN and opens previous reports without creating another request", async () => {
 let created = 0;
 server.use(http.get("*/services/history/previous", () => HttpResponse.json([{ conversationId: id, vin: "1HGCM82633A004352" }])), http.post("*/services/conversations", () => { created++; return HttpResponse.json({ id, resourceId: id }); }));
 const screen = await renderMobile(<ServiceScreen/>);
 await fireEvent.changeText(await screen.findByLabelText("VIN for enquiry (optional)"), "1hgcm82633a004352");
 await fireEvent.press(await screen.findByRole("button", { name: "Open previous reports" }));
 await screen.findByText(message.body); expect(created).toBe(0);
});
it("retains source Listing and proposed VIN when starting a contextual enquiry", async () => {
 routeParams.sourceListingId = id; routeParams.vin = "1HGCM82633A004352"; routeParams.purpose = "history";
 const created: Record<string, unknown>[] = [];
 server.use(http.get("*/services/history/previous", () => HttpResponse.json([])), http.post("*/services/conversations", async ({ request }) => { created.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ id, resourceId: id }); }));
 const screen = await renderMobile(<ServiceScreen/>); await fireEvent.press(await screen.findByRole("button", { name: "New request", disabled: false }));
 await screen.findByText(message.body); expect(created).toEqual([{ purpose: "history", synthetic: true, sourceListingId: id, proposedVin: "1HGCM82633A004352" }]);
});

it("retries the same private receipt bytes and submits evidence without marking funds verified", async () => {
 const commands: Record<string, unknown>[] = []; let stages = 0, uploads = 0;
 server.use(http.get("*/services/conversations", () => HttpResponse.json([{ id, purpose: "history", createdAt: "2026-10-15T10:00:00Z" }])), http.get("*/services/conversations/:id", () => HttpResponse.json({ id, resourceId: id, purpose: "history", status: "enquiry", assignmentVersion: 1, assigned: true, operatorName: "Synthetic operator", sourceListingId: null, canSend: true, messages: [], lastSequence: 0, readThrough: 0, unread: 0, hasMore: false })), http.get("*/services/conversations/:id/history", () => HttpResponse.json({ synthetic: true, quotes: [], order: { id, quoteId: id, state: "held", version: 0, day: "2026-10-15", holdExpiresAt: "2026-10-15T10:00:00Z", promiseAt: "2026-10-15T12:00:00Z", paidAt: null, escalatedAt: null, recoveryDeadline: null, recoveryUsed: false, refundState: null }, payments: [] })), http.post("*/services/conversations/:id/attachments", async ({ request }) => { stages++; expect((await request.json() as { category: string }).category).toBe("payment_evidence"); return HttpResponse.json({ id }); }), http.post("*/services/conversations/:id/attachments/:file/bytes", () => { uploads++; return uploads === 1 ? HttpResponse.json({ code: "UNAVAILABLE" }, { status: 503 }) : HttpResponse.json({ ok: true }); }), http.post("*/services/conversations/:id/history", async ({ request }) => { commands.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ ok: true }); }));
 const screen = await renderMobile(<ServiceScreen/>); await fireEvent.press(await screen.findByRole("button", { name: "Vehicle History" }));
 await fireEvent.press(await screen.findByRole("button", { name: "Add receipt screenshot" })); await fireEvent.press(await screen.findByRole("button", { name: "Retry receipt upload" }));
 await screen.findByText("Receipt ready for reconciliation"); expect(stages).toBe(1); expect(uploads).toBe(2); expect(commands).toHaveLength(0);
 await fireEvent.press(screen.getByRole("button", { name: "Submit for reconciliation" })); expect(commands[0]?.["attachmentId"]).toBe(id); expect(commands[0]).not.toHaveProperty("verifiedFunds");
});

it("preserves an unsent draft when leaving and returning to a service conversation", async () => {
 const second = "33333333-3333-4333-8333-333333333333";
 server.use(http.get("*/services/conversations", () => HttpResponse.json([{ id, purpose: "support", createdAt: "2026-10-15T10:00:00Z" }, { id: second, purpose: "support", createdAt: "2026-10-16T10:00:00Z" }])), http.get("*/services/conversations/:id", ({ params }) => HttpResponse.json({ id: params.id, resourceId: params.id, purpose: "support", status: "open", assignmentVersion: 0, assigned: false, operatorName: null, sourceListingId: null, canSend: true, messages: [message], lastSequence: 1, readThrough: 0, unread: 1, hasMore: false })));
 const screen = await renderMobile(<ServiceScreen/>);
 await fireEvent.press((await screen.findAllByRole("button", { name: "General Support" }))[0]); await screen.findByText(message.body);
 await fireEvent.changeText(screen.getByLabelText("Message"), "Keep this draft");
 await fireEvent.press(screen.getByRole("button", { name: "Back to queue" }));
 await fireEvent.press((await screen.findAllByRole("button", { name: "General Support" }))[0]);
 expect(await screen.findByDisplayValue("Keep this draft")).toBeTruthy();
});
