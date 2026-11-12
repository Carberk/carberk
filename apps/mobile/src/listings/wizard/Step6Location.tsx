import { useState } from "react";
import { View } from "react-native";
import { MapPin } from "lucide-react-native";
import type { CatalogSchemas, WizardSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import {
  findCityInGroups,
  useCityGroups,
  type CityGroup,
} from "../../api/catalog/useCityGroups";

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

/** Cities whose name matches the search, keeping only the regions that still have one. */
function filterGroups(groups: CityGroup[], search: string): CityGroup[] {
  const query = search.trim().toLowerCase();
  return groups
    .map((group) => ({
      ...group,
      cities: query
        ? group.cities.filter((city) => city.name.toLowerCase().includes(query))
        : group.cities,
    }))
    .filter((group) => group.cities.length > 0);
}

function wrapDisabled(children: React.ReactNode, disabled: boolean) {
  if (!disabled) return <>{children}</>;
  return <View className="opacity-50">{children}</View>;
}

function CityPicker({
  payload,
  onChange,
  error,
  disabled,
  onOpen,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  error?: string;
  disabled: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { groups, isPending, isError } = useCityGroups();

  const selected = findCityInGroups(groups, payload.cityId);
  const regionName =
    selected && selected.region.name !== selected.city.name ? selected.region.name : undefined;

  function close() {
    setOpen(false);
    setSearch("");
  }

  function handleSelect(city: CatalogSchemas.CitySummary) {
    onChange({ cityId: city.id, regionId: city.regionId });
    close();
  }

  return (
    <>
      <PickerRow
        label={t("city")}
        required
        value={selected?.city.name}
        detail={regionName}
        placeholder={t("selectCity")}
        disabled={disabled}
        locked={disabled}
        error={error}
        onPress={() => {
          onOpen();
          setOpen(true);
        }}
      />

      <CatalogPickerSheet
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={t("selectCity")}
        searchPlaceholder={t("searchPlaceholder")}
        search={search}
        onSearchChange={setSearch}
        sections={filterGroups(groups, search).map((group) => ({
          id: group.region.id,
          title: group.region.name,
          items: group.cities,
        }))}
        selectedId={payload.cityId}
        emptyMessage={search ? t("noCitiesMatch") : t("noCitiesAvailable")}
        isLoading={isPending}
        isError={isError}
        onSelect={(cityId) => {
          const match = findCityInGroups(groups, cityId);
          if (match) handleSelect(match.city);
        }}
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
  // Like Car: a field's error shows once the seller has touched it, and every
  // error shows after the first Continue tap.
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const markTouched = (field: string) =>
    setTouchedFields((current) => (current[field] ? current : { ...current, [field]: true }));
  const visibleError = (field: string) =>
    showErrors || touchedFields[field] ? fieldErrors?.[field] : undefined;
  const areaError = visibleError("locationText");

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

      <Text accessibilityRole="header" className="border-t border-border pt-5 text-subhead font-heading font-semibold">{t("placeSection")}</Text>

      {/* Picking a city also sets its region, so the Region error is never shown on its own. */}
      <CityPicker
        payload={payload}
        onChange={onChange}
        error={visibleError("cityId")}
        disabled={disabled}
        onOpen={() => markTouched("cityId")}
      />

      <View className="gap-1.5">
        <Text className="text-callout font-medium text-foreground">
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
              accessibilityLabel={t("area")}
              maxLength={200}
              editable={!disabled}
              className="pl-10"
            />
          </View>,
          disabled,
        )}
        {areaError ? (
          <Text className="text-callout text-destructive" accessibilityLiveRegion="polite">
            {areaError}
          </Text>
        ) : (
          <Text className="text-callout text-muted-foreground">{t("areaHelper")}</Text>
        )}
      </View>
    </View>
  );
}
