import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";
import { useTranslation } from "react-i18next";

import { ApiError } from "../api/client";

import { useHistoryContact } from "./useHistoryContact";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ErrorState } from "@/components/ErrorState";

export function ContactActions({ listingId, fromHistory = false }: { listingId?: string; fromHistory?: boolean }) {
  const { t } = useTranslation();
  const { viewer, busy, error, started, existing, contact } = useHistoryContact(listingId, fromHistory);
  const denied = error instanceof ApiError && [401, 403, 404].includes(error.status);
  useEffect(() => {
    if (busy || error) AccessibilityInfo.announceForAccessibility(t(busy ? "vehicleHistory.opening" : "vehicleHistory.createFailed"));
  }, [busy, error, t]);
  return <>
    <Button disabled={viewer === undefined || busy} accessibilityState={{ busy }} onPress={() => contact(fromHistory)}>
      <Text>{t(busy ? "vehicleHistory.opening" : fromHistory ? "vehicleHistory.newRequest"
        : existing ? "vehicleHistory.open" : viewer ? "vehicleHistory.contact" : "vehicleHistory.signInContact")}</Text>
    </Button>
    {error && (denied ? <Text accessibilityRole="alert" className="text-body text-muted-foreground">{t("vehicleHistory.createDenied")}</Text>
      : <ErrorState error={error} title={t(error instanceof ApiError && error.status === 0 ? "vehicleHistory.offline" : "vehicleHistory.createFailed")}
          onRetry={() => contact()} />)}
    {!fromHistory && started && !busy && <Button variant="secondary" onPress={() => contact(true)}><Text>{t("vehicleHistory.newRequest")}</Text></Button>}
  </>;
}
