import { useCallback } from "react";
import { Image, ScrollView, View } from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { PublicMarketplaceSchemas } from "@auto-tm/contracts";

import { apiClient } from "../api/client";

import { MarketplaceShareActions } from "./MarketplaceShareActions";
import { marketplaceCopy, readerLocale } from "./showroomCopy";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/components/ui/pressable-scale";

export function ShowroomScreen({ businessId }: { businessId: string }) {
 const { i18n } = useTranslation(); const locale = readerLocale(i18n.language); const c = marketplaceCopy(locale);
 const query = useInfiniteQuery({ queryKey: ["public-showroom", businessId], initialPageParam: undefined as string | undefined, queryFn: ({ pageParam }) => apiClient.get(`/public-marketplace/showrooms/${encodeURIComponent(businessId)}${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`, PublicMarketplaceSchemas.PublicShowroomSchema, { auth: false }), getNextPageParam: page => page.nextCursor ?? undefined, staleTime: 0, enabled: !!businessId });
 useFocusEffect(useCallback(() => { if (businessId) void query.refetch(); }, [businessId, query.refetch]));
 const page = query.data?.pages[0]; const business = page?.business;
 return <><Stack.Screen options={{ title: business?.name ?? "Carberk" }} /><ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 px-5 py-6 pb-12">
  {query.isPending ? <Text accessibilityRole="progressbar">{c.loading}</Text> : query.isError ? <><Text accessibilityRole="alert">{c.unavailable}</Text><Button onPress={() => { void query.refetch(); }}><Text>{c.retry}</Text></Button></> : business ? <>
   <Text className="font-heading text-title-1 font-semibold">{business.name}</Text>
   {business.logoUrl && /^https:\/\//.test(business.logoUrl) ? <Image source={{ uri: business.logoUrl }} className="h-16 w-16 rounded-lg" accessibilityIgnoresInvertColors /> : null}
   {business.city ? <Text>{business.city[locale]}</Text> : null}<Text>{business.identityChecked ? c.checked : c.synthetic}</Text>{business.identityChecked ? <Text className="text-muted-foreground">{c.checkedHelp}</Text> : null}{business.address ? <Text>{business.address}</Text> : null}
   <MarketplaceShareActions kind="showrooms" id={business.id} />
   <Text className="mt-4 font-heading text-title-2 font-semibold">{c.available}</Text><Text className="text-muted-foreground">{c.inventory}</Text>
   {page?.listings.length === 0 ? <Text>{c.empty}</Text> : null}
   {query.data?.pages.flatMap(item => item.listings).map(car => { const title = `${car.brand[locale]} ${car.model[locale]} ${car.year ?? ""}`.trim(); return <PressableScale key={car.id} accessibilityRole="button" accessibilityLabel={title} className="gap-3 rounded-2xl bg-card p-3" onPress={() => router.push({ pathname: "/listings/[id]", params: { id: car.id } })}>
    {car.photos[0] ? <Image source={{ uri: car.photos[0] }} className="aspect-photo w-full rounded-xl" accessibilityLabel={title} /> : null}<View className="gap-1"><Text className="font-heading text-headline font-semibold">{car.priceAmount.toLocaleString(locale)} {car.priceCurrency}</Text><Text className="text-callout">{title}</Text><Text className="text-muted-foreground">{car.city[locale]}</Text></View>
   </PressableScale>; })}
   {query.hasNextPage ? <Button disabled={query.isFetchingNextPage} onPress={() => { void query.fetchNextPage(); }}><Text>{query.isFetchingNextPage ? c.loading : c.more}</Text></Button> : null}
   {business.description || business.hours || business.services ? <View className="mt-4 gap-3"><Text className="font-heading text-title-2 font-semibold">{c.details}</Text>{business.description ? <Text>{business.description}</Text> : null}{business.hours ? <Text>{c.hours}: {business.hours}</Text> : null}{business.services ? <Text>{c.services}: {business.services}</Text> : null}</View> : null}
  </> : null}
 </ScrollView></>;
}
