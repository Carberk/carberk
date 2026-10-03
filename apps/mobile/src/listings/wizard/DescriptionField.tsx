import { View } from "react-native";
import type { WizardSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

interface DescriptionFieldProps {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  error?: string;
  disabled?: boolean;
  onBlur?: () => void;
}

/** The required Description at the top of the Description and place step. */
export function DescriptionField({
  payload,
  onChange,
  error,
  disabled = false,
  onBlur,
}: DescriptionFieldProps) {
  const { t } = useTranslation();
  const descriptionLength = payload.description?.length ?? 0;

  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium text-foreground">
          {t("description")} *
        </Text>
        <Text className="text-xs text-muted-foreground">
          {descriptionLength}/2000
        </Text>
      </View>
      <View className={disabled ? "opacity-50" : ""}>
        <Input
          value={payload.description ?? ""}
          onChangeText={(text) =>
            onChange({ description: text || undefined })
          }
          onBlur={onBlur}
          placeholder={t("descriptionPlaceholder")}
          multiline
          numberOfLines={4}
          editable={!disabled}
          className="h-auto min-h-[96px] py-2"
          maxLength={2000}
          accessibilityLabel={t("description")}
        />
      </View>
      {error ? (
        <Text className="text-sm text-destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
