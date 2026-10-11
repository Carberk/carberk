import { ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../src/auth/useAuth";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { ConversationList } from "../../src/conversations/components/ConversationList";
import { LargeTitle } from "../../components/navigation/ScreenHeader";
import { TabBarClear, TabScreen } from "../../components/navigation/TabScreen";
import { useTabBarSpace } from "../../components/navigation/tabBarHeight";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Text } from "@/components/ui/text";

function AnonymousChatEntry() {
  const router = useRouter();
  const { t } = useTranslation();

  const handleSignIn = () => {
    useAuthIntentStore.getState().requireSignIn(router, {
      returnTo: "/(tabs)/chat",
    });
  };

  return (
    <EmptyState illustration="messages" title={t("messagesSignedOutTitle")}>
      <Button variant="brand" size="pill" onPress={handleSignIn}>
        <Text>{t("signIn")}</Text>
      </Button>
    </EmptyState>
  );
}

function ChatContent({ isAuthenticated }: { isAuthenticated: boolean | null }) {
  const { t } = useTranslation();
  const tabBarSpace = useTabBarSpace();

  if (isAuthenticated === false) {
    return <TabBarClear><AnonymousChatEntry /></TabBarClear>;
  }

  if (isAuthenticated === true) {
    return <ConversationList tabBarSpace={tabBarSpace} />;
  }

  return (
    <TabBarClear className="items-center justify-center gap-3">
      <ActivityIndicator />
      <Text className="text-callout text-muted-foreground">{t("loading")}</Text>
    </TabBarClear>
  );
}

export default function ChatScreen() {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();

  return (
    <TabScreen underTabBar>
      <LargeTitle title={t("messages")} />

      <ChatContent isAuthenticated={isAuthenticated} />
    </TabScreen>
  );
}
