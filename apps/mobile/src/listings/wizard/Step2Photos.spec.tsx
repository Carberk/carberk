import { useRef } from "react";
import * as Reanimated from "react-native-reanimated";
import * as Linking from "expo-linking";
import { describe, expect, it, vi } from "vitest";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import { renderMobile, fireEvent, act, first, within } from "../../../test/render";
import type { StagedPhoto } from "../uploadStaging/types";

import Step2Photos from "./Step2Photos";

// The pan's callbacks are recorded on a host view, so a spec can run a drag the
// way Gesture Handler would: start after the long press, update, finalize.
vi.mock("react-native-gesture-handler", async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  const Pan = () => {
    const recorded: Record<string, unknown> = {};
    const gesture: unknown = new Proxy(recorded, {
      get: (target, key: string) => key === "recorded" ? target
        : (value: unknown) => { target[key] = value; return gesture; },
    });
    return gesture;
  };
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ gesture, children }: { gesture: { recorded: unknown }; children: React.ReactNode }) =>
      React.createElement(View, { testID: "photo-drag", pan: gesture.recorded } as object, children),
    Gesture: { Pan },
  };
});
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: vi.fn(), launchCameraAsync: vi.fn(), getCameraPermissionsAsync: vi.fn(), requestCameraPermissionsAsync: vi.fn() }));
vi.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///documents/",
  getInfoAsync: vi.fn(async () => ({ exists: true })), copyAsync: vi.fn(async () => {}),
  makeDirectoryAsync: vi.fn(async () => {}), deleteAsync: vi.fn(async () => {}) }));

const photo = (photoId: string, sortOrder: number): StagedPhoto => ({ photoId, sortOrder,
  localUri: `file:///${photoId}.jpg`, state: "attached", retryCount: 0 });
const defaults = () => ({ photos: [], onAddPhoto: vi.fn<(uri: string) => Promise<void>>(async () => {}), onRemovePhoto: vi.fn(),
  onReorderPhotos: vi.fn(), onRetryPhoto: vi.fn(), isCompressing: false, isUploading: false });

type PanCallbacks = Record<string, ((event?: unknown) => void) | number | boolean>;
function pan(screen: ReturnType<typeof renderMobile>, index: number): PanCallbacks {
  const detector = screen.getAllByTestId("photo-drag")[index];
  if (!detector) throw new Error(`No drag on photo ${index + 1}`);
  return detector.props.pan as PanCallbacks;
}
/** Long-press photo `index`, move it by dx, dy and lift, as Gesture Handler reports it. */
function dragPhoto(screen: ReturnType<typeof renderMobile>, index: number, { dx, dy }: { dx: number; dy: number }) {
  const callbacks = pan(screen, index);
  const call = (name: string, event?: unknown) => (callbacks[name] as (event?: unknown) => void)(event);
  act(() => {
    call("onStart");
    call("onUpdate", { translationX: dx, translationY: dy });
    call("onFinalize");
  });
}

describe("Step2Photos", () => {
  it("shows an empty state and photo validation error", () => {
    const screen = renderMobile(<Step2Photos {...defaults()} fieldErrors={{ photos: "Add a photo" }} showErrors />);
    expect(screen.getByText("No photos")).toBeTruthy();
    expect(screen.getByText("Add a photo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Camera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Library" })).toBeTruthy();
  });

  it("drags a photo from the first row to the second, and the others make room (#820)", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const props = { ...defaults(), photos: ids.map((id, n) => photo(id, n)) };
    const screen = renderMobile(<Step2Photos {...props} />);

    // 390 pt wide: 111 pt tiles, 119 pt apart. Photo 1 goes one row down and one column on.
    dragPhoto(screen, 0, { dx: 119, dy: 119 });

    expect(props.onReorderPhotos).toHaveBeenCalledWith(["b", "c", "d", "e", "a", "f"]);
  });

  it("keeps the dragged photo at its drop position until the reordered grid commits (#820)", () => {
    const values: { value: number }[] = [];
    const sharedValue = vi.spyOn(Reanimated, "useSharedValue").mockImplementation(((initial: number) => {
      const ref = useRef({ value: initial });
      if (!values.includes(ref.current)) values.push(ref.current);
      return ref.current;
    }) as typeof Reanimated.useSharedValue);
    try {
      const ids = ["a", "b", "c", "d", "e", "f"];
      const props = { ...defaults(), photos: ids.map((id, n) => photo(id, n)) };
      const screen = renderMobile(<Step2Photos {...props} />);
      dragPhoto(screen, 0, { dx: 119, dy: 119 });
      // Native shared values still describe the drop while the parent has the
      // old grid; otherwise the photo visibly snaps back before React commits.
      expect(values.map((value) => value.value)).toEqual([0, 4, 119, 119]);
      screen.rerender(<Step2Photos {...props} photos={["b", "c", "d", "e", "a", "f"].map((id, n) => photo(id, n))} />);
      expect(values.map((value) => value.value)).toEqual([-1, -1, 0, 0]);
      expect(screen.getByRole("button", { name: /^Photo 5 of 6/ })).toBeTruthy();
    } finally {
      sharedValue.mockRestore();
    }
  });

  it("drags a photo back onto the cover slot (#820)", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const props = { ...defaults(), photos: ids.map((id, n) => photo(id, n)) };
    const screen = renderMobile(<Step2Photos {...props} />);

    dragPhoto(screen, 4, { dx: -119, dy: -119 });

    expect(props.onReorderPhotos).toHaveBeenCalledWith(["e", "a", "b", "c", "d", "f"]);
  });

  it("holds the drag back while the grid is disabled, and a drop on its own slot changes nothing", () => {
    const props = { ...defaults(), photos: [photo("a", 0), photo("b", 1)] };
    const screen = renderMobile(<Step2Photos {...props} />);
    expect(pan(screen, 0).enabled).toBe(true);

    dragPhoto(screen, 1, { dx: 10, dy: 5 });
    expect(props.onReorderPhotos).not.toHaveBeenCalled();

    screen.rerender(<Step2Photos {...props} disabled />);
    expect(pan(screen, 0).enabled).toBe(false);
    expect(pan(screen, 0).activateAfterLongPress).toBe(250);
  });

  it("removes a selected photo and renders the in-progress state", () => {
    const props = { ...defaults(), photos: [photo("a", 0)], isCompressing: true };
    const screen = renderMobile(<Step2Photos {...props} />);
    fireEvent.press(screen.getByLabelText("Remove: Photo 1 of 1"));
    expect(props.onRemovePhoto).toHaveBeenCalledWith("a");
    expect(screen.getByText("Compressing...")).toBeTruthy();
  });

  it("copies picker media before adding it and cleans temporary media", async () => {
    const props = defaults();
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: false,
      assets: [{ uri: "file:///picker/a.jpg", width: 100, height: 100 }] });
    const screen = renderMobile(<Step2Photos {...props} />);
    await act(async () => { await fireEvent.press(screen.getByRole("button", { name: "Library" })); });
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: "file:///picker/a.jpg", to: expect.stringContaining("file:///documents/picker-temp/") });
    expect(props.onAddPhoto).toHaveBeenCalledWith(expect.stringContaining("file:///documents/picker-temp/"));
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(props.onAddPhoto.mock.calls[0]?.[0], { idempotent: true });
  });

  it("adds library photos in the order they were tapped in the picker (#819)", async () => {
    const props = defaults();
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: false,
      assets: [1, 2, 3].map((n) => ({ uri: `file:///picker/${n}.jpg`, width: 100, height: 100 })) });
    vi.mocked(FileSystem.copyAsync).mockClear();
    const screen = renderMobile(<Step2Photos {...props} />);
    await act(async () => { await fireEvent.press(screen.getByRole("button", { name: "Library" })); });
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ orderedSelection: true }));
    const copiedTo = new Map(vi.mocked(FileSystem.copyAsync).mock.calls.map(([{ from, to }]) => [to, from]));
    expect(props.onAddPhoto.mock.calls.map(([uri]) => copiedTo.get(uri))).toEqual(
      ["file:///picker/1.jpg", "file:///picker/2.jpg", "file:///picker/3.jpg"]);
  });

  it("disables adding at twenty photos", () => {
    const screen = renderMobile(<Step2Photos {...defaults()} photos={Array.from({ length: 20 }, (_, i) => photo(String(i), i))} />);
    expect(screen.getByRole("button", { name: "Camera", disabled: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Library", disabled: true })).toBeTruthy();
    expect(screen.getByText("Photo limit reached")).toBeTruthy();
    // The maximum is stated once, in the intro line.
    expect(screen.getByText("Photos: 20")).toBeTruthy();
    expect(screen.getAllByText(/20 photos|20 фото|limit of 20|Maximum 20/)).toHaveLength(1);
    expect(screen.getByText("Photos under 5 MB upload faster. Add up to 20 photos.")).toBeTruthy();
  });

  it.each([
    ["en", 2, "Photos: 2", "At least 3 photos are required"],
    ["en", 3, "Photos: 3", "Add 5 more for a better listing"],
    ["en", 8, "Photos: 8", "Enough photos for a detailed listing"],
    ["ru", 2, "Фото: 2", "Нужно не менее 3 фотографий"],
    ["ru", 3, "Фото: 3", "Добавьте ещё 5, чтобы объявление было лучше"],
    ["tk", 2, "Surat: 2", "Iň azyndan 3 surat gerek"],
    ["tk", 3, "Surat: 3", "Has gowy bildiriş üçin ýene 5 surat goşuň"],
  ])("counts photos without the goal as a denominator in %s at %i photos", (locale, count, counter, hint) => {
    const photos = Array.from({ length: count as number }, (_, i) => photo(String(i), i));
    const screen = renderMobile(<Step2Photos {...defaults()} photos={photos} />, { locale: locale as string });
    expect(screen.getByText(counter as string)).toBeTruthy();
    expect(screen.queryByText(/\/ 8/)).toBeNull();
    expect(screen.getByText(hint as string)).toBeTruthy();
  });
});

const inState = (photoId: string, sortOrder: number, state: StagedPhoto["state"], extra: Partial<StagedPhoto> = {}): StagedPhoto =>
  ({ ...photo(photoId, sortOrder), state, ...extra });
const failedWith = (photoId: string, sortOrder: number, message: string, retryable: boolean): StagedPhoto =>
  inState(photoId, sortOrder, "failed", { retryCount: 1, error: { code: retryable ? "NETWORK_ERROR" : "LOCAL_FILE_MISSING", message, retryable } });
const NETWORK = "No internet connection — will retry automatically";
const MISSING = "Photo missing — remove and re-select";
const LOST = "The file is no longer on this phone. Remove it and add it again.";

describe("Step2Photos tile labels", () => {
  it("announces each tile as Photo N of M, with Cover on the first and its upload state", () => {
    const photos = [
      photo("a", 0), inState("b", 1, "uploading"), inState("c", 2, "selected"), inState("d", 3, "compressed"),
      inState("e", 4, "waiting_for_network"), failedWith("f", 5, NETWORK, true), inState("g", 6, "lost"),
    ];
    const screen = renderMobile(<Step2Photos {...defaults()} photos={photos} />);

    expect(screen.getByLabelText("Photo 1 of 7, Cover, Uploaded")).toBeTruthy();
    expect(screen.getByLabelText("Photo 2 of 7, Uploading")).toBeTruthy();
    expect(screen.getByLabelText("Photo 3 of 7, Compressing")).toBeTruthy();
    expect(screen.getByLabelText("Photo 4 of 7, In queue")).toBeTruthy();
    expect(screen.getByLabelText("Photo 5 of 7, Waiting for network")).toBeTruthy();
    expect(screen.getByLabelText("Photo 6 of 7, Failed")).toBeTruthy();
    expect(screen.getByLabelText("Photo 7 of 7, Lost")).toBeTruthy();
  });
});

describe("Step2Photos photo actions sheet", () => {
  const three = () => ({ ...defaults(), photos: [photo("a", 0), photo("b", 1), photo("c", 2)] });
  const sheet = (screen: ReturnType<typeof renderMobile>) => within(screen.getByTestId("photo-actions-sheet"));

  it("opens only when a tile is tapped, titled with the photo's position", () => {
    const screen = renderMobile(<Step2Photos {...three()} />);
    expect(screen.queryByTestId("photo-actions-sheet")).toBeNull();

    fireEvent.press(screen.getByLabelText("Photo 2 of 3, Uploaded"));

    expect(screen.getByTestId("photo-actions-sheet")).toBeTruthy();
    expect(sheet(screen).getByText("Photo 2 of 3")).toBeTruthy();
  });

  it("offers Set as cover, Move earlier, Move later and Remove for a middle photo", () => {
    const screen = renderMobile(<Step2Photos {...three()} />);
    fireEvent.press(screen.getByLabelText("Photo 2 of 3, Uploaded"));

    for (const name of ["Set as cover", "Move earlier", "Move later", "Remove"]) {
      expect(sheet(screen).getByRole("button", { name })).toBeTruthy();
    }
    expect(sheet(screen).queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("has no Move earlier or Set as cover on the first photo", () => {
    const screen = renderMobile(<Step2Photos {...three()} />);
    fireEvent.press(screen.getByLabelText("Photo 1 of 3, Cover, Uploaded"));

    expect(sheet(screen).queryByRole("button", { name: "Move earlier" })).toBeNull();
    expect(sheet(screen).queryByRole("button", { name: "Set as cover" })).toBeNull();
    expect(sheet(screen).getByRole("button", { name: "Move later" })).toBeTruthy();
    expect(sheet(screen).getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  it("has no Move later on the last photo", () => {
    const screen = renderMobile(<Step2Photos {...three()} />);
    fireEvent.press(screen.getByLabelText("Photo 3 of 3, Uploaded"));

    expect(sheet(screen).queryByRole("button", { name: "Move later" })).toBeNull();
    expect(sheet(screen).getByRole("button", { name: "Move earlier" })).toBeTruthy();
    expect(sheet(screen).getByRole("button", { name: "Set as cover" })).toBeTruthy();
  });

  it("has neither Move action when there is one photo", () => {
    const screen = renderMobile(<Step2Photos {...defaults()} photos={[photo("a", 0)]} />);
    fireEvent.press(screen.getByLabelText("Photo 1 of 1, Cover, Uploaded"));

    expect(sheet(screen).queryByRole("button", { name: "Move earlier" })).toBeNull();
    expect(sheet(screen).queryByRole("button", { name: "Move later" })).toBeNull();
    expect(sheet(screen).getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  it.each([
    ["Move earlier", "Photo 2 of 3, Uploaded", ["b", "a", "c"]],
    ["Move later", "Photo 2 of 3, Uploaded", ["a", "c", "b"]],
    ["Set as cover", "Photo 3 of 3, Uploaded", ["c", "a", "b"]],
  ])("%s saves the new order and closes the sheet", (action, tile, order) => {
    const props = three();
    const screen = renderMobile(<Step2Photos {...props} />);
    fireEvent.press(screen.getByLabelText(tile));
    fireEvent.press(sheet(screen).getByRole("button", { name: action }));

    expect(props.onReorderPhotos).toHaveBeenCalledWith(order);
    expect(screen.queryByTestId("photo-actions-sheet")).toBeNull();
  });

  it("removes the tapped photo", () => {
    const props = three();
    const screen = renderMobile(<Step2Photos {...props} />);
    fireEvent.press(screen.getByLabelText("Photo 2 of 3, Uploaded"));
    fireEvent.press(sheet(screen).getByRole("button", { name: "Remove" }));

    expect(props.onRemovePhoto).toHaveBeenCalledWith("b");
    expect(screen.queryByTestId("photo-actions-sheet")).toBeNull();
  });

  it("offers Retry, with the reason, for a retryable failure", () => {
    const props = { ...defaults(), photos: [photo("a", 0), failedWith("b", 1, NETWORK, true)] };
    const screen = renderMobile(<Step2Photos {...props} />);
    fireEvent.press(screen.getByLabelText("Photo 2 of 2, Failed"));

    expect(sheet(screen).getByText(NETWORK)).toBeTruthy();
    fireEvent.press(sheet(screen).getByRole("button", { name: "Retry" }));
    expect(props.onRetryPhoto).toHaveBeenCalledWith("b");
    expect(screen.queryByTestId("photo-actions-sheet")).toBeNull();
  });

  it("offers no Retry for a failure that cannot be retried", () => {
    const props = { ...defaults(), photos: [photo("a", 0), failedWith("b", 1, MISSING, false)] };
    const screen = renderMobile(<Step2Photos {...props} />);
    fireEvent.press(screen.getByLabelText("Photo 2 of 2, Failed"));

    expect(sheet(screen).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(sheet(screen).getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  it("opens no sheet when a drag ends", () => {
    const props = three();
    const screen = renderMobile(<Step2Photos {...props} />);
    dragPhoto(screen, 0, { dx: 119, dy: 0 });

    expect(props.onReorderPhotos).toHaveBeenCalledWith(["b", "a", "c"]);
    expect(screen.queryByTestId("photo-actions-sheet")).toBeNull();
  });
});

describe("Step2Photos failed list", () => {
  const mixed = () => ({
    ...defaults(),
    photos: [photo("a", 0), failedWith("b", 1, NETWORK, true), failedWith("c", 2, MISSING, false), inState("d", 3, "lost")],
  });
  const list = (screen: ReturnType<typeof renderMobile>) => within(screen.getByTestId("failed-photos"));

  it("lists each failed or lost photo with its number and reason", () => {
    const screen = renderMobile(<Step2Photos {...mixed()} />);

    expect(list(screen).getByText(`#2 · ${NETWORK}`)).toBeTruthy();
    expect(list(screen).getByText(`#3 · ${MISSING}`)).toBeTruthy();
    expect(list(screen).getByText(`#4 · ${LOST}`)).toBeTruthy();
    expect(list(screen).queryByText(/#1/)).toBeNull();
  });

  it("offers Retry for a retryable failure and Remove only for file missing and lost", () => {
    const props = mixed();
    const screen = renderMobile(<Step2Photos {...props} />);

    expect(list(screen).getAllByRole("button", { name: /^Retry/ })).toHaveLength(1);
    expect(list(screen).getAllByRole("button", { name: /^Remove/ })).toHaveLength(2);
    fireEvent.press(first(list(screen).getAllByRole("button", { name: /^Retry/ })));
    expect(props.onRetryPhoto).toHaveBeenCalledWith("b");
    fireEvent.press(first(list(screen).getAllByRole("button", { name: /^Remove/ })));
    expect(props.onRemovePhoto).toHaveBeenCalledWith("c");
  });

  it("is read after the grid", () => {
    const screen = renderMobile(<Step2Photos {...mixed()} />);
    const json = JSON.stringify(screen.toJSON());

    expect(json.indexOf("photo-grid")).toBeGreaterThanOrEqual(0);
    expect(json.indexOf("failed-photos")).toBeGreaterThan(json.indexOf("photo-grid"));
  });

  it("is absent when no photo failed", () => {
    const screen = renderMobile(<Step2Photos {...defaults()} photos={[photo("a", 0), inState("b", 1, "uploading")]} />);

    expect(screen.queryByTestId("failed-photos")).toBeNull();
  });
});

describe("Step2Photos while photos upload", () => {
  const KEEP_UPLOADING = "You can continue. Photos keep uploading.";

  it.each(["selected", "compressed", "presigned", "uploading", "waiting_for_network"] as const)(
    "tells the seller to continue while a photo is %s",
    (state) => {
      const screen = renderMobile(<Step2Photos {...defaults()} photos={[inState("a", 0, state), photo("b", 1), photo("c", 2)]} />);

      expect(screen.getByText(KEEP_UPLOADING)).toBeTruthy();
    },
  );

  it("says nothing of the kind once every photo is uploaded or failed", () => {
    const screen = renderMobile(
      <Step2Photos {...defaults()} photos={[photo("a", 0), failedWith("b", 1, NETWORK, true)]} />,
    );

    expect(screen.queryByText(KEEP_UPLOADING)).toBeNull();
  });

  it("does not say it where the next step still waits for an uploaded photo", () => {
    const screen = renderMobile(
      <Step2Photos {...defaults()} photos={[inState("a", 0, "uploading"), inState("b", 1, "attached"), inState("c", 2, "attached")]} continuesWhileUploading={false} />,
    );

    expect(screen.queryByText(KEEP_UPLOADING)).toBeNull();
  });

  it("says it in Russian and Turkmen", () => {
    const photos = [inState("a", 0, "uploading"), inState("b", 1, "attached"), inState("c", 2, "attached")];
    const ru = renderMobile(<Step2Photos {...defaults()} photos={photos} />, { locale: "ru" });
    expect(ru.getByText("Можно продолжать. Фото загружаются в фоне.")).toBeTruthy();
    const tk = renderMobile(<Step2Photos {...defaults()} photos={photos} />, { locale: "tk" });
    expect(tk.getByText("Dowam edip bilersiňiz. Suratlar ýüklenmegini dowam edýär.")).toBeTruthy();
  });
});

describe("Step2Photos minimum guidance", () => {
  it("does not promise Continue while only two photos are picked", () => {
    const photos = [photo("a", 0), { ...photo("b", 1), state: "uploading" as const }];
    const screen = renderMobile(<Step2Photos {...defaults()} photos={photos} />);
    expect(screen.queryByText("You can continue. Photos keep uploading.")).toBeNull();
  });
});

describe("Step2Photos errors", () => {
  const required = { photos: "At least 3 photos are required" };

  it("states the three-photo minimum when the seller arrives on the step", () => {
    const screen = renderMobile(<Step2Photos {...defaults()} fieldErrors={required} />);

    expect(screen.getByText("No photos")).toBeTruthy();
    expect(screen.getByText("At least 3 photos are required")).toBeTruthy();
  });

  it("says a photo is required once the seller removes the last one", () => {
    const props = { ...defaults(), photos: [photo("a", 0)] };
    const screen = renderMobile(<Step2Photos {...props} />);

    fireEvent.press(screen.getByLabelText("Remove: Photo 1 of 1"));
    expect(props.onRemovePhoto).toHaveBeenCalledWith("a");
    screen.rerender(<Step2Photos {...props} photos={[]} fieldErrors={required} />);

    expect(screen.getByText("At least 3 photos are required")).toBeTruthy();
  });

  it("says a photo is required when the wizard asks the step to show its errors", () => {
    const screen = renderMobile(<Step2Photos {...defaults()} fieldErrors={required} showErrors />);

    expect(screen.getByText("At least 3 photos are required")).toBeTruthy();
  });
});

describe("Sell camera permission", () => {
  const permission = (granted: boolean, canAskAgain: boolean): ImagePicker.CameraPermissionResponse => ({ granted, canAskAgain, status: (granted ? "granted" : "denied") as ImagePicker.CameraPermissionResponse["status"], expires: "never" });
  it.each([
    ["en", "Camera", "Camera access is off", "Open settings"],
    ["ru", "Камера", "Нет доступа к камере", "Открыть настройки"],
    ["tk", "Kamera", "Kamera rugsady ýok", "Sazlamalary aç"],
  ])("offers system settings after permanent denial in %s", async (locale, camera, title, settings) => {
    vi.mocked(ImagePicker.getCameraPermissionsAsync).mockResolvedValue(permission(false, false));
    vi.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({ canceled: true, assets: null });
    const screen = renderMobile(<Step2Photos {...defaults()} />, { locale });
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: camera })); });
    expect(screen.getByText(title)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: settings })); });
    expect(Linking.openSettings).toHaveBeenCalled();
    expect(screen.queryByText(title)).toBeNull();
  });
  it("does not launch a camera when a permission request is denied", async () => {
    vi.mocked(ImagePicker.getCameraPermissionsAsync).mockResolvedValue(permission(false, true));
    vi.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue(permission(false, true));
    vi.mocked(ImagePicker.launchCameraAsync).mockClear();
    vi.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({ canceled: true, assets: null });
    const screen = renderMobile(<Step2Photos {...defaults()} />);
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Camera" })); });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(screen.queryByText("Camera access is off")).toBeNull();
  });
  it("shows settings when the last request becomes permanent denial", async () => {
    vi.mocked(ImagePicker.getCameraPermissionsAsync).mockResolvedValue(permission(false, true));
    vi.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue(permission(false, false));
    const screen = renderMobile(<Step2Photos {...defaults()} />);
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Camera" })); });
    expect(screen.getByText("Camera access is off")).toBeTruthy();
  });
  it("adds a camera photo once permission is granted", async () => {
    vi.mocked(ImagePicker.getCameraPermissionsAsync).mockResolvedValue(permission(false, true));
    vi.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue(permission(true, true));
    vi.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///camera/a.jpg", width: 100, height: 100 }] });
    const props = defaults();
    const screen = renderMobile(<Step2Photos {...props} />);
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Camera" })); });
    expect(props.onAddPhoto).toHaveBeenCalledWith(expect.stringContaining("picker-temp/"));
  });
  it("explains when the device has no camera instead of failing silently (#793)", async () => {
    vi.mocked(ImagePicker.getCameraPermissionsAsync).mockResolvedValue(permission(true, true));
    vi.mocked(ImagePicker.launchCameraAsync).mockRejectedValue(new Error("No camera available"));
    const props = defaults();
    const screen = renderMobile(<Step2Photos {...props} />);
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Camera" })); });
    expect(screen.getByText("No camera on this device")).toBeTruthy();
    expect(screen.getByText("You can still add photos from the gallery.")).toBeTruthy();
    expect(props.onAddPhoto).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Done" })); });
    expect(screen.queryByText("No camera on this device")).toBeNull();
  });
});

vi.mock("expo-linking", () => ({ openSettings: vi.fn(async () => {}) }));
