import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { Camera, Lock } from "lucide-react-native";
import { Enums, WizardSchemas } from "@auto-tm/contracts";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { useBrands } from "../../api/catalog/useBrands";
import { findCityInGroups, useCityGroups } from "../../api/catalog/useCityGroups";
import { useEngineTypes } from "../../api/catalog/useEngineTypes";
import { useGenerations } from "../../api/catalog/useGenerations";
import { useModels } from "../../api/catalog/useModels";
import { useTransmissions } from "../../api/catalog/useTransmissions";
import { legalPageUrl } from "../../config/publicWebUrl";
import { localeTag, resolveLocale } from "../../i18n/resources";
import { listingSpecLine } from "../feed/listingSpecLine";
import { getPhotoUri } from "../uploadStaging/photoUri";
import type { StagedPhoto } from "../uploadStaging/types";
import { countUploads } from "../uploadStaging/uploadCounts";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

type DataStep = Exclude<WizardSchemas.WizardStep, "review">;
/** The steps that hold fields, in the wizard's order. */
const DATA_STEPS = WizardSchemas.WIZARD_STEPS.filter((step): step is DataStep => step !== "review");
const NO_PHOTOS: StagedPhoto[] = [];

export interface CheckAndPublishProps {
  payload: WizardSchemas.WizardDraftPayload;
  validatedSteps: WizardSchemas.WizardStep[];
  /** Opens a step from Check; Done on that step returns here. */
  onChangeStep: (step: WizardSchemas.WizardStep) => void;
  /** Every picked photo in order, the cover first. */
  photos: StagedPhoto[];
  /**
   * False until the upload queue holds this draft's photos. Until then `photos`
   * says nothing about the draft, so Check does not claim there are none.
   */
  photosReady?: boolean;
}

/** "Brand Model, year", as the Listing card titles it. Also heads an edit's steps. */
export function useCarTitle(payload: WizardSchemas.WizardDraftPayload): string {
  const { data: brands } = useBrands();
  const { data: models } = useModels(payload.brandId ?? "");
  const brandName = brands?.items.find((b) => b.id === payload.brandId)?.name;
  const modelName = models?.items.find((m) => m.id === payload.modelId)?.name;
  const identity = [brandName, modelName].filter(Boolean).join(" ");
  return [identity, payload.year].filter((value) => value != null && value !== "").join(", ");
}

/** The catalog names and formatted values that the preview and the section summaries share. */
function useCheckValues(payload: WizardSchemas.WizardDraftPayload) {
  const { t, i18n } = useTranslation();
  const title = useCarTitle(payload);
  const { data: transmissions } = useTransmissions();
  const { data: engineTypes } = useEngineTypes();
  const { groups: cityGroups } = useCityGroups();

  const isNew = payload.condition === Enums.ListingCondition.New;
  const specs = listingSpecLine({
    mileageKm: isNew ? null : payload.mileageKm,
    transmissionName: transmissions?.items.find((x) => x.id === payload.transmissionId)?.name,
    engineTypeName: engineTypes?.items.find((x) => x.id === payload.engineTypeId)?.name,
    locale: i18n.language,
    kmLabel: t("km"),
  });

  return {
    title,
    /** The amount in the currency the seller chose; buyers see it converted to TMT. */
    price:
      payload.priceAmount != null
        ? `${payload.priceAmount.toLocaleString(localeTag(i18n.language))} ${payload.priceCurrency ?? "TMT"}`
        : "",
    /** "New" or the mileage, then gearbox and fuel. */
    specs: [isNew ? t("new") : null, specs].filter(Boolean).join(" · "),
    cityName: findCityInGroups(cityGroups, payload.cityId)?.city.name,
  };
}

type CheckValues = ReturnType<typeof useCheckValues>;

/** The Listing card buyers will see in Results, built from the draft. */
function PreviewCard({
  values,
  photos,
  photosReady,
}: {
  values: CheckValues;
  photos: StagedPhoto[];
  photosReady: boolean;
}) {
  const { t } = useTranslation();
  const cover = photos[0];
  const coverUri = cover ? getPhotoUri(cover, "list") : undefined;

  return (
    <View testID="check-preview" className="overflow-hidden rounded-2xl border border-border bg-card">
      <View className="h-[170px] bg-muted">
        {coverUri ? (
          // expo-image takes no className, so its size goes through style.
          <Image
            testID="check-preview-cover"
            source={{ uri: coverUri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityIgnoresInvertColors
          />
        ) : photosReady ? (
          <View className="h-full items-center justify-center">
            <Text className="text-caption text-muted-foreground">{t("noPhotos")}</Text>
          </View>
        ) : null}
        {photos.length > 1 ? (
          <View
            accessibilityLabel={t("resultsPhotoCount", { count: photos.length })}
            className="absolute bottom-2 left-2 flex-row items-center gap-1 rounded-md bg-black/60 px-2 py-1"
          >
            <Icon as={Camera} className="size-3 text-white" />
            <Text className="text-caption text-white">{photos.length}</Text>
          </View>
        ) : null}
      </View>
      <View className="gap-0.5 px-4 py-3">
        <Text className="text-headline font-heading font-semibold text-foreground" numberOfLines={1}>
          {values.price || "—"}
        </Text>
        {values.specs ? (
          <Text className="text-callout text-foreground" numberOfLines={1}>{values.specs}</Text>
        ) : null}
        <Text className="text-callout text-muted-foreground" numberOfLines={1}>
          {values.title || "—"}
        </Text>
        <Text className="pt-1 text-caption text-muted-foreground" numberOfLines={1}>
          {[values.cityName, t("resultsToday")].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </View>
  );
}

const join = (parts: (string | false | null | undefined)[], separator = " · ") =>
  parts.filter(Boolean).join(separator);

/** What each step holds, in one line, for its row on Check. */
function useSectionSummaries(
  payload: WizardSchemas.WizardDraftPayload,
  values: CheckValues,
  photoCount: number,
): Record<DataStep, string> {
  const { t } = useTranslation();
  const { data: generations } = useGenerations(payload.modelId ?? "");
  const generationName = generations?.items.find((g) => g.id === payload.generationId)?.name;
  const isUsed = payload.condition !== Enums.ListingCondition.New;
  const damaged = payload.conditionDisclosure?.damaged;

  return {
    vehicle: join([values.title, generationName, payload.vin ? `${t("vin")} ${payload.vin}` : null]),
    // ADR-0080: a New car is never asked Damaged, so Check does not state it.
    specs: join([
      values.specs,
      isUsed && damaged !== undefined ? `${t("damaged")}: ${damaged ? t("yes") : t("no")}` : null,
    ]),
    photos: photoCount > 0 ? t("resultsPhotoCount", { count: photoCount }) : "",
    price: join([
      values.price,
      payload.acceptsExchange ? t("exchangePossible") : null,
      payload.installmentAvailable ? t("installment") : null,
    ]),
    location: join([payload.description?.trim(), join([values.cityName, payload.locationText?.trim()], ", ")]),
    contact: join([
      payload.contactPhone,
      join([payload.allowCalls ? t("phoneCalls") : null, payload.allowChat ? t("inAppChat") : null], ", "),
    ]),
  };
}

/** One step: its title, what it holds, and Change, or Fill in while it needs the seller. */
function SectionRow({
  title,
  summary,
  needsSeller,
  onPress,
}: {
  title: string;
  summary: string;
  needsSeller: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const action = needsSeller ? t("checkFillIn") : t("checkChange");

  // No class is toggled on a mounted component here: the row's classes are fixed,
  // and Change and Fill in are two separate texts.
  return (
    <Pressable
      testID="check-section"
      accessibilityRole="button"
      accessibilityLabel={join([title, summary, action], ", ")}
      className="min-h-14 flex-row items-center gap-3 border-b border-border py-3 active:opacity-70"
      onPress={onPress}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body text-foreground">{title}</Text>
        {summary ? (
          <Text className="text-callout text-muted-foreground" numberOfLines={2}>{summary}</Text>
        ) : null}
      </View>
      {needsSeller ? (
        <Text key="fill-in" className="text-callout font-medium text-destructive">{action}</Text>
      ) : (
        <Text key="change" className="text-callout font-medium text-link">{action}</Text>
      )}
    </Pressable>
  );
}

/** A step the seller cannot open: its title, what it holds, and why it is locked. */
function LockedSectionRow({ title, summary, note }: { title: string; summary: string; note: string }) {
  return (
    <View
      testID="check-section"
      accessible
      accessibilityLabel={join([title, summary, note], ", ")}
      // Not a button and disabled, so a screen reader says it cannot be changed.
      accessibilityState={{ disabled: true }}
      className="min-h-14 flex-row items-center gap-3 border-b border-border py-3"
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body text-foreground">{title}</Text>
        {summary ? (
          <Text className="text-callout text-muted-foreground" numberOfLines={2}>{summary}</Text>
        ) : null}
        <Text className="text-caption text-muted-foreground">{note}</Text>
      </View>
      <Icon as={Lock} className="size-4 text-muted-foreground" />
    </View>
  );
}

export interface EditSectionListProps {
  payload: WizardSchemas.WizardDraftPayload;
  validatedSteps: WizardSchemas.WizardStep[];
  /** Opens a step from the list; Done on that step returns here. Never called for Car. */
  onChangeStep: (step: WizardSchemas.WizardStep) => void;
  /** Every photo of the edit in order, the cover first. */
  photos: StagedPhoto[];
  /** False until the upload queue holds this Listing's photos; see `CheckAndPublishProps`. */
  photosReady?: boolean;
  /** Steps that pass their format check but still need the seller, such as an unconfirmed contact phone. */
  stepsNeedingSeller?: readonly WizardSchemas.WizardStep[];
}

/**
 * The section list a published Listing's edit opens on: Check and publish's rows
 * without the buyer preview, the Posting rules line or Publish. Car is locked
 * after publishing (ADR-0024), so its row has no Change.
 */
export function EditSectionList({
  payload,
  validatedSteps,
  onChangeStep,
  photos: queuePhotos,
  photosReady = true,
  stepsNeedingSeller = [],
}: EditSectionListProps) {
  const { t } = useTranslation();
  const photos = photosReady ? queuePhotos : NO_PHOTOS;
  const values = useCheckValues(payload);
  const summaries = useSectionSummaries(payload, values, photos.length);
  const photosNeedSeller = countUploads(photos).failed > 0;

  return (
    <View className="gap-3 py-5">
      <Text className="text-caption text-muted-foreground">{t("editChangesNote")}</Text>

      <View className="border-t border-border">
        {DATA_STEPS.map((step) =>
          step === "vehicle" ? (
            <LockedSectionRow
              key={step}
              title={t(`wizardSteps.${step}`)}
              summary={summaries[step]}
              note={t("editCarLockedNote")}
            />
          ) : (
            <SectionRow
              key={step}
              title={t(`wizardSteps.${step}`)}
              summary={summaries[step]}
              needsSeller={
                !validatedSteps.includes(step) ||
                stepsNeedingSeller.includes(step) ||
                (step === "photos" && photosNeedSeller)
              }
              onPress={() => onChangeStep(step)}
            />
          ),
        )}
      </View>
    </View>
  );
}

/** The last step of the Sell wizard: the Listing as buyers will see it, and what is left to fix. */
export default function CheckAndPublish({
  payload,
  validatedSteps,
  onChangeStep,
  photos: queuePhotos,
  photosReady = true,
}: CheckAndPublishProps) {
  const { t, i18n } = useTranslation();
  const photos = photosReady ? queuePhotos : NO_PHOTOS;
  const values = useCheckValues(payload);
  const summaries = useSectionSummaries(payload, values, photos.length);
  // A failed photo is fixed on Photos, so that row asks for the seller too.
  const photosNeedSeller = countUploads(photos).failed > 0;

  return (
    <View className="gap-3 py-5">
      <PreviewCard values={values} photos={photos} photosReady={photosReady} />
      <Text className="text-center text-caption text-muted-foreground">{t("thisIsHowBuyersSee")}</Text>

      <View className="border-t border-border">
        {DATA_STEPS.map((step) => (
          <SectionRow
            key={step}
            title={t(`wizardSteps.${step}`)}
            summary={summaries[step]}
            needsSeller={!validatedSteps.includes(step) || (step === "photos" && photosNeedSeller)}
            onPress={() => onChangeStep(step)}
          />
        ))}
      </View>

      <Text className="pt-1 text-caption leading-normal text-muted-foreground">
        {t("publishRulesPrefix")}
        <Text
          accessibilityRole="link"
          className="text-caption font-medium text-link underline"
          onPress={() => void Linking.openURL(legalPageUrl(resolveLocale(i18n.language), "posting-rules"))}
        >
          {t("publishRulesLink")}
        </Text>
        {t("publishRulesSuffix")}
      </Text>
    </View>
  );
}
