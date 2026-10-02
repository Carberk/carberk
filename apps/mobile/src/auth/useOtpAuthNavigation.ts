import { useEffect, useState } from "react";
import { usePreventRemove } from "@react-navigation/native";
import type { Router } from "expo-router";

import { useAuthIntentStore } from "./intentStore";

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

    // Back to the phone entry already under the email screen, or in place of
    // this screen when sign-in started on email.
    if (exit === "use-phone") {
      router.dismissTo("/(auth)/phone");
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

  return {
    cancel: () => setExit("cancel"),
    changeMethod: () => setExit("change-method"),
    usePhoneInstead: () => setExit("use-phone"),
    complete: () => setExit("complete"),
    invalidDestination: (method: SignInMethod) =>
      setExit({ invalidDestination: method }),
  };
}
