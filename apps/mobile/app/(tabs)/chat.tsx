import { MessageSquare } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../src/auth/useAuth";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { ConversationList } from "../../src/conversations/components/ConversationList";
import { useChatPushTokenRegistration } from "../../src/notifications/useChatPushTokenRegistration";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
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
    <View className="flex-1 items-center justify-center gap-4 px-6 py-12">
      <View className="size-16 items-center justify-center rounded-full bg-muted">
        <Icon as={MessageSquare} className="size-8 text-muted-foreground" />
      </View>
      <Text className="text-center text-lg font-semibold text-foreground">
        {t("messagesSignedOutTitle")}
      </Text>
      <Button variant="brand" size="pill" onPress={handleSignIn}>
        <Text>{t("signIn")}</Text>
      </Button>
    </View>
  );
}

function ChatContent({ isAuthenticated }: { isAuthenticated: boolean | null }) {
  const { t } = useTranslation();

  useChatPushTokenRegistration(isAuthenticated === true);

  if (isAuthenticated === false) {
    return <AnonymousChatEntry />;
  }

  if (isAuthenticated === true) {
    return <ConversationList />;
  }

  return (
    <View className="flex-1 items-center justify-center gap-3">
      <ActivityIndicator />
      <Text className="text-sm text-muted-foreground">{t("loading")}</Text>
    </View>
  );
}

export default function ChatScreen() {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <View className="px-4 pt-6 pb-3">
        <Text className="text-2xl font-heading text-foreground">{t("messages")}</Text>
      </View>

      <ChatContent isAuthenticated={isAuthenticated} />
    </SafeAreaView>
  );
}
