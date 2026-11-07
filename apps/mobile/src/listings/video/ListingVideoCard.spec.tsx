import * as Linking from "expo-linking";
import * as ImagePicker from "expo-image-picker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as FileSystem from "expo-file-system/legacy";

import { storeAuthSession, clearAuthSession } from "../../auth/session";
import { server } from "../../../test/msw";
import { act, fireEvent, renderMobile } from "../../../test/render";
import type { FakeVideoPlayer } from "../../../test/native-video";
import type { StagedPhoto } from "../uploadStaging/types";
import Step2Photos from "../wizard/Step2Photos";
import type { ListingVideoNativeModule } from "../../../modules/listing-video/src/prepare";

import { InMemoryVideoUploadPersistence } from "./application/testing/InMemoryVideoUploadPersistence";
import { ListingVideoCard } from "./ListingVideoCard";

type PreparedResult = Awaited<ReturnType<ListingVideoNativeModule["prepare"]>>;

function fakeNative(
  prepareImpl?: (
    source: string,
    startS: number,
    endS: number,
    coverS: number,
    jobId: string,
  ) => Promise<PreparedResult>,
): ListingVideoNativeModule {
  let next = 0;
  return {
    newJobId: () => `job-${++next}`,
    prepare: vi.fn(
      prepareImpl ??
        (async (_source: string, startS: number, endS: number, _coverS: number, jobId: string) => ({
          uri: `file:///documents/listing-video/${jobId}/prepared.mp4`,
          durationS: endS - startS,
          sizeBytes: 1_500_000,
          width: 1280,
          height: 720,
          fps: 30,
          hasAudio: true,
        })),
    ),
    cancel: vi.fn(),
    addProgressListener: vi.fn(() => ({ remove: vi.fn() })),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

vi.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value); },
    deleteItemAsync: async (key: string) => { values.delete(key); },
  };
});
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  getCameraPermissionsAsync: vi.fn(),
  requestCameraPermissionsAsync: vi.fn(),
  getMediaLibraryPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  getInfoAsync: vi.fn(async () => ({ exists: true })),
  copyAsync: vi.fn(async () => {}),
  makeDirectoryAsync: vi.fn(async () => {}),
  deleteAsync: vi.fn(async () => {}),
}));
vi.mock("expo-linking", () => ({ openSettings: vi.fn(async () => {}) }));

const photo = (photoId: string, sortOrder: number): StagedPhoto => ({
  photoId,
  sortOrder,
  localUri: `file:///${photoId}.jpg`,
  state: "attached",
  retryCount: 0,
});
const threePhotos = () => [photo("a", 0), photo("b", 1), photo("c", 2)];

const granted = { granted: true, canAskAgain: true, status: "granted", expires: "never" } as ImagePicker.MediaLibraryPermissionResponse;
const denied = { granted: false, canAskAgain: false, status: "denied", expires: "never" } as ImagePicker.MediaLibraryPermissionResponse;

function stepProps(extra: Record<string, unknown> = {}) {
  return {
    photos: threePhotos(),
    onAddPhoto: vi.fn(async () => {}),
    onRemovePhoto: vi.fn(),
    onReorderPhotos: vi.fn(),
    onRetryPhoto: vi.fn(),
    isCompressing: false,
    isUploading: false,
    ...extra,
  };
}

async function pickVideo(screen: Awaited<ReturnType<typeof renderMobile>>, durationMs: number) {
  vi.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(granted);
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///library/video.mp4", duration: durationMs, width: 1280, height: 720 }],
  } as ImagePicker.ImagePickerResult);
  await act(async () => {
    await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));
  });
}

async function layoutTrack(screen: Awaited<ReturnType<typeof renderMobile>>, width = 300) {
  await act(async () => {
    await fireEvent(screen.getByTestId("listing-video-trim-track"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width, height: 56 } },
    });
  });
}

async function dragHandle(
  screen: Awaited<ReturnType<typeof renderMobile>>,
  testID: string,
  fromX: number,
  toX: number,
) {
  const handle = screen.getByTestId(testID);
  await act(async () => {
    await fireEvent(handle, "responderGrant", { nativeEvent: { pageX: fromX } });
    await fireEvent(handle, "responderMove", { nativeEvent: { pageX: toX } });
    await fireEvent(handle, "responderRelease", { nativeEvent: { pageX: toX } });
  });
}

const startNow = (screen: Awaited<ReturnType<typeof renderMobile>>) =>
  screen.getByTestId("listing-video-start-handle").props.accessibilityValue.now as number;
const endNow = (screen: Awaited<ReturnType<typeof renderMobile>>) =>
  screen.getByTestId("listing-video-end-handle").props.accessibilityValue.now as number;

describe("Listing video card on the Photos step", () => {
  it("is hidden for non-testers and photos work exactly as before", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} />);
    expect(screen.queryByTestId("listing-video-card")).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose from library" })).toBeNull();
    expect(screen.getByLabelText("Photo 1 of 3, Cover, Uploaded")).toBeTruthy();

    const tester = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    expect(tester.getByTestId("listing-video-card")).toBeTruthy();
    expect(tester.getByText("One video, up to 90 seconds, from your library")).toBeTruthy();
    expect(tester.getByRole("button", { name: "Choose from library" })).toBeTruthy();
  });

  it("opens a video-only picker and cancel changes nothing", async () => {
    const native = fakeNative();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    vi.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(granted);
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null });

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ["videos"], allowsMultipleSelection: false }),
    );
    expect(screen.queryByTestId("listing-video-editor")).toBeNull();
    expect(screen.getByRole("button", { name: "Choose from library" })).toBeTruthy();
    expect(native.prepare).not.toHaveBeenCalled();
  });

  it("shows the denied note with Open Settings and keeps every photo", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    vi.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(denied);
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockClear();

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));
    });

    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Carberk can't open your videos")).toBeTruthy();
    expect(screen.getByText("Allow video access in Settings, or carry on with photos. Nothing you entered is lost.")).toBeTruthy();
    expect(screen.getByLabelText("Photo 1 of 3, Cover, Uploaded")).toBeTruthy();
    expect(screen.getByLabelText("Photo 3 of 3, Uploaded")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Open Settings" }));
    });
    expect(Linking.openSettings).toHaveBeenCalled();
  });

  it("discards the pick when the editor is cancelled", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    await pickVideo(screen, 45_000);
    expect(screen.getByTestId("listing-video-preview")).toBeTruthy();
    expect(await screen.findAllByTestId("listing-video-cover-image")).toHaveLength(4);
    expect(screen.getByTestId("listing-video-editor")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    });

    expect(screen.queryByTestId("listing-video-editor")).toBeNull();
    expect(screen.getByRole("button", { name: "Choose from library" })).toBeTruthy();
  });
});

describe("Listing video editor", () => {
  it("keeps four usable fractional cover choices for a short video", async () => {
    const native = fakeNative();
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo videoNative={native} />);
    await pickVideo(screen, 1_800);

    const images = await screen.findAllByTestId("listing-video-cover-image");
    expect(images.map((image) => image.props.source.uri)).toEqual([
      "file:///thumb-225.jpg", "file:///thumb-675.jpg", "file:///thumb-1125.jpg", "file:///thumb-1575.jpg",
    ]);
    await fireEvent.press(screen.getByRole("button", { name: "Cover 4 of 4, frame at 0:02" }));
    expect(screen.getByRole("button", { name: "Cover 4 of 4, frame at 0:02" }).props.accessibilityState.selected).toBe(true);
    expect(screen.getAllByText("0:01")).toHaveLength(2);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });
    expect(native.prepare).toHaveBeenCalledWith(expect.any(String), 0, 1.8, 1.575, "job-1");
    expect(await screen.findByText("Video ready")).toBeTruthy();
  });

  it("previews only the kept interval and stops at its end", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    await pickVideo(screen, 45_000);
    await fireEvent(screen.getByTestId("listing-video-start-handle"), "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    const player = screen.getByTestId("listing-video-preview").props.player as FakeVideoPlayer;

    await fireEvent.press(screen.getByRole("button", { name: "Play the part to keep" }));
    expect(player.playing).toBe(true);
    expect(player.currentTime).toBe(1);

    await act(async () => { player.emitTimeUpdate(44); });
    expect(player.playing).toBe(true);
    await act(async () => { player.emitTimeUpdate(45); });
    expect(player.playing).toBe(false);
    expect(player.currentTime).toBe(1);
    expect(screen.getByRole("button", { name: "Play the part to keep" })).toBeTruthy();
  });

  it("opens a short video on the whole clip and hands source, interval and cover to preparation on Use video", async () => {
    const native = fakeNative();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 45_000);

    expect(screen.getAllByText("0:45")).toHaveLength(2);
    expect(screen.getByText("Max 1:30")).toBeTruthy();
    expect(screen.getByText("Drag the yellow edges to trim. Optional.")).toBeTruthy();
    expect(startNow(screen)).toBe(0);
    expect(endNow(screen)).toBe(45);

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Play the part to keep" }));
    });
    expect(screen.getByText("Playing 0:00–0:45")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });
    // The library file is copied into app storage first; only the copy is
    // prepared, with the kept interval and cover.
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: "file:///library/video.mp4",
      to: expect.stringMatching(/^file:\/\/\/documents\/listing-video\/prep-[^/]+\/source.mp4$/),
    });
    expect(native.prepare).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/documents\/listing-video\/prep-[^/]+\/source.mp4$/),
      0,
      45,
      5.625,
      "job-1",
    );
    expect(await screen.findByText("Video ready")).toBeTruthy();
  });

  it("opens a long video on the first 1:30 and names the part on the Use button", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    await pickVideo(screen, 120_000);

    expect(startNow(screen)).toBe(0);
    expect(endNow(screen)).toBe(90);
    expect(screen.getByText("This video is 2:00. Drag the yellow frame to the 1:30 you want.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use 0:00–1:30" })).toBeTruthy();
  });

  it("stops an edge drag at the 1:30 cap", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    await pickVideo(screen, 120_000);
    await layoutTrack(screen, 300);

    await dragHandle(screen, "listing-video-end-handle", 0, -150);
    expect(endNow(screen)).toBe(30);

    await dragHandle(screen, "listing-video-end-handle", 0, 300);
    expect(endNow(screen)).toBe(90);
    expect(screen.getByText("Videos can be up to 1:30. Slide the frame to move it.")).toBeTruthy();
  });

  it("keeps at least 3 seconds when an edge is dragged past the other", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    await pickVideo(screen, 45_000);
    await layoutTrack(screen, 300);

    await dragHandle(screen, "listing-video-start-handle", 0, 300);
    expect(startNow(screen)).toBe(42);
    expect(endNow(screen)).toBe(45);
    expect(screen.getByText("0:03")).toBeTruthy();
  });

  it("slides the whole frame from its middle without changing its length", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    await pickVideo(screen, 120_000);
    await layoutTrack(screen, 300);

    await dragHandle(screen, "listing-video-trim-window", 0, 75);
    expect(startNow(screen)).toBe(30);
    expect(endNow(screen)).toBe(120);
    expect(screen.getByRole("button", { name: "Use 0:30–2:00" })).toBeTruthy();
  });

  it("moves the nearest edge to a tap on the timeline", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    await pickVideo(screen, 120_000);
    await layoutTrack(screen, 300);

    await act(async () => {
      await fireEvent.press(screen.getByTestId("listing-video-trim-track"), { nativeEvent: { locationX: 25 } });
    });
    expect(startNow(screen)).toBe(10);
    expect(endNow(screen)).toBe(90);

    await act(async () => {
      await fireEvent.press(screen.getByTestId("listing-video-trim-track"), { nativeEvent: { locationX: 200 } });
    });
    expect(startNow(screen)).toBe(10);
    expect(endNow(screen)).toBe(80);
  });

  it("steps an edge by one second from its accessible adjustable control", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    await pickVideo(screen, 45_000);

    const start = screen.getByTestId("listing-video-start-handle");
    expect(start.props.accessibilityValue).toEqual({ min: 0, max: 42, now: 0, text: "Starts at 0:00" });
    expect(start.props.style.width).toBe(44);
    expect(start.props.style.minHeight).toBeGreaterThanOrEqual(44);

    await act(async () => {
      await fireEvent(start, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    });
    expect(startNow(screen)).toBe(1);

    await act(async () => {
      await fireEvent(screen.getByTestId("listing-video-end-handle"), "accessibilityAction", {
        nativeEvent: { actionName: "decrement" },
      });
    });
    expect(endNow(screen)).toBe(44);
  });

  it("chooses one of four covers in the photo crop and keeps the slot when the frame moves", async () => {
    const native = fakeNative();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 120_000);
    await layoutTrack(screen, 300);

    const covers = ["Cover 1 of 4, frame at 0:11", "Cover 2 of 4, frame at 0:34", "Cover 3 of 4, frame at 0:56", "Cover 4 of 4, frame at 1:19"];
    for (const name of covers) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.getByRole("button", { name: covers[0] }).props.accessibilityState.selected).toBe(true);

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: covers[2] }));
    });
    expect(screen.getByRole("button", { name: covers[2] }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole("button", { name: covers[0] }).props.accessibilityState.selected).toBe(false);

    await dragHandle(screen, "listing-video-trim-window", 0, 75);
    const movedCovers = screen.getAllByRole("button", { name: /^Cover \d of 4/ });
    expect(movedCovers).toHaveLength(4);
    expect(movedCovers[2]?.props.accessibilityState.selected).toBe(true);

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use 0:30–2:00" }));
    });
    expect(native.prepare).toHaveBeenCalledWith(expect.any(String), 30, 120, 86.25, "job-1");
    expect(await screen.findByText("Video ready")).toBeTruthy();
  });

  it("keeps a used pick when re-editing is cancelled", async () => {
    const native = fakeNative();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });
    expect(await screen.findByText("Video ready")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Continue editing" }));
    });
    expect(screen.getByTestId("listing-video-editor")).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    });

    expect(screen.queryByTestId("listing-video-editor")).toBeNull();
    expect(screen.getByText("Video ready")).toBeTruthy();
    expect(native.prepare).toHaveBeenCalledTimes(1);
  });

  it("shows the denied note from Change without leaving the editor", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    await pickVideo(screen, 45_000);
    vi.mocked(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(denied);

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Change" }));
    });

    expect(screen.getByTestId("listing-video-editor")).toBeTruthy();
    expect(screen.getByText("Carberk can't open your videos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Settings" })).toBeTruthy();
  });

  it("uses a whole video shorter than 3 seconds", async () => {
    const native = fakeNative();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 2_000);

    const use = screen.getByRole("button", { name: "Use video" });
    expect(use.props.accessibilityState?.disabled ?? use.props.disabled).toBeFalsy();
    await act(async () => {
      await fireEvent.press(use);
    });
    expect(native.prepare).toHaveBeenCalledWith(expect.any(String), 0, 2, 0.25, "job-1");
  });

  it("uses a whole 2.9-second video without rounding its interval", async () => {
    const native = fakeNative();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 2_999);

    const use = screen.getByRole("button", { name: "Use video" });
    expect(use.props.accessibilityState?.disabled ?? use.props.disabled).toBeFalsy();
    await act(async () => {
      await fireEvent.press(use);
    });
    expect(native.prepare).toHaveBeenCalledWith(expect.any(String), 0, 2.999, 0.374875, "job-1");
  });

  it("reopens the picker from Change and replaces the pick", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    await pickVideo(screen, 45_000);
    expect(endNow(screen)).toBe(45);

    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///library/other.mp4", duration: 120_000, width: 1280, height: 720 }],
    } as ImagePicker.ImagePickerResult);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Change" }));
    });

    expect(screen.getByRole("button", { name: "Use 0:00–1:30" })).toBeTruthy();
    expect(endNow(screen)).toBe(90);
  });
  it("keeps fractional source duration (45.9s shows 0:46)", async () => {
    const screen = await renderMobile(<Step2Photos {...stepProps()} canUploadVideo />);
    await pickVideo(screen, 45_900);
    expect(screen.getAllByText("0:46").length).toBeGreaterThan(0);
  });
});

describe("Listing video preparation (#1044)", () => {
  it("shows Preparing with an indeterminate bar and Cancel deletes the local files", async () => {
    const gate = deferred<PreparedResult>();
    const native = fakeNative(() => gate.promise);
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });

    expect(await screen.findByText("Preparing video…")).toBeTruthy();
    expect(screen.getByText("Keep Carberk open. 0:45 selected")).toBeTruthy();
    expect(screen.getByTestId("listing-video-preparing-bar")).toBeTruthy();
    expect(screen.getByLabelText("Photo 1 of 3, Cover, Uploaded")).toBeTruthy();

    vi.mocked(FileSystem.deleteAsync).mockClear();
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    });
    expect(native.cancel).toHaveBeenCalledWith("job-1");
    expect(FileSystem.deleteAsync).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose from library" })).toBeTruthy();
  });

  it("stops preparation when the app leaves and Prepare again keeps trim and cover", async () => {
    const gate = deferred<PreparedResult>();
    let calls = 0;
    const native = fakeNative(async (_s, startS, endS, _c, jobId) => {
      calls += 1;
      if (calls === 1) return gate.promise;
      return {
        uri: `file:///documents/listing-video/${jobId}/prepared.mp4`,
        durationS: endS - startS,
        sizeBytes: 1_500_000,
        width: 1280,
        height: 720,
        fps: 30,
        hasAudio: true,
      };
    });
    let onBackground: (() => void) | undefined;
    const subscribeAppState = (cb: () => void) => {
      onBackground = cb;
      return () => undefined;
    };
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} subscribeAppState={subscribeAppState} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });
    expect(await screen.findByText("Preparing video…")).toBeTruthy();

    await act(async () => {
      onBackground?.();
    });
    expect(screen.getByText("Preparing stopped")).toBeTruthy();
    expect(screen.getByText("Carberk was closed while preparing. Your selection is kept.")).toBeTruthy();
    expect(native.cancel).toHaveBeenCalled();

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Prepare again" }));
    });
    expect(await screen.findByText("Video ready")).toBeTruthy();
    expect(native.prepare).toHaveBeenCalledTimes(2);
  });

  it("shows Video no longer available when the source is gone and keeps photos", async () => {
    const native = fakeNative(async () => {
      throw Object.assign(new Error("gone"), { code: "source-unreadable" });
    });
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });

    expect(await screen.findByText("Video no longer available")).toBeTruthy();
    expect(screen.getByText("The original was moved, deleted or access was removed. Choose another video.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose another" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Prepare again" })).toBeNull();
    expect(screen.getByLabelText("Photo 1 of 3, Cover, Uploaded")).toBeTruthy();
    expect(screen.getByLabelText("Photo 3 of 3, Uploaded")).toBeTruthy();
  });

  it("shows Not enough space and Try again prepares from the kept selection", async () => {
    let calls = 0;
    const native = fakeNative(async (_s, startS, endS, _c, jobId) => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("full"), { code: "insufficient-storage" });
      return {
        uri: `file:///documents/listing-video/${jobId}/prepared.mp4`,
        durationS: endS - startS,
        sizeBytes: 1_500_000,
        width: 1280,
        height: 720,
        fps: 30,
        hasAudio: true,
      };
    });
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });

    expect(await screen.findByText("Not enough space on your phone")).toBeTruthy();
    expect(screen.getByText("Free up some space, then try again. Your selection is kept.")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    });
    expect(await screen.findByText("Video ready")).toBeTruthy();
  });

  it("shows Couldn't prepare and rejects an oversized output before it can be used", async () => {
    const native = fakeNative(async (_s, startS, endS, _c, jobId) => ({
      uri: `file:///documents/listing-video/${jobId}/prepared.mp4`,
      durationS: endS - startS,
      sizeBytes: 16 * 1024 * 1024,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true,
    }));
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });

    expect(await screen.findByText("Couldn't prepare this video")).toBeTruthy();
    expect(screen.getByText("Try again, or choose another video.")).toBeTruthy();
    expect(screen.queryByText("Video ready")).toBeNull();
    expect(screen.getByLabelText("Photo 1 of 3, Cover, Uploaded")).toBeTruthy();
  });

  it("deletes the copied source when Cancel lands during the copy", async () => {
    const copyGate = deferred<undefined>();
    vi.mocked(FileSystem.copyAsync).mockImplementationOnce(() => copyGate.promise);
    const native = fakeNative();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });
    expect(await screen.findByText("Preparing video…")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    });
    await act(async () => {
      copyGate.resolve(undefined);
    });
    expect(native.prepare).not.toHaveBeenCalled();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/documents\/listing-video\/prep-[^/]+\/$/),
      { idempotent: true },
    );
    expect(screen.getByRole("button", { name: "Choose from library" })).toBeTruthy();
  });

  it("deletes the output of a preparation superseded by a re-edit", async () => {
    const gate = deferred<PreparedResult>();
    let calls = 0;
    const native = fakeNative(async (_s, startS, endS, _c, jobId) => {
      calls += 1;
      if (calls === 1) return gate.promise;
      return {
        uri: `file:///documents/listing-video/${jobId}/prepared.mp4`,
        durationS: endS - startS,
        sizeBytes: 1_500_000,
        width: 1280,
        height: 720,
        fps: 30,
        hasAudio: true,
      };
    });
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });
    expect(await screen.findByText("Preparing video…")).toBeTruthy();

    // Supersede the running preparation by removing it, then resolve late.
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    });
    vi.mocked(FileSystem.deleteAsync).mockClear();
    await act(async () => {
      gate.resolve({
        uri: "file:///documents/listing-video/job-1/prepared.mp4",
        durationS: 45,
        sizeBytes: 1_500_000,
        width: 1280,
        height: 720,
        fps: 30,
        hasAudio: true,
      });
    });
    // The cancelled native job rejects instead of resolving, so no prepared
    // file is kept and the card is back at Choose.
    expect(screen.getByRole("button", { name: "Choose from library" })).toBeTruthy();
    expect(screen.queryByText("Video ready")).toBeNull();
  });

  it("shows Not enough space when the source copy runs out of storage", async () => {
    vi.mocked(FileSystem.copyAsync).mockRejectedValueOnce(
      Object.assign(new Error("No space left on device"), { code: "ENOSPC" }),
    );
    const native = fakeNative();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });
    expect(await screen.findByText("Not enough space on your phone")).toBeTruthy();
    expect(native.prepare).not.toHaveBeenCalled();
  });

  it("removes the preparation directory when the source copy fails", async () => {
    vi.mocked(FileSystem.copyAsync).mockRejectedValueOnce(new Error("gone"));
    const native = fakeNative();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });
    expect(await screen.findByText("Video no longer available")).toBeTruthy();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/documents\/listing-video\/prep-[^/]+\/$/),
      { idempotent: true },
    );
    expect(native.prepare).not.toHaveBeenCalled();
  });

  it("deletes the previous output when the seller uses an edited selection again", async () => {
    const native = fakeNative();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });
    expect(await screen.findByText("Video ready")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Continue editing" }));
    });
    vi.mocked(FileSystem.deleteAsync).mockClear();
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });
    expect(await screen.findByText("Video ready")).toBeTruthy();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      "file:///documents/listing-video/job-1/prepared.mp4",
      { idempotent: true },
    );
    expect(native.prepare).toHaveBeenCalledTimes(2);
  });

  it("Remove on a prepared video deletes the local files", async () => {
    const native = fakeNative();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoNative={native} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });
    expect(await screen.findByText("Video ready")).toBeTruthy();

    vi.mocked(FileSystem.deleteAsync).mockClear();
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
    });
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      "file:///documents/listing-video/job-1/prepared.mp4",
      { idempotent: true },
    );
    expect(screen.getByRole("button", { name: "Choose from library" })).toBeTruthy();
  });
});


const uploadTarget = { type: "draft" as const, id: "10000000-0000-4000-8000-000000000001" };
const uploadSession = "10000000-0000-4000-8000-000000000002";
const uploadGeneration = "10000000-0000-4000-8000-000000000003";
const uploadRoot = "http://localhost:3006/api/v1/listings/video-uploads";

function uploadServer() {
  const persistence = new InMemoryVideoUploadPersistence();
  const state = { confirmed: false, phase: "UPLOADING", cancelUnknown: true, sent: [] as number[], keys: [] as string[], cover: 0 };
  const response = () => ({
    sessionId: uploadSession, generationId: uploadGeneration, target: uploadTarget, state: state.phase,
    partSizeBytes: 5_242_880, expiresAt: "2030-01-01T00:00:00.000Z",
    confirmedParts: state.confirmed ? [{ partNumber: 1, sizeBytes: 1_500_000 }] : [],
    parts: state.confirmed || state.phase !== "UPLOADING" ? [] : [{ partNumber: 1, sizeBytes: 1_500_000, uploadUrl: "https://bucket/part1", expiresAt: "2030-01-01T00:00:00.000Z" }],
  });
  server.use(
    http.post(uploadRoot, async ({ request }) => {
      const body = await request.json() as { coverOffsetMs: number };
      state.cover = body.coverOffsetMs;
      state.keys.push(request.headers.get("Idempotency-Key") ?? "missing");
      return HttpResponse.json(response());
    }),
    http.get(`${uploadRoot}/${uploadSession}`, () => HttpResponse.json(response())),
    http.post(`${uploadRoot}/${uploadSession}/complete`, () => { state.phase = "PROCESSING"; return HttpResponse.json(response()); }),
    http.post(`${uploadRoot}/${uploadSession}/cancel`, () => {
      if (state.cancelUnknown) return HttpResponse.error();
      state.phase = "CANCELLED";
      return HttpResponse.json({ sessionId: uploadSession, generationId: uploadGeneration, state: "CANCELLED" });
    }),
  );
  return { state, persistence };
}

describe("Listing video resumable upload card with the real HTTP client", () => {
  it("retains unknown Cancel and clears preparation and selection only after confirmation", async () => {
    const { state, persistence } = uploadServer();
    const part = deferred<undefined>();
    const screen = await renderMobile(<ListingVideoCard canUploadVideo videoNative={fakeNative()}
      videoUploadTarget={uploadTarget} videoUploadPersistence={persistence}
      videoUploadTransport={{ put: async () => part.promise }} />);
    await pickVideo(screen, 45_000);
    await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    expect(await screen.findByText("Uploading video")).toBeTruthy();
    expect(screen.getByText("0.0 of 1.4 MB · 0%")).toBeTruthy();
    vi.mocked(FileSystem.deleteAsync).mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Cancellation not confirmed yet")).toBeTruthy();
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    expect(screen.queryByText("Video ready")).toBeNull();
    await screen.unmount();
    const reopened = await renderMobile(<ListingVideoCard canUploadVideo videoUploadTarget={uploadTarget} videoUploadPersistence={persistence} />);
    expect(await reopened.findByText("Cancellation not confirmed yet")).toBeTruthy();
    state.phase = "PROCESSING";
    await fireEvent.press(reopened.getByRole("button", { name: "Check status" }));
    expect(reopened.getByText("Cancellation not confirmed yet")).toBeTruthy();
    expect(await persistence.get(`listing-video:draft:${uploadTarget.id}`)).not.toBeNull();
    state.phase = "CANCELLED";
    await fireEvent.press(reopened.getByRole("button", { name: "Check status" }));
    expect(await reopened.findByRole("button", { name: "Choose from library" })).toBeTruthy();
    expect(reopened.queryByText("Video ready")).toBeNull();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(expect.stringMatching(/\/prep-[^/]+\/$/), { idempotent: true });
    part.resolve(undefined);
  });

  it("clears the mounted prepared card after confirmed Cancel", async () => {
    const { state, persistence } = uploadServer();
    state.cancelUnknown = false;
    const pending = deferred<undefined>();
    const screen = await renderMobile(<ListingVideoCard canUploadVideo videoNative={fakeNative()}
      videoUploadTarget={uploadTarget} videoUploadPersistence={persistence}
      videoUploadTransport={{ put: async () => pending.promise }} />);
    await pickVideo(screen, 45_000);
    await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    expect(await screen.findByText("Uploading video")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("button", { name: "Choose from library" })).toBeTruthy();
    expect(screen.queryByText("Video ready")).toBeNull();
    expect(screen.queryByText("Video chosen")).toBeNull();
    pending.resolve(undefined);
  });

  it("explains a missing prepared file and offers Remove before another selection", async () => {
    const { persistence } = uploadServer();
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (uri) => ({ exists: !String(uri).endsWith("/prepared.mp4") }) as FileSystem.FileInfo);
    const screen = await renderMobile(<ListingVideoCard canUploadVideo videoNative={fakeNative()}
      videoUploadTarget={uploadTarget} videoUploadPersistence={persistence} />);
    await pickVideo(screen, 45_000);
    await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    expect(await screen.findByText("Video no longer available")).toBeTruthy();
    expect(screen.queryByText("Video ready")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("button", { name: "Choose from library" })).toBeTruthy();
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true } as FileSystem.FileInfo);
  });

  it("shows bounded failure, then Continue uses the same prepared file and cleans both owned paths", async () => {
    const { state, persistence } = uploadServer();
    let refuse = true;
    const native = fakeNative();
    const screen = await renderMobile(<ListingVideoCard canUploadVideo videoNative={native}
      videoUploadTarget={uploadTarget} videoUploadPersistence={persistence}
      videoUploadTransport={{ put: async (_url, part) => {
        state.sent.push(part.offset);
        if (refuse) throw new Error("HTTP 500");
        state.confirmed = true;
      } }} />);
    await pickVideo(screen, 45_000);
    await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    expect(await screen.findByText("Upload interrupted")).toBeTruthy();
    expect(state.sent).toEqual([0, 0, 0]);
    refuse = false;
    vi.mocked(FileSystem.deleteAsync).mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Continue upload" }));
    expect(await screen.findByText("Processing video…")).toBeTruthy();
    expect(state.keys).toHaveLength(1);
    expect(native.prepare).toHaveBeenCalledOnce();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith("file:///documents/listing-video/job-1/prepared.mp4", { idempotent: true });
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(expect.stringMatching(/\/prep-[^/]+\/$/), { idempotent: true });
    expect(screen.queryByText("Video ready")).toBeNull();
  });

  it("shows a durable manual pause after remount and Continue reconciles server-confirmed bytes", async () => {
    const { state, persistence } = uploadServer();
    const part = deferred<undefined>();
    const screen = await renderMobile(<ListingVideoCard canUploadVideo videoNative={fakeNative()}
      videoUploadTarget={uploadTarget} videoUploadPersistence={persistence}
      videoUploadTransport={{ put: async () => part.promise }} />);
    await pickVideo(screen, 45_000);
    await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    expect(await screen.findByText("Uploading video")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Pause upload" }));
    expect(await screen.findByText("Upload paused")).toBeTruthy();
    await screen.unmount();
    expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith("file:///documents/listing-video/job-1/prepared.mp4", { idempotent: true });
    const reopened = await renderMobile(<ListingVideoCard canUploadVideo videoUploadTarget={uploadTarget} videoUploadPersistence={persistence} />);
    expect(await reopened.findByText("Upload paused")).toBeTruthy();
    state.phase = "PROCESSING";
    state.confirmed = true;
    await fireEvent.press(reopened.getByRole("button", { name: "Continue upload" }));
    expect(await reopened.findByText("Processing video…")).toBeTruthy();
    part.resolve(undefined);
  });
});


describe("current-user video access", () => {
  const user = { id: "11111111-1111-4111-8111-111111111111", phone: null, email: "video@example.com", displayName: null, role: "seller" as const };
  const me = { ...user, phoneVerified: false, nameNumber: 4821, avatarIndex: 0, avatarKey: null, avatarUrl: null, locale: "en", createdAt: "2026-01-01T00:00:00.000Z", deletionScheduledAt: null };
  beforeEach(async () => {
    await storeAuthSession({ accessToken: "test-token", refreshToken: "test-refresh", user });
  });
  afterEach(async () => { await clearAuthSession(); });

  it("hides the card for a non-tester and retains the paused card for an upload tester", async () => {
    server.use(http.get("*/me", () => HttpResponse.json({ ...me, isVideoUploadTester: false, canUploadVideo: false })));
    const hidden = await renderMobile(<ListingVideoCard />);
    expect(hidden.queryByTestId("listing-video-card")).toBeNull();
    await hidden.unmount();
    server.use(http.get("*/me", () => HttpResponse.json({ ...me, isVideoUploadTester: true, canUploadVideo: false })));
    const paused = await renderMobile(<ListingVideoCard />);
    expect(await paused.findByText("Video uploads are paused right now")).toBeTruthy();
    expect(paused.getByRole("button", { name: "Choose from library" })).toBeDisabled();
  });

  it("refreshes before opening the picker and hides the card when upload membership was removed", async () => {
    let tester = true;
    server.use(http.get("*/me", () => HttpResponse.json({ ...me, isVideoUploadTester: tester, canUploadVideo: tester })));
    const screen = await renderMobile(<ListingVideoCard />);
    await screen.findByRole("button", { name: "Choose from library" });
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockClear();
    tester = false;
    await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));
    expect(screen.queryByTestId("listing-video-card")).toBeNull();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it("refreshes before Use video, refuses a newly paused upload and preserves the chosen interval", async () => {
    let enabled = true;
    server.use(http.get("*/me", () => HttpResponse.json({ ...me, isVideoUploadTester: true, canUploadVideo: enabled })));
    const screen = await renderMobile(<ListingVideoCard videoNative={fakeNative()} />);
    await screen.findByRole("button", { name: "Choose from library" });
    await pickVideo(screen, 12_000);
    enabled = false;
    await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    expect(await screen.findByText("Video uploads are paused right now")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use video" })).toBeTruthy();
    expect(screen.queryByText("Preparing video")).toBeNull();
    enabled = true;
    await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    expect(await screen.findByTestId("listing-video-prepared")).toBeTruthy();
  });
});
