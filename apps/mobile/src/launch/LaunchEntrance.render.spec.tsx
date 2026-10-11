import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Text } from "react-native";
import * as SplashScreen from "expo-splash-screen";

import { act, fireEvent, renderMobile } from "../../test/render";

import { LaunchEntrance } from "./LaunchEntrance";

import { useReduceMotion } from "@/lib/motion";

vi.mock("expo-status-bar", async () => ({ StatusBar: (await import("react-native")).View }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(useReduceMotion).mockReturnValue(false);
  vi.mocked(SplashScreen.hide).mockClear();
});
afterEach(() => vi.useRealTimers());

function destination(ready: boolean) {
  return <LaunchEntrance ready={ready}><Text>Destination route</Text></LaunchEntrance>;
}

describe("cold-launch identity", () => {
  it("shows the exact credit while startup is pending and mounts the destination independently", () => {
    const screen = renderMobile(destination(false));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    expect(screen.getByText("Destination route")).toBeTruthy();
    fireEvent(screen.getByTestId("launch-entrance"), "layout");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    screen.rerender(destination(true));
    act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
  });

  it("hides native launch only after its matching React view is laid out", () => {
    const screen = renderMobile(destination(false));
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId("launch-entrance"), "layout");
    expect(SplashScreen.hide).toHaveBeenCalledOnce();
    fireEvent(screen.getByTestId("launch-entrance"), "layout");
    expect(SplashScreen.hide).toHaveBeenCalledOnce();
  });

  it("enters once, does not restart on readiness changes, and leaves a settled destination", () => {
    const screen = renderMobile(destination(false));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    fireEvent(screen.getByTestId("launch-entrance"), "layout");
    act(() => vi.advanceTimersByTime(650));
    screen.rerender(destination(true));
    act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
    screen.rerender(destination(false));
    screen.rerender(destination(true));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
    expect(screen.getByText("Destination route")).toBeTruthy();
  });

  it("uses static identity for reduced motion and lets ready or failed startup leave immediately", () => {
    vi.mocked(useReduceMotion).mockReturnValue(true);
    const screen = renderMobile(destination(false));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    expect(screen.getByLabelText("Carberk")).toBeTruthy();
    fireEvent(screen.getByTestId("launch-entrance"), "layout");
    screen.rerender(destination(true));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
    expect(screen.getByText("Destination route")).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
