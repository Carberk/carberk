import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/useAuth";
import { useAuthIntentStore } from "../auth/intentStore";

import { serviceCopy } from "./copy";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/** Both approved entries resolve the same server-owned personal case. */
export function SupportEntry() {
 const { isAuthenticated } = useAuth(), { i18n } = useTranslation(), c = serviceCopy(i18n.language);
 return <Button accessibilityLabel={isAuthenticated === true ? c.support : c.signedOut} onPress={() => {
  if (isAuthenticated === true) router.push({ pathname: "/service-requests", params: { purpose: "support" } });
  else useAuthIntentStore.getState().requireSignIn(router, { returnTo: "/service-requests?purpose=support" });
 }}><Text>{isAuthenticated === true ? c.support : c.signedOut}</Text></Button>;
}
