import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { getNotificationPermissionState } from "./requestNotificationPermission";
import type { NotificationPermissionState } from "./types";

/**
 * The device's notification permission, read when the screen gains focus and
 * when the app returns to the foreground, so a change made in system settings
 * shows without a restart. It only reads the permission; it never prompts.
 * `null` until the first read finishes.
 */
export function useNotificationPermissionState(): NotificationPermissionState | null {
  const [state, setState] = useState<NotificationPermissionState | null>(null);
  const mounted = useRef(true);
  // Only the newest read may set state, so an older read that resolves late
  // cannot overwrite a newer one.
  const latest = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    const read = ++latest.current;
    void getNotificationPermissionState().then((next) => {
      if (mounted.current && read === latest.current) setState(next);
    });
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return state;
}
