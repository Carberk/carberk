import { describe, expect, it, vi } from "vitest";

import AboutScreen from "../../app/about";
import { fireEvent, renderMobile, routerMock } from "../render";

vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "9.8.7" } } }));

describe("About the app", () => {
  it("shows the AutoTM name and the version the build was made with", () => {
    const screen = renderMobile(<AboutScreen />);

    expect(screen.getByText("About the app")).toBeTruthy();
    expect(screen.getByLabelText("AutoTM")).toBeTruthy();
    expect(screen.getByText("Version 9.8.7")).toBeTruthy();
  });

  it.each([
    ["ru", "О приложении", "Версия 9.8.7"],
    ["tk", "Programma hakda", "Wersiýa 9.8.7"],
  ])("reads in %s", (locale, title, version) => {
    const screen = renderMobile(<AboutScreen />, { locale });

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(version)).toBeTruthy();
  });

  it("goes back to Cabinet", () => {
    const screen = renderMobile(<AboutScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(routerMock.back).toHaveBeenCalledOnce();
  });
});
