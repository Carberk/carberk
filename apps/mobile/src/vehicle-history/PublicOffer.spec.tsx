import { beforeEach, expect, it, vi } from "vitest";
import { Share } from "react-native";


import VehicleHistoryScreen from "../../app/vehicle-history";
import { fireEvent, renderMobile } from "../../test/render";

import { sampleDevice } from "./application/testing/sampleDevice";

vi.mock("expo-file-system/legacy", async () => (await import("./application/testing/sampleDevice")).sampleFileSystem);

beforeEach(() => {
  sampleDevice.reset();
  vi.stubEnv("EXPO_PUBLIC_API_URL", "http://localhost:3006/api/v1");
  vi.stubEnv("EXPO_PUBLIC_ENV", "development");
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", "true");
});

it("lets a signed-out customer read the offer without creating an enquiry", async () => {
  const screen = await renderMobile(<VehicleHistoryScreen />);
  expect(screen.getByText("100 TMT per vehicle")).toBeTruthy();
  expect(screen.getByText("Carfax or AutoCheck is sufficient. Both are included when obtainable.")).toBeTruthy();
  expect(screen.getByText("For a vehicle anywhere, including outside Carberk listings.")).toBeTruthy();
  expect(screen.queryByText(/Sign in|Contact operator|Pay now/)).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "View fictional sample" }));
  expect(screen.getByText("CARBERK FICTIONAL EDUCATIONAL SAMPLE")).toBeTruthy();
  const [close] = screen.getAllByRole("button", { name: "Close" });
  if (!close) throw new Error("Missing Close action");
  await fireEvent.press(close);
  expect(screen.queryByText("CARBERK FICTIONAL EDUCATIONAL SAMPLE")).toBeNull();
  expect(screen.getByText("100 TMT per vehicle")).toBeTruthy();
});


it("saves the original fictional file and opens the native export sheet", async () => {
  const share = vi.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
  const screen = await renderMobile(<VehicleHistoryScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "View fictional sample" }));
  await fireEvent.press(screen.getByRole("button", { name: "Download educational file" }));
  await vi.waitFor(() => expect(share).toHaveBeenCalledWith({ url: "file:///documents/carberk-fictional-history.txt" }));
  expect(sampleDevice.files.get("file:///documents/carberk-fictional-history.txt")).toContain("Not a Carfax or AutoCheck report. Not evidence about any real vehicle.");
  expect(screen.queryByText(/Download complete|Successfully saved/)).toBeNull();
});

it.each([
  ["default off", "development", undefined, "http://localhost:3006/api/v1"],
  ["staging", "staging", "true", "http://localhost:3006/api/v1"],
  ["production", "production", "true", "http://localhost:3006/api/v1"],
  ["remote", "development", "true", "https://api.carberk.test/api/v1"],
  ["invalid origin", "development", "true", "not a URL"],
])("refuses %s deep links and leaves Back usable", async (_name, env, enabled, api) => {
  vi.stubEnv("EXPO_PUBLIC_ENV", env);
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", enabled);
  vi.stubEnv("EXPO_PUBLIC_API_URL", api);
  const screen = await renderMobile(<VehicleHistoryScreen />);
  expect(screen.getByRole("alert")).toHaveTextContent("Vehicle History is not available in this build.");
  expect(screen.queryByRole("button", { name: "View fictional sample" })).toBeNull();
  expect(screen.getAllByRole("button")).toHaveLength(1);
});

it("keeps the sample readable after storage failure and retries the real save boundary", async () => {
  sampleDevice.failure = true;
  const screen = await renderMobile(<VehicleHistoryScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "View fictional sample" }));
  await fireEvent.press(screen.getByRole("button", { name: "Download educational file" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t save or open the file. Check available storage and try again.");
  expect(sampleDevice.files.size).toBe(0);
  sampleDevice.failure = false;
  await fireEvent.press(screen.getByRole("button", { name: "Retry download" }));
  await vi.waitFor(() => expect(sampleDevice.files.size).toBe(1));
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each([
  ["en", "100 TMT per vehicle", "View fictional sample", "Fictional sample", "The document stays in its original English."],
  ["ru", "100 TMT за автомобиль", "Посмотреть вымышленный пример", "Вымышленный пример", "Документ остаётся на исходном английском языке."],
  ["tk", "Her ulag üçin 100 TMT", "Toslama nusgany gör", "Toslama nusga", "Resminama asyl iňlis dilinde saklanýar."],
])("localizes the public UI in %s while preserving original document language", async (locale, price, view, title, language) => {
  const screen = await renderMobile(<VehicleHistoryScreen />, { locale });
  expect(screen.getByText(price)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: view }));
  expect(screen.getByText(title)).toBeTruthy();
  expect(screen.getByText(language)).toBeTruthy();
  if (locale === "tk") {
    expect(screen.getByText("Carberk-iň öz okuw nusgasy. Ähli ulaglar we wakalar toslamadyr. Bu üpjün edijiniň hasabaty däldir.")).toBeTruthy();
  }
  expect(screen.getByText("Illustrative event: 09 January 2024 - damage entry recorded; severity unknown.")).toBeTruthy();
  expect(screen.getByText("CARBERK FICTIONAL EDUCATIONAL SAMPLE").props.accessibilityLanguage).toBe("en");
});

it("shows progress, disables repeated saves, and offers retry when native export fails", async () => {
  let finish: (() => void) | undefined;
  sampleDevice.hold = new Promise<void>((resolve) => { finish = resolve; });
  const share = vi.spyOn(Share, "share").mockRejectedValueOnce(new Error("No export activity"));
  const screen = await renderMobile(<VehicleHistoryScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "View fictional sample" }));
  await fireEvent.press(screen.getByRole("button", { name: "Download educational file" }));
  expect(await screen.findByRole("button", { name: "Preparing file…", disabled: true })).toBeTruthy();
  expect(sampleDevice.files.size).toBe(0);
  finish?.();
  expect(await screen.findByRole("button", { name: "Retry download" })).toBeTruthy();
  expect(screen.getByText("CARBERK FICTIONAL EDUCATIONAL SAMPLE")).toBeTruthy();
  share.mockResolvedValue({ action: "dismissedAction" });
  await fireEvent.press(screen.getByRole("button", { name: "Retry download" }));
  expect(await screen.findByRole("button", { name: "Download educational file" })).toBeTruthy();
  expect(screen.queryByText(/Download complete|Successfully saved/)).toBeNull();
});

it("preserves optional Listing context as information and uses safe Back", async () => {
  const { routeParams, routerMock } = await import("../../test/render");
  routeParams.listingId = "00000000-0000-4000-8000-000000000373";
  routerMock.canGoBack.mockReturnValueOnce(false);
  const screen = await renderMobile(<VehicleHistoryScreen />);
  expect(screen.getByText("Opened from a listing. The listing is context only; it grants no access to the seller’s private information.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(routerMock.replace).toHaveBeenCalledWith("/(tabs)/(search)");
});

it("announces the sample and returns accessibility focus after native dismissal", async () => {
  const { AccessibilityInfo } = await import("react-native");
  const { getHost, act } = await import("../../test/render");
  const focus = vi.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
  const announce = vi.spyOn(AccessibilityInfo, "announceForAccessibility");
  const screen = await renderMobile(<VehicleHistoryScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "View fictional sample" }));
  const modal = getHost(screen.container, "Modal");
  await fireEvent(modal, "show");
  expect(focus).toHaveBeenCalledWith(expect.anything(), "focus");
  expect(announce).toHaveBeenCalledWith("Fictional sample");
  focus.mockClear();
  const dismiss = modal.props.onDismiss;
  await fireEvent.press(screen.getAllByRole("button", { name: "Close" }).at(0) ?? screen.getByText("Close"));
  await act(() => dismiss());
  expect(focus).toHaveBeenCalledWith(expect.anything(), "focus");
  expect(announce).toHaveBeenCalledWith("Vehicle History");
});
