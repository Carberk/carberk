import { useCallback, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../src/auth/useAuth";
import { useViewer } from "../../src/auth/useViewer";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { useEngineTypes } from "../../src/api/catalog/useEngineTypes";
import { useTransmissions } from "../../src/api/catalog/useTransmissions";
import { FavoriteListingCard, FavoriteListingCardSkeleton } from "../../src/listings/favorites/FavoriteListingCard";
import { useFeedCatalogMaps } from "../../src/listings/feed/useFeedCatalogMaps";
import { HideSoldToggle } from "../../src/listings/favorites/HideSoldToggle";
import { useFavoritesView } from "../../src/listings/favorites/useFavoritesView";
import { HOME_HREF } from "../../src/navigation/homeHref";
import { LargeTitle } from "../../components/navigation/ScreenHeader";
import { TabScreen } from "../../components/navigation/TabScreen";

import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Text } from "@/components/ui/text";

function CenteredMessage({ title, hint, children, icon = true }: { title: string; hint: string; children?: ReactNode; icon?: boolean }) {
  return (
    <EmptyState illustration={icon ? "favorites" : undefined} title={title} hint={hint}>
      {children}
    </EmptyState>
  );
}

function BrowseListingsButton() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <Button variant="secondary" size="pill" onPress={() => router.navigate(HOME_HREF)}>
      <Text>{t("browseListings")}</Text>
    </Button>
  );
}

function AnonymousFavoritesEntry() {
  const router = useRouter();
  const { t } = useTranslation();

  const handleSignIn = () => {
    useAuthIntentStore.getState().requireSignIn(router, {
      returnTo: "/(tabs)/favorites",
    });
  };

  return (
    <CenteredMessage title={t("favoritesSignedOutTitle")} hint={t("favoritesSignedOutHint")}>
      <Button variant="brand" size="pill" onPress={handleSignIn}>
        <Text>{t("signIn")}</Text>
      </Button>
    </CenteredMessage>
  );
}

function FavoritesContent({ view }: { view: ReturnType<typeof useFavoritesView> }) {
  const router = useRouter();
  const { t } = useTranslation();
  const viewer = useViewer();
  const { state, hideSold, setHideSold, showSwitch, items, counts, remove, query } = view;

  const handlePress = useCallback(
    (id: string) => {
      router.push(`/(public)/listings/${id}`);
    },
    [router],
  );

  const catalogMaps = useFeedCatalogMaps(items);
  // The card's spec line and a tapped card's Listing detail preview both name
  // the gearbox and fuel from these catalogs.
  const transmissions = useTransmissions();
  const engineTypes = useEngineTypes();
  const transmissionName = (id?: string) => transmissions.data?.items.find((item) => item.id === id)?.name;
  const engineTypeName = (id?: string) => engineTypes.data?.items.find((item) => item.id === id)?.name;

  // The spinner answers a pull only, not the reload after a confirmed removal.
  const [pulling, setPulling] = useState(false);
  const refresh = () => {
    setPulling(true);
    void query.refetch().finally(() => setPulling(false));
  };

  // Kept through loading and errors after a switch, so the User can switch back.
  const toggle = showSwitch ? (
    <HideSoldToggle hideSold={hideSold} onChange={setHideSold} hiddenCount={counts.inactive} />
  ) : null;

  if (state === "loading") {
    return (
      <>
        {toggle}
        <View accessibilityLabel={t("loading")} className="gap-2">
          {[0, 1, 2].map((id) => <FavoriteListingCardSkeleton key={id} />)}
        </View>
      </>
    );
  }

  if (state === "error") {
    return (
      <>
        {toggle}
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </>
    );
  }

  if (state === "empty") {
    return (
      <CenteredMessage title={t("noFavoritesYet")} hint={t("favoritesSaveLater")}>
        <BrowseListingsButton />
      </CenteredMessage>
    );
  }

  return (
    <FlatList
      testID="favorites-list"
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <FavoriteListingCard
          listing={item}
          onPress={handlePress}
          brandName={catalogMaps.brandName(item.brandId)}
          modelName={catalogMaps.modelName(item.modelId)}
          cityName={catalogMaps.cityName(item.cityId)}
          transmissionName={transmissionName(item.transmissionId)}
          engineTypeName={engineTypeName(item.engineTypeId)}
          // Until the viewer is known, a card could be the User's own: no contact buttons yet.
          isOwn={viewer === undefined || viewer?.userId === item.sellerId}
          onRemoveFavorite={remove}
        />
      )}
      ItemSeparatorComponent={() => <View className="h-2 bg-background" />}
      ListHeaderComponent={toggle}
      ListEmptyComponent={
        state === "noActive" ? (
          <CenteredMessage icon={false} title={t("favoritesNoActiveTitle")} hint={t("favoritesNoActiveHint")}>
            <BrowseListingsButton />
          </CenteredMessage>
        ) : null
      }
      refreshControl={
        <RefreshControl refreshing={pulling} onRefresh={refresh} />
      }
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <View className="py-4 items-center">
            <ActivityIndicator />
          </View>
        ) : null
      }
    />
  );
}

function SignedInFavorites() {
  const view = useFavoritesView();
  // A removal waiting for Undo is sent when the tab loses focus.
  const flush = useRef(view.flush);
  flush.current = view.flush;
  useFocusEffect(useCallback(() => () => flush.current(), []));
  return (
    <>
      <Title count={view.showSwitch ? view.counts.total : undefined} />
      <FavoritesContent view={view} />
    </>
  );
}

function Title({ count }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <LargeTitle
      title={t("favorites")}
      accessory={
        count ? (
          <Text testID="favorites-count" className="text-headline font-medium text-muted-foreground">
            {count}
          </Text>
        ) : null
      }
    />
  );
}

export default function FavoritesScreen() {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();

  return (
    <TabScreen>
      {isAuthenticated === true ? (
        <SignedInFavorites />
      ) : (
        <>
          <Title />
          {isAuthenticated === false ? (
            <AnonymousFavoritesEntry />
          ) : (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator />
              <Text className="text-callout text-muted-foreground">{t("loading")}</Text>
            </View>
          )}
        </>
      )}
    </TabScreen>
  );
}
