import { Redirect, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { readPickerResultsFilters } from "../../../src/listings/search/resultsRouteState";
import { ModelPicker } from "../../../src/listings/search/ModelPicker";
import { BRANDS_PATH } from "../../../src/listings/search/pickerActions";
import { useRoutePickerActions } from "../../../src/listings/search/useRoutePickerActions";
import { useSafeBack } from "../../../src/navigation/useSafeBack";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/**
 * Model picker for one brand (`brandId`), optionally with models already
 * ticked (`modelIds`, comma-separated). Ends with "Show N listings" and
 * "More filters"; "Change brand" returns to the Brand picker.
 */
export default function ModelPickerScreen() {
  const { t } = useTranslation();
  const goBack = useSafeBack(BRANDS_PATH);
  const actions = useRoutePickerActions();
  const params = useLocalSearchParams<{ brandId?: string; modelIds?: string; returnToResults?: string; resultsState?: string }>();
  const brandId = params.brandId ?? "";
  const modelIdsParam = params.modelIds ?? "";
  const initialModelIds = useMemo(
    () => modelIdsParam.split(",").filter(Boolean),
    [modelIdsParam],
  );

  // A link without a brand has nothing to list: pick the brand first.
  if (!brandId) return <Redirect href={BRANDS_PATH} />;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]} style={{ paddingBottom: tabBarSpace }}>
      <ModelPicker
        key={brandId}
        actions={actions}
        brandId={brandId}
        initialModelIds={initialModelIds}
        filters={readPickerResultsFilters(params)}
        leading={
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onPress={goBack}
            accessibilityLabel={t("back")}
          >
            <Icon as={ChevronLeft} className="size-6 text-foreground" />
          </Button>
        }
      />
    </SafeAreaView>
  );
}
