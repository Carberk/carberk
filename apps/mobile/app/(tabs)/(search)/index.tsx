import { useScrollToTop } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { useMeasurementScreen } from "../../../src/measurement/useMeasurementScreen";
import { useEngineTypes } from "../../../src/api/catalog/useEngineTypes";
import { useTransmissions } from "../../../src/api/catalog/useTransmissions";
import { useListings } from "../../../src/api/listings/useListings";
import { useViewer } from "../../../src/auth/useViewer";
import { FeedEmpty } from "../../../src/listings/feed/FeedEmpty";
import { FeedError } from "../../../src/listings/feed/FeedError";
import { HomeHeader } from "../../../src/listings/feed/HomeHeader";
import {
  ListingGridCard,
  ListingGridSkeleton,
} from "../../../src/listings/feed/ListingGridCard";
import { useFeedCatalogMaps } from "../../../src/listings/feed/useFeedCatalogMaps";
import { useFeedFavoriteReplay } from "../../../src/listings/feed/useFeedFavoriteReplay";
import { HOME_HREF } from "../../../src/navigation/homeHref";
import { TabScreen } from "../../../components/navigation/TabScreen";
import { useTabBarSpace } from "../../../components/navigation/tabBarHeight";

import { useListEntrance } from "@/components/ui/motion";
import { Text } from "@/components/ui/text";

/**
 * Fills the second column of an odd last row. Without it the last card's
 * `flex-1` would take the whole row and read as a large card.
 */
const GRID_SPACER = { id: "grid-spacer" } as const;
type GridCell = ListingsSchemas.ListingSummary | typeof GRID_SPACER;
const isSpacer = (cell: GridCell): cell is typeof GRID_SPACER => cell === GRID_SPACER;

/**
 * Home, the Search tab's first screen (33 — Search & discovery; ADR-0051):
 * 🔍 opens Search, the "Brand, model" card opens the Brand picker, and New
 * listings is the chronological feed as a two-column grid. There are no
 * filters and no safety banner here.
 */
export default function HomeScreen() {
  useMeasurementScreen("home",{eventName:"discovery_opened",purpose:"product_improvement",payload:{screen:"home"}});
  const { t } = useTranslation();
  // Tapping Search again while Home is showing glides the feed back to the top.
  const listRef = useRef<FlatList>(null);
  useScrollToTop(listRef);
  const viewer = useViewer();
  const isAuthenticated = viewer === undefined ? null : viewer !== null;
  useFeedFavoriteReplay(HOME_HREF);

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useListings({
    viewerId: viewer?.userId ?? null,
    // Wait for the session check so a signed-in User's first page already
    // carries `isFavorited` instead of refetching straight after.
    enabled: viewer !== undefined,
  });

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );
  const catalogMaps = useFeedCatalogMaps(items);
  // A tapped card opens Listing detail with its gearbox and engine already in
  // their Specifications cells; the names come from these catalogs, so warm
  // them here.
  useTransmissions();
  useEngineTypes();
  const cells = useMemo<GridCell[]>(
    () => (items.length % 2 === 1 ? [...items, GRID_SPACER] : items),
    [items],
  );

  const openListing = useCallback((id: string) => {
    router.push(`/(public)/listings/${id}`);
  }, []);

  // The first cards fade in from their skeletons, once; a card that scrolls
  // back into the window, or a next page, is simply there.
  const enterOrder = useListEntrance(items.length > 0);

  const renderItem = useCallback(
    ({ item, index }: { item: GridCell; index: number }) =>
      isSpacer(item) ? (
        <View className="flex-1" />
      ) : (
        <ListingGridCard
          listing={item}
          onPress={openListing}
          brandName={catalogMaps.brandName(item.brandId)}
          modelName={catalogMaps.modelName(item.modelId)}
          isAuthenticated={isAuthenticated}
          returnTo={HOME_HREF}
          titlePending={catalogMaps.namesPending}
          enterOrder={enterOrder(index)}
        />
      ),
    [catalogMaps, enterOrder, isAuthenticated, openListing],
  );

  const header = <HomeHeader />;
  const tabBarSpace = useTabBarSpace();

  if (isPending) {
    return (
      <TabScreen>
        {header}
        <ListingGridSkeleton />
      </TabScreen>
    );
  }

  if (isError) {
    return (
      <TabScreen>
        {header}
        <FeedError error={error} onRetry={() => refetch()} />
      </TabScreen>
    );
  }

  return (
    <TabScreen underTabBar>
      <FlatList
        ref={listRef}
        data={cells}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={<FeedEmpty />}
        columnWrapperClassName="gap-3 px-4"
        contentContainerClassName="grow gap-3"
        contentContainerStyle={{ paddingBottom: tabBarSpace + 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            void fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="items-center py-4">
              <ActivityIndicator />
            </View>
          ) : !hasNextPage && items.length > 0 ? (
            <View className="items-center pb-2 pt-5">
              <Text className="text-footnote text-muted-foreground">{t("noMore")}</Text>
            </View>
          ) : null
        }
      />
    </TabScreen>
  );
}
