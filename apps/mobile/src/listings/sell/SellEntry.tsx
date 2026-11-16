import { useState } from "react";
import { View } from "react-native";
import { Car, FileText, List, Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ListingsSchemas } from "@auto-tm/contracts";

import { Photo as Image } from "../../media/photoRoute";
import { buildOriginalUrl, buildVariantUrl } from "../detail/buildVariantUrl";
import { draftProgress } from "../wizard/draftProgress";
import { MenuDivider, MenuGap, MenuRow } from "../../../components/account/MenuRow";

import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { localeTag } from "@/src/i18n/resources";

type ListingDraft = ListingsSchemas.ListingDraft;

export const DRAFTS_HREF = { pathname: "/listings/manage", params: { tab: "drafts" } } as const;
export const MY_LISTINGS_HREF = "/listings/manage";

interface SellEntryProps {
  /** The signed-in User's drafts, most recently updated first. */
  drafts: ListingDraft[] | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  /** Catalog names of the latest draft's brand and model, once loaded. */
  brandName?: string | undefined;
  modelName?: string | undefined;
  isCreating: boolean;
  onContinue: (draft: ListingDraft) => void;
  onCreate: () => void;
  onNavigate: (href: typeof DRAFTS_HREF | typeof MY_LISTINGS_HREF) => void;
  /** The five-draft sheet, also opened by the screen when the API refuses a create. */
  limitSheetOpen: boolean;
  onLimitSheetOpenChange: (open: boolean) => void;
}

function draftTitle(
  draft: ListingDraft,
  brandName: string | undefined,
  modelName: string | undefined,
): string | null {
  const car = [brandName, modelName].filter(Boolean).join(" ");
  if (!car) return null;
  return draft.payload.year ? `${car}, ${draft.payload.year}` : car;
}

function DraftCover({ draft }: { draft: ListingDraft }) {
  const [failed, setFailed] = useState(false);
  const key = draft.payload.photos?.find((photo) => photo.key)?.key;
  // Draft photos still live under pending/; sized variants exist only after publish.
  const uri = key ? (key.startsWith("pending/") ? buildOriginalUrl(key) : buildVariantUrl(key, "list")) : null;

  return (
    <View className="h-12 w-16 items-center justify-center overflow-hidden rounded-lg bg-muted">
      {uri && !failed ? (
        <Image
          source={{ uri }}
          className="h-12 w-16"
          contentFit="cover"
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon as={Car} className="size-6 text-muted-foreground" />
      )}
    </View>
  );
}

function EntrySkeleton() {
  return (
    <View testID="sell-entry-skeleton" className="gap-3 px-5 pt-6">
      <Skeleton className="h-6 w-3/5" />
      <Skeleton className="h-3.5 w-11/12" />
      <Skeleton className="mt-3 h-12 w-full rounded-xl" />
    </View>
  );
}

/** The signed-in Sell tab before the wizard opens: the latest draft first, or the first listing. */
export function SellEntry({
  drafts,
  isPending,
  error,
  onRetry,
  brandName,
  modelName,
  isCreating,
  onContinue,
  onCreate,
  onNavigate,
  limitSheetOpen,
  onLimitSheetOpenChange,
}: SellEntryProps) {
  const { t, i18n } = useTranslation();

  if (isPending) return <EntrySkeleton />;
  if (error || !drafts) return <ErrorState error={error} onRetry={onRetry} />;

  const limitSheet = (
    <Sheet open={limitSheetOpen} onOpenChange={onLimitSheetOpenChange}>
      <SheetContent compact closeOnBackdropPress>
        <SheetHeader>
          <SheetTitle>{t("draftLimitTitle", { limit: ListingsSchemas.MAX_DRAFTS_PER_USER })}</SheetTitle>
          <SheetDescription>{t("draftLimitBody")}</SheetDescription>
        </SheetHeader>
        <View className="gap-2">
          <Button
            variant="default"
            size="pill"
            onPress={() => {
              onLimitSheetOpenChange(false);
              onNavigate(DRAFTS_HREF);
            }}
          >
            <Text>{t("openDrafts")}</Text>
          </Button>
          <Button variant="outline" size="pill" onPress={() => onLimitSheetOpenChange(false)}>
            <Text>{t("cancel")}</Text>
          </Button>
        </View>
      </SheetContent>
    </Sheet>
  );

  const myListingsRow = (
    <MenuRow icon={List} label={t("myListings")} chevron onPress={() => onNavigate(MY_LISTINGS_HREF)} />
  );

  const latest = drafts[0];
  if (!latest) {
    return (
      <View>
        <View className="gap-1.5 px-5 pb-5 pt-6">
          <Text className="text-headline font-heading font-semibold text-foreground">
            {t("sellEntryTitle")}
          </Text>
          <Text className="mb-3 text-callout text-muted-foreground">{t("sellEntryBody")}</Text>
          <Button variant="default" size="pill" disabled={isCreating} onPress={onCreate}>
            <Icon as={Plus} className="size-[18px] text-primary-foreground" />
            <Text>{t("listACar")}</Text>
          </Button>
        </View>
        <MenuGap />
        {myListingsRow}
        {limitSheet}
      </View>
    );
  }

  const { filled, total } = draftProgress(latest.payload);
  const updated = new Date(latest.updatedAt).toLocaleDateString(localeTag(i18n.language), {
    day: "numeric",
    month: "short",
  });
  const atLimit = drafts.length >= ListingsSchemas.MAX_DRAFTS_PER_USER;

  return (
    <View>
      <Text className="px-5 pb-1 pt-4 text-caption font-medium uppercase tracking-widest text-muted-foreground">
        {t("latestDraft")}
      </Text>
      <MenuRow
        size="large"
        lead={<DraftCover draft={latest} />}
        label={draftTitle(latest, brandName, modelName) ?? t("draftWithoutCar")}
        sub={`${t("draftStepsFilled", { filled, total })} · ${t("draftUpdatedOn", { date: updated })}`}
        chevron
        onPress={() => onContinue(latest)}
      />
      <View className="gap-2 px-5 pb-5 pt-1.5">
        <Button variant="default" size="pill" onPress={() => onContinue(latest)}>
          <Text>{t("continue")}</Text>
        </Button>
        <Button
          variant="outline"
          size="pill"
          disabled={isCreating}
          onPress={() => (atLimit ? onLimitSheetOpenChange(true) : onCreate())}
        >
          <Icon as={Plus} className="size-[18px] text-foreground" />
          <Text>{t("newListing")}</Text>
        </Button>
      </View>
      <MenuGap />
      {drafts.length > 1 ? (
        <>
          <MenuRow
            icon={FileText}
            label={t("allDrafts")}
            value={String(drafts.length)}
            chevron
            onPress={() => onNavigate(DRAFTS_HREF)}
          />
          <MenuDivider />
        </>
      ) : null}
      {myListingsRow}
      {limitSheet}
    </View>
  );
}
