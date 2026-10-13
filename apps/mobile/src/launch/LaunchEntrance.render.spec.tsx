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
async function paint(screen: Awaited<ReturnType<typeof renderMobile>>) {
  await fireEvent(screen.getByTestId("launch-entrance"), "layout");
  await fireEvent(screen.getByTestId("launch-c-dot"), "load");
}

describe("cold-launch identity", () => {
  it("holds the completed wordmark and credit for 450 ms even when the destination is ready", async () => {
    const screen = await renderMobile(destination(true));
    await paint(screen);
    await act(() => vi.advanceTimersByTime(620));
    await act(() => vi.advanceTimersByTime(30));
    await act(() => vi.advanceTimersByTime(180));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    await act(() => vi.advanceTimersByTime(239));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    await act(() => vi.advanceTimersByTime(1));
    await act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
  });

  it("shows the exact credit while startup is pending and mounts the destination independently", async () => {
    const screen = await renderMobile(destination(false));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    expect(screen.getByText("Destination route")).toBeTruthy();
    await paint(screen);
    await act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    await screen.rerender(destination(true));
    await act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
  });

  it("keeps native launch up on layout alone and releases it once the matching C-dot has loaded", async () => {
    const screen = await renderMobile(destination(false));
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId("launch-entrance"), "layout");
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId("launch-c-dot"), "load");
    expect(SplashScreen.hide).toHaveBeenCalledOnce();
    await fireEvent(screen.getByTestId("launch-entrance"), "layout");
    await fireEvent(screen.getByTestId("launch-c-dot"), "load");
    await act(() => vi.advanceTimersByTime(2000));
    expect(SplashScreen.hide).toHaveBeenCalledOnce();
  });

  it("does not start the entrance before native launch is released", async () => {
    const screen = await renderMobile(destination(true));
    await fireEvent(screen.getByTestId("launch-entrance"), "layout");
    await act(() => vi.advanceTimersByTime(250));
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    await fireEvent(screen.getByTestId("launch-c-dot"), "load");
    await act(() => vi.advanceTimersByTime(1069));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    await act(() => vi.advanceTimersByTime(1));
    await act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
  });

  it("releases native launch when the C-dot fails to load", async () => {
    const screen = await renderMobile(destination(false));
    await fireEvent(screen.getByTestId("launch-entrance"), "layout");
    await fireEvent(screen.getByTestId("launch-c-dot"), "error");
    expect(SplashScreen.hide).toHaveBeenCalledOnce();
  });

  it("never hangs on native launch when the C-dot reports nothing", async () => {
    const screen = await renderMobile(destination(true));
    await fireEvent(screen.getByTestId("launch-entrance"), "layout");
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTime(400));
    expect(SplashScreen.hide).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTime(1070));
    await act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
  });

  it("enters once, does not restart on readiness changes, and leaves a settled destination", async () => {
    const screen = await renderMobile(destination(false));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    await paint(screen);
    await act(() => vi.advanceTimersByTime(1070));
    await screen.rerender(destination(true));
    await act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
    await screen.rerender(destination(false));
    await screen.rerender(destination(true));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
    expect(screen.getByText("Destination route")).toBeTruthy();
  });

  it("uses static identity for reduced motion and lets ready or failed startup leave immediately", async () => {
    vi.mocked(useReduceMotion).mockReturnValue(true);
    const screen = await renderMobile(destination(false));
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    expect(screen.getByLabelText("Carberk")).toBeTruthy();
    await paint(screen);
    await screen.rerender(destination(true));
    expect(screen.queryByText("By Alpha Motors")).toBeNull();
    expect(screen.getByText("Destination route")).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
