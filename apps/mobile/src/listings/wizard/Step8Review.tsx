import { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { Check, AlertCircle, Eye, ListChecks } from "lucide-react-native";
import { WizardSchemas, type ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { useBrands } from "../../api/catalog/useBrands";
import { useModels } from "../../api/catalog/useModels";
import { useColors } from "../../api/catalog/useColors";
import { useBodyTypes } from "../../api/catalog/useBodyTypes";
import { useTransmissions } from "../../api/catalog/useTransmissions";
import { useDriveTypes } from "../../api/catalog/useDriveTypes";
import { useEngineTypes } from "../../api/catalog/useEngineTypes";
import { useRegions } from "../../api/catalog/useRegions";
import { useCities } from "../../api/catalog/useCities";
import type { StagedPhoto } from "../uploadStaging/types";
import { getPhotoUri } from "../uploadStaging/photoUri";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";

interface Step8ReviewProps {
  payload: WizardSchemas.WizardDraftPayload;
  validatedSteps: WizardSchemas.WizardStep[];
  onGoToStep: (step: WizardSchemas.WizardStep) => void;
  photos: StagedPhoto[];
}

function useStepLabels() {
  const { t } = useTranslation();
  return Object.fromEntries(
    WizardSchemas.WIZARD_STEPS.map((step) => [step, t(`wizardSteps.${step}`)]),
  ) as Record<WizardSchemas.WizardStep, string>;
}

type ViewMode = "checklist" | "preview";

export default function Step8Review({
  payload,
  validatedSteps,
  onGoToStep,
  photos,
}: Step8ReviewProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>("checklist");
  const STEP_LABELS = useStepLabels();

  const { data: brandsData } = useBrands();
  const { data: modelsData } = useModels(payload.brandId ?? "");
  const { data: colorsData } = useColors();
  const { data: bodyTypesData } = useBodyTypes();
  const { data: transmissionsData } = useTransmissions();
  const { data: driveTypesData } = useDriveTypes();
  const { data: engineTypesData } = useEngineTypes();
  const { data: regionsData } = useRegions();
  const { data: citiesData } = useCities(payload.regionId ?? "");

  const brandName = brandsData?.items.find((b) => b.id === payload.brandId)?.name;
  const modelName = modelsData?.items.find((m) => m.id === payload.modelId)?.name;
  const colorName = colorsData?.items.find((c) => c.id === payload.colorId)?.name;
  const colorHex = colorsData?.items.find((c) => c.id === payload.colorId)?.hex;
  const bodyTypeName = bodyTypesData?.items.find((b) => b.id === payload.bodyTypeId)?.name;
  const transmissionName = transmissionsData?.items.find((t) => t.id === payload.transmissionId)?.name;
  const driveTypeName = driveTypesData?.items.find((d) => d.id === payload.driveTypeId)?.name;
  const engineTypeName = engineTypesData?.items.find((e) => e.id === payload.engineTypeId)?.name;
  const regionName = regionsData?.items.find((r) => r.id === payload.regionId)?.name;
  const cityName = citiesData?.items.find((c) => c.id === payload.cityId)?.name;

  const uploadedPhotos = photos.filter((p) => p.key);
  const hasPhotos = uploadedPhotos.length > 0;

  return (
    <View className="gap-4 py-5">
      {/* Toggle */}
      <View className="flex-row rounded-lg bg-muted p-1">
        <Pressable
          onPress={() => setViewMode("checklist")}
          accessibilityRole="button"
          accessibilityState={{ selected: viewMode === "checklist" }}
          // Keep the class shape stable between states: toggling a CSS-var
          // class (e.g. shadow-sm) onto a mounted component triggers a
          // css-interop upgrade that crashes the app in dev.
          className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-md border py-2 ${
            viewMode === "checklist"
              ? "border-border bg-card"
              : "border-transparent bg-transparent"
          }`}
        >
          <Icon as={ListChecks} className={`size-4 ${viewMode === "checklist" ? "text-foreground" : "text-muted-foreground"}`} />
          <Text className={`text-sm font-medium ${viewMode === "checklist" ? "text-foreground" : "text-muted-foreground"}`}>
            {t("checklist")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setViewMode("preview")}
          accessibilityRole="button"
          accessibilityState={{ selected: viewMode === "preview" }}
          className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-md border py-2 ${
            viewMode === "preview"
              ? "border-border bg-card"
              : "border-transparent bg-transparent"
          }`}
        >
          <Icon as={Eye} className={`size-4 ${viewMode === "preview" ? "text-foreground" : "text-muted-foreground"}`} />
          <Text className={`text-sm font-medium ${viewMode === "preview" ? "text-foreground" : "text-muted-foreground"}`}>
            {t("preview")}
          </Text>
        </Pressable>
      </View>

      {viewMode === "checklist" ? (
        <ChecklistView
          payload={payload}
          validatedSteps={validatedSteps}
          onGoToStep={onGoToStep}
          uploadedPhotos={uploadedPhotos}
          brandName={brandName}
          modelName={modelName}
          colorName={colorName}
          bodyTypeName={bodyTypeName}
          transmissionName={transmissionName}
          driveTypeName={driveTypeName}
          engineTypeName={engineTypeName}
          regionName={regionName}
          cityName={cityName}
          stepLabels={STEP_LABELS}
        />
      ) : (
        <PreviewView
          payload={payload}
          brandName={brandName}
          modelName={modelName}
          colorName={colorName}
          colorHex={colorHex}
          bodyTypeName={bodyTypeName}
          transmissionName={transmissionName}
          driveTypeName={driveTypeName}
          engineTypeName={engineTypeName}
          regionName={regionName}
          cityName={cityName}
          uploadedPhotos={uploadedPhotos}
          hasPhotos={hasPhotos}
        />
      )}
    </View>
  );
}

function ChecklistView({
  payload,
  validatedSteps,
  onGoToStep,
  uploadedPhotos,
  brandName,
  modelName,
  colorName,
  bodyTypeName,
  transmissionName,
  driveTypeName,
  engineTypeName,
  regionName,
  cityName,
  stepLabels,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  validatedSteps: WizardSchemas.WizardStep[];
  onGoToStep: (step: WizardSchemas.WizardStep) => void;
  uploadedPhotos: StagedPhoto[];
  brandName?: string;
  modelName?: string;
  colorName?: string;
  bodyTypeName?: string;
  transmissionName?: string;
  driveTypeName?: string;
  engineTypeName?: string;
  regionName?: string;
  cityName?: string;
  stepLabels: Record<WizardSchemas.WizardStep, string>;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-4">
      {/* Vehicle */}
      <ReviewSection
        title={stepLabels.vehicle}
        isValid={validatedSteps.includes("vehicle")}
        onEdit={() => onGoToStep("vehicle")}
      >
        <Text className="text-sm text-foreground">
          {brandName && modelName ? `${payload.year} ${brandName} ${modelName}` : t("notSet")}
        </Text>
        {payload.generationId && (
          <Text className="text-sm text-muted-foreground">{t("generation")}: {payload.generationId}</Text>
        )}
        {payload.vin && (
          <Text className="text-sm text-muted-foreground">{t("vin")}: {payload.vin}</Text>
        )}
      </ReviewSection>

      {/* Specs */}
      <ReviewSection
        title={stepLabels.specs}
        isValid={validatedSteps.includes("specs")}
        onEdit={() => onGoToStep("specs")}
      >
        <Text className="text-sm text-foreground">
          {payload.condition === "new" ? t("new") : `${t("used")}, ${payload.mileageKm?.toLocaleString()} ${t("km")}`}
        </Text>
        {colorName && (
          <Text className="text-sm text-muted-foreground">{t("color")}: {colorName}</Text>
        )}
        {bodyTypeName && (
          <Text className="text-sm text-muted-foreground">{t("bodyType")}: {bodyTypeName}</Text>
        )}
        {transmissionName && (
          <Text className="text-sm text-muted-foreground">{t("transmission")}: {transmissionName}</Text>
        )}
        {driveTypeName && (
          <Text className="text-sm text-muted-foreground">{t("driveType")}: {driveTypeName}</Text>
        )}
        {engineTypeName && (
          <Text className="text-sm text-muted-foreground">{t("engineType")}: {engineTypeName}</Text>
        )}
        {payload.enginePower && (
          <Text className="text-sm text-muted-foreground">{t("enginePower")}: {payload.enginePower} {t("hp")}</Text>
        )}
        {payload.conditionDisclosure && (
          <ConditionDisclosureSummary disclosure={payload.conditionDisclosure} />
        )}
      </ReviewSection>

      {/* Photos */}
      <ReviewSection
        title={stepLabels.photos}
        isValid={validatedSteps.includes("photos")}
        onEdit={() => onGoToStep("photos")}
      >
        <Text className="text-sm text-foreground">
          {t("photosUploadedCount", { count: uploadedPhotos.length })}
        </Text>
      </ReviewSection>

      {/* Price */}
      <ReviewSection
        title={stepLabels.price}
        isValid={validatedSteps.includes("price")}
        onEdit={() => onGoToStep("price")}
      >
        <Text className="text-sm text-foreground">
          {payload.priceAmount?.toLocaleString()} {payload.priceCurrency}
        </Text>
        {payload.acceptsExchange && (
          <Text className="text-sm text-muted-foreground">{t("exchangePossible")}</Text>
        )}
        {payload.installmentAvailable && (
          <Text className="text-sm text-muted-foreground">{t("installmentAvailableLabel")}</Text>
        )}
      </ReviewSection>

      {/* Location */}
      <ReviewSection
        title={stepLabels.location}
        isValid={validatedSteps.includes("location")}
        onEdit={() => onGoToStep("location")}
      >
        <Text className="text-sm text-foreground" numberOfLines={2}>
          {payload.description || t("noDescription")}
        </Text>
        <Text className="text-sm text-foreground">
          {regionName && cityName ? `${regionName}, ${cityName}` : t("notSet")}
        </Text>
        {payload.locationText && (
          <Text className="text-sm text-muted-foreground">{payload.locationText}</Text>
        )}
      </ReviewSection>

      {/* Contact */}
      <ReviewSection
        title={stepLabels.contact}
        isValid={validatedSteps.includes("contact")}
        onEdit={() => onGoToStep("contact")}
      >
        <Text className="text-sm text-muted-foreground">
          {payload.allowCalls ? t("callsAllowed") : t("noCalls")} ·{" "}
          {payload.allowChat ? t("chatAllowed") : t("noChat")}
        </Text>
        {payload.contactPhone && (
          <Text className="text-sm text-muted-foreground">
            {t("phone")}: {payload.contactPhone}
          </Text>
        )}
      </ReviewSection>
    </View>
  );
}

function PreviewView({
  payload,
  brandName,
  modelName,
  colorName,
  colorHex,
  bodyTypeName,
  transmissionName,
  driveTypeName,
  engineTypeName,
  regionName,
  cityName,
  uploadedPhotos,
  hasPhotos,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  brandName?: string;
  modelName?: string;
  colorName?: string;
  colorHex?: string | null;
  bodyTypeName?: string;
  transmissionName?: string;
  driveTypeName?: string;
  engineTypeName?: string;
  regionName?: string;
  cityName?: string;
  uploadedPhotos: StagedPhoto[];
  hasPhotos: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-4">
      {/* Photo carousel */}
      <View className="rounded-xl overflow-hidden bg-muted">
        {hasPhotos && uploadedPhotos[0] && getPhotoUri(uploadedPhotos[0], "detail") ? (
          // expo-image is not bridged with cssInterop — className is silently
          // dropped, so sizing must go through the style prop.
          <Image
            source={{ uri: getPhotoUri(uploadedPhotos[0], "detail") }}
            style={{ width: "100%", aspectRatio: 4 / 3 }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View className="w-full aspect-[4/3] items-center justify-center bg-muted">
            <Icon as={AlertCircle} className="size-8 text-muted-foreground" />
            <Text className="mt-2 text-sm text-muted-foreground">{t("noPhotos")}</Text>
          </View>
        )}
        {uploadedPhotos.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="py-2 px-2">
            <View className="flex-row gap-2">
              {uploadedPhotos.slice(1).map((photo) => {
                const uri = getPhotoUri(photo, "thumbnail");
                return uri ? (
                  <Image
                    key={photo.photoId}
                    source={{ uri }}
                    style={{ width: 64, height: 64, borderRadius: 8 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : null;
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Title + Price */}
      <View className="gap-2">
        <Text className="text-2xl font-heading text-foreground">
          {brandName && modelName
            ? `${payload.year} ${brandName} ${modelName}`
            : t("vehicleNotSpecified")}
        </Text>
        <Text className="text-xl font-semibold text-primary">
          {payload.priceAmount
            ? `${payload.priceAmount.toLocaleString()} ${payload.priceCurrency}`
            : t("priceNotSet")}
        </Text>
      </View>

      {/* Location */}
      <View className="flex-row items-center gap-1.5">
        <Text className="text-sm text-muted-foreground">
          {regionName && cityName ? `${regionName}, ${cityName}` : t("locationNotSet")}
        </Text>
        {payload.locationText && (
          <Text className="text-sm text-muted-foreground">· {payload.locationText}</Text>
        )}
      </View>

      {/* Specs grid */}
      <View className="rounded-xl border border-border p-4 gap-3">
        <Text className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t("specs")}
        </Text>
        <View className="flex-row flex-wrap">
          <SpecItem label={t("condition")} value={payload.condition === "new" ? t("new") : t("used")} />
          {payload.mileageKm !== undefined && payload.mileageKm !== null && (
            <SpecItem label={t("mileage")} value={`${payload.mileageKm.toLocaleString()} ${t("km")}`} />
          )}
          {colorName && <SpecItem label={t("color")} value={colorName} colorHex={colorHex} />}
          {bodyTypeName && <SpecItem label={t("bodyType")} value={bodyTypeName} />}
          {transmissionName && <SpecItem label={t("transmission")} value={transmissionName} />}
          {driveTypeName && <SpecItem label={t("driveType")} value={driveTypeName} />}
          {engineTypeName && <SpecItem label={t("engineType")} value={engineTypeName} />}
          {payload.enginePower && <SpecItem label={t("enginePower")} value={`${payload.enginePower} ${t("hp")}`} />}
        </View>
      </View>

      {/* Condition disclosure */}
      {payload.conditionDisclosure && (
        <View className="rounded-xl border border-border p-4 gap-3">
          <Text className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("conditionDisclosure")}
          </Text>
          <ConditionDisclosureSummary disclosure={payload.conditionDisclosure} />
        </View>
      )}

      {/* Description */}
      {payload.description && (
        <View className="rounded-xl border border-border p-4 gap-2">
          <Text className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("description")}
          </Text>
          <Text className="text-sm text-foreground leading-relaxed">
            {payload.description}
          </Text>
        </View>
      )}

      {/* Contact */}
      <View className="rounded-xl border border-border p-4 gap-2">
        <Text className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t("contact")}
        </Text>
        <Text className="text-sm text-foreground">
          {payload.allowCalls ? t("callsAllowed") : t("noCalls")}
        </Text>
        {payload.contactPhone && (
          <Text className="text-sm text-muted-foreground">{payload.contactPhone}</Text>
        )}
      </View>

      {/* Terms */}
      {(payload.acceptsExchange || payload.installmentAvailable) && (
        <View className="flex-row gap-2 flex-wrap">
          {payload.acceptsExchange && (
            <View className="rounded-full bg-muted px-3 py-1">
              <Text className="text-xs font-medium text-foreground">{t("exchangePossible")}</Text>
            </View>
          )}
          {payload.installmentAvailable && (
            <View className="rounded-full bg-muted px-3 py-1">
              <Text className="text-xs font-medium text-foreground">{t("installment")}</Text>
            </View>
          )}
        </View>
      )}

      <Text className="text-xs text-muted-foreground text-center py-2">
        {t("thisIsHowBuyersSee")}
      </Text>
    </View>
  );
}

function SpecItem({
  label,
  value,
  colorHex,
}: {
  label: string;
  value: string;
  colorHex?: string | null;
}) {
  return (
    <View className="w-1/2 py-2 pr-4">
      <Text className="text-xs text-muted-foreground mb-0.5">{label}</Text>
      <View className="flex-row items-center gap-1.5">
        {colorHex && (
          <View
            className="h-4 w-4 rounded-full border border-border"
            style={{ backgroundColor: colorHex }}
          />
        )}
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function ReviewSection({
  title,
  isValid,
  onEdit,
  children,
}: {
  title: string;
  isValid: boolean;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View className="rounded-xl border border-border p-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {isValid ? (
            <Icon as={Check} className="size-4 text-success-500" />
          ) : (
            <Icon as={AlertCircle} className="size-4 text-destructive" />
          )}
          <Text className="text-sm font-medium text-foreground">{title}</Text>
        </View>
        <Button variant="ghost" size="sm" onPress={onEdit} accessibilityLabel={`${t("edit")} ${title}`}>
          <Text className="text-sm text-primary font-medium">{t("edit")}</Text>
        </Button>
      </View>
      <View className="mt-2 gap-0.5 pl-6">{children}</View>
    </View>
  );
}

function ConditionDisclosureSummary({
  disclosure,
}: {
  disclosure: ListingsSchemas.DraftConditionDisclosure;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-1">
      {disclosure.damaged !== undefined && (
        <Text className="text-sm text-foreground">
          {t("damaged")}: {disclosure.damaged ? t("yes") : t("no")}
        </Text>
      )}
      {disclosure.knownIssuesText && (
        <Text className="text-sm text-foreground" numberOfLines={2}>
          {t("knownIssuesText")}: {disclosure.knownIssuesText}
        </Text>
      )}
    </View>
  );
}
