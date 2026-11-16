import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";
import { http, HttpResponse } from "msw";

import { act, fireEvent, getAllHosts, getHost, queryAllHosts, renderMobile, routeParams } from "../../test/render";
import { server } from "../../test/msw";
import { fixture, summaryFixture } from "../../test/fixtures/listing";
import ProfileScreen from "../../app/profile";
import TesterRouteScreen from "../../app/tester-route";
import ConversationDetailScreen from "../../app/conversations/[id]";
import { ToastProvider } from "../../components/ui/toast";
import { captureRouteSnapshot, provisionGatewayKey, removeGatewayKey, selectTesterRoute } from "../api/routes";
import { clearAuthSession, loadAuthSession, storeAuthSession } from "../auth/session";
import { ConversationList } from "../conversations/components/ConversationList";
import { ListingPhoto } from "../listings/feed/ListingPhoto";
import type { PhotoDrag } from "../listings/wizard/PhotoThumbnail";

import { photoRequest } from "./photoRoute";

vi.hoisted(() => { process.env["EXPO_PUBLIC_MEDIA_URL"] = "https://minio-staging-5795.up.railway.app"; });
vi.mock("expo-image", async () => ({ Image: (await import("./application/testing/NativePhotoImage")).NativePhotoImage }));
vi.mock("expo-image-manipulator", async () => (await import("../../test/profile-photo-device")).imageManipulatorFake);
vi.mock("socket.io-client", () => ({ io: () => ({ connected: false, on() {}, disconnect() {} }) }));
vi.mock("expo-image-picker", () => ({
  useMediaLibraryPermissions: () => [{ granted: true }, async () => ({ granted: true })],
  launchImageLibraryAsync: async () => ({ canceled: true, assets: null }),
  launchCameraAsync: async () => ({ canceled: true, assets: null }),
}));
vi.mock("@rn-primitives/progress", async () => {
  const { View } = await import("react-native");
  return { Root: View, Indicator: View };
});

const key = "synthetic-photo-gateway-access-key";
const photo = "https://minio-staging-5795.up.railway.app/listing-photos/pending/a%2fb/original.webp?x=1+2&x=%2F";
const alias = "https://tm-staging.bagtyyar.dev/photos/listing-photos/pending/a%2fb/original.webp?x=1+2&x=%2F";
const storage = new Map<string, string>();

beforeEach(async () => {
  vi.stubGlobal("__DEV__", true);
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://api-staging-2861.up.railway.app/api/v1");
  vi.stubEnv("EXPO_PUBLIC_MEDIA_URL", "https://minio-staging-5795.up.railway.app");
  vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", "true");
  vi.stubEnv("EXPO_PUBLIC_ENV", "staging");
  storage.clear();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async name => storage.get(name) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (name, value) => { storage.set(name, value); });
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async name => { storage.delete(name); });
  selectTesterRoute("global");
  await provisionGatewayKey(key);
});
afterEach(async () => { await act(() => clearAuthSession()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("keeps a recovered avatar visible when an old native request dispatches through the current callback", async () => {
  const { UserAvatar } = await import("../../components/identity/UserAvatar");
  selectTesterRoute("tm");
  const screen = await renderMobile(<UserAvatar size={40} avatarIndex={1} avatarKey="pending/avatar/original.webp" avatarUrl={photo} />);
  await vi.waitFor(() => expect(getHost(screen.container, "Image").props.source?.headers).toEqual({ "X-Carberk-Gateway-Key": key }));
  const pendingNativeError = getHost(screen.container, "Image").props.onError as (event: { error: string }) => void;
  await act(() => provisionGatewayKey("synthetic-replacement-photo-access-key"));
  await vi.waitFor(() => expect(getHost(screen.container, "Image").props.source?.headers).toEqual({ "X-Carberk-Gateway-Key": "synthetic-replacement-photo-access-key" }));
  await act(() => pendingNativeError({ error: "Old request failed after access changed" }));
  expect(getHost(screen.container, "Image").props.source?.headers).toEqual({ "X-Carberk-Gateway-Key": "synthetic-replacement-photo-access-key" });
});

it("retains the Assigned Avatar after access removal until private photo access can be prepared", async () => {
  const { UserAvatar } = await import("../../components/identity/UserAvatar");
  selectTesterRoute("tm");
  const route = captureRouteSnapshot();
  const screen = await renderMobile(<UserAvatar size={40} avatarIndex={1} avatarKey="pending/avatar/original.webp" avatarUrl={photo} />);
  await vi.waitFor(() => expect(getHost(screen.container, "Image").props.source?.headers).toEqual({ "X-Carberk-Gateway-Key": key }));
  await fireEvent(getHost(screen.container, "Image"), "error", { error: "HTTP 403" });
  expect(queryAllHosts(screen.container, "Image")).toHaveLength(0);
  await act(() => removeGatewayKey());
  expect(queryAllHosts(screen.container, "Image")).toHaveLength(0);
  expect(captureRouteSnapshot()).toEqual(route);
  await act(() => provisionGatewayKey(key));
  await vi.waitFor(() => expect(getHost(screen.container, "Image").props.source?.headers).toEqual({ "X-Carberk-Gateway-Key": key }));
});

it("keeps mounted readers on TM without a storage request when private access is removed", async () => {
  selectTesterRoute("tm");
  const route = captureRouteSnapshot();
  const screen = await renderMobile(<ListingPhoto mediaKey="pending/one/original.webp" emptyLabel="No photo" />);
  const source = () => getHost(screen.container, "Image").props.source;
  await vi.waitFor(() => expect(source()?.headers).toEqual({ "X-Carberk-Gateway-Key": key }));
  await act(() => removeGatewayKey());
  expect(source()).toBeUndefined();
  expect(captureRouteSnapshot()).toEqual(route);
  await act(() => provisionGatewayKey("synthetic-replacement-photo-access-key"));
  await vi.waitFor(() => expect(source()?.headers).toEqual({ "X-Carberk-Gateway-Key": "synthetic-replacement-photo-access-key" }));
});

it("removes tester access without changing the chosen entry and permits an explicit Global selection", async () => {
  selectTesterRoute("tm");
  const route = captureRouteSnapshot();
  const screen = await renderMobile(<TesterRouteScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Remove access key" }));
  expect(screen.getByText("Gateway access not configured")).toBeTruthy();
  expect(screen.getByRole("radio", { name: "TM gateway", checked: true })).toBeTruthy();
  expect(captureRouteSnapshot()).toEqual(route);
  await fireEvent.press(screen.getByRole("radio", { name: "Global" }));
  expect(captureRouteSnapshot().entry).toBe("global");
});

it("pins one photo transfer, preserves its raw capability and never sends API credentials to storage", async () => {
  selectTesterRoute("tm");
  const preparing = photoRequest(photo, { "If-Match": '"original-etag"', "Content-Type": "image/webp", Authorization: "Bearer api-only", Cookie: "api-only" });
  selectTesterRoute("global");
  expect(await preparing).toEqual({ uri: alias, headers: { "If-Match": '"original-etag"', "Content-Type": "image/webp", "X-Carberk-Gateway-Key": key } });
  expect(await photoRequest(photo, { authorization: "Bearer api-only", "x-carberk-gateway-key": key })).toEqual({ uri: photo, headers: {} });
  expect(Object.keys(captureRouteSnapshot()).sort()).toEqual(["apiBaseUrl", "entry", "generation"]);
});

it("does not grant the gateway key to unapproved origins, buckets or lookalike hosts", async () => {
  selectTesterRoute("tm");
  for (const uri of ["https://minio-staging-5795.up.railway.app.attacker.test/listing-photos/a.webp", "https://other.test/listing-photos/a.webp", "https://minio-staging-5795.up.railway.app/private-history/a.webp"]) {
    await expect(photoRequest(uri)).rejects.toThrow("Unapproved photo destination");
  }
});

it("changes the actual feed image request when the entry changes, retaining its canonical object/cache identity", async () => {
  const screen = await renderMobile(<ListingPhoto mediaKey="pending/one/original.webp" emptyLabel="No photo" />);
  const source = () => getHost(screen.container, "Image").props.source;
  expect(source()).toMatchObject({ uri: "https://minio-staging-5795.up.railway.app/listing-photos/pending/one/list.webp?v=webp-natural-1" });
  await act(() => selectTesterRoute("tm"));
  await vi.waitFor(() => expect(source()).toMatchObject({
    uri: "https://tm-staging.bagtyyar.dev/photos/listing-photos/pending/one/list.webp?v=webp-natural-1",
    cacheKey: "https://minio-staging-5795.up.railway.app/listing-photos/pending/one/list.webp?v=webp-natural-1",
    headers: { "X-Carberk-Gateway-Key": key },
  }));
  await act(() => selectTesterRoute("global"));
  expect(source()).toMatchObject({ uri: "https://minio-staging-5795.up.railway.app/listing-photos/pending/one/list.webp?v=webp-natural-1" });
});

it("routes gallery sources/placeholders and API-returned avatars while preserving local and bundled images", async () => {
  const { GalleryImage } = await import("../listings/components/GalleryImage");
  const { UserAvatar } = await import("../../components/identity/UserAvatar");
  const { Photo } = await import("./photoRoute");
  selectTesterRoute("tm");
  const screen = await renderMobile(<>
    <GalleryImage item={{ key: "pending/one/original.webp" }} variant="fullscreen" placeholderVariant="detail" contentFit="contain" style={{ width: 100, height: 100 }} />
    <UserAvatar size={40} avatarIndex={1} avatarKey="pending/avatar/original.webp" avatarUrl={photo} />
    <Photo source={{ uri: "file:///picked.webp" }} />
    <Photo source={42} />
  </>);
  const { getAllHosts } = await import("../../test/render");
  await vi.waitFor(() => {
    const images = getAllHosts(screen.container, "Image");
    expect(images[0]?.props.source).toMatchObject({ uri: "https://tm-staging.bagtyyar.dev/photos/listing-photos/pending/one/fullscreen.webp?v=webp-natural-1", headers: { "X-Carberk-Gateway-Key": key } });
    expect(images[0]?.props.placeholder).toMatchObject({ uri: "https://tm-staging.bagtyyar.dev/photos/listing-photos/pending/one/detail.webp?v=webp-natural-1", headers: { "X-Carberk-Gateway-Key": key } });
    expect(images[1]?.props.source).toMatchObject({ uri: alias });
    expect(images[2]?.props.source).toEqual({ uri: "file:///picked.webp" });
    expect(images[3]?.props.source).toBe(42);
  });
});

it.each([false, true])("rebinds a mounted TM photo after provisioning access (initially available: %s)", async (available) => {
  if (!available) storage.clear();
  selectTesterRoute("tm");
  const generation = captureRouteSnapshot().generation;
  const screen = await renderMobile(<ListingPhoto mediaKey="pending/one/original.webp" emptyLabel="No photo" />);
  const source = () => getHost(screen.container, "Image").props.source;
  if (available) await vi.waitFor(() => expect(source()?.headers).toEqual({ "X-Carberk-Gateway-Key": key }));
  else expect(source()).toBeUndefined();
  await act(() => provisionGatewayKey("synthetic-replacement-photo-access-key"));
  await vi.waitFor(() => expect(source()).toEqual(available ? {
    uri: "https://tm-staging.bagtyyar.dev/photos/listing-photos/pending/one/list.webp?v=webp-natural-1",
    cacheKey: "https://minio-staging-5795.up.railway.app/listing-photos/pending/one/list.webp?v=webp-natural-1",
    headers: { "X-Carberk-Gateway-Key": "synthetic-replacement-photo-access-key" },
  } : {
    uri: "https://tm-staging.bagtyyar.dev/photos/listing-photos/pending/one/original.webp",
    cacheKey: "https://minio-staging-5795.up.railway.app/listing-photos/pending/one/original.webp",
    headers: { "X-Carberk-Gateway-Key": "synthetic-replacement-photo-access-key" },
  }));
  expect(captureRouteSnapshot()).toMatchObject({ entry: "tm", generation });
});


it.each(["avatar", "bubble", "row"])("retries a %s hidden after native failure when private access is reprovisioned", async (kind) => {
  const { UserAvatar } = await import("../../components/identity/UserAvatar");
  const { MessageBubble } = await import("../conversations/components/MessageBubble");
  const { ConversationListItem } = await import("../conversations/components/ConversationListItem");
  const { queryAllHosts } = await import("../../test/render");
  selectTesterRoute("tm");
  const screen = await renderMobile(kind === "avatar" ? <UserAvatar size={40} avatarIndex={1} avatarKey="pending/one/original.webp" avatarUrl={photo} />
    : kind === "bubble" ? <MessageBubble id="m" text="" kind="image" metadata={{ key: "chat-attachments/c/p/original.webp" }} isMine={false} status="sent" createdAt="2026-11-15T00:00:00Z" />
    : <ConversationListItem conversation={{ id: "c", buyerId: "b", sellerId: "s", myRole: "buyer", peer: { id: "s", displayName: "Seller", nameNumber: 1, avatarIndex: 1, avatarKey: null, deleted: false }, blockedByMe: false, updatedAt: "2026-11-15T00:00:00Z", unreadCount: 0, listing: { id: "l", brandId: "b", modelId: "m", displayPriceTmt: 1, priceCurrency: "TMT", status: "active", coverMediaKey: "pending/one/original.webp" } }} />);
  await vi.waitFor(() => expect(getHost(screen.container, "Image").props.source?.headers).toEqual({ "X-Carberk-Gateway-Key": key }));
  const canonical = getHost(screen.container, "Image").props.source.cacheKey;
  const oldError = getHost(screen.container, "Image").props.onError as (event: { error: string }) => void;
  await act(() => oldError({ error: "HTTP 403" }));
  expect(queryAllHosts(screen.container, "Image")).toHaveLength(0);
  await act(() => provisionGatewayKey("synthetic-replacement-photo-access-key"));
  await vi.waitFor(() => expect(getHost(screen.container, "Image").props.source).toMatchObject({
    uri: kind === "avatar" ? alias : kind === "bubble" ? "https://tm-staging.bagtyyar.dev/photos/chat-attachments/chat-attachments/c/p/original.webp" : "https://tm-staging.bagtyyar.dev/photos/listing-photos/pending/one/thumbnail.webp?v=webp-natural-1",
    cacheKey: canonical, headers: { "X-Carberk-Gateway-Key": "synthetic-replacement-photo-access-key" },
  }));
  await act(() => oldError({ error: "late old failure" }));
  expect(getHost(screen.container, "Image").props.source?.headers).toEqual({ "X-Carberk-Gateway-Key": "synthetic-replacement-photo-access-key" });
  const currentError = getHost(screen.container, "Image").props.onError as (event: { error: string }) => void;
  await act(() => currentError({ error: "current image failed" }));
  expect(queryAllHosts(screen.container, "Image")).toHaveLength(0);
  await act(() => oldError({ error: "late old failure after current failure" }));
  expect(queryAllHosts(screen.container, "Image")).toHaveLength(0);
});

it.each(["profile", "conversation list", "conversation detail"])("routes API-backed %s photos and recovers without changing its session or cached identities", async (surface) => {
  const buyerId = "00000000-0000-4000-8000-0000000000b1";
  const sellerId = "00000000-0000-4000-8000-0000000000b2";
  const conversationId = "00000000-0000-4000-8000-0000000000c1";
  const conversation = {
    id: conversationId, buyerId, sellerId, myRole: "buyer",
    peer: { id: sellerId, displayName: "Synthetic seller", nameNumber: 1001, avatarIndex: 1, avatarKey: null, deleted: false },
    blockedByMe: false, updatedAt: "2026-11-15T00:00:00Z", unreadCount: 0,
    listing: {
      id: "00000000-0000-4000-8000-0000000000a1",
      brandId: "00000000-0000-4000-8000-0000000000d1", modelId: "00000000-0000-4000-8000-0000000000d2",
      displayPriceTmt: 1, priceCurrency: "TMT", status: "active", coverMediaKey: "pending/one/original.webp",
    },
  };
  const apiRequests: { origin: string; authorization: string | null; gateway: string | null }[] = [];
  const record = (request: Request) => {
    apiRequests.push({ origin: new URL(request.url).origin, authorization: request.headers.get("authorization"), gateway: request.headers.get("x-carberk-gateway-key") });
  };
  server.use(
    http.get("*/me", ({ request }) => {
      record(request);
      return HttpResponse.json({
        id: buyerId, phone: null, email: "reader@example.com", phoneVerified: false, displayName: "Synthetic reader",
        nameNumber: 1002, avatarIndex: 1, avatarKey: "pending/avatar/original.webp", avatarUrl: photo,
        role: "buyer", locale: "en", createdAt: "2026-01-15T00:00:00Z", deletionScheduledAt: null,
      });
    }),
    http.get("*/conversations", ({ request }) => { record(request); return HttpResponse.json({ items: [conversation], nextCursor: null }); }),
    http.get(`*/conversations/${conversationId}`, ({ request }) => { record(request); return HttpResponse.json({ ...conversation, sendRestriction: null }); }),
    http.get(`*/conversations/${conversationId}/messages`, ({ request }) => {
      record(request);
      return HttpResponse.json({ items: [{
        id: "00000000-0000-4000-8000-0000000000e1", conversationId, senderId: sellerId,
        kind: "image", text: null, metadata: { key: "chat-attachments/c/p/original.webp" }, createdAt: "2026-11-15T00:00:00Z",
      }], nextCursor: null });
    }),
    http.post(`*/conversations/${conversationId}/watermark`, () => HttpResponse.json({ conversationId })),
    http.get("*/catalog/brands", () => HttpResponse.json({ items: [], nextCursor: null, hasMore: false })),
    http.get("*/catalog/brands/:brandId/models", () => HttpResponse.json({ items: [], nextCursor: null, hasMore: false })),
    http.get(`*/listings/${conversation.listing.id}`, () => HttpResponse.json(fixture({
      id: conversation.listing.id, brandId: conversation.listing.brandId, modelId: conversation.listing.modelId,
      generationId: undefined, regionId: "00000000-0000-4000-8000-0000000000d3", cityId: "00000000-0000-4000-8000-0000000000d4",
    }))),
    http.get("*/config", () => HttpResponse.json({ reportEntryEnabled: false, adminModerationActionsEnabled: false, inspectionInterestEnabled: false })),
  );
  await storeAuthSession({ accessToken: "reader-access", refreshToken: "reader-refresh", user: { id: buyerId, phone: null, email: "reader@example.com", displayName: "Synthetic reader", role: "buyer" } });
  const session = await loadAuthSession();
  selectTesterRoute("tm");
  routeParams.id = conversationId;
  const screen = await renderMobile(<ToastProvider>{surface === "profile" ? <ProfileScreen /> : surface === "conversation list" ? <ConversationList /> : <ConversationDetailScreen />}</ToastProvider>);
  await screen.findByText(surface === "profile" ? "Synthetic reader" : "Synthetic seller");
  const canonical = surface === "profile" ? photo : surface === "conversation list"
    ? "https://minio-staging-5795.up.railway.app/listing-photos/pending/one/thumbnail.webp?v=webp-natural-1"
    : "https://minio-staging-5795.up.railway.app/chat-attachments/chat-attachments/c/p/original.webp";
  const image = () => getAllHosts(screen.container, "Image").find(node => node.props.source?.cacheKey === canonical);
  await vi.waitFor(() => expect(image()?.props.source?.headers).toEqual({ "X-Carberk-Gateway-Key": key }));
  expect(apiRequests.length).toBeGreaterThan(0);
  expect(apiRequests.every(request => request.origin === "https://tm-staging.bagtyyar.dev" && request.authorization === "Bearer reader-access" && request.gateway === key)).toBe(true);
  const cached = screen.queryClient.getQueryCache().getAll().map(query => query.state.data);
  const route = captureRouteSnapshot();
  const oldError = image()?.props.onError as (event: { error: string }) => void;
  await act(() => oldError({ error: "HTTP 403" }));
  expect(queryAllHosts(screen.container, "Image").some(node => node.props.source?.cacheKey === canonical)).toBe(false);
  await act(() => provisionGatewayKey("synthetic-replacement-photo-access-key"));
  await vi.waitFor(() => expect(image()?.props.source?.headers).toEqual({ "X-Carberk-Gateway-Key": "synthetic-replacement-photo-access-key" }));
  await act(() => oldError({ error: "late image failure" }));
  expect(image()).toBeTruthy();
  expect(captureRouteSnapshot()).toEqual(route);
  expect(await loadAuthSession()).toEqual(session);
  expect(screen.queryClient.getQueryCache().getAll().map(query => query.state.data)).toEqual(cached);
  expect(JSON.stringify(cached)).not.toContain("/photos/");
  await act(() => selectTesterRoute("global"));
  expect(getAllHosts(screen.container, "Image").some(node => node.props.source?.uri === canonical && !node.props.source.headers)).toBe(true);
  expect(await loadAuthSession()).toEqual(session);
});

it.each(["draft", "owner", "sell", "thumbnail"])("recovers the mounted %s photo after access changes and ignores old image errors", async (kind) => {
  const { DraftCard } = await import("../listings/components/DraftCard");
  const { OwnerListingCard } = await import("../listings/components/OwnerListingCard");
  const { SellEntry } = await import("../listings/sell/SellEntry");
  const { PhotoThumbnail } = await import("../listings/wizard/PhotoThumbnail");
  const draft = { id: "draft", userId: "reader", payload: { photos: [{ photoId: "p", key: "pending/one/original.webp", sortOrder: 0 }] }, createdAt: "2026-11-15T00:00:00Z", updatedAt: "2026-11-15T00:00:00Z" };
  selectTesterRoute("tm");
  const screen = await renderMobile(kind === "draft" ? <DraftCard draft={draft} onResume={() => {}} onMore={() => {}} />
    : kind === "owner" ? <OwnerListingCard listing={summaryFixture({ coverMediaKey: "pending/one/original.webp" })} onOpen={() => {}} onMore={() => {}} />
    : kind === "sell" ? <SellEntry drafts={[draft]} isPending={false} error={null} onRetry={() => {}} isCreating={false} onContinue={() => {}} onCreate={() => {}} onNavigate={() => {}} limitSheetOpen={false} onLimitSheetOpenChange={() => {}} />
    : <PhotoThumbnail photo={{ photoId: "p", key: "pending/one/original.webp", state: "attached", retryCount: 0, sortOrder: 0 }} index={0} total={1} onRemove={() => {}} onOpenActions={() => {}} dragEnabled={false} onDragStart={() => {}} onDrop={() => {}} drag={{ from: { value: -1 }, to: { value: -1 }, x: { value: 0 }, y: { value: 0 } } as unknown as PhotoDrag} />);
  await vi.waitFor(() => expect(getHost(screen.container, "Image").props.source?.headers).toEqual({ "X-Carberk-Gateway-Key": key }));
  const canonical = getHost(screen.container, "Image").props.source.cacheKey;
  const oldError = getHost(screen.container, "Image").props.onError as () => void;
  await act(() => oldError());
  expect(queryAllHosts(screen.container, "Image")).toHaveLength(0);
  await act(() => provisionGatewayKey("synthetic-replacement-photo-access-key"));
  await vi.waitFor(() => expect(getHost(screen.container, "Image").props.source).toMatchObject({ cacheKey: canonical, headers: { "X-Carberk-Gateway-Key": "synthetic-replacement-photo-access-key" } }));
  await act(() => oldError());
  expect(getHost(screen.container, "Image").props.source.cacheKey).toBe(canonical);
});
