import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { ImageOff, MoreHorizontal } from "lucide-react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { buildOriginalUrl, buildVariantUrl } from "../detail/buildVariantUrl";
import { draftProgress } from "../wizard/draftProgress";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
}

type ListingDraft = ListingsSchemas.ListingDraft;

interface DraftCardProps {
  draft: ListingDraft;
  brandName?: string;
  modelName?: string;
  onResume: (draft: ListingDraft) => void;
  /** Opens the ⋯ sheet; the card passes the title the sheet shows. */
  onMore: (draft: ListingDraft, title: string) => void;
}

export function DraftCard({
  draft,
  brandName,
  modelName,
  onResume,
  onMore,
}: DraftCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const { t, i18n } = useTranslation();

  const payload = draft.payload;
  const attachedPhotos = useMemo(
    () => payload.photos?.filter((p) => p.key) ?? [],
    [payload.photos],
  );
  const photoCount = attachedPhotos.length;
  const coverKey = attachedPhotos[0]?.key;
  // Draft photos still live under pending/ — sized variants only exist after
  // publish, so pending keys must load the original upload.
  const imageUrl = coverKey
    ? coverKey.startsWith("pending/")
      ? buildOriginalUrl(coverKey)
      : buildVariantUrl(coverKey, "list")
    : null;

  const titleParts = [
    payload.year ? String(payload.year) : null,
    brandName,
    modelName,
  ].filter(Boolean);

  const identity = titleParts.length > 0
    ? titleParts.join(" ")
    : payload.brandId && payload.modelId
      ? t("unnamedDraft")
      : t("untitledDraft");

  const { filled, total, percent: progressPercent } = draftProgress(payload);

  // ⋯ sits beside the tappable row, not inside it, so a screen reader reaches
  // it on its own instead of folding it into the row's label.
  return (
    <View className="flex-row items-start pr-1">
      <Pressable
        className="flex-1 active:opacity-90"
        onPress={() => onResume(draft)}
        accessibilityRole="button"
        accessibilityLabel={`${t("continueListing")} ${identity}`}
      >
        <View className="flex-row gap-3 py-3 pl-4">
          {/* Cover image */}
          <View className="h-[100px] w-[140px] shrink-0 overflow-hidden rounded-lg bg-muted">
            {imageUrl && !imageFailed ? (
              <Image
                source={{ uri: imageUrl }}
                className="h-[100px] w-[140px]"
                contentFit="cover"
                cachePolicy="memory-disk"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <View className="h-full w-full items-center justify-center">
                <Icon as={ImageOff} className="size-6 text-muted-foreground" />
              </View>
            )}
          </View>

          {/* Text content */}
          <View className="min-w-0 flex-1 justify-between gap-2 py-0.5">
            <View className="gap-1">
              <Text
                className="text-base font-semibold text-foreground leading-5"
                numberOfLines={2}
              >
                {identity}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {t("updated")} {formatDate(draft.updatedAt, i18n.language)}
                {photoCount > 0 ? ` · ${t("photoCount", { count: photoCount })}` : ""}
              </Text>
            </View>

            <View className="gap-1.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-muted-foreground">
                  {t("draftStepsFilled", { filled, total })}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {progressPercent}%
                </Text>
              </View>
              <Progress value={progressPercent} className="h-1" />
            </View>
          </View>
        </View>
      </Pressable>
      <Button
        variant="ghost"
        size="icon"
        className="mt-2 h-11 w-11"
        onPress={() => onMore(draft, identity)}
        accessibilityLabel={t("myListingsActionsFor", { title: identity })}
      >
        <Icon as={MoreHorizontal} className="size-5 text-foreground" />
      </Button>
    </View>
  );
}
