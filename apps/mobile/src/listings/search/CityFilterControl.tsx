import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { useRegions } from "../../api/catalog/useRegions";
import { useCities } from "../../api/catalog/useCities";

import type { UseListingFiltersReturn } from "./useListingFilters";

import { CatalogPickerSheet } from "@/components/listings/wizard/CatalogPickerSheet";
import { PickerRow } from "@/components/listings/wizard/PickerRow";
import { Button } from "@/components/ui/button";
import { FilterLabel } from "./FilterSection";
import { GroupedList } from "@/components/ui/grouped-list";
import { Text } from "@/components/ui/text";

interface CityFilterControlProps {
  draft: UseListingFiltersReturn["draft"];
  setField: UseListingFiltersReturn["setField"];
}

interface CityMeta {
  name: string;
  regionId: string;
}

/** Module-level cache survives sheet close/open cycles so the
 *  selected city name is still visible when the sheet reopens.
 */
const cityMetaCache = new Map<string, CityMeta>();

function filterBySearch<T extends { name: string }>(items: T[], search: string) {
  if (!search) return items;
  return items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
}

export function CityFilterControl({ draft, setField }: CityFilterControlProps) {
  const { t } = useTranslation();
  const cached = draft.cityId ? cityMetaCache.get(draft.cityId) : undefined;

  const [regionOpen, setRegionOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [regionSearch, setRegionSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [selectedRegionId, setSelectedRegionId] = useState<string>(cached?.regionId ?? "");

  const isInternalChangeRef = useRef(false);

  useEffect(() => {
    if (draft.cityId) {
      const cachedMeta = cityMetaCache.get(draft.cityId);
      if (cachedMeta) {
        setSelectedRegionId(cachedMeta.regionId);
      }
    } else if (!isInternalChangeRef.current) {
      setSelectedRegionId("");
    }
    isInternalChangeRef.current = false;
  }, [draft.cityId]);

  const {
    data: regionsData,
    isPending: regionsLoading,
    isError: regionsError,
  } = useRegions();

  const {
    data: citiesData,
    isPending: citiesLoading,
    isError: citiesError,
  } = useCities(selectedRegionId);

  const filteredRegions = useMemo(
    () => filterBySearch(regionsData?.items ?? [], regionSearch),
    [regionsData?.items, regionSearch],
  );

  const filteredCities = useMemo(
    () => filterBySearch(citiesData?.items ?? [], citySearch),
    [citiesData?.items, citySearch],
  );

  const selectedRegion = useMemo(
    () => regionsData?.items.find((r) => r.id === selectedRegionId),
    [regionsData?.items, selectedRegionId],
  );

  const selectedCity = useMemo(() => {
    const cityId = draft.cityId;
    if (!cityId) return undefined;
    const fromData = citiesData?.items.find((c) => c.id === cityId);
    if (fromData) return fromData;
    const cachedMeta = cityMetaCache.get(cityId);
    if (cachedMeta) return { id: cityId, name: cachedMeta.name };
    return undefined;
  }, [draft.cityId, citiesData?.items]);

  const handleSelectRegion = useCallback(
    (regionId: string) => {
      setSelectedRegionId(regionId);
      setRegionOpen(false);
      setRegionSearch("");
      if (draft.cityId) {
        cityMetaCache.delete(draft.cityId);
        setField("cityId", undefined);
      }
      setCityOpen(true);
      isInternalChangeRef.current = true;
    },
    [draft.cityId, setField],
  );

  const handleSelectCity = useCallback(
    (cityId: string) => {
      const city = citiesData?.items.find((c) => c.id === cityId);
      if (city) {
        cityMetaCache.set(cityId, { name: city.name, regionId: selectedRegionId });
      }
      setField("cityId", cityId);
      setCityOpen(false);
      setCitySearch("");
    },
    [citiesData?.items, selectedRegionId, setField],
  );

  const handleClearCity = useCallback(() => {
    if (draft.cityId) {
      cityMetaCache.delete(draft.cityId);
    }
    setField("cityId", undefined);
    setSelectedRegionId("");
  }, [draft.cityId, setField]);

  const canOpenCityPicker = !!selectedRegionId || !!draft.cityId;

  return (
    <View className="gap-2">
      <FilterLabel>{t("city")}</FilterLabel>
      <GroupedList inset="text" className="mx-0">
        <PickerRow
          grouped
          label={t("region")}
          value={selectedRegion?.name}
          placeholder={t("selectRegion")}
          onPress={() => setRegionOpen(true)}
        />

        <PickerRow
          grouped
          label={t("city")}
          value={selectedCity?.name}
          placeholder={selectedRegionId ? t("selectCity") : t("selectRegionFirst")}
          disabled={!canOpenCityPicker}
          onPress={() => setCityOpen(true)}
        />
      </GroupedList>

      {draft.cityId && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start px-0"
          hitSlop={10}
          onPress={handleClearCity}
          accessibilityLabel={t("clear")}
        >
          <Text className="text-callout font-medium text-foreground">{t("clear")}</Text>
        </Button>
      )}

      {/* Out of the flow: a closed sheet still mounts an empty root, which would take a gap. */}
      <View className="absolute">
      <CatalogPickerSheet
        open={regionOpen}
        onOpenChange={(open) => {
          setRegionOpen(open);
          if (!open) setRegionSearch("");
        }}
        title={t("selectRegion")}
        searchPlaceholder={`${t("searchPlaceholder")}`}
        search={regionSearch}
        onSearchChange={setRegionSearch}
        items={filteredRegions}
        selectedId={selectedRegionId}
        emptyMessage={
          regionSearch ? t("noRegionsMatch") : t("noRegionsAvailable")
        }
        isLoading={regionsLoading}
        isError={regionsError}
        onSelect={handleSelectRegion}
      />

      <CatalogPickerSheet
        open={cityOpen}
        onOpenChange={(open) => {
          setCityOpen(open);
          if (!open) setCitySearch("");
        }}
        title={t("selectCity")}
        searchPlaceholder={`${t("searchPlaceholder")}`}
        search={citySearch}
        onSearchChange={setCitySearch}
        items={filteredCities}
        selectedId={draft.cityId}
        emptyMessage={
          citySearch ? t("noCitiesMatch") : t("noCitiesAvailable")
        }
        isLoading={citiesLoading}
        isError={citiesError}
        onSelect={handleSelectCity}
      />
      </View>
    </View>
  );
}
