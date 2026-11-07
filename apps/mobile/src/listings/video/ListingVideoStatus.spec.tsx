import { http, HttpResponse } from "msw";
import * as ImagePicker from "expo-image-picker";
import { expect, it, vi } from "vitest";

import { server } from "../../../test/msw";
import { act, fireEvent, renderMobile } from "../../../test/render";

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
  expect(screen.getByText("You can publish now. Buyers see the video once it is ready.")).toBeTruthy();
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
  expect(screen.getByText("Replacement")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Cancel replacement" }));
  expect(screen.getByText("Buyers see this video")).toBeTruthy();
  expect(screen.queryByText("Replacement")).toBeNull();
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
  expect(await screen.findByText("We couldn’t process this video")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Processing video…")).toBeTruthy();
  expect(screen.queryByText("We couldn’t process this video")).toBeNull();
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
  expect(screen.queryByText("Replacement")).toBeNull();
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


it.each(["paused", "dismissed", "editor-cancelled"] as const)("preserves the failed source and Try again when Choose another is %s", async (reason) => {
  let retired = false;
  let reprocessed = false;
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(reason === "editor-cancelled"
    ? { canceled: false, assets: [{ uri: "file:///replacement.mp4", width: 1280, height: 720, duration: 6000 }] }
    : { canceled: true, assets: null });
  server.use(
    http.get("*/listings/video-uploads/target/draft/:id", () => HttpResponse.json(retired ? {} : { pendingVideo: { ...pending, status: reprocessed ? "processing" : "failed", canReprocess: !reprocessed } })),
    http.post("*/listings/video-uploads/remove", () => { retired = true; return HttpResponse.json({ state: "REMOVED" }); }),
    http.post(`*/listings/video-uploads/${pending.sessionId}/reprocess`, () => {
      reprocessed = true;
      return HttpResponse.json({ sessionId: pending.sessionId, generationId: pending.generationId, target: { type: "draft", id }, state: "PROCESSING", partSizeBytes: 5242880, confirmedParts: [], parts: [], expiresAt: "2030-01-01T00:00:00.000Z" });
    }),
  );
  const screen = await renderMobile(<ListingVideoCard isVideoUploadTester canUploadVideo={reason !== "paused"} videoUploadTarget={{ type: "draft", id }} />);
  await screen.findByText("We couldn’t process this video");
  await fireEvent.press(screen.getByRole("button", { name: "Choose another" }));
  if (reason === "editor-cancelled") {
    await screen.findByRole("button", { name: "Use video" });
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  }
  expect(retired).toBe(false);
  expect(await screen.findByText("We couldn’t process this video")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Processing video…")).toBeTruthy();
  expect(reprocessed).toBe(true);
});
