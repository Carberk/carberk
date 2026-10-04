import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Pressable,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { ChevronLeft, List } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Enums } from "@auto-tm/contracts";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { useAuth } from "../../src/auth/useAuth";
import { useViewer } from "../../src/auth/useViewer";
import { queryKeys } from "../../src/api/queryKeys";
import { useInfiniteMyListings } from "../../src/api/listings/useInfiniteMyListings";
import { useInfiniteMyDrafts } from "../../src/api/listings/useInfiniteMyDrafts";
import { useMyListingCounts } from "../../src/api/listings/useMyListingCounts";
import { useArchiveListing } from "../../src/api/listings/useArchiveListing";
import { useDeleteListing } from "../../src/api/listings/useDeleteListing";
import { useDiscardDraft } from "../../src/api/listings/useDiscardDraft";
import { useMarkSold } from "../../src/api/listings/useMarkSold";
import { useRepublishListing } from "../../src/api/listings/useRepublishListing";
import { useBrands } from "../../src/api/catalog/useBrands";
import { useModels } from "../../src/api/catalog/useModels";
import { useSafeBack } from "../../src/navigation/useSafeBack";
import { OwnerListingCard } from "../../src/listings/components/OwnerListingCard";
import { DraftCard } from "../../src/listings/components/DraftCard";
import { OwnerActionSheet } from "../../src/listings/components/OwnerActionSheet";
import {
  DRAFT_ACTIONS,
  OWNER_ACTION_CONFIRM,
  isDestructiveAction,
  ownerListingActions,
  type ConfirmedOwnerAction,
  type OwnerAction,
} from "../../src/listings/ownerListingActions";
import { SignInDialog } from "../../components/auth/SignInDialog";
import { useFeedCatalogMaps } from "../../src/listings/feed/useFeedCatalogMaps";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";
import { SafeScreen } from "@/components/navigation/SafeScreen";
import { ErrorState } from "@/components/ErrorState";

type ManageTab = "active" | "drafts" | "archive";
type ListingSummary = ListingsSchemas.ListingSummary;
type ListingDraft = ListingsSchemas.ListingDraft;

const TABS: { key: ManageTab; labelKey: string }[] = [
  { key: "active", labelKey: "myListingsTabActive" },
  { key: "drafts", labelKey: "myListingsTabDrafts" },
  { key: "archive", labelKey: "myListingsTabArchive" },
];

/** Active holds blocked Listings too; Archive holds sold and removed ones. */
const TAB_STATUSES: Record<Exclude<ManageTab, "drafts">, readonly string[]> = {
  active: [Enums.ListingStatus.Active, Enums.ListingStatus.Banned],
  archive: [Enums.ListingStatus.Sold, Enums.ListingStatus.Archived],
};

function parseTab(value: string | undefined): ManageTab {
  return TABS.some((tab) => tab.key === value) ? (value as ManageTab) : "active";
}

type SheetTarget =
  | { kind: "listing"; listing: ListingSummary; title: string }
  | { kind: "draft"; draft: ListingDraft; title: string };

function EmptyState({
  tab,
  onCreate,
}: {
  tab: ManageTab;
  onCreate?: () => void;
}) {
  const { t } = useTranslation();

  const copy: Record<ManageTab, { title: string; body: string; cta?: string }> = {
    active: {
      title: t("noActiveListings"),
      body: t("myListingsEmptyActive"),
      cta: t("listACar"),
    },
    drafts: {
      title: t("noDrafts"),
      body: t("myListingsEmptyDrafts"),
      cta: t("startListing"),
    },
    archive: {
      title: t("myListingsEmptyArchiveTitle"),
      body: t("myListingsEmptyArchive"),
    },
  };

  const current = copy[tab];

  return (
    <View className="items-center justify-center px-6 py-12 gap-4">
      <View className="size-16 items-center justify-center rounded-full bg-muted">
        <Icon as={List} className="size-8 text-muted-foreground" />
      </View>
      <View className="items-center gap-1">
        <Text className="text-lg font-semibold text-foreground">
          {current.title}
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          {current.body}
        </Text>
      </View>
      {current.cta && onCreate && (
        <Button
          variant="default"
          size="pill"
          className="mt-2"
          onPress={onCreate}
        >
          <Text>{current.cta}</Text>
        </Button>
      )}
    </View>
  );
}

function RowsSkeleton() {
  return (
    <View testID="my-listings-skeleton" className="gap-1">
      {[0, 1, 2].map((row) => (
        <View key={row} className="flex-row gap-3 px-4 py-3">
          <Skeleton className="h-[100px] w-[140px] rounded-lg" />
          <View className="flex-1 gap-2 py-0.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </View>
        </View>
      ))}
    </View>
  );
}

function SegmentedTabs({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: ManageTab;
  /** Absent while the counts load or after they fail; zero shows no number. */
  counts: Partial<Record<ManageTab, number>>;
  onChange: (tab: ManageTab) => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="px-4 pb-3">
      <View className="flex-row rounded-lg bg-muted p-1" accessibilityRole="tablist">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const label = t(tab.labelKey);
          const count = counts[tab.key] ? counts[tab.key] : null;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              // Keep the class shape stable between states: toggling a CSS-var
              // class (e.g. shadow-sm) onto a mounted component triggers a
              // css-interop upgrade that crashes the app in dev.
              className={`min-h-9 flex-1 flex-row items-center justify-center gap-1 rounded-md border py-1.5 ${
                isActive
                  ? "border-border bg-background"
                  : "border-transparent bg-transparent"
              }`}
              accessibilityRole="tab"
              accessibilityLabel={count ? `${label}, ${count}` : label}
              accessibilityState={{ selected: isActive }}
            >
              <Text
                className={`text-xs font-medium ${
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {label}
              </Text>
              {count ? (
                <Text className="text-xs text-muted-foreground">{count}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ManageListingsScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const viewer = useViewer();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<ManageTab>(() => parseTab(params.tab));
  const [showSignIn, setShowSignIn] = useState(false);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [confirm, setConfirm] = useState<{ action: ConfirmedOwnerAction; id: string } | null>(null);
  const goBack = useSafeBack("/(tabs)/sell");

  const listingsQuery = useInfiniteMyListings({
    enabled: isAuthenticated === true,
  });
  const draftsQuery = useInfiniteMyDrafts({
    enabled: isAuthenticated === true,
  });
  const countsQuery = useMyListingCounts(
    isAuthenticated === true ? (viewer?.userId ?? null) : null,
  );

  const markSold = useMarkSold();
  const archive = useArchiveListing();
  const republish = useRepublishListing();
  const deleteListing = useDeleteListing();
  const discardDraft = useDiscardDraft();
  const isActing =
    useIsMutating({ mutationKey: queryKeys.listings.lifecycleMutation() }) > 0 ||
    discardDraft.isPending;

  const { data: brandsData } = useBrands();

  const allListings = useMemo(
    () => listingsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [listingsQuery.data],
  );
  const allDrafts = useMemo(
    () => draftsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [draftsQuery.data],
  );

  const filteredListings = useMemo(() => {
    if (activeTab === "drafts") return [];
    const statuses = TAB_STATUSES[activeTab];
    return allListings.filter((l) => statuses.includes(l.status));
  }, [allListings, activeTab]);

  const counts = useMemo((): Partial<Record<ManageTab, number>> => {
    if (countsQuery.status !== "success") return {};
    const c = countsQuery.data;
    return { active: c.active + c.banned, drafts: c.drafts, archive: c.sold + c.archived };
  }, [countsQuery.status, countsQuery.data]);

  const isListingsTab = activeTab !== "drafts";
  const currentQuery = isListingsTab ? listingsQuery : draftsQuery;

  const catalogMaps = useFeedCatalogMaps(filteredListings);

  const handleOpenListing = useCallback((id: string) => {
    router.push(`/(public)/listings/${id}`);
  }, []);

  const handleResumeDraft = useCallback((draft: ListingDraft) => {
    router.push({
      pathname: "/(tabs)/sell",
      params: { resumeDraftId: draft.id },
    });
  }, []);

  const handleListingMore = useCallback((listing: ListingSummary, title: string) => {
    setSheet({ kind: "listing", listing, title });
  }, []);

  const handleDraftMore = useCallback((draft: ListingDraft, title: string) => {
    setSheet({ kind: "draft", draft, title });
  }, []);

  const handleSelectAction = (action: OwnerAction) => {
    const target = sheet;
    setSheet(null);
    if (!target) return;
    if (target.kind === "draft") {
      if (action === "continue") handleResumeDraft(target.draft);
      else if (action === "deleteDraft") setConfirm({ action, id: target.draft.id });
      return;
    }
    if (action === "edit") {
      router.push(`/listings/${target.listing.id}/edit`);
    } else if (action !== "continue") {
      setConfirm({ action, id: target.listing.id });
    }
  };

  // The row moves when the invalidated lists refetch; the counts refetch with them.
  const handleConfirm = () => {
    if (!confirm) return;
    const { action, id } = confirm;
    const callbacks = {
      onSuccess: () => {
        setConfirm(null);
        toast.show({ title: t(OWNER_ACTION_CONFIRM[action].done), variant: "success" });
      },
      onError: () => {
        setConfirm(null);
        toast.show({ title: t("ownerActionFailed"), variant: "destructive" });
      },
    };
    switch (action) {
      case "markSold":
        markSold.mutate(id, callbacks);
        break;
      case "remove":
        archive.mutate(id, callbacks);
        break;
      case "relist":
        republish.mutate(id, callbacks);
        break;
      case "delete":
        deleteListing.mutate(id, callbacks);
        break;
      case "deleteDraft":
        discardDraft.mutate(id, callbacks);
        break;
    }
  };

  const closeConfirm = () => {
    if (isActing) return;
    setConfirm(null);
  };

  const handleCreateListing = useCallback(() => {
    router.push("/(tabs)/sell");
  }, []);

  const handleRefresh = useCallback(() => {
    void countsQuery.refetch();
    if (isListingsTab) {
      void listingsQuery.refetch();
    } else {
      void draftsQuery.refetch();
    }
  }, [isListingsTab, listingsQuery, draftsQuery, countsQuery]);

  const handleLoadMore = useCallback(() => {
    if (currentQuery.hasNextPage && !currentQuery.isFetchingNextPage) {
      void currentQuery.fetchNextPage();
    }
  }, [currentQuery]);

  // Tabs filter /me/listings on the client, so a tab with no row on the loaded pages
  // keeps paging until it finds one or runs out, before it may show its empty state.
  const isSeekingRows =
    isListingsTab &&
    filteredListings.length === 0 &&
    listingsQuery.hasNextPage &&
    !listingsQuery.isError;
  const { fetchNextPage: fetchNextListings, isFetchingNextPage: isFetchingNextListings } =
    listingsQuery;
  useEffect(() => {
    if (isSeekingRows && !isFetchingNextListings) void fetchNextListings();
  }, [isSeekingRows, isFetchingNextListings, fetchNextListings]);

  // Auth-on-action: anonymous users see a sign-in prompt instead of an API error.
  if (isAuthenticated === false) {
    return (
      <SafeScreen>
        <View className="px-4 pb-3 flex-row items-center gap-2">
          <Button
            variant="ghost"
            className="h-11 w-11"
            size="icon"
            onPress={goBack}
          >
            <Icon as={ChevronLeft} className="size-6 text-foreground" />
          </Button>
          <Text className="text-2xl font-heading text-foreground">
            {t("myListings")}
          </Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-lg font-semibold text-foreground">
            {t("signInToManage")}
          </Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground">
            {t("manageYourListings")}
          </Text>
          <Button
            variant="default"
            size="pill"
            className="mt-6"
            onPress={() => setShowSignIn(true)}
          >
            <Text>{t("signIn")}</Text>
          </Button>
        </View>
        <SignInDialog
          description={t("signInToManageDescription")}
          open={showSignIn}
          returnTo="/listings/manage"
          title={t("signInToManageTitle")}
          onOpenChange={setShowSignIn}
        />
      </SafeScreen>
    );
  }

  const isPending = isAuthenticated === null || currentQuery.isPending || isSeekingRows;
  const isEmpty = isListingsTab ? filteredListings.length === 0 : allDrafts.length === 0;
  const confirmCopy = confirm ? OWNER_ACTION_CONFIRM[confirm.action] : null;
  const confirmDestructive = confirm ? isDestructiveAction(confirm.action) : false;

  const refreshControl = (
    <RefreshControl
      refreshing={currentQuery.isRefetching}
      onRefresh={handleRefresh}
    />
  );
  const listFooter = currentQuery.isFetchingNextPage ? (
    <View className="py-4 items-center">
      <ActivityIndicator />
    </View>
  ) : !currentQuery.hasNextPage ? (
    <View className="py-4 items-center">
      <Text className="text-xs text-muted-foreground">
        {t("noMore")}
      </Text>
    </View>
  ) : null;

  return (
    <SafeScreen>
      {/* Header */}
      <View className="px-4 pb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Button
            variant="ghost"
            className="h-11 w-11"
            size="icon"
            onPress={goBack}
          >
            <Icon as={ChevronLeft} className="size-6 text-foreground" />
          </Button>
          <Text className="text-2xl font-heading text-foreground">
            {t("myListings")}
          </Text>
        </View>
      </View>

      <SegmentedTabs activeTab={activeTab} counts={counts} onChange={setActiveTab} />

      {/* Content */}
      {isPending ? (
        <RowsSkeleton />
      ) : currentQuery.isError ? (
        <ErrorState error={currentQuery.error} onRetry={handleRefresh} />
      ) : isEmpty ? (
        <FlatList
          data={[]}
          keyExtractor={() => "empty"}
          renderItem={() => null}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={refreshControl}
          ListEmptyComponent={
            <EmptyState
              tab={activeTab}
              onCreate={activeTab === "archive" ? undefined : handleCreateListing}
            />
          }
        />
      ) : isListingsTab ? (
        <FlatList<ListingSummary>
          data={filteredListings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: { item: ListingSummary }) => (
            <OwnerListingCard
              listing={item}
              brandName={catalogMaps.brandName(item.brandId)}
              modelName={catalogMaps.modelName(item.modelId)}
              cityName={catalogMaps.cityName(item.cityId)}
              onOpen={handleOpenListing}
              onMore={handleListingMore}
            />
          )}
          ItemSeparatorComponent={() => <Separator className="mx-4" />}
          refreshControl={refreshControl}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={listFooter}
        />
      ) : (
        <FlatList<ListingDraft>
          data={allDrafts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: { item: ListingDraft }) => (
            <DraftCardWrapper
              draft={item}
              brandsData={brandsData}
              onResume={handleResumeDraft}
              onMore={handleDraftMore}
            />
          )}
          ItemSeparatorComponent={() => <Separator className="mx-4" />}
          refreshControl={refreshControl}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={listFooter}
        />
      )}

      <OwnerActionSheet
        open={sheet !== null}
        title={sheet?.title ?? ""}
        actions={
          sheet === null
            ? []
            : sheet.kind === "draft"
              ? DRAFT_ACTIONS
              : ownerListingActions(sheet.listing.status)
        }
        onSelect={handleSelectAction}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
      />

      <AlertDialog open={confirm !== null} onOpenChange={closeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy ? t(confirmCopy.title) : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCopy ? t(confirmCopy.description) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel accessibilityRole="button" disabled={isActing} onPress={closeConfirm}>
              <Text>{t("cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="confirm-action"
              accessibilityRole="button"
              disabled={isActing}
              onPress={handleConfirm}
              className={confirmDestructive ? "bg-destructive" : undefined}
            >
              <Text className={confirmDestructive ? "text-destructive-foreground" : undefined}>
                {isActing ? t("working") : t(confirmDestructive ? "ownerActionDelete" : "confirm")}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SafeScreen>
  );
}

function DraftCardWrapper({
  draft,
  brandsData,
  onResume,
  onMore,
}: {
  draft: ListingDraft;
  brandsData:
    | { items: { id: string; name: string }[] }
    | undefined;
  onResume: (draft: ListingDraft) => void;
  onMore: (draft: ListingDraft, title: string) => void;
}) {
  const brandName = brandsData?.items.find(
    (b) => b.id === draft.payload.brandId,
  )?.name;

  const { data: modelsData } = useModels(draft.payload.brandId ?? "");
  const modelName = modelsData?.items.find(
    (m) => m.id === draft.payload.modelId,
  )?.name;

  return (
    <DraftCard
      draft={draft}
      brandName={brandName}
      modelName={modelName}
      onResume={onResume}
      onMore={onMore}
    />
  );
}
