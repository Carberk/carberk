import { View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { useErrorCopy } from "@/src/api/useErrorCopy";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Illustration } from "@/components/ui/illustration";
import { Text } from "@/components/ui/text";

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
  title?: string;
}

export function ErrorState({ error, onRetry, compact = false, title }: ErrorStateProps) {
  const { t } = useTranslation("common");
  const copy = useErrorCopy(error);

  if (compact) {
    return (
      <View
        accessibilityRole="alert"
        className="flex-row items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5"
      >
        <Icon as={AlertTriangle} className="size-4 shrink-0 text-destructive" />
        <Text className="flex-1 text-callout text-destructive" numberOfLines={2}>
          {title ?? copy.title}
        </Text>
        {copy.retryable && onRetry && (
          <Button variant="ghost" size="sm" onPress={onRetry}>
            <Text className="text-callout text-destructive">{t("retry")}</Text>
          </Button>
        )}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="alert"
      className="flex-1 items-center justify-center px-8 pb-12 pt-6"
    >
      <Illustration name="error" className="mb-6" />
      <Text className="text-center font-heading text-headline font-semibold text-foreground" numberOfLines={2}>
        {title ?? copy.title}
      </Text>
      <Text className="mt-2 text-center text-body text-muted-foreground" numberOfLines={3}>
        {copy.description}
      </Text>
      {copy.retryable && onRetry && (
        <Button variant="secondary" size="pill" className="mt-7 self-stretch" onPress={onRetry}>
          <Text>{t("retry")}</Text>
        </Button>
      )}
    </View>
  );
}
