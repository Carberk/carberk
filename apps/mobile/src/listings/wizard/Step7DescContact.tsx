import { useEffect } from "react";
import { View } from "react-native";
import { Phone, MessageSquare } from "lucide-react-native";
import type { ListingsSchemas, WizardSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { useBrands } from "../../api/catalog/useBrands";
import { useModels } from "../../api/catalog/useModels";
import { useCities } from "../../api/catalog/useCities";

import { ContactPhonePicker } from "./ContactPhonePicker";

import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";

interface Step7DescContactProps {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  disabled?: boolean;
  /** The seller's sign-in phone from `useAuth`; null for an email-only User. */
  accountPhone?: string | null;
  confirmedPhones?: ListingsSchemas.VerifiedContactPhone[];
  /** Edit mode: the Listing's stored number, selectable without a code. */
  currentListingPhone?: string | null;
  onAnotherNumber?: () => void;
  onConfirmExpired?: (phone: string) => void;
  selectionError?: string | null;
  publishPhoneError?: boolean;
  canChangeNumber?: boolean | undefined;
}

function useReviewSummary(payload: WizardSchemas.WizardDraftPayload) {
  const { data: brandsData } = useBrands();
  const { data: modelsData } = useModels(payload.brandId ?? "");
  const { data: citiesData } = useCities(payload.regionId ?? "");

  const brandName =
    brandsData?.items.find((b) => b.id === payload.brandId)?.name ?? "";
  const modelName =
    modelsData?.items.find((m) => m.id === payload.modelId)?.name ?? "";
  const cityName =
    citiesData?.items.find((c) => c.id === payload.cityId)?.name ?? "";

  return { brandName, modelName, cityName };
}

function wrapDisabled(children: React.ReactNode, disabled: boolean) {
  if (!disabled) return <>{children}</>;
  return <View className="opacity-50">{children}</View>;
}

function ReviewSummary({
  payload,
}: {
  payload: WizardSchemas.WizardDraftPayload;
}) {
  const { brandName, modelName, cityName } = useReviewSummary(payload);

  return (
    <View className="gap-1 rounded-lg border-l-4 border-l-primary bg-muted/60 p-3">
      <Text className="text-callout font-medium text-foreground">
        {brandName} {modelName} {payload.year}
      </Text>
      <Text className="text-callout text-foreground">
        {payload.priceAmount
          ? `${payload.priceAmount.toLocaleString()} ${payload.priceCurrency}`
          : "—"}
      </Text>
      <Text className="text-callout text-muted-foreground">{cityName}</Text>
    </View>
  );
}

function ContactMethods({
  payload,
  onChange,
  disabled,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const allowCalls = payload.allowCalls ?? true;
  const allowChat = payload.allowChat ?? true;
  const hasContactMethod = allowCalls || allowChat;

  return (
    <>
      <View className="rounded-xl border border-border p-4 gap-1">
        <Text className="text-caption font-medium uppercase tracking-widest text-muted-foreground mb-3">
          {t("contactMethods")}
        </Text>

        <View className="flex-row items-center justify-between py-1">
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Icon as={Phone} className="size-4 text-foreground" />
            </View>
            <View className="gap-0.5">
              <Text className="text-body text-foreground">{t("phoneCalls")}</Text>
              <Text className="text-caption text-muted-foreground">{t("callsAllowed")}</Text>
            </View>
          </View>
          <Switch
            checked={allowCalls}
            onCheckedChange={(v) => onChange({ allowCalls: v })}
            disabled={disabled}
          />
        </View>

        <View className="h-px bg-border my-1" />

        <View className="flex-row items-center justify-between py-1">
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Icon as={MessageSquare} className="size-4 text-foreground" />
            </View>
            <View className="gap-0.5">
              <Text className="text-body text-foreground">{t("inAppChat")}</Text>
              <Text className="text-caption text-muted-foreground">{t("chatAllowed")}</Text>
            </View>
          </View>
          <Switch
            checked={allowChat}
            onCheckedChange={(v) => onChange({ allowChat: v })}
            disabled={disabled}
          />
        </View>
      </View>

      {!hasContactMethod && (
        <Text className="text-callout text-destructive" accessibilityLiveRegion="polite">
          {t("chooseAtLeastOneContact")}
        </Text>
      )}
    </>
  );
}

export default function Step7DescContact({
  canChangeNumber,
  payload,
  onChange,
  disabled = false,
  accountPhone,
  confirmedPhones,
  currentListingPhone,
  onAnotherNumber = () => {},
  onConfirmExpired = () => {},
  selectionError,
  publishPhoneError = false,
}: Step7DescContactProps) {
  // The sign-in phone is preselected (ADR-0081): it counts as confirmed
  // without a code, so a fresh draft starts with it chosen. An edit session
  // already carries the Listing's number, and an email-only User picks one.
  useEffect(() => {
    if (!payload.contactPhone && accountPhone) {
      onChange({ contactPhone: accountPhone });
    }
  }, [payload.contactPhone, accountPhone, onChange]);

  return (
    <View className="gap-5 py-5">
      <ReviewSummary payload={payload} />
      {wrapDisabled(
        <ContactPhonePicker
          canChangeNumber={canChangeNumber}
          selectedPhone={payload.contactPhone}
          onSelect={(phone) => onChange({ contactPhone: phone })}
          accountPhone={accountPhone}
          confirmedPhones={confirmedPhones}
          currentListingPhone={currentListingPhone}
          onAnotherNumber={onAnotherNumber}
          onConfirmExpired={onConfirmExpired}
          selectionError={selectionError}
          publishPhoneError={publishPhoneError}
          disabled={disabled}
        />,
        disabled,
      )}
      <ContactMethods
        payload={payload}
        onChange={onChange}
        disabled={disabled}
      />
    </View>
  );
}
