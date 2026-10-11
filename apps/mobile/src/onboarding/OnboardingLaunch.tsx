import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";

import type { OnboardingDecision } from "./onboardingGate";

/** Home's path. A cold start anywhere else came from a link, and the link wins. */
const HOME_PATHNAME = "/";

/** Opens owed onboarding above the tabs; LaunchEntrance owns native handoff. */
export function OnboardingLaunch({ decision }: { decision: OnboardingDecision }) {
  const pathname = usePathname();
  const settled = useRef(false);

  useEffect(() => {
    if (settled.current) return;
    settled.current = true;
    if (decision !== "show" || pathname !== HOME_PATHNAME) return;
    try {
      router.push("/(onboarding)/language");
    } catch (error) {
      console.warn("[onboarding] could not open the Language screen", error);
    }
  }, [decision, pathname]);

  return null;
}
