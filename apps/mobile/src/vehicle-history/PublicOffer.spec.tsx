import { beforeEach, expect, it, vi } from "vitest";

import { Share } from "react-native";

import { sampleDevice } from "./application/testing/sampleDevice";

import VehicleHistoryScreen from "../../app/vehicle-history";
import { fireEvent, renderMobile } from "../../test/render";

vi.mock("expo-file-system/legacy", async () => (await import("./application/testing/sampleDevice")).sampleFileSystem);

beforeEach(() => {
  sampleDevice.reset();
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
  await fireEvent.press(screen.getAllByRole("button", { name: "Close" })[0]);
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
