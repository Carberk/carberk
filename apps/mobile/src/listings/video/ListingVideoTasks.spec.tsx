import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { expect, it, vi } from "vitest";
import type { VideoUploadsSchemas } from "@auto-tm/contracts";

import { OwnerListingCard } from "../components/OwnerListingCard";
import { act, fireEvent, renderMobile } from "../../../test/render";
import type { ListingVideoNativeModule, PreparedVideoFile } from "../../../modules/listing-video/src/prepare";

import { ListingVideoTasksProvider, useListingVideoTasks, useSharedListingVideoTask, type ListingVideoTaskOptions } from "./ListingVideoTasks";
import { createListingVideoDraft, toSelection } from "./listingVideo";
import { InMemoryVideoUploadPersistence } from "./application/testing/InMemoryVideoUploadPersistence";

const draft = { type: "draft" as const, id: "11111111-1111-4111-8111-111111111111" };
const listing = { type: "listing" as const, id: "22222222-2222-4222-8222-222222222222" };

it("keeps preparation alive through Review and publish, then opens against the canonical Listing", async () => {
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
  server.use(
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
  await act(async () => { finish({ uri: "file:///prepared.mp4", durationS: 4, sizeBytes: 1000, width: 1280, height: 720, fps: 30, hasAudio: true }); await prepared; });
  expect(await screen.findByText("processing")).toBeTruthy();
  expect(openedTargets).toEqual([listing]);
  expect(native.prepare).toHaveBeenCalledOnce();
});
