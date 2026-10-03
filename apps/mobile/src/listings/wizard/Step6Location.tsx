import { useState } from "react";
import { View } from "react-native";
import { MapPin } from "lucide-react-native";
import type { WizardSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { useRegions } from "../../api/catalog/useRegions";
import { useCities } from "../../api/catalog/useCities";

import { DescriptionField } from "./DescriptionField";

import { CatalogPickerSheet } from "@/components/listings/wizard/CatalogPickerSheet";
import { PickerRow } from "@/components/listings/wizard/PickerRow";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";

interface Step6LocationProps {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  fieldErrors?: Record<string, string>;
  /** Show every field's error, after the seller first taps Continue on this step. */
  showErrors?: boolean;
  disabled?: boolean;
}

function useLocationPicker(payload: WizardSchemas.WizardDraftPayload) {
  const [regionOpen, setRegionOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [regionSearch, setRegionSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");

  const {
    data: regionsData,
    isPending: regionsLoading,
    isError: regionsError,
  } = useRegions();
  const {
    data: citiesData,
    isPending: citiesLoading,
    isError: citiesError,
  } = useCities(payload.regionId ?? "");

  const filteredRegions = filterBySearch(regionsData?.items ?? [], regionSearch);
  const filteredCities = filterBySearch(citiesData?.items ?? [], citySearch);

  const selectedRegion = findById(regionsData?.items ?? [], payload.regionId);
  const selectedCity = findById(citiesData?.items ?? [], payload.cityId);

  return {
    regionOpen,
    setRegionOpen,
    cityOpen,
    setCityOpen,
    regionSearch,
    setRegionSearch,
    citySearch,
    setCitySearch,
    filteredRegions,
    filteredCities,
    selectedRegion,
    selectedCity,
    regionsLoading,
    regionsError,
    citiesLoading,
    citiesError,
  };
}

function filterBySearch<T extends { name: string }>(items: T[], search: string) {
  if (!search) return items;
  return items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  );
}

function findById<T extends { id: string }>(items: T[], id?: string) {
  return items.find((i) => i.id === id);
}

function wrapDisabled(children: React.ReactNode, disabled: boolean) {
  if (!disabled) return <>{children}</>;
  return <View className="opacity-50">{children}</View>;
}

function LocationSheets({
  payload,
  picker,
  onChange,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  picker: ReturnType<typeof useLocationPicker>;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
}) {
  const { t } = useTranslation();
  function handleSelectRegion(regionId: string) {
    onChange({ regionId, cityId: undefined });
    picker.setRegionOpen(false);
    picker.setRegionSearch("");
  }

  function handleSelectCity(cityId: string) {
    onChange({ cityId });
    picker.setCityOpen(false);
    picker.setCitySearch("");
  }

  return (
    <>
      <CatalogPickerSheet
        open={picker.regionOpen}
        onOpenChange={(open) => {
          picker.setRegionOpen(open);
          if (!open) picker.setRegionSearch("");
        }}
        title={t("selectRegion")}
        searchPlaceholder={t("searchPlaceholder")}
        search={picker.regionSearch}
        onSearchChange={picker.setRegionSearch}
        items={picker.filteredRegions}
        selectedId={payload.regionId}
        emptyMessage={
          picker.regionSearch
            ? t("noRegionsMatch")
            : t("noRegionsAvailable")
        }
        isLoading={picker.regionsLoading}
        isError={picker.regionsError}
        onSelect={handleSelectRegion}
      />

      <CatalogPickerSheet
        open={picker.cityOpen}
        onOpenChange={(open) => {
          picker.setCityOpen(open);
          if (!open) picker.setCitySearch("");
        }}
        title={t("selectCity")}
        searchPlaceholder={t("searchPlaceholder")}
        search={picker.citySearch}
        onSearchChange={picker.setCitySearch}
        items={picker.filteredCities}
        selectedId={payload.cityId}
        emptyMessage={
          picker.citySearch
            ? t("noCitiesMatch")
            : t("noCitiesAvailable")
        }
        isLoading={picker.citiesLoading}
        isError={picker.citiesError}
        onSelect={handleSelectCity}
      />
    </>
  );
}

export default function Step6Location({
  payload,
  onChange,
  fieldErrors,
  showErrors = false,
  disabled = false,
}: Step6LocationProps) {
  const { t } = useTranslation();
  const picker = useLocationPicker(payload);
  // Like Car: a field's error shows once the seller has touched it, and every
  // error shows after the first Continue tap.
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const markTouched = (field: string) =>
    setTouchedFields((current) => (current[field] ? current : { ...current, [field]: true }));
  const visibleError = (field: string) =>
    showErrors || touchedFields[field] ? fieldErrors?.[field] : undefined;

  return (
    <View className="gap-5 py-5">
      <DescriptionField
        payload={payload}
        onChange={(updates) => {
          markTouched("description");
          onChange(updates);
        }}
        onBlur={() => markTouched("description")}
        error={visibleError("description")}
        disabled={disabled}
      />

      <PickerRow
        label={t("region")}
        required
        value={picker.selectedRegion?.name}
        placeholder={t("selectRegion")}
        disabled={disabled}
        locked={disabled}
        error={visibleError("regionId")}
        onPress={() => {
          markTouched("regionId");
          picker.setRegionOpen(true);
        }}
      />

      <PickerRow
        label={t("city")}
        required
        value={picker.selectedCity?.name}
        placeholder={t("selectCity")}
        disabled={disabled || !payload.regionId}
        locked={disabled}
        error={visibleError("cityId")}
        onPress={() => {
          markTouched("cityId");
          picker.setCityOpen(true);
        }}
      />

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-foreground">
          {t("area")}
        </Text>
        {wrapDisabled(
          <View className="relative">
            <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
              <Icon as={MapPin} className="size-4 text-muted-foreground" />
            </View>
            <Input
              value={payload.locationText ?? ""}
              onChangeText={(text) => {
                markTouched("locationText");
                onChange({ locationText: text || undefined });
              }}
              placeholder={t("areaPlaceholder")}
              editable={!disabled}
              className="pl-10"
            />
          </View>,
          disabled,
        )}
        {visibleError("locationText") && (
          <Text className="text-sm text-destructive" accessibilityLiveRegion="polite">
            {visibleError("locationText")}
          </Text>
        )}
      </View>

      <Text className="text-sm text-muted-foreground leading-relaxed">
        {t("thisIsHowBuyersSee")}
      </Text>

      <LocationSheets payload={payload} picker={picker} onChange={onChange} />
    </View>
  );
}
