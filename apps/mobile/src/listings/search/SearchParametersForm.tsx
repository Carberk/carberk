import { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, ScrollView, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { useBrands } from "../../api/catalog/useBrands";
import { useModels } from "../../api/catalog/useModels";
import { useListingCount } from "../../api/listings/useListingCount";

import { showResultsCount } from "./showResultsCount";
import { BrandPicker } from "./BrandPicker";
import { CityFilterControl } from "./CityFilterControl";
import { SellerTypeFilterControl } from "./SellerTypeFilterControl";
import { ConditionFilterControl } from "./ConditionFilterControl";
import { FilterLabel } from "./FilterSection";
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
import { GlassButton } from "@/components/ui/glass-button";
import { GroupedList } from "@/components/ui/grouped-list";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { BackButton, HeaderTextAction, StackHeader } from "@/components/navigation/StackHeader";
import { StickyActionBar, useStickyActionBar } from "@/components/navigation/StickyActionBar";
import { TabScreen } from "@/components/navigation/TabScreen";
import { useKeepFocusedInputVisible } from "@/components/navigation/useKeepFocusedInputVisible";

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
  const { t, i18n } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const { draft, setField, reset, isValid } = useListingFilters(initial);
  const [priceRangeValid, setPriceRangeValid] = useState(true);
  const [cityResetVersion, setCityResetVersion] = useState(0);
  const [step, setStep] = useState<DonePickerStep | null>(null);
  const record = useRecentChoicesStore((s) => s.record);
  const bar = useStickyActionBar();
  // The Show bar floats over the form; a field typed in must stay above it.
  const scrollRef = useRef<ScrollView>(null);
  const keepFieldVisible = useKeepFocusedInputVisible(scrollRef, bar.space);

  const countEnabled = isValid && priceRangeValid;
  const count = useListingCount({ filters: draft, enabled: countEnabled });
  const showCountError = countEnabled && count.isError && count.data === undefined;

  let showLabel = t("showResults");
  if (countEnabled && count.data !== undefined) {
    showLabel = showResultsCount(t, i18n.resolvedLanguage ?? i18n.language, count.data.totalMatching);
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
    <BackButton kind="close" onPress={() => setStep(null)} accessibilityLabel={t("close")} />
  );

  return (
    <TabScreen edgeFade={false}>
      {/* Android is edge to edge, so the window no longer resizes for the keyboard: both platforms pad. */}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <StackHeader
          title={t("searchParameters")}
          leading={<BackButton onPress={onBack} accessibilityLabel={t("back")} />}
          trailing={
            <HeaderTextAction
              label={t("reset")}
              accessibilityLabel={t("reset")}
              onPress={() => {
                reset();
                setCityResetVersion((version) => version + 1);
              }}
            />
          }
        />

        {/* The form runs under the bar; the bar rides up with the keyboard. */}
        <View className="min-h-0 flex-1">
        <ScrollView
          ref={scrollRef}
          {...keepFieldVisible}
          className="min-h-0 flex-1"
          contentContainerClassName="gap-6 px-4 pt-2"
          contentContainerStyle={{ paddingBottom: bar.space + 8 }}
          keyboardShouldPersistTaps="handled"
        >
          <ConditionFilterControl value={draft.condition} onChange={(value) => setField("condition", value)} />
          <SellerTypeFilterControl value={draft.sellerType} onChange={(value) => setField("sellerType", value)} />
          <CityFilterControl key={cityResetVersion} draft={draft} setField={setField} />
          <View className="gap-2">
          <FilterLabel>{t("brandModel")}</FilterLabel>
          <GroupedList inset="text" className="mx-0">
          <PickerRow
            grouped
            label={t("brand")}
            value={selectedBrand?.name}
            placeholder={t("selectBrand")}
            onPress={() => setStep({ step: "brand" })}
          />
          <PickerRow
            grouped
            label={t("model")}
            value={modelRowValue}
            placeholder={t("selectModel")}
            disabled={!draft.brandId}
            onPress={() => {
              if (!draft.brandId) return;
              setStep({ step: "model", brand: { id: draft.brandId, name: selectedBrand?.name ?? "" } });
            }}
          />
          </GroupedList>
          </View>
          <YearRangeFilterControl draft={draft} setField={setField} />
          <PriceRangeFilterControl
            priceMin={draft.priceMin}
            priceMax={draft.priceMax}
            setField={setField}
            onValidityChange={setPriceRangeValid}
          />
        </ScrollView>

        <StickyActionBar {...bar.barProps} edgeFade>
          {!countEnabled ? (
            <Text className="px-2 pt-1 text-center text-callout text-destructive">{t("checkFilterValues")}</Text>
          ) : null}
          {showCountError ? (
            <View accessibilityRole="alert" className="gap-1">
              <Text className="px-2 pt-1 text-center text-callout text-destructive">{t("failedToLoadListingCount")}</Text>
              <Button variant="ghost" onPress={() => void count.refetch()}>
                <Text>{t("retry")}</Text>
              </Button>
            </View>
          ) : null}
          <GlassButton
            tone="brand"
            disabled={!countEnabled}
            onPress={show}
            accessibilityLabel={showLabel}
          >
            <Text numberOfLines={1}>{showLabel}</Text>
          </GlassButton>
        </StickyActionBar>
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
              barContainer="screen"
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </TabScreen>
  );
}
