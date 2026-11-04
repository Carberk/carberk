import { useCallback, useEffect, useMemo, useState } from "react";
import { usePreventRemove } from "@react-navigation/native";
import type { Router } from "expo-router";

import { useAuthIntentStore } from "./intentStore";
import { hasMountedSignInEntry, selectMountedSignInEntry } from "./signInEntryReturn";

type SignInMethod = "phone" | "email";

type OtpExit =
  | "cancel"
  | "change-method"
  | "use-phone"
  | "complete"
  | { invalidDestination: SignInMethod };

/**
 * Owns every way the OTP screen can leave. Native Back and swipe gestures are
 * intercepted while the screen is active, then replayed as an explicit auth
 * outcome after the removal guard has been disabled for the next render.
 */
export function useOtpAuthNavigation(router: Router) {
  const [exit, setExit] = useState<OtpExit | null>(null);

  usePreventRemove(exit === null, () => {
    setExit("cancel");
  });

  useEffect(() => {
    if (exit === null) {
      return;
    }

    if (exit === "change-method") {
      router.back();
      return;
    }

    // Reuse the entry already beneath Code, even when its route is email.
    // A standalone code link still falls back to the valid phone entry.
    if (exit === "use-phone") {
      if (selectMountedSignInEntry("phone")) router.back();
      else router.dismissTo("/(auth)/phone");
      return;
    }

    if (typeof exit === "object") {
      router.replace(
        exit.invalidDestination === "email"
          ? "/(auth)/email"
          : "/(auth)/phone",
      );
      return;
    }

    // Code Back edits the method already under it. Only leaving that entry
    // abandons sign-in; a standalone Code route retains its legacy fallback.
    if (exit === "cancel" && hasMountedSignInEntry()) {
      router.back();
      return;
    }

    const authIntent = useAuthIntentStore.getState();
    if (exit === "complete") {
      authIntent.completeSignIn(router);
      return;
    }

    if (authIntent.intent) {
      authIntent.cancelSignIn(router);
      return;
    }

    router.back();
  }, [exit, router]);

  const cancel = useCallback(() => setExit("cancel"), []);
  const changeMethod = useCallback(() => setExit("change-method"), []);
  const usePhoneInstead = useCallback(() => setExit("use-phone"), []);
  const complete = useCallback(() => setExit("complete"), []);
  const invalidDestination = useCallback(
    (method: SignInMethod) => setExit({ invalidDestination: method }),
    [],
  );

  return useMemo(
    () => ({ cancel, changeMethod, usePhoneInstead, complete, invalidDestination }),
    [cancel, changeMethod, usePhoneInstead, complete, invalidDestination],
  );
}
