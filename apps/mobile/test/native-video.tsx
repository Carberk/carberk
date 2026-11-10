import { createElement, useEffect, useRef } from "react";
import { View } from "react-native";

type Listener = (event: never) => void;

/** Native playback boundary for component tests; it never decodes video. */
export class FakeVideoPlayer {
  source: unknown;

  constructor(source: unknown) {
    this.source = source;
  }

  /** expo-video replaces the source on the same player; it loads paused at 0. */
  replaceSource(source: unknown) {
    this.source = source;
    this.currentTime = 0;
    this.playing = false;
  }

  currentTime = 0;
  playing = false;
  muted = false;
  status: "idle" | "loading" | "readyToPlay" | "error" = "idle";
  timeUpdateEventInterval = 0;
  private readonly listeners = new Map<string, Set<Listener>>();

  play() {
    this.playing = true;
    this.emit("playingChange", { isPlaying: true });
  }

  pause() {
    this.playing = false;
    // The native player can report its status again after a pause; a
    // listener must not read that as a reason to resume.
    this.emit("statusChange", { status: this.status, oldStatus: this.status });
    this.emit("playingChange", { isPlaying: false });
  }

  addListener(event: string, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return { remove: () => { set.delete(listener); } };
  }

  private emit(event: string, payload: unknown) {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as (event: unknown) => void)(payload);
    }
  }

  emitTimeUpdate(currentTime: number) {
    this.currentTime = currentTime;
    this.emit("timeUpdate", { currentTime });
  }

  emitStatus(status: FakeVideoPlayer["status"]) {
    const oldStatus = this.status;
    this.status = status;
    this.emit("statusChange", { status, oldStatus });
  }

  emitPlayToEnd() {
    this.playing = false;
    this.emit("playToEnd", undefined);
  }

  release() {
    this.pause();
    this.listeners.clear();
  }
}

export function useVideoPlayer(source: unknown, setup?: (player: FakeVideoPlayer) => void) {
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const playerRef = useRef<FakeVideoPlayer | null>(null);
  if (playerRef.current === null) {
    playerRef.current = new FakeVideoPlayer(source);
    setupRef.current?.(playerRef.current);
  }
  const player = playerRef.current;
  useEffect(() => {
    if (!Object.is(player.source, source)) player.replaceSource(source);
  }, [player, source]);
  useEffect(() => () => player.release(), [player]);
  return player;
}

export function VideoView(props: Record<string, unknown>) {
  return createElement(View, props);
}
