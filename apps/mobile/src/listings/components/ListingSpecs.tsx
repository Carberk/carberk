import { View } from "react-native";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { localeTag } from "@/src/i18n/resources";
import { useLargeText } from "@/lib/font-scale";
import { cn } from "@/lib/utils";
import { SkeletonText } from "@/components/ui/skeleton-text";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";

/** A value the Listing has but that has not loaded yet: drawn as a placeholder. */
export const PENDING = Symbol("pending");
type Pending = typeof PENDING;

/** One Specifications entry; no value means the Listing has none and it is left out. */
export interface ListingSpec {
  label: string;
  value: string | undefined | Pending;
}

function known<T>(value: T | null | undefined | Pending, format: (value: T) => string) {
  if (value === PENDING) return PENDING;
  return value == null ? undefined : format(value);
}

/**
 * The six key figures in grid order. Loaded detail, the card-seeded preview and
 * the deep-link skeleton all build their grid here, so each value appears in
 * the same cell before and after detail loads.
 */
export function keySpecs(
  values: {
    year?: number | Pending;
    mileageKm?: number | Pending;
    transmission?: string | Pending;
    engineType?: string | Pending;
    enginePower?: number | null | Pending;
    driveType?: string | Pending;
  },
  t: TFunction,
  language: string,
): ListingSpec[] {
  return [
    { label: t("year"), value: known(values.year || undefined, String) },
    {
      label: t("mileage"),
      value: known(values.mileageKm, (km) => `${km.toLocaleString(localeTag(language))} ${t("km")}`),
    },
    { label: t("transmission"), value: values.transmission },
    { label: t("engineType"), value: values.engineType },
    { label: t("enginePower"), value: known(values.enginePower, (hp) => `${hp} ${t("hp")}`) },
    { label: t("driveType"), value: values.driveType },
  ];
}

/** The label/value rows under the grid, in order. */
export function specRows(
  values: {
    condition?: "new" | "used" | Pending;
    bodyType?: string | Pending;
    color?: string | Pending;
    vin?: string | Pending;
  },
  t: TFunction,
): ListingSpec[] {
  return [
    { label: t("condition"), value: known(values.condition, (condition) => t(condition)) },
    { label: t("bodyType"), value: values.bodyType },
    { label: t("color"), value: values.color },
    { label: t("vin"), value: values.vin || undefined },
  ];
}

/** Every key figure and row still loading: the deep-link skeleton's grid. */
export const PENDING_KEY_SPECS = {
  year: PENDING,
  mileageKm: PENDING,
  transmission: PENDING,
  engineType: PENDING,
  enginePower: PENDING,
  driveType: PENDING,
} as const;
export const PENDING_SPEC_ROWS = { condition: PENDING, bodyType: PENDING, color: PENDING } as const;

function SpecItem({ label, value }: ListingSpec) {
  // Three columns break a value such as "120 000 km" across lines at a large
  // font size; two columns keep it whole.
  const largeText = useLargeText();
  if (value === undefined) return null;
  const className = cn(largeText ? "w-1/2" : "w-1/3", "gap-1 py-3 pr-2");
  if (value === PENDING) {
    return (
      <View testID="spec-cell-loading" className={className}>
        <SkeletonText className="text-caption" width="60%" />
        <SkeletonText className="text-callout font-semibold" width="80%" />
      </View>
    );
  }
  return (
    <View testID="spec-cell" className={className}>
      <Text className="text-caption text-muted-foreground">{label}</Text>
      <Text className="text-callout font-semibold text-foreground">{value}</Text>
    </View>
  );
}

function SpecRow({ label, value }: ListingSpec) {
  if (value === undefined) return null;
  const className = "flex-row gap-3 py-1.5";
  if (value === PENDING) {
    return (
      <View testID="spec-row-loading" className={className}>
        <View className="w-2/5">
          <SkeletonText className="text-callout" width="70%" />
        </View>
        <View className="flex-1">
          <SkeletonText className="text-callout" width="50%" />
        </View>
      </View>
    );
  }
  return (
    <View testID="spec-row" className={className}>
      <Text className="w-2/5 text-callout text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-callout text-foreground">{value}</Text>
    </View>
  );
}

/**
 * Specifications: a separator, the heading, the key-figure grid, then rows.
 * Entries still loading keep their cell as a placeholder, and the heading is
 * one too until some value is known.
 */
export function SpecificationsSection({ specs, rows }: { specs: ListingSpec[]; rows: ListingSpec[] }) {
  const { t } = useTranslation();
  const entries = [...specs, ...rows];
  if (!entries.some((entry) => entry.value !== undefined)) return null;
  return (
    <View className="gap-1">
      <Separator className="mb-3" />
      {entries.some((entry) => typeof entry.value === "string") ? (
        <Text className="text-subhead font-semibold">{t("specifications")}</Text>
      ) : (
        <SkeletonText className="text-subhead font-semibold" width="45%" />
      )}
      <View className="flex-row flex-wrap">
        {specs.map((spec) => (
          <SpecItem key={spec.label} {...spec} />
        ))}
      </View>
      {rows.map((row) => (
        <SpecRow key={row.label} {...row} />
      ))}
    </View>
  );
}
