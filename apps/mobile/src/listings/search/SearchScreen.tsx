import { useCallback, useEffect, useRef, useState } from "react";
import type { TextInput} from "react-native";
import {
  Keyboard, KeyboardAvoidingView, Pressable,
  ScrollView, View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Calendar, ChevronRight, History, SlidersHorizontal, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { CatalogSchemas } from "@auto-tm/contracts";

import { useMeasurementScreen } from "../../measurement/useMeasurementScreen";
import { ApiError } from "../../api/client";
import { useBrands } from "../../api/catalog/useBrands";
import { CATALOG_SEARCH_MIN_LENGTH, useCatalogSearch } from "../../api/catalog/useCatalogSearch";
import { useListingBrandCounts } from "../../api/listings/useListingBrandCounts";
import { HOME_HREF } from "../../navigation/homeHref";
import { useSafeBack } from "../../navigation/useSafeBack";

import { buildBrandSections } from "./brandPickerLogic";
import { CarBrandLogo } from "./CarBrandLogo";
import { PARAMETERS_PATH } from "./pickerActions";
import { useRecentChoicesStore, type BrandModelChoice } from "./recentSearches";

import { ErrorState } from "@/components/ErrorState";
import { BackButton, HeaderButton, StackHeader } from "@/components/navigation/StackHeader";
import { StickyActionBar, useStickyActionBar } from "@/components/navigation/StickyActionBar";
import { Button } from "@/components/ui/button";
import { GlassButton } from "@/components/ui/glass-button";
import { GroupedList } from "@/components/ui/grouped-list";
import { Icon } from "@/components/ui/icon";
import { GroupedListSkeleton, ListNote } from "@/components/ui/list-states";
import { SearchField } from "@/components/ui/search-field";
import { Text } from "@/components/ui/text";

/** Search consumes catalog matches and parsed years; the API owns spelling and parsing. */
export function SearchScreen() {
  useMeasurementScreen("search",{eventName:"discovery_opened",purpose:"product_improvement",payload:{screen:"search"}});
  const { t } = useTranslation();
  const goBack = useSafeBack(HOME_HREF);
  const bar = useStickyActionBar();
  const [query, setQuery] = useState("");
  const input = useRef<TextInput>(null);
  const brands = useBrands();
  const counts = useListingBrandCounts({});
  const search = useCatalogSearch(query);
  const recent = useRecentChoicesStore((state) => state.items);
  const hydrate = useRecentChoicesStore((state) => state.hydrate);
  const record = useRecentChoicesStore((state) => state.record);
  const clear = useRecentChoicesStore((state) => state.clear);
  useEffect(() => { void hydrate(); }, [hydrate]);
  useFocusEffect(useCallback(() => { input.current?.focus(); }, []));

  const brandMap = new Map(brands.data?.items.map((brand) => [brand.id, brand]));
  const popular = buildBrandSections(
    brands.data?.items ?? [],
    counts.data ? new Map(counts.data.items.map((item) => [item.brandId, item.totalMatching])) : undefined,
  ).popular;
  const empty = !query.trim();
  const enoughText = [...query.trim()].length >= CATALOG_SEARCH_MIN_LENGTH;
  // Previous data is useful in pickers, but cannot authorize a new Search selection.
  const waiting = search.isSettling || search.isPlaceholderData || (enoughText && search.isPending);
  const current = !waiting && !search.isPaused && enoughText ? search.data : undefined;
  const years = current?.yearFrom !== undefined
    ? current.yearFrom === current.yearTo
      ? String(current.yearFrom)
      : `${current.yearFrom}–${current.yearTo ?? current.yearFrom}`
    : undefined;

  const openResults = (choice?: BrandModelChoice, withYears = false) => {
    const params: Record<string, string> = {};
    if (choice) {
      params.brandId = choice.brandId;
      if (choice.modelIds.length) params.modelIds = choice.modelIds.join(",");
      void record(choice);
    }
    if (withYears && current) {
      if (current.yearFrom !== undefined) params.yearMin = String(current.yearFrom);
      if (current.yearTo !== undefined) params.yearMax = String(current.yearTo);
    }
    Keyboard.dismiss();
    router.replace({ pathname: "/(tabs)/(search)/results", params });
  };
  const pickMatch = (match: CatalogSchemas.CatalogSearchResultItem) => {
    if (!current) return;
    const brandName = match.kind === "brand" ? match.label : match.brandLabel ?? brandMap.get(match.brandId)?.name ?? match.brandId;
    openResults({ brandId: match.brandId, brandName,
      modelIds: match.kind === "model" && match.modelId ? [match.modelId] : [],
      modelNames: match.kind === "model" ? [match.label] : [],
    }, true);
  };
  const pausedError = new ApiError("NETWORK_ERROR", 0);
  const browseError = brands.isPaused || counts.isPaused ? pausedError : brands.isError ? brands.error : counts.isError ? counts.error : undefined;
  const browseLoading = !brands.data || !counts.data;
  const retryBrowse = () => { void brands.refetch(); void counts.refetch(); };

  return (
    // Android is edge to edge, so the window no longer resizes for the keyboard: both platforms pad.
    <KeyboardAvoidingView className="flex-1" behavior="padding">
      <StackHeader
        leading={<BackButton accessibilityLabel={t("back")} onPress={() => { Keyboard.dismiss(); goBack(); }} />}
        trailing={query ? <HeaderButton icon={X}
          accessibilityLabel={t("clearSearch")} onPress={() => { setQuery(""); input.current?.focus(); }} /> : null}
      >
        <View className="min-w-0 flex-1">
          <SearchField ref={input} value={query} onChangeText={setQuery} autoFocus
            placeholder={t("searchBrandOrModel")} accessibilityLabel={t("searchBrandOrModel")}
            autoCorrect={false} autoCapitalize="none" returnKeyType="search" maxLength={100} />
        </View>
      </StackHeader>
      {/* The list runs under the bar; the bar rides up with the keyboard. */}
      <View className="min-h-0 flex-1">
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bar.space + 8 }}>
        {empty ? <>
          {recent.length > 0 ? <>
            <View className="flex-row items-center justify-between px-5 pb-2 pt-3">
              <Text className="font-heading text-subhead font-semibold text-foreground">{t("recentChoices")}</Text>
              <Button variant="ghost" size="sm" className="-mr-2 min-h-6 px-2 py-0" hitSlop={10} accessibilityLabel={t("clearRecent")} onPress={() => void clear()}>
                <Text className="text-callout font-medium text-foreground">{t("clear")}</Text>
              </Button>
            </View>
            <GroupedList>{recent.map((choice) => <SearchRow key={`${choice.brandId}-${choice.modelIds.join(",")}`}
              label={choice.modelNames.length ? `${choice.brandName} ${choice.modelNames.join(", ")}` : t("brandAllModels", { brand: choice.brandName })}
              leading={<CarBrandLogo name={choice.brandName} logoUrl={brandMap.get(choice.brandId)?.logoUrl} size={36} />}
              trailing={<Icon as={History} className="size-4 text-muted-foreground" />}
              onPress={() => openResults(choice)} />)}</GroupedList>
          </> : null}
          <Text className="px-5 pb-2 pt-6 font-heading text-subhead font-semibold text-foreground">{t("popularBrands")}</Text>
          {browseError ? <ErrorState error={browseError} onRetry={retryBrowse} /> : browseLoading ? <Loading /> : <GroupedList>{popular.map((brand) =>
            <SearchRow key={brand.id} label={brand.name}
              leading={<CarBrandLogo name={brand.name} logoUrl={brand.logoUrl} size={36} />}
              detail={brand.count ? String(brand.count) : undefined}
              onPress={() => openResults({ brandId: brand.id, brandName: brand.name, modelIds: [], modelNames: [] })} />)}</GroupedList>}
        </> : search.isPaused && enoughText ? <ErrorState error={pausedError} onRetry={() => void search.refetch()} /> : waiting ? <Loading /> : search.isError && enoughText ?
          <ErrorState error={search.error} onRetry={() => void search.refetch()} /> : current?.results.length ? <GroupedList className="mt-1">
            {current.results.map((match) => <SearchRow key={`${match.kind}-${match.brandId}-${match.modelId ?? ""}`}
              label={match.kind === "model" ? `${match.brandLabel ?? brandMap.get(match.brandId)?.name ?? match.brandId} ${match.label}` : match.label}
              leading={match.kind === "brand" ? <CarBrandLogo name={match.label} logoUrl={brandMap.get(match.brandId)?.logoUrl} size={36} /> : <View className="size-9" />}
              detail={years ?? (match.kind === "brand" ? t("brand") : undefined)} onPress={() => pickMatch(match)} />)}
          </GroupedList> : years && /^[\d\s–—-]+$/u.test(query.trim()) ? <GroupedList className="mt-1"><SearchRow label={t("allCarsYear", { years })}
            leading={<View className="size-9 items-center justify-center rounded-full bg-secondary"><Icon as={Calendar} className="size-5 text-foreground" /></View>} onPress={() => openResults(undefined, true)} /></GroupedList> :
          <ListNote>{t("noCatalogMatch", { query: query.trim() })}</ListNote>}
      </ScrollView>
      <StickyActionBar {...bar.barProps} edgeFade>
        <GlassButton onPress={() => { Keyboard.dismiss(); router.replace({ pathname: PARAMETERS_PATH }); }}>
          <Icon as={SlidersHorizontal} className="size-5" /><Text>{t("allFilters")}</Text>
        </GlassButton>
      </StickyActionBar>
      </View>
    </KeyboardAvoidingView>
  );
}

function Loading() {
  const { t } = useTranslation();
  return <GroupedListSkeleton rows={5} className="mt-1" accessibilityLabel={t("loadingEllipsis")} />;
}

function SearchRow({ label, leading, trailing, detail, onPress }: {
  label: string; leading: React.ReactNode; trailing?: React.ReactNode; detail?: string; onPress: () => void;
}) {
  return <Pressable onPress={onPress} accessibilityRole="button"
    className="min-h-14 flex-row items-center gap-3 px-4 py-2 active:bg-secondary">
    {leading}<Text className="min-w-0 flex-1 text-body font-medium text-foreground" numberOfLines={1}>{label}</Text>
    {detail ? <Text className="text-callout text-muted-foreground">{detail}</Text> : null}
    {trailing ?? <Icon as={ChevronRight} className="size-4 text-muted-foreground" />}
  </Pressable>;
}
