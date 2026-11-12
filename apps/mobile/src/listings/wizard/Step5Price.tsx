import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import type { TextInput } from "react-native";
import { Enums } from "@auto-tm/contracts";
import type { WizardSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { useExchangeRates } from "../../api/exchange-rates/useExchangeRates";
import { formatAmountInput, parseAmountInput } from "../formatPrice";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";

interface Step5PriceProps {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  fieldErrors?: Record<string, string>;
  /** Show every error, as after the first Continue tap. */
  showErrors?: boolean;
  disabled?: boolean;
}

const CURRENCIES: { value: Enums.Currency; label: string }[] = [
  { value: Enums.Currency.TMT, label: "TMT" },
  { value: Enums.Currency.USD, label: "USD" },
  { value: Enums.Currency.AED, label: "AED" },
];

function usePriceStep(payload: WizardSchemas.WizardDraftPayload) {
  const { data: ratesData } = useExchangeRates();

  const rate = ratesData?.rates.find(
    (r) =>
      r.fromCurrency === payload.priceCurrency && r.toCurrency === "TMT",
  );
  const tmtEquivalent =
    rate && payload.priceAmount
      ? Math.round(payload.priceAmount * rate.rate)
      : null;

  return { tmtEquivalent };
}

function wrapDisabled(children: React.ReactNode, disabled: boolean) {
  if (!disabled) return <>{children}</>;
  return <View className="opacity-50">{children}</View>;
}

function PriceInput({
  payload,
  onChange,
  error,
  onTouched,
  disabled,
  inputRef,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  /** The amount's error, once it is to be shown. */
  error?: string;
  onTouched: () => void;
  disabled: boolean;
  inputRef: React.RefObject<TextInput | null>;
}) {
  const { t, i18n } = useTranslation();
  return (
    <View className="gap-1.5">
      <Text className="text-callout font-medium text-foreground">{t("amount")} *</Text>
      {wrapDisabled(
        <Input
          ref={inputRef}
          // Grouped as a displayed price; the payload keeps the plain number.
          value={formatAmountInput(payload.priceAmount, i18n.language)}
          onChangeText={(text) => {
            onTouched();
            const num = parseAmountInput(text);
            const updates: Partial<WizardSchemas.WizardDraftPayload> = { priceAmount: num };
            if (num !== undefined && !payload.priceCurrency) {
              updates.priceCurrency = Enums.Currency.TMT;
            }
            onChange(updates);
          }}
          onBlur={onTouched}
          placeholder={t("priceAmountPlaceholder")}
          keyboardType="number-pad"
          editable={!disabled}
        />,
        disabled,
      )}
      {error && (
        <Text className="text-callout text-destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

/** TMT, USD and AED in one row. Another currency clears the amount, which the seller types again. */
function CurrencyButtons({
  payload,
  onChange,
  disabled,
  onSwitched,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  disabled: boolean;
  onSwitched: () => void;
}) {
  const { t } = useTranslation();
  const selected = payload.priceCurrency ?? Enums.Currency.TMT;

  return (
    <View className="gap-1.5">
      <Text className="text-callout font-medium text-foreground">{t("currency")}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("currency")}
        className={`flex-row rounded-xl bg-secondary p-[3px] ${disabled ? "opacity-50" : ""}`}
      >
        {CURRENCIES.map((currency) => {
          const isSelected = currency.value === selected;
          return (
            <Pressable
              key={currency.value}
              accessibilityRole="radio"
              accessibilityLabel={currency.label}
              accessibilityState={{ checked: isSelected, disabled }}
              disabled={disabled}
              onPress={() => {
                if (isSelected) return;
                onChange({ priceCurrency: currency.value, priceAmount: undefined });
                onSwitched();
              }}
              // Keep the class shape stable between states: toggling a CSS-var
              // class (e.g. shadow-sm) onto a mounted component triggers a
              // css-interop upgrade that crashes the app in dev.
              className={`min-h-10 flex-1 items-center justify-center rounded-[9px] border ${
                isSelected
                  ? "border-border bg-background"
                  : "border-transparent bg-transparent"
              }`}
            >
              <Text
                className={
                  isSelected ? "text-body font-semibold text-foreground" : "text-body text-muted-foreground"
                }
              >
                {currency.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TmtEquivalent({ amount }: { amount: number | null }) {
  if (amount === null) return null;
  return (
    <Text className="text-caption text-muted-foreground">
      ≈ {amount.toLocaleString()} TMT
    </Text>
  );
}

function SellerTerms({
  payload,
  onChange,
  disabled,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View className="rounded-xl border border-border p-4 gap-1">
      <Text className="text-caption font-medium uppercase tracking-widest text-muted-foreground mb-3">
        {t("sellerTerms")}
      </Text>
      <View className="flex-row items-center justify-between py-2">
        <Text className="text-body text-foreground">{t("exchangePossible")}</Text>
        <Switch
          accessibilityLabel={t("exchangePossible")}
          checked={payload.acceptsExchange ?? false}
          onCheckedChange={(v) => onChange({ acceptsExchange: v })}
          disabled={disabled}
        />
      </View>
      <View className="h-px bg-border" />
      <View className="flex-row items-center justify-between py-2">
        <Text className="text-body text-foreground">{t("installmentAvailableLabel")}</Text>
        <Switch
          accessibilityLabel={t("installmentAvailableLabel")}
          checked={payload.installmentAvailable ?? false}
          onCheckedChange={(v) => onChange({ installmentAvailable: v })}
          disabled={disabled}
        />
      </View>
    </View>
  );
}

export default function Step5Price({
  payload,
  onChange,
  fieldErrors,
  showErrors = false,
  disabled = false,
}: Step5PriceProps) {
  const { tmtEquivalent } = usePriceStep(payload);
  const amountRef = useRef<TextInput>(null);
  // Like the other steps: the amount's error shows once the seller has typed in
  // or left the field, or after the first Continue tap, never on arrival.
  const [amountTouched, setAmountTouched] = useState(false);
  const amountError = showErrors || amountTouched ? fieldErrors?.priceAmount : undefined;

  return (
    <View className="gap-5 py-5">
      {/* The step is titled Price, so the field carries one label, Amount. */}
      <View className="gap-1.5">
        <PriceInput
          payload={payload}
          onChange={onChange}
          error={amountError}
          onTouched={() => setAmountTouched(true)}
          disabled={disabled}
          inputRef={amountRef}
        />
        <TmtEquivalent amount={tmtEquivalent} />
      </View>
      <CurrencyButtons
        payload={payload}
        onChange={onChange}
        disabled={disabled}
        onSwitched={() => amountRef.current?.focus()}
      />
      <SellerTerms payload={payload} onChange={onChange} disabled={disabled} />
    </View>
  );
}
