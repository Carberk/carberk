import { http, HttpResponse } from "msw";
import * as ImagePicker from "expo-image-picker";
import { afterEach, expect, it, vi } from "vitest";

import { server } from "../../../test/msw";
import { videoCoverAccessFixture } from "../../../test/fixtures/listing";
import { act, fireEvent, renderMobile } from "../../../test/render";
import { clearAuthSession, storeAuthSession } from "../../auth/session";

import { ListingVideoCard } from "./ListingVideoCard";

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/", getInfoAsync: async () => ({ exists: true }),
  deleteAsync: async () => {}, copyAsync: async () => {}, makeDirectoryAsync: async () => {},
}));
vi.mock("expo-image-picker", () => ({
  getMediaLibraryPermissionsAsync: vi.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: vi.fn(async () => ({ canceled: true, assets: null })),
}));
const id = "11111111-1111-4111-8111-111111111111";
const pending = { id, generationId: "22222222-2222-4222-8222-222222222222", sourceId: "33333333-3333-4333-8333-333333333333", sessionId: "33333333-3333-4333-8333-333333333333", status: "processing", canReprocess: false };
it("reopens processing without blocking photos-first publication", async () => {
  server.use(http.get("*/listings/video-uploads/target/draft/:id", () => HttpResponse.json({ pendingVideo: pending })));
  const screen = await renderMobile(<ListingVideoCard canUploadVideo videoUploadTarget={{ type: "draft", id }} />);
  expect(await screen.findByText("Processing video…")).toBeTruthy();
  expect(screen.getByText("Buyers see it once it’s ready.")).toBeTruthy();
});

const ready = { id, generationId: "44444444-4444-4444-8444-444444444444", galleryIndex: 1, durationMs: 45000, qualities: [240], cover: { thumbnail: "cover:thumbnail", list: "cover:list", detail: "cover:detail", fullscreen: "cover:fullscreen" } };

it("keeps the public Ready video while cancelling its processing replacement", async () => {
  let replacement = true;
  server.use(
    http.get("*/listings/video-uploads/target/listing/:id", () => HttpResponse.json({ video: ready, ...(replacement ? { pendingVideo: pending } : {}) })),
    http.post(`*/listings/video-uploads/${pending.sessionId}/cancel`, () => { replacement = false; return HttpResponse.json({ sessionId: pending.sessionId, generationId: pending.generationId, state: "CANCELLED" }); }),
  );
  const screen = await renderMobile(<ListingVideoCard canUploadVideo videoUploadTarget={{ type: "listing", id }} />);
  expect(await screen.findByText("Buyers see this video")).toBeTruthy();
  expect(screen.getByTestId("listing-video-replacement")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Keep current" }));
  expect(screen.getByText("Buyers see this video")).toBeTruthy();
  expect(screen.queryByTestId("listing-video-replacement")).toBeNull();
  expect(screen.getByRole("button", { name: "Replace" })).toBeTruthy();
});

it("reprocesses the same stored upload without picking or sending a file", async () => {
  let processing = false;
  server.use(
    http.get("*/listings/video-uploads/target/draft/:id", () => HttpResponse.json({ pendingVideo: { ...pending, status: processing ? "processing" : "failed", canReprocess: !processing, failureType: "TRANSIENT" } })),
    http.post(`*/listings/video-uploads/${pending.sessionId}/reprocess`, () => {
      processing = true;
      return HttpResponse.json({ sessionId: pending.sessionId, generationId: pending.generationId, target: { type: "draft", id }, state: "PROCESSING", partSizeBytes: 5242880, confirmedParts: [], parts: [], expiresAt: "2030-01-01T00:00:00.000Z" });
    }),
  );
  const screen = await renderMobile(<ListingVideoCard canUploadVideo videoUploadTarget={{ type: "draft", id }} />);
  expect(await screen.findByText("Couldn’t process this video")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Processing video…")).toBeTruthy();
  expect(screen.queryByText("Couldn’t process this video")).toBeNull();
});

it("confirms removal then hides Ready before the server replies", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let removed = false;
  server.use(
    http.get("*/listings/video-uploads/target/listing/:id", () => HttpResponse.json(removed ? {} : { video: ready })),
    http.post("*/listings/video-uploads/remove", async ({ request }) => {
      expect(await request.json()).toEqual({ type: "listing", id });
      await gate; removed = true; return HttpResponse.json({ state: "REMOVED" });
    }),
  );
  const screen = await renderMobile(<ListingVideoCard canUploadVideo videoUploadTarget={{ type: "listing", id }} />);
  await screen.findByText("Buyers see this video");
  await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
  expect(screen.getByText("Remove video?")).toBeTruthy();
  expect(screen.getByText("Buyers see this video")).toBeTruthy();
  await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Remove video" })); });
  expect(screen.queryByText("Buyers see this video")).toBeNull();
  expect(screen.queryByTestId("listing-video-replacement")).toBeNull();
  await act(async () => { release(); await gate; });
});

it("offers Check again after a failed status read, preserving the last known processing state", async () => {
  let fail = true;
  server.use(http.get("*/listings/video-uploads/target/draft/:id", () => fail ? HttpResponse.error() : HttpResponse.json({ pendingVideo: pending })));
  const screen = await renderMobile(<ListingVideoCard canUploadVideo videoUploadTarget={{ type: "draft", id }} />);
  expect(await screen.findByText("Couldn’t check the video status")).toBeTruthy();
  fail = false;
  await fireEvent.press(screen.getByRole("button", { name: "Check again" }));
  expect(await screen.findByText("Processing video…")).toBeTruthy();
});

it("fences a status response started before Remove so it cannot restore the video", async () => {
  let release!: () => void;
  const late = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0;
  let removed = false;
  server.use(
    http.get("*/listings/video-uploads/target/listing/:id", async () => {
      if (++reads === 2) { await late; return HttpResponse.json({ video: ready }); }
      return HttpResponse.json(removed ? {} : { video: ready });
    }),
    http.post("*/listings/video-uploads/remove", () => { removed = true; return HttpResponse.json({ state: "REMOVED" }); }),
  );
  const screen = await renderMobile(<ListingVideoCard canUploadVideo videoUploadTarget={{ type: "listing", id }} />);
  await screen.findByText("Buyers see this video");
  let refreshing!: Promise<void>;
  await act(async () => { refreshing = screen.queryClient.refetchQueries(); });
  await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
  await fireEvent.press(screen.getByRole("button", { name: "Remove video" }));
  expect(await screen.findByRole("button", { name: "Choose from library" })).toBeTruthy();
  await act(async () => { release(); await refreshing; });
  expect(screen.queryByText("Buyers see this video")).toBeNull();
});


it.each(["paused", "dismissed", "editor-cancelled"] as const)("preserves the failed source when Choose another is %s", async (reason) => {
  let retired = false;
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(reason === "editor-cancelled"
    ? { canceled: false, assets: [{ uri: "file:///replacement.mp4", width: 1280, height: 720, duration: 6000 }] }
    : { canceled: true, assets: null });
  server.use(
    http.get("*/listings/video-uploads/target/draft/:id", () => HttpResponse.json(retired ? {} : { pendingVideo: { ...pending, status: "failed", canReprocess: false, failureType: "SOURCE_INVALID" } })),
    http.post("*/listings/video-uploads/remove", () => { retired = true; return HttpResponse.json({ state: "REMOVED" }); }),
  );
  const screen = await renderMobile(<ListingVideoCard isVideoUploadTester canUploadVideo={reason !== "paused"} videoUploadTarget={{ type: "draft", id }} />);
  await screen.findByText("Couldn’t process this video");
  // Without a retry the card does not promise one; it offers another video or removal.
  expect(screen.getByText("This file can’t be used.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Choose another" }));
  if (reason === "editor-cancelled") {
    await screen.findByRole("button", { name: "Use video" });
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  }
  expect(retired).toBe(false);
  expect(await screen.findByText("Couldn’t process this video")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Choose another" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
});

// Secure storage is the native boundary; cover grants require an authenticated owner.
vi.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value); },
    deleteItemAsync: async (key: string) => { values.delete(key); },
  };
});
afterEach(async () => { await clearAuthSession(); });

it.each(["draft", "listing"] as const)("shows the owner's granted cover and duration for a Ready %s", async (type) => {
  await storeAuthSession({ accessToken: "test-token", refreshToken: "test-refresh", user: {
    id, phone: null, email: "owner@example.com", displayName: null, role: "seller",
  } });
  const grant = videoCoverAccessFixture(id);
  server.use(
    http.get(`*/listings/video-uploads/target/${type}/:id`, () => HttpResponse.json({ video: ready })),
    http.get(`*/listings/video-access/owner-preview/${type}/:id`, () => HttpResponse.json({
      ...grant, video: { ...grant.video, id: ready.id, generationId: ready.generationId },
    })),
  );
  const screen = await renderMobile(<ListingVideoCard canUploadVideo videoUploadTarget={{ type, id }} />);
  const image = await screen.findByTestId("video-cover-image", { includeHiddenElements: true });
  expect(image.props.source.uri).toBe(grant.video.cover.thumbnail);
  expect(screen.getByText("0:45")).toBeTruthy();
  expect(screen.getByText(type === "draft" ? "Private until you publish" : "Buyers see this video")).toBeTruthy();
});
