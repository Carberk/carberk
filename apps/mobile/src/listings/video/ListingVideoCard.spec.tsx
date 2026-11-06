import * as Linking from "expo-linking";
import * as ImagePicker from "expo-image-picker";
import { describe, expect, it, vi } from "vitest";

import { act, fireEvent, renderMobile } from "../../../test/render";
import type { FakeVideoPlayer } from "../../../test/native-video";
import type { StagedPhoto } from "../uploadStaging/types";
import Step2Photos from "../wizard/Step2Photos";

import { FakeListingVideoPreparation } from "./videoPreparation";

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
    const preparation = new FakeListingVideoPreparation();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoPreparation={preparation} />,
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
    expect(preparation.selections).toEqual([]);
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
    const preparation = new FakeListingVideoPreparation();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoPreparation={preparation} />,
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
    expect(preparation.selections).toEqual([
      {
        source: { uri: "file:///library/video.mp4", durationS: 45 },
        startS: 0,
        endS: 45,
        coverIndex: 0,
        posterS: 6,
      },
    ]);
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
    const preparation = new FakeListingVideoPreparation();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoPreparation={preparation} />,
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
    expect(preparation.selections[0]?.coverIndex).toBe(2);
    expect(preparation.selections[0]?.startS).toBe(30);
    expect(preparation.selections[0]?.endS).toBe(120);
  });

  it("keeps a used pick when re-editing is cancelled", async () => {
    const preparation = new FakeListingVideoPreparation();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoPreparation={preparation} />,
    );
    await pickVideo(screen, 45_000);
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Use video" }));
    });
    expect(screen.getByText("Video chosen")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Continue editing" }));
    });
    expect(screen.getByTestId("listing-video-editor")).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    });

    expect(screen.queryByTestId("listing-video-editor")).toBeNull();
    expect(screen.getByText("Video chosen")).toBeTruthy();
    expect(preparation.selections).toHaveLength(1);
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

  it("will not use a video shorter than 3 seconds", async () => {
    const preparation = new FakeListingVideoPreparation();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoPreparation={preparation} />,
    );
    await pickVideo(screen, 2_000);

    const use = screen.getByRole("button", { name: "Use video" });
    expect(use.props.accessibilityState?.disabled ?? use.props.disabled).toBeTruthy();
    await act(async () => {
      await fireEvent.press(use);
    });
    expect(preparation.selections).toEqual([]);
  });

  it("will not use a 2.9-second video that only rounds up to 3 seconds", async () => {
    const preparation = new FakeListingVideoPreparation();
    const screen = await renderMobile(
      <Step2Photos {...stepProps()} canUploadVideo videoPreparation={preparation} />,
    );
    await pickVideo(screen, 2_999);

    const use = screen.getByRole("button", { name: "Use video" });
    expect(use.props.accessibilityState?.disabled ?? use.props.disabled).toBeTruthy();
    expect(preparation.selections).toEqual([]);
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
