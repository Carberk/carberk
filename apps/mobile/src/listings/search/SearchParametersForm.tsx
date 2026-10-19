import { useMemo, useState } from "react";
import { ChevronLeft, X } from "lucide-react-native";
import { KeyboardAvoidingView, Platform, ScrollView, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { useBrands } from "../../api/catalog/useBrands";
import { useModels } from "../../api/catalog/useModels";
import { useListingCount } from "../../api/listings/useListingCount";

import { BrandPicker } from "./BrandPicker";
import { CityFilterControl } from "./CityFilterControl";
import { ConditionFilterControl } from "./ConditionFilterControl";
import { ModelPicker } from "./ModelPicker";
import { PriceRangeFilterControl } from "./PriceRangeFilterControl";
import { YearRangeFilterControl } from "./YearRangeFilterControl";
import {
  choiceFormFields,
  createDonePickerActions,
  showResultsFromParameters,
  type DonePickerStep,
} from "./pickerActions";
import { useRecentChoicesStore } from "./recentSearches";
import { useApplyFilterChoice } from "./useApplyFilterChoice";
import { useListingFilters, type ListingFilter } from "./useListingFilters";
import { pickerRouter } from "./useRoutePickerActions";

import { PickerRow } from "@/components/listings/wizard/PickerRow";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";

interface SearchParametersFormProps {
  /** The filters the form opens with: what Results is showing, the Model picker's choice, or none from Search's All filters. */
  initial: ListingFilter;
  /** True when a Results screen sits below this form, so Show N updates it in place. */
  returnToResults: boolean;
  /** Back discards unapplied edits. */
  onBack: () => void;
}

/**
 * Search parameters (33 — Search & discovery): the full-screen form for
 * condition, city, brand, model, year and price, with a sticky "Show N
 * listings". Edits live in the form's own draft; only Show N applies them,
 * so Back leaves Results untouched. Brand and Model open the pickers in Done
 * mode, which hand the choice back to the form.
 */
export function SearchParametersForm({ initial, returnToResults, onBack }: SearchParametersFormProps) {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const { draft, setField, reset, isValid } = useListingFilters(initial);
  const [priceRangeValid, setPriceRangeValid] = useState(true);
  const [cityResetVersion, setCityResetVersion] = useState(0);
  const [step, setStep] = useState<DonePickerStep | null>(null);
  const record = useRecentChoicesStore((s) => s.record);

  const countEnabled = isValid && priceRangeValid;
  const count = useListingCount({ filters: draft, enabled: countEnabled });
  const showCountError = countEnabled && count.isError && count.data === undefined;

  let showLabel = t("showResults");
  if (countEnabled && count.data !== undefined) {
    showLabel = t("showResultsCount", { count: count.data.totalMatching });
  } else if (countEnabled && !showCountError) {
    showLabel = t("loadingEllipsis");
  }

  const show = useApplyFilterChoice(draft, () => showResultsFromParameters(pickerRouter, draft, returnToResults));

  const { data: brandsData } = useBrands();
  const { data: modelsData } = useModels(draft.brandId ?? "");
  const selectedBrand = brandsData?.items.find((brand) => brand.id === draft.brandId);
  const selectedModelNames = useMemo(
    () =>
      (draft.modelIds ?? [])
        .map((id) => modelsData?.items.find((model) => model.id === id)?.name)
        .filter((name): name is string => Boolean(name)),
    [draft.modelIds, modelsData],
  );
  let modelRowValue: string | undefined;
  if (draft.brandId && selectedModelNames.length === 1) {
    modelRowValue = selectedModelNames[0];
  } else if (draft.brandId && selectedModelNames.length > 1) {
    modelRowValue = t("modelsSelected", { count: selectedModelNames.length });
  } else if (draft.brandId) {
    modelRowValue = t("allModels");
  }

  const actions = useMemo(
    () =>
      createDonePickerActions({
        setStep,
        record: (choice) => void record(choice),
        onDone: (choice) => {
          const fields = choiceFormFields(choice);
          setField("brandId", fields.brandId);
          setField("modelId", fields.modelId);
          setField("modelIds", fields.modelIds);
          setStep(null);
        },
      }),
    [record, setField],
  );

  const closePicker = (
    <Button variant="ghost" size="icon" className="h-11 w-11" onPress={() => setStep(null)} accessibilityLabel={t("close")}>
      <Icon as={X} className="size-5 text-foreground" />
    </Button>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]} style={{ paddingBottom: tabBarSpace }}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="flex-row items-center gap-1 px-1 pt-2 pb-2">
          <Button variant="ghost" size="icon" className="h-11 w-11" onPress={onBack} accessibilityLabel={t("back")}>
            <Icon as={ChevronLeft} className="size-6 text-foreground" />
          </Button>
          <Text className="min-w-0 flex-1 font-heading text-2xl text-foreground" numberOfLines={1}>
            {t("searchParameters")}
          </Text>
          <Button variant="ghost" className="h-11 px-3 py-0" onPress={() => {
            reset();
            setCityResetVersion((version) => version + 1);
          }} accessibilityLabel={t("reset")}>
            <Text className="text-base font-medium text-primary">{t("reset")}</Text>
          </Button>
        </View>

        <ScrollView
          className="min-h-0 flex-1"
          contentContainerClassName="gap-4 px-4 pb-4"
          keyboardShouldPersistTaps="handled"
        >
          <ConditionFilterControl value={draft.condition} onChange={(value) => setField("condition", value)} />
          <CityFilterControl key={cityResetVersion} draft={draft} setField={setField} />
          <PickerRow
            label={t("brand")}
            value={selectedBrand?.name}
            placeholder={t("selectBrand")}
            onPress={() => setStep({ step: "brand" })}
          />
          <PickerRow
            label={t("model")}
            value={modelRowValue}
            placeholder={t("selectModel")}
            disabled={!draft.brandId}
            onPress={() => {
              if (!draft.brandId) return;
              setStep({ step: "model", brand: { id: draft.brandId, name: selectedBrand?.name ?? "" } });
            }}
          />
          <YearRangeFilterControl draft={draft} setField={setField} />
          <PriceRangeFilterControl
            priceMin={draft.priceMin}
            priceMax={draft.priceMax}
            setField={setField}
            onValidityChange={setPriceRangeValid}
          />
        </ScrollView>

        <View className="gap-2 border-t border-border px-4 pt-3 pb-4">
          {!countEnabled ? (
            <Text className="text-center text-sm text-destructive">{t("checkFilterValues")}</Text>
          ) : null}
          {showCountError ? (
            <View accessibilityRole="alert" className="gap-1">
              <Text className="text-center text-sm text-destructive">{t("failedToLoadListingCount")}</Text>
              <Button variant="ghost" onPress={() => void count.refetch()}>
                <Text>{t("retry")}</Text>
              </Button>
            </View>
          ) : null}
          <Button
            variant="brand"
            size="pill"
            disabled={!countEnabled}
            onPress={show}
            accessibilityLabel={showLabel}
          >
            <Text numberOfLines={1}>{showLabel}</Text>
          </Button>
        </View>
      </KeyboardAvoidingView>

      <Sheet open={step !== null} onOpenChange={(open) => !open && setStep(null)}>
        <SheetContent className="px-0 pb-0" style={{ height: Math.min(screenHeight * 0.92, screenHeight - 48) }}>
          {step?.step === "brand" ? (
            <BrandPicker actions={actions} filters={draft} leading={closePicker} />
          ) : step?.step === "model" ? (
            <ModelPicker
              key={step.brand.id}
              actions={actions}
              brandId={step.brand.id}
              brandName={step.brand.name || undefined}
              initialModelIds={step.brand.id === draft.brandId ? draft.modelIds : []}
              filters={draft}
              leading={closePicker}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </SafeAreaView>
  );
}
