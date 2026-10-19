import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../../src/api/client";
import { useListings } from "../../../src/api/listings/useListings";
import { useListingCount } from "../../../src/api/listings/useListingCount";
import { useModels } from "../../../src/api/catalog/useModels";
import { useTransmissions } from "../../../src/api/catalog/useTransmissions";
import { useEngineTypes } from "../../../src/api/catalog/useEngineTypes";
import { useViewer } from "../../../src/auth/useViewer";
import { ListingLargeCard, ListingLargeCardSkeleton } from "../../../src/listings/feed/ListingLargeCard";
import { FeedEmpty } from "../../../src/listings/feed/FeedEmpty";
import { FeedError } from "../../../src/listings/feed/FeedError";
import { FilteredEmpty } from "../../../src/listings/feed/FilteredEmpty";
import { useFeedCatalogMaps } from "../../../src/listings/feed/useFeedCatalogMaps";
import { useFeedFavoriteReplay } from "../../../src/listings/feed/useFeedFavoriteReplay";
import { FeedMessageReplay } from "../../../src/listings/feed/FeedMessageReplay";
import { ResultsHeader } from "../../../src/listings/search/ResultsHeader";
import { SortSheet } from "../../../src/listings/search/SortSheet";
import { ConditionSwitch } from "../../../src/listings/search/ConditionSwitch";
import { BrandModelCard } from "../../../src/listings/search/BrandModelCard";
import { FilterChipsRow, type ChipGroup } from "../../../src/listings/search/FilterChipsRow";
import { useListingFilters } from "../../../src/listings/search/useListingFilters";
import { PARAMETERS_PATH } from "../../../src/listings/search/pickerActions";
import { readResultsRouteState, writeResultsRouteState, type ResultsRouteState } from "../../../src/listings/search/resultsRouteState";
import { HOME_HREF } from "../../../src/navigation/homeHref";
import { useSafeBack } from "../../../src/navigation/useSafeBack";
import { TabScreen } from "../../../components/navigation/TabScreen";
import { useTabBarSpace } from "../../../components/navigation/tabBarHeight";

import { useListEntrance } from "@/components/ui/motion";
import { Text } from "@/components/ui/text";
import { timing } from "@/lib/motion";

/** Results keeps the applied query in search params and leaves its list mounted on Listing navigation. */
export default function ResultsScreen() {
  const { t } = useTranslation();
  const goBack = useSafeBack(HOME_HREF);
  const params = useLocalSearchParams<ResultsRouteState>();
  const routeState = readResultsRouteState(params);
  const routeKey = JSON.stringify(routeState);
  const previousRouteKey = useRef(routeKey);
  const [sortOpen, setSortOpen] = useState(false);
  const filters = useListingFilters(routeState, (next) => router.setParams(writeResultsRouteState(next)));
  const { replace, commit } = filters;
  useEffect(() => {
    if (previousRouteKey.current !== routeKey) {
      previousRouteKey.current = routeKey;
      replace(JSON.parse(routeKey));
    }
  }, [routeKey, replace]);

  const sort = filters.active.sort ?? "newest";
  const applied = useMemo(() => ({ ...filters.active, sort }), [filters.active, sort]);
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const returnTo = useMemo(() => ({ pathname: "/(tabs)/(search)/results" as const, params: writeResultsRouteState(applied) }), [applied]);
  useFeedFavoriteReplay(returnTo);
  const feed = useListings({ filters: applied, viewerId: viewer?.userId ?? null });
  const count = useListingCount({ filters: applied });
  const items = feed.data?.pages.flatMap((page) => page.items) ?? [];
  // Include a selected brand even when there are no matching Listings, so its names remain visible.
  const catalog = useFeedCatalogMaps(items, filters.active.brandId ? [filters.active.brandId] : []);
  const models = useModels(filters.active.brandId ?? "");
  const modelNames = (filters.active.modelIds ?? []).map((id) => models.data?.items.find((model) => model.id === id)?.name ?? t("loading"));
  const transmissions = useTransmissions();
  const engineTypes = useEngineTypes();
  const tabBarSpace = useTabBarSpace();
  const scrollY = useRef(0);
  const [floating, setFloating] = useState(false);
  const floated = useSharedValue(0);
  const floatingStyle = useAnimatedStyle(() => ({ opacity: floated.value, transform: [{ translateY: (1 - floated.value) * 12 }] }));
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
    const next = scrollY.current > 180;
    setFloating((previous) => previous === next ? previous : next);
    floated.value = withTiming(next ? 1 : 0, timing("fast"));
  }, [floated]);
  const reset = () => { filters.replace({ sort }); router.setParams(writeResultsRouteState({ sort })); };
  const remove = (group: ChipGroup) => commit(group === "city" ? { cityId: undefined } : group === "price" ? { priceMin: undefined, priceMax: undefined } : { yearMin: undefined, yearMax: undefined });
  // The form is its own screen: it opens with what Results shows, and its Show N updates this screen in place.
  const openParameters = () => router.push({ pathname: PARAMETERS_PATH, params: { ...writeResultsRouteState(applied), returnToResults: "1" } });
  const chipsProps = { filters: applied, cityName: filters.active.cityId ? catalog.cityName(filters.active.cityId) : undefined, onOpen: openParameters, onRemove: remove };
  // The first cards fade in from their skeletons, once; later cards are simply there.
  const enterOrder = useListEntrance(items.length > 0, 3);
  const header = <View className="pb-2 pt-1">
    <View className="gap-3 px-4 pb-1">
      <ConditionSwitch value={applied.condition} onChange={(condition) => commit({ condition })} />
      <BrandModelCard brandName={applied.brandId ? catalog.brandName(applied.brandId) : undefined} brandLogoUrl={applied.brandId ? catalog.brandLogoUrl(applied.brandId) : undefined} modelNames={modelNames} hasBrand={!!applied.brandId}
        onClear={() => commit({ brandId: undefined, modelIds: undefined, modelId: undefined })}
        onEdit={() => router.push(applied.brandId ? { pathname: "/(tabs)/(search)/models", params: { brandId: applied.brandId, modelIds: applied.modelIds?.join(","), returnToResults: "1", resultsState: JSON.stringify(writeResultsRouteState(applied)) } } : { pathname: "/(tabs)/(search)/brands", params: { returnToResults: "1", resultsState: JSON.stringify(writeResultsRouteState(applied)) } })} />
    </View>
    <FilterChipsRow {...chipsProps} />
  </View>;
  const offline = feed.fetchStatus === "paused" && items.length === 0;
  // The count and the brand/city names are separate queries. After an outage they must reload with the feed.
  // Only queries a mounted screen is watching: failed queries left behind by other screens stay untouched.
  const retry = () => { void queryClient.refetchQueries({ type: "active", predicate: (query) => query.state.status === "error" || query.state.fetchStatus === "paused" }); };
  const empty = offline ? <FeedError error={new ApiError("NETWORK_ERROR", 0)} onRetry={retry} /> : feed.isPending ? <View accessibilityLabel={t("resultsLoading")} className="gap-3">{[0, 1, 2].map((id) => <ListingLargeCardSkeleton key={id} />)}</View>
    : feed.isError ? <FeedError error={feed.error} onRetry={retry} />
      : filters.count ? <FilteredEmpty onReset={reset} /> : <FeedEmpty />;
  // The chips pinned above the tab bar while the list scrolls: glass, and drawn above the edge fade.
  const floatingChips = floating ? <Animated.View style={[floatingStyle, { bottom: tabBarSpace - 8 }]} className="absolute left-0 right-0"><FilterChipsRow {...chipsProps} floating /></Animated.View> : null;
  return <TabScreen underTabBar overlay={floatingChips}>
    <ResultsHeader count={count.data} sort={sort} onSort={() => setSortOpen(true)} onBack={goBack} />
    <FlatList testID="results-list" data={feed.isPending || feed.isError ? [] : items} keyExtractor={(item) => item.id} ListHeaderComponent={header} ListEmptyComponent={empty}
      contentContainerClassName="grow" contentContainerStyle={{ paddingBottom: tabBarSpace + (items.length ? 68 : 8) }} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}
      renderItem={({ item, index }) => <ListingLargeCard listing={item} enterOrder={enterOrder(index)} onPress={(id) => router.push(`/(public)/listings/${id}`)}
        brandName={catalog.brandName(item.brandId)} modelName={catalog.modelName(item.modelId)} cityName={catalog.cityName(item.cityId)}
        transmissionName={transmissions.data?.items.find((entry) => entry.id === item.transmissionId)?.name}
        engineTypeName={engineTypes.data?.items.find((entry) => entry.id === item.engineTypeId)?.name}
        isAuthenticated={viewer === undefined ? null : viewer !== null} viewerId={viewer?.userId ?? null} returnTo={returnTo} />}
      ItemSeparatorComponent={() => <View className="h-3" />}
      refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />}
      onEndReached={() => { if (feed.hasNextPage && !feed.isFetchingNextPage && !feed.isRefetching) void feed.fetchNextPage(); }} onEndReachedThreshold={0.5}
      ListFooterComponent={items.length && !feed.isPending && !feed.isError ? <View className="items-center pb-2 pt-5">{feed.isFetchingNextPage ? <ActivityIndicator /> : !feed.hasNextPage ? <Text className="text-footnote text-muted-foreground">{t("noMore")}</Text> : null}</View> : null} />
    <FeedMessageReplay returnTo={returnTo} />
    <SortSheet open={sortOpen} onOpenChange={setSortOpen} value={sort} onChange={(value) => commit({ sort: value })} />
  </TabScreen>;
}
