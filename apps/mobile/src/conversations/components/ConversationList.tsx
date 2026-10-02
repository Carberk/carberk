import { useCallback, useRef, useState } from "react";
import {
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MessageSquare } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { useConversations } from "../../api/conversations/useConversations";
import { HOME_HREF } from "../../navigation/homeHref";

import { ConversationListItem } from "./ConversationListItem";
import { useConversationCatalogMaps } from "./useConversationCatalogMaps";

import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";

function LoadingSkeleton() {
  return (
    <View className="flex-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} testID="conversation-row-skeleton" className="flex-row items-center gap-3 px-4 py-3">
          <Skeleton className="w-16 h-16 rounded-xl" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6 py-12">
      <View className="size-16 items-center justify-center rounded-full bg-muted">
        <Icon as={MessageSquare} className="size-8 text-muted-foreground" />
      </View>
      <Text className="text-center text-lg font-semibold text-foreground">{t("noConversationsYet")}</Text>
      <Text className="text-center text-sm text-muted-foreground">{t("startByMessaging")}</Text>
      <Button variant="secondary" size="pill" onPress={() => router.navigate(HOME_HREF)}>
        <Text>{t("browseListings")}</Text>
      </Button>
    </View>
  );
}

export function ConversationList() {
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useConversations();

  const conversations = data?.pages.flatMap((page) => page.items) ?? [];
  const catalogMaps = useConversationCatalogMaps(
    conversations.map((c) => c.listing),
  );

  // The spinner answers a pull only, not the refetch when the tab regains focus.
  const [pulling, setPulling] = useState(false);
  const handleRefresh = useCallback(() => {
    setPulling(true);
    void refetch().finally(() => setPulling(false));
  }, [refetch]);

  // Unread badges clear after a Conversation is read, so the list refetches each
  // time the screen regains focus. The first focus is the mount, which already loads.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedBefore.current) {
        focusedBefore.current = true;
        return;
      }
      void refetch();
    }, [refetch]),
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isPending) {
    return <LoadingSkeleton />;
  }

  if (isError && !data) {
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  if (conversations.length === 0) {
    return <EmptyState />;
  }

  return (
    <FlatList
      testID="conversation-list"
      data={conversations}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ConversationListItem
          conversation={item}
          brandName={item.listing ? catalogMaps.brandName(item.listing.brandId) : undefined}
          modelName={item.listing ? catalogMaps.modelName(item.listing.modelId) : undefined}
        />
      )}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={handleRefresh}
        />
      }
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View className="py-4 items-center">
            <Skeleton className="h-4 w-32 rounded" />
          </View>
        ) : null
      }
    />
  );
}
