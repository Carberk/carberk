import { describe, expect, it, vi } from "vitest";

import AboutScreen from "../../app/about";
import { fireEvent, renderMobile, routerMock } from "../render";

vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "9.8.7" } } }));

describe("About the app", () => {
  it("shows the Carberk name and the version the build was made with", () => {
    const screen = renderMobile(<AboutScreen />);

    expect(screen.getByText("About the app")).toBeTruthy();
    expect(screen.getByLabelText("Carberk")).toBeTruthy();
    expect(screen.getByText("Version 9.8.7")).toBeTruthy();
  });

  it.each([
    ["ru", "О приложении", "Версия 9.8.7"],
    ["tk", "Programma hakynda", "Wersiýa 9.8.7"],
  ])("reads in %s", (locale, title, version) => {
    const screen = renderMobile(<AboutScreen />, { locale });

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(version)).toBeTruthy();
  });

  it("leaves the brand logos notice to the Terms of Service", () => {
    const screen = renderMobile(<AboutScreen />);

    expect(screen.queryByText(/Brand names and logos/)).toBeNull();
  });

  it("goes back to Cabinet", () => {
    const screen = renderMobile(<AboutScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(routerMock.back).toHaveBeenCalledOnce();
  });
});
