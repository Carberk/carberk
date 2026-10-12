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

/** Overlay laid out and its C-dot painted: the point where native launch may be released. */
function paint(screen: ReturnType<typeof renderMobile>) {
  fireEvent(screen.getByTestId("launch-entrance"), "layout");
  fireEvent(screen.getByTestId("launch-c-dot"), "load");
}

describe("cold-launch identity", () => {
  it("shows the exact credit while startup is pending and mounts the destination independently", () => {
    const screen = renderMobile(destination(false));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    expect(screen.getByText("Destination route")).toBeTruthy();
    paint(screen);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    screen.rerender(destination(true));
    act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
  });

  it("keeps native launch up on layout alone and releases it once the matching C-dot has loaded", () => {
    const screen = renderMobile(destination(false));
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId("launch-entrance"), "layout");
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId("launch-c-dot"), "load");
    expect(SplashScreen.hide).toHaveBeenCalledOnce();
    fireEvent(screen.getByTestId("launch-entrance"), "layout");
    fireEvent(screen.getByTestId("launch-c-dot"), "load");
    act(() => vi.advanceTimersByTime(2000));
    expect(SplashScreen.hide).toHaveBeenCalledOnce();
  });

  it("does not start the entrance before native launch is released", () => {
    const screen = renderMobile(destination(true));
    fireEvent(screen.getByTestId("launch-entrance"), "layout");
    act(() => vi.advanceTimersByTime(250));
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    fireEvent(screen.getByTestId("launch-c-dot"), "load");
    act(() => vi.advanceTimersByTime(649));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1 + 180));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
  });

  it("releases native launch when the C-dot fails to load", () => {
    const screen = renderMobile(destination(false));
    fireEvent(screen.getByTestId("launch-entrance"), "layout");
    fireEvent(screen.getByTestId("launch-c-dot"), "error");
    expect(SplashScreen.hide).toHaveBeenCalledOnce();
  });

  it("never hangs on native launch when the C-dot reports nothing", () => {
    const screen = renderMobile(destination(true));
    fireEvent(screen.getByTestId("launch-entrance"), "layout");
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(SplashScreen.hide).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(650 + 180));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
  });

  it("enters once, does not restart on readiness changes, and leaves a settled destination", () => {
    const screen = renderMobile(destination(false));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    paint(screen);
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
    paint(screen);
    screen.rerender(destination(true));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
    expect(screen.getByText("Destination route")).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
