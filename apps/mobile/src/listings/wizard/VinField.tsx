import { Lock } from "lucide-react-native";
import { View } from "react-native";
import type { WizardSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

interface VinFieldProps {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * The optional VIN at the bottom of the Car step. Nothing decodes a VIN
 * (ADR-0053), so the helper promises no auto-fill.
 */
export function VinField({ payload, onChange, error, disabled }: VinFieldProps) {
  const { t } = useTranslation();
  const helper = t(disabled ? "thisFieldCannotBeChanged" : "vinHelper");

  return (
    <View className="gap-1.5">
      <Text className="text-callout font-medium text-foreground">
        {t("vin")}
      </Text>
      <View className="relative">
        <Input
          value={payload.vin ?? ""}
          onChangeText={(text) =>
            // null (not an omitted key) reaches the draft update, so clearing the
            // field removes the stored VIN instead of leaving the old value.
            onChange({ vin: text.trim() === "" ? null : text.replace(/[a-z]/g, (letter) => letter.toUpperCase()) })
          }
          placeholder="WBA1234567890ABCD"
          editable={!disabled}
          className={disabled ? "pr-10 opacity-60" : undefined}
          accessibilityState={{ disabled: !!disabled }}
          autoCapitalize="characters"
          maxLength={17}
          accessibilityLabel={t("vin")}
          accessibilityHint={helper}
        />
        {disabled && (
          <View
            className="absolute right-3.5 top-4"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Icon as={Lock} className="size-4 text-muted-foreground" />
          </View>
        )}
      </View>
      <Text className="text-caption text-muted-foreground">{helper}</Text>
      {error && (
        <Text className="text-callout text-destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}
