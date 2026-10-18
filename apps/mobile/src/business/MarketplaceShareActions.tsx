import { useEffect, useState } from "react";
import { Share, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { PublicMarketplaceSchemas } from "@auto-tm/contracts";

import { apiClient } from "../api/client";

import { readerLocale } from "./showroomCopy";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

const copy = {
 en: { share: "Share", copy: "Copy link", copied: "Link copied", failed: "Could not share. Try again." },
 ru: { share: "Поделиться", copy: "Копировать ссылку", copied: "Ссылка скопирована", failed: "Не удалось поделиться. Повторите попытку." },
 tk: { share: "Paýlaşmak", copy: "Salgyny göçürmek", copied: "Salgy göçürildi", failed: "Paýlaşyp bolmady. Täzeden synanyşyň." },
};
function publicOrigin() {
 try { const url = new URL(process.env.EXPO_PUBLIC_WEB_URL ?? ""); return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" ? url.origin : null; } catch { return null; }
}
/** Availability comes from the accepted deployed reader/association gate. */
export function MarketplaceShareActions({ kind, id }: { kind: "listings" | "showrooms"; id: string }) {
 const { i18n } = useTranslation(); const locale = readerLocale(i18n.language); const c = copy[locale]; const origin = publicOrigin();
 const [feedback, setFeedback] = useState(""); const [working, setWorking] = useState(false);
 useEffect(() => { setFeedback(""); }, [kind, id, locale]);
 const capability = useQuery({ queryKey: ["marketplace-sharing", origin], enabled: !!origin, staleTime: 0, retry: false, queryFn: async ({ signal }) => { const result = await fetch(`${origin}/api/marketplace-sharing`, { signal, cache: "no-store" }); if (!result.ok) return false; const body: unknown = await result.json(); return !!body && typeof body === "object" && "enabled" in body && body.enabled === true; } });
 if (!origin || capability.isError || capability.data !== true) return null;
 async function run(action: "share" | "copy") {
  setWorking(true); setFeedback("");
  try {
   const accepted = await capability.refetch();
   if (accepted.isError || accepted.data !== true) throw new Error("Sharing unavailable");
   // Recheck public visibility immediately before exposing the canonical URL.
   if (kind === "listings") await apiClient.get(`/public-marketplace/listings/${id}`, PublicMarketplaceSchemas.PublicListingSchema, { auth: false });
   else await apiClient.get(`/public-marketplace/showrooms/${id}`, PublicMarketplaceSchemas.PublicShowroomSchema, { auth: false });
   const url = `${origin}/${locale}/${kind}/${id}`;
   if (action === "copy") { const copied = await Clipboard.setStringAsync(url); if (!copied) throw new Error("Clipboard unavailable"); setFeedback(c.copied); }
   else await Share.share({ message: url });
  } catch { setFeedback(c.failed); }
  finally { setWorking(false); }
 }
 return <View className="gap-2"><View className="flex-row gap-3"><Button variant="secondary" disabled={working} onPress={() => { void run("share"); }}><Text>{c.share}</Text></Button><Button variant="secondary" disabled={working} onPress={() => { void run("copy"); }}><Text>{c.copy}</Text></Button></View>{feedback ? <Text accessibilityRole="alert">{feedback}</Text> : null}</View>;
}
