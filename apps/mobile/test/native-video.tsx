import { createElement, useEffect, useRef } from "react";
import { View } from "react-native";

type Listener = (event: never) => void;

/** Every player the fake hook built, oldest first; reset per test. */
export const createdPlayers: FakeVideoPlayer[] = [];

/** Native playback boundary for component tests; it never decodes video. */
export class FakeVideoPlayer {
  readonly source: unknown;
  released = false;

  constructor(source: unknown) {
    this.source = source;
    createdPlayers.push(this);
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
    if (this.released) return;
    this.pause();
    this.listeners.clear();
    this.released = true;
  }
}

/**
 * Mirrors expo-video 55's `useVideoPlayer` (`useReleasingSharedObject`): a
 * NEW player whenever `JSON.stringify(source)` changes, the same player while
 * it is identical. The replaced player is released after commit, the last
 * one on unmount. `setup` runs once per created player.
 */
export function useVideoPlayer(source: unknown, setup?: (player: FakeVideoPlayer) => void) {
  const key = JSON.stringify(source);
  const currentRef = useRef<{ key: string; player: FakeVideoPlayer } | null>(null);
  const toReleaseRef = useRef<FakeVideoPlayer | null>(null);
  if (currentRef.current === null || currentRef.current.key !== key) {
    if (currentRef.current) toReleaseRef.current = currentRef.current.player;
    const player = new FakeVideoPlayer(source);
    setup?.(player);
    currentRef.current = { key, player };
  }
  const player = currentRef.current.player;
  useEffect(() => {
    toReleaseRef.current?.release();
    toReleaseRef.current = null;
  }, [player]);
  useEffect(() => () => currentRef.current?.player.release(), []);
  return player;
}

export function VideoView(props: Record<string, unknown>) {
  return createElement(View, props);
}
