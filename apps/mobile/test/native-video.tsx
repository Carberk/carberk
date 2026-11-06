import { createElement, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";

/** Native playback boundary for component tests; it never decodes video. */
export class FakeVideoPlayer {
  constructor(readonly source: unknown) {}

  currentTime = 0;
  playing = false;
  timeUpdateEventInterval = 0;
  private readonly listeners = new Set<(event: { currentTime: number }) => void>();

  play() { this.playing = true; }
  pause() { this.playing = false; }

  addListener(_event: "timeUpdate", listener: (event: { currentTime: number }) => void) {
    this.listeners.add(listener);
    return { remove: () => { this.listeners.delete(listener); } };
  }

  emitTimeUpdate(currentTime: number) {
    this.currentTime = currentTime;
    for (const listener of this.listeners) listener({ currentTime });
  }

  release() {
    this.pause();
    this.listeners.clear();
  }
}

export function useVideoPlayer(source: unknown, setup?: (player: FakeVideoPlayer) => void) {
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const player = useMemo(() => {
    const value = new FakeVideoPlayer(source);
    setupRef.current?.(value);
    return value;
  }, [source]);
  useEffect(() => () => player.release(), [player]);
  return player;
}

export function VideoView(props: Record<string, unknown>) {
  return createElement(View, props);
}
