import { Platform } from "react-native";
import { expect } from "vitest";

import { getAllHosts, first, type renderMobile } from "./render";

export const KEYBOARD_PLATFORMS = ["ios", "android"] as const;

/** Runs `run` with `Platform.OS` set to `os`, restoring it afterwards, also after an await. */
export async function onPlatform(os: (typeof KEYBOARD_PLATFORMS)[number], run: () => unknown) {
  const previous = Platform.OS;
  Platform.OS = os;
  try {
    await run();
  } finally {
    Platform.OS = previous;
  }
}

/**
 * The screen's one active keyboard avoidance region (#843). It pads on both
 * platforms: iOS needs it, and Android is edge to edge, so its window does not
 * resize for the keyboard. It takes no vertical offset, which is correct only
 * because the screens place it directly in their root, whose frame starts at
 * the top of the window. Query the focused field and its action inside it.
 */
export function activeKeyboardRegion(view: Awaited<ReturnType<typeof renderMobile>>) {
  const active = getAllHosts(view.container, "KeyboardAvoidingView").filter((region) => region.props.enabled !== false);
  expect(active).toHaveLength(1);
  const region = first(active);
  expect(region.props.behavior).toBe("padding");
  expect(region.props.keyboardVerticalOffset ?? 0).toBe(0);
  return region;
}
