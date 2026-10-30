import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { serviceCopy } from "./copy";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function HistoryEntry({ sourceListingId, vin }: { sourceListingId?: string; vin?: string | null }) {
 const { i18n } = useTranslation(), c = serviceCopy(i18n.language);
 return <Button variant="secondary" accessibilityRole="button" accessibilityLabel={c.history} onPress={() => router.push({ pathname: "/service-requests", params: { purpose: "history", ...(sourceListingId ? { sourceListingId } : {}), ...(vin ? { vin } : {}) } })}><Text>{c.history}</Text></Button>;
}
