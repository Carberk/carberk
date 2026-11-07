import { http, HttpResponse } from "msw";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { environmentManager, focusManager } from "@tanstack/react-query";
import type { VideoUploadsSchemas } from "@auto-tm/contracts";

import { server } from "../../../test/msw";
import { storeAuthSession, clearAuthSession } from "../../auth/session";
import { OwnerListingCard } from "../components/OwnerListingCard";
import { act, fireEvent, renderMobile } from "../../../test/render";
import type { ListingVideoNativeModule, PreparedVideoFile } from "../../../modules/listing-video/src/prepare";

import { ListingVideoTasksProvider, useListingVideoTasks, useSharedListingVideoTask, type ListingVideoTaskOptions } from "./ListingVideoTasks";
import { createListingVideoDraft, toSelection } from "./listingVideo";
import { InMemoryVideoUploadPersistence } from "./application/testing/InMemoryVideoUploadPersistence";

const draft = { type: "draft" as const, id: "11111111-1111-4111-8111-111111111111" };
const listing = { type: "listing" as const, id: "22222222-2222-4222-8222-222222222222" };

vi.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value); },
    deleteItemAsync: async (key: string) => { values.delete(key); },
  };
});
const wasServer = environmentManager.isServer();
afterEach(async () => { await clearAuthSession(); environmentManager.setIsServer(() => wasServer); focusManager.setFocused(undefined); });

it.each(["ready", "failed"] as const)("keeps preparation through publication and discovers %s on My listings after an initially empty target", async (outcome) => {
  environmentManager.setIsServer(() => false);
  focusManager.setFocused(true);
  const user = { id: draft.id, phone: null, email: "owner@example.com", displayName: null, role: "seller" as const };
  await storeAuthSession({ accessToken: "test-access", refreshToken: "test-refresh", user });
  let finish!: (file: PreparedVideoFile) => void;
  const prepared = new Promise<PreparedVideoFile>((resolve) => { finish = resolve; });
  const native: ListingVideoNativeModule = {
    newJobId: () => "native-job", prepare: vi.fn(() => prepared), cancel: vi.fn(),
    addProgressListener: () => ({ remove() {} }),
  };
  const session = (target: VideoUploadsSchemas.VideoUploadTarget): VideoUploadsSchemas.VideoUploadStatusResponse => ({
    target, sessionId: "33333333-3333-4333-8333-333333333333", generationId: "44444444-4444-4444-8444-444444444444", state: "PROCESSING", partSizeBytes: 5242880, parts: [], confirmedParts: [], expiresAt: "2030-01-01T00:00:00.000Z",
  });
  const openedTargets: VideoUploadsSchemas.VideoUploadTarget[] = [];
  let workerFinished = false;
  let emptyReads = 0;
  server.use(
    http.get("*/me", () => HttpResponse.json({ ...user, phoneVerified: false, nameNumber: 1234, avatarIndex: 0, avatarKey: null, avatarUrl: null, locale: "en", createdAt: "2026-11-01T00:00:00.000Z", deletionScheduledAt: null, isVideoUploadTester: true, canUploadVideo: true })),
    http.get("*/listings/video-uploads/target/listing/:id", () => {
      if (!openedTargets.length) { emptyReads++; return HttpResponse.json({}); }
      const { generationId, sessionId } = session(listing);
      return HttpResponse.json(workerFinished && outcome === "ready"
        ? { video: { id: listing.id, generationId, galleryIndex: 1, durationMs: 4000, qualities: [240], cover: { thumbnail: "cover:thumbnail", list: "cover:list", detail: "cover:detail", fullscreen: "cover:fullscreen" } } }
        : { pendingVideo: { id: listing.id, generationId, sessionId, sourceId: sessionId, status: workerFinished ? "failed" : "processing", canReprocess: workerFinished } });
    }),
    http.post("*/listings/video-uploads", async ({ request }) => {
      const input = await request.json() as VideoUploadsSchemas.OpenVideoUploadRequest;
      openedTargets.push(input.target);
      return HttpResponse.json(session(input.target));
    }),
    http.get("*/listings/video-uploads/:sessionId", () => HttpResponse.json(session(listing))),
  );
  const options: ListingVideoTaskOptions = {
    native, subscribeAppState: () => () => {}, subscribeLifecycle: () => () => {},
    fileSystem: { documentDirectory: "file:///documents/", copy: async () => {}, ensureDir: async () => {}, remove: async () => {}, exists: async () => true },
    uploadFileSystem: { exists: async () => true, remove: async () => {} },
    persistence: new InMemoryVideoUploadPersistence(),
  };
  function Screen() {
    const [step, setStep] = useState("photos");
    const tasks = useListingVideoTasks();
    const task = useSharedListingVideoTask({ ...options, target: step === "owner" ? listing : draft });
    return <>
      {step === "owner" && <OwnerListingCard listing={{ id: listing.id, sellerId: "owner", status: "active", brandId: "brand", modelId: "model", year: 2020, priceAmount: 1, priceCurrency: "TMT", displayPriceTmt: 1, photoKeys: [], photoCount: 0, cityId: "city", publishedAt: "2026-11-01T00:00:00.000Z" }} onOpen={() => {}} onMore={() => {}} />}
      <Text>{step}</Text>{task && <Text>Task ready</Text>}<Text>{task?.prep.state.phase}</Text><Text>{task?.upload.state.phase}</Text>
      {step === "photos" && <Pressable accessibilityRole="button" accessibilityLabel="Use video" onPress={() => task?.prep.prepare(toSelection(createListingVideoDraft({ uri: "file:///picked.mp4", durationS: 4 })))}><Text>Use video</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Review" onPress={() => setStep("review")}><Text>Review</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Publish" onPress={() => { tasks?.published(draft.id, listing.id); setStep("owner"); }}><Text>Publish</Text></Pressable>
    </>;
  }
  const screen = await renderMobile(<ListingVideoTasksProvider><Screen /></ListingVideoTasksProvider>);
  await screen.findByText("Task ready");
  await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
  expect(await screen.findByText("preparing")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(screen.getByRole("button", { name: "Publish" }));
  expect(screen.getByText("owner")).toBeTruthy();
  expect(screen.getByText("Video · Preparing")).toBeTruthy();
  expect(native.cancel).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(emptyReads).toBeGreaterThan(0));
  await act(async () => { finish({ uri: "file:///prepared.mp4", durationS: 4, sizeBytes: 1000, width: 1280, height: 720, fps: 30, hasAudio: true }); await prepared; });
  expect(await screen.findByText("processing")).toBeTruthy();
  expect(openedTargets).toEqual([listing]);
  expect(native.prepare).toHaveBeenCalledOnce();
  await screen.findByText("Video · Processing");
  workerFinished = true;
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 3300)); });
  expect(await screen.findByText(outcome === "ready" ? "Video · Ready" : "Video · Needs attention")).toBeTruthy();
});
