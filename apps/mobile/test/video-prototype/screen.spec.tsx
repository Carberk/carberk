import { afterEach, describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../render";
import { VideoUploadPrototype } from "../../src/video-prototype/VideoUploadPrototype";
import VideoUploadPrototypeRoute from "../../app/(review)/video-upload-prototype";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Listing video upload prototype screen", () => {
  it("renders the empty slot and preserves visible photo readiness", async () => {
    const screen = await renderMobile(<VideoUploadPrototype />);

    expect(screen.getByRole("header", { name: "Listing video upload prototype" })).toBeTruthy();
    expect(screen.getByText("Empty slot")).toBeTruthy();
    expect(screen.getByText("Photos preserved: 3 required photos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add video from library" })).toBeTruthy();
  });

  it("exercises selection, exact 90-second acceptance, poster and local upload controls", async () => {
    const screen = await renderMobile(<VideoUploadPrototype />);

    await fireEvent.press(screen.getByRole("button", { name: "Add video from library" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose exact 90-second clip" }));
    expect(screen.getByText("Preview")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Trim video" }));
    expect(screen.getByText("Selected duration: 90s / 90s maximum")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Continue to poster" }));
    await fireEvent.press(screen.getByRole("button", { name: "Use video and prepare locally" }));
    expect(screen.getAllByText("Preparing").length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("button", { name: "Finish local preparation" }));
    expect(screen.getByText("Uploading · 0%")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Upload next chunk" }));
    expect(screen.getByText("Uploading · 25%")).toBeTruthy();
  });

  it("shows accessible trim handles and the >90-second rejection", async () => {
    const screen = await renderMobile(<VideoUploadPrototype />);

    await fireEvent.press(screen.getByRole("button", { name: "Add video from library" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose 120-second clip" }));
    await fireEvent.press(screen.getByRole("button", { name: "Trim video" }));
    expect(screen.getByRole("button", { name: "Video start -5 seconds" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Video end +5 seconds" })).toBeTruthy();
    expect(screen.getByText("Selection exceeds the 90-second maximum.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue to poster" }).props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Use first 90 seconds" }));
    expect(screen.getByText("Selected duration: 90s / 90s maximum")).toBeTruthy();
  });

  it("shows failed, retry, optional pending and remove transitions", async () => {
    const screen = await renderMobile(<VideoUploadPrototype />);

    await fireEvent.press(screen.getByRole("button", { name: "Add video from library" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose 45-second clip" }));
    await fireEvent.press(screen.getByRole("button", { name: "Trim video" }));
    await fireEvent.press(screen.getByRole("button", { name: "Continue to poster" }));
    await fireEvent.press(screen.getByRole("button", { name: "Use video and prepare locally" }));
    await fireEvent.press(screen.getByRole("button", { name: "Finish local preparation" }));
    await fireEvent.press(screen.getByRole("button", { name: "Simulate upload failure" }));
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Uploading · 0%")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Continue with photos" }));
    expect(screen.getAllByText("Optional video pending").length).toBeGreaterThan(0);
    expect(screen.getByText("Photos preserved: 3 required photos")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Remove video and keep photos" }));
    expect(screen.getByText("Empty slot")).toBeTruthy();
  });
});

describe("review route guard", () => {
  it("denies the route when the production global is false", async () => {
    vi.stubGlobal("__DEV__", false);
    const screen = await renderMobile(<VideoUploadPrototypeRoute />);

    expect(screen.getByText("Review prototype unavailable")).toBeTruthy();
    expect(screen.queryByText("Listing video upload prototype")).toBeNull();
  });

  it("renders the prototype in a dev/reviewer build", async () => {
    vi.stubGlobal("__DEV__", true);
    const screen = await renderMobile(<VideoUploadPrototypeRoute />);

    expect(screen.getByText("Listing video upload prototype")).toBeTruthy();
  });
});
