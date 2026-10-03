import { useState } from "react";
import { View } from "react-native";
import type { WizardSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { useBrands } from "../../api/catalog/useBrands";
import { useGenerations } from "../../api/catalog/useGenerations";
import { useModels } from "../../api/catalog/useModels";


import {
  shouldShowVehicleFieldError,
  type VehicleField,
} from "./vehicleFieldErrorVisibility";
import { VinField } from "./VinField";

import { CatalogPickerSheet } from "@/components/listings/wizard/CatalogPickerSheet";
import { PickerRow } from "@/components/listings/wizard/PickerRow";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";


interface Step3VehicleIdProps {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  fieldErrors?: Record<string, string>;
  disabled?: boolean;
  showErrors?: boolean;
}

function useVehiclePicker(
  payload: WizardSchemas.WizardDraftPayload,
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void,
  setTouchedFields: React.Dispatch<
    React.SetStateAction<Partial<Record<VehicleField, boolean>>>
  >,
) {
  const [brandOpen, setBrandOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [generationOpen, setGenerationOpen] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [generationSearch, setGenerationSearch] = useState("");

  const {
    data: brandsData,
    isPending: brandsLoading,
    isError: brandsError,
  } = useBrands();
  const {
    data: modelsData,
    isPending: modelsLoading,
    isError: modelsError,
  } = useModels(payload.brandId ?? "");
  const {
    data: generationsData,
    isPending: generationsLoading,
    isError: generationsError,
  } = useGenerations(payload.modelId ?? "");

  const filteredBrands = filterBySearch(brandsData?.items ?? [], brandSearch);
  const filteredModels = filterBySearch(modelsData?.items ?? [], modelSearch);
  const filteredGenerations = filterBySearch(
    generationsData?.items ?? [],
    generationSearch,
  );

  const selectedBrand = findById(brandsData?.items ?? [], payload.brandId);
  const selectedModel = findById(modelsData?.items ?? [], payload.modelId);
  const selectedGeneration = findById(
    generationsData?.items ?? [],
    payload.generationId,
  );

  const generationHelper = computeGenerationHelper(
    payload.modelId,
    generationsLoading,
    generationsError,
    generationsData?.items.length ?? 0,
  );

  function markTouched(field: VehicleField) {
    setTouchedFields((current) =>
      current[field] ? current : { ...current, [field]: true },
    );
  }

  function handleSelectBrand(brandId: string) {
    markTouched("brandId");
    onChange({ brandId, modelId: undefined, generationId: undefined });
    setBrandOpen(false);
    setBrandSearch("");
  }

  function handleSelectModel(modelId: string) {
    markTouched("modelId");
    onChange({ modelId, generationId: undefined });
    setModelOpen(false);
    setModelSearch("");
  }

  function handleSelectGeneration(generationId: string) {
    onChange({ generationId });
    setGenerationOpen(false);
    setGenerationSearch("");
  }

  return {
    brandOpen,
    setBrandOpen,
    modelOpen,
    setModelOpen,
    generationOpen,
    setGenerationOpen,
    brandSearch,
    setBrandSearch,
    modelSearch,
    setModelSearch,
    generationSearch,
    setGenerationSearch,
    filteredBrands,
    filteredModels,
    filteredGenerations,
    selectedBrand,
    selectedModel,
    selectedGeneration,
    brandsLoading,
    brandsError,
    modelsLoading,
    modelsError,
    generationsLoading,
    generationsError,
    generationHelper,
    markTouched,
    handleSelectBrand,
    handleSelectModel,
    handleSelectGeneration,
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

function computeGenerationHelper(
  modelId: string | undefined,
  generationsLoading: boolean,
  generationsError: boolean,
  generationCount: number,
) {
  const { t } = useTranslation();
  if (!modelId) return t("selectBrandFirst");
  if (!generationsLoading && !generationsError && generationCount === 0) {
    return t("noGenerationsAvailable");
  }
  return undefined;
}

function YearInput({
  payload,
  onChange,
  disabled,
  markTouched,
  fieldErrors,
  showErrors,
  touchedFields,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  disabled: boolean;
  markTouched: (field: VehicleField) => void;
  fieldErrors?: Record<string, string>;
  showErrors: boolean;
  touchedFields: Partial<Record<VehicleField, boolean>>;
}) {
  const { t } = useTranslation();
  const [yearText, setYearText] = useState(payload.year?.toString() ?? "");

  function handleYearChange(text: string) {
    markTouched("year");
    const digits = text.replace(/\D/g, "").slice(0, 4);
    setYearText(digits);
    if (digits.length === 0) {
      onChange({ year: undefined });
      return;
    }
    if (digits.length === 4) {
      const num = parseInt(digits, 10);
      if (num >= 1900 && num <= 2100) {
        onChange({ year: num });
      }
    }
  }

  const yearError = fieldErrors?.year;
  const showYearError = shouldShowVehicleFieldError({
    field: "year",
    showAllErrors: showErrors,
    touchedFields,
  });

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{t("year")} *</Text>
      <View className={disabled ? "opacity-50" : undefined}>
        <Input
          value={yearText}
          onChangeText={handleYearChange}
          placeholder={t("yearPlaceholder")}
          keyboardType="number-pad"
          editable={!disabled}
          maxLength={4}
          accessibilityState={{ disabled }}
        />
      </View>
      {yearError && showYearError && (
        <Text className="text-sm text-destructive">{yearError}</Text>
      )}
      {disabled && (
        <Text className="text-sm text-muted-foreground">
          {t("thisFieldCannotBeChanged")}
        </Text>
      )}
    </View>
  );
}

function VehicleIdSheets({
  payload,
  picker,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  picker: ReturnType<typeof useVehiclePicker>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <CatalogPickerSheet
        open={picker.brandOpen}
        onOpenChange={(open) => {
          picker.setBrandOpen(open);
          if (!open) picker.setBrandSearch("");
        }}
        title={t("selectBrand")}
        searchPlaceholder={t("searchPlaceholder")}
        search={picker.brandSearch}
        onSearchChange={picker.setBrandSearch}
        items={picker.filteredBrands}
        selectedId={payload.brandId}
        emptyMessage={
          picker.brandSearch
            ? t("noBrandsMatch")
            : t("noBrandsAvailable")
        }
        isLoading={picker.brandsLoading}
        isError={picker.brandsError}
        onSelect={picker.handleSelectBrand}
      />

      <CatalogPickerSheet
        open={picker.modelOpen}
        onOpenChange={(open) => {
          picker.setModelOpen(open);
          if (!open) picker.setModelSearch("");
        }}
        title={t("selectModel")}
        searchPlaceholder={t("searchPlaceholder")}
        search={picker.modelSearch}
        onSearchChange={picker.setModelSearch}
        items={picker.filteredModels}
        selectedId={payload.modelId}
        emptyMessage={
          picker.modelSearch
            ? t("noModelsMatch")
            : t("noModelsAvailable")
        }
        isLoading={picker.modelsLoading}
        isError={picker.modelsError}
        onSelect={picker.handleSelectModel}
      />

      <CatalogPickerSheet
        open={picker.generationOpen}
        onOpenChange={(open) => {
          picker.setGenerationOpen(open);
          if (!open) picker.setGenerationSearch("");
        }}
        title={t("selectGeneration")}
        searchPlaceholder={t("searchPlaceholder")}
        search={picker.generationSearch}
        onSearchChange={picker.setGenerationSearch}
        items={picker.filteredGenerations}
        selectedId={payload.generationId}
        emptyMessage={
          picker.generationSearch
            ? t("noGenerationsMatch")
            : t("noGenerationsAvailable")
        }
        isLoading={picker.generationsLoading}
        isError={picker.generationsError}
        onSelect={picker.handleSelectGeneration}
      />
    </>
  );
}

export default function Step3VehicleId({
  payload,
  onChange,
  fieldErrors,
  disabled = false,
  showErrors = false,
}: Step3VehicleIdProps) {
  const { t } = useTranslation();
  const [touchedFields, setTouchedFields] = useState<
    Partial<Record<VehicleField, boolean>>
  >({});

  const picker = useVehiclePicker(payload, onChange, setTouchedFields);

  const visibleError = (field: VehicleField) =>
    shouldShowVehicleFieldError({
      field,
      showAllErrors: showErrors,
      touchedFields,
    })
      ? fieldErrors?.[field]
      : undefined;

  return (
    <View className="gap-5 py-5">
      <PickerRow
        label={t("brand")}
        required
        value={picker.selectedBrand?.name}
        placeholder={t("selectBrand")}
        disabled={disabled}
        locked={disabled}
        error={visibleError("brandId")}
        onPress={() => {
          picker.markTouched("brandId");
          picker.setBrandOpen(true);
        }}
      />

      <PickerRow
        label={t("model")}
        required
        value={picker.selectedModel?.name}
        placeholder={t("selectModel")}
        disabled={disabled || !payload.brandId}
        locked={disabled}
        error={visibleError("modelId")}
        onPress={() => {
          picker.markTouched("modelId");
          picker.setModelOpen(true);
        }}
      />

      <PickerRow
        label={t("generation")}
        value={picker.selectedGeneration?.name}
        placeholder={t("selectGeneration")}
        disabled={disabled || !payload.modelId || picker.generationsLoading}
        locked={disabled}
        helper={picker.generationHelper}
        onPress={() => picker.setGenerationOpen(true)}
      />

      <YearInput
        payload={payload}
        onChange={onChange}
        disabled={disabled}
        markTouched={picker.markTouched}
        fieldErrors={fieldErrors}
        showErrors={showErrors}
        touchedFields={touchedFields}
      />

      <VinField
        payload={payload}
        onChange={onChange}
        disabled={disabled}
        error={showErrors ? fieldErrors?.vin : undefined}
      />

      <VehicleIdSheets payload={payload} picker={picker} />
    </View>
  );
}
