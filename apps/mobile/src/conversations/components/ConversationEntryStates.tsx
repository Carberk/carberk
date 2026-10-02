import { Lock, MessageSquareOff } from "lucide-react-native";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

interface EntryStateProps {
  onPress: () => void;
}

/** Shown in place of the Messages when no User is signed in. */
export function ConversationSignedOutState({ onPress }: EntryStateProps) {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      <Icon as={Lock} className="size-8 text-muted-foreground" />
      <Text className="text-center text-base text-foreground">
        {t("signInToViewMessages")}
      </Text>
      <Button
        variant="brand"
        size="pill"
        onPress={onPress}
        accessibilityLabel={t("signIn")}
      >
        <Text>{t("signIn")}</Text>
      </Button>
    </View>
  );
}

/**
 * Shown when the Conversation does not exist or the signed-in User is not part
 * of it. It names nothing from the Conversation.
 */
export function ConversationNotFoundState({ onPress }: EntryStateProps) {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      <Icon as={MessageSquareOff} className="size-8 text-muted-foreground" />
      <Text className="text-center text-base text-foreground">
        {t("conversationNotFound")}
      </Text>
      <Button
        variant="outline"
        size="pill"
        onPress={onPress}
        accessibilityLabel={t("goToMessages")}
      >
        <Text>{t("goToMessages")}</Text>
      </Button>
    </View>
  );
}
