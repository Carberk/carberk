import { AlertCircle, X } from "lucide-react-native";
import { useMemo, useState, useCallback } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Enums } from "@auto-tm/contracts";
import type { WizardSchemas, ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { useColors } from "../../api/catalog/useColors";
import { useBodyTypes } from "../../api/catalog/useBodyTypes";
import { useEngineTypes } from "../../api/catalog/useEngineTypes";
import { useTransmissions } from "../../api/catalog/useTransmissions";
import { useDriveTypes } from "../../api/catalog/useDriveTypes";

import {
  conditionDisclosureFieldErrors,
  type ConditionDisclosureFieldErrors,
} from "./conditionDisclosureErrors";

import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

interface Step4SpecsProps {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  fieldErrors?: Record<string, string>;
  showErrors?: boolean;
  disabled?: boolean;
}

function SheetCloseButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="icon"
      onPress={onPress}
      accessibilityLabel={t("cancel")}
    >
      <Icon as={X} className="size-5 text-foreground" />
    </Button>
  );
}

function useCatalogPicker<T extends { id: string; name: string }>(
  items: T[],
) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return items;
    return items.filter((i) =>
      i.name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [items, search]);

  const reset = () => setSearch("");

  return { open, setOpen, search, setSearch, filtered, reset };
}

function SpecPickerSheet({
  open,
  onOpenChange,
  title,
  search,
  onSearchChange,
  items,
  selectedId,
  onSelect,
  isLoading,
  isError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  search: string;
  onSearchChange: (text: string) => void;
  items: { id: string; name: string }[];
  selectedId?: string;
  onSelect: (id: string) => void;
  isLoading?: boolean;
  isError?: boolean;
}) {
  const { t } = useTranslation();
  const showSearch = items.length > 12;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent compact>
        <SheetHeader className="flex-row items-center justify-between">
          <SheetTitle>{title}</SheetTitle>
          <SheetCloseButton onPress={() => onOpenChange(false)} />
        </SheetHeader>
        {showSearch && (
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChangeText={onSearchChange}
            className="mb-2"
          />
        )}
        {isLoading ? (
          <View className="py-4 items-center">
            <ActivityIndicator size="small" />
            <Text className="mt-2 text-callout text-muted-foreground">{t("savingEllipsis")}</Text>
          </View>
        ) : isError ? (
          <View className="py-4 items-center">
            <Icon as={AlertCircle} className="size-6 text-destructive" />
            <Text className="mt-2 text-callout text-destructive">{t("failedToLoadOptions")}</Text>
          </View>
        ) : items.length === 0 ? (
          <View className="py-4 items-center">
            <Text className="text-callout text-muted-foreground">{t("noOptionsAvailable")}</Text>
          </View>
        ) : (
          <ScrollView>
            {items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => onSelect(item.id)}
                className={`flex-row items-center border-b border-border py-3 px-1 ${
                  item.id === selectedId ? "bg-muted" : ""
                }`}
              >
                {item.id === selectedId && (
                  <View className="mr-2 h-2 w-2 rounded-full bg-primary" />
                )}
                <Text className="text-body text-foreground">{item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ColorPickerSheet({
  open,
  onOpenChange,
  colors,
  selectedId,
  onSelect,
  isLoading,
  isError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colors: { id: string; name: string; hex?: string | null }[];
  selectedId?: string;
  onSelect: (id: string) => void;
  isLoading?: boolean;
  isError?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent compact>
        <SheetHeader className="flex-row items-center justify-between">
          <SheetTitle>{t("selectColor")}</SheetTitle>
          <SheetCloseButton onPress={() => onOpenChange(false)} />
        </SheetHeader>
        {isLoading ? (
          <View className="py-4 items-center">
            <ActivityIndicator size="small" />
            <Text className="mt-2 text-callout text-muted-foreground">{t("savingEllipsis")}</Text>
          </View>
        ) : isError ? (
          <View className="py-4 items-center">
            <Icon as={AlertCircle} className="size-6 text-destructive" />
            <Text className="mt-2 text-callout text-destructive">{t("failedToLoadColors")}</Text>
          </View>
        ) : colors.length === 0 ? (
          <View className="py-4 items-center">
            <Text className="text-callout text-muted-foreground">{t("noColorsAvailable")}</Text>
          </View>
        ) : (
          <ScrollView>
            {colors.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => onSelect(c.id)}
                className={`flex-row items-center gap-3 border-b border-border py-3 px-1 ${
                  c.id === selectedId ? "bg-muted" : ""
                }`}
              >
                {c.hex ? (
                  <View
                    className="h-6 w-6 rounded-full border border-border"
                    style={{ backgroundColor: c.hex }}
                  />
                ) : (
                  <View className="h-6 w-6 rounded-full border border-border bg-muted" />
                )}
                <Text className="text-body text-foreground">{c.name}</Text>
                {c.id === selectedId && (
                  <View className="ml-auto mr-2 h-2 w-2 rounded-full bg-primary" />
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </SheetContent>
    </Sheet>
  );
}

function useSpecsStep(payload: WizardSchemas.WizardDraftPayload) {
  const condition = payload.condition ?? Enums.ListingCondition.Used;

  const { data: colorsData, isPending: colorsLoading, isError: colorsError } = useColors();
  const colorPicker = useCatalogPicker(colorsData?.items ?? []);
  const selectedColor = colorsData?.items.find((c) => c.id === payload.colorId);

  const { data: bodyTypesData, isPending: bodyTypesLoading, isError: bodyTypesError } = useBodyTypes();
  const bodyPicker = useCatalogPicker(bodyTypesData?.items ?? []);
  const selectedBodyType = bodyTypesData?.items.find(
    (b) => b.id === payload.bodyTypeId,
  );

  const { data: transmissionsData, isPending: transmissionsLoading, isError: transmissionsError } = useTransmissions();
  const transmissionPicker = useCatalogPicker(transmissionsData?.items ?? []);
  const selectedTransmission = transmissionsData?.items.find(
    (t) => t.id === payload.transmissionId,
  );

  const { data: driveTypesData, isPending: driveTypesLoading, isError: driveTypesError } = useDriveTypes();
  const drivePicker = useCatalogPicker(driveTypesData?.items ?? []);
  const selectedDriveType = driveTypesData?.items.find(
    (d) => d.id === payload.driveTypeId,
  );

  const { data: engineTypesData, isPending: engineTypesLoading, isError: engineTypesError } = useEngineTypes();
  const enginePicker = useCatalogPicker(engineTypesData?.items ?? []);
  const selectedEngineType = engineTypesData?.items.find(
    (e) => e.id === payload.engineTypeId,
  );

  return {
    condition,
    colorPicker,
    selectedColor,
    bodyPicker,
    selectedBodyType,
    transmissionPicker,
    selectedTransmission,
    drivePicker,
    selectedDriveType,
    enginePicker,
    selectedEngineType,
    colorsLoading,
    colorsError,
    bodyTypesLoading,
    bodyTypesError,
    transmissionsLoading,
    transmissionsError,
    driveTypesLoading,
    driveTypesError,
    engineTypesLoading,
    engineTypesError,
  };
}

function wrapDisabled(children: React.ReactNode, disabled: boolean) {
  if (!disabled) return <>{children}</>;
  return <View className="opacity-50">{children}</View>;
}

function SpecSheets({
  payload,
  onChange,
  specs,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  specs: ReturnType<typeof useSpecsStep>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ColorPickerSheet
        open={specs.colorPicker.open}
        onOpenChange={(open) => {
          specs.colorPicker.setOpen(open);
          if (!open) specs.colorPicker.reset();
        }}
        colors={specs.colorPicker.filtered}
        selectedId={payload.colorId}
        onSelect={(id) => {
          onChange({ colorId: id });
          specs.colorPicker.setOpen(false);
          specs.colorPicker.reset();
        }}
        isLoading={specs.colorsLoading}
        isError={specs.colorsError}
      />

      <SpecPickerSheet
        open={specs.bodyPicker.open}
        onOpenChange={(open) => {
          specs.bodyPicker.setOpen(open);
          if (!open) specs.bodyPicker.reset();
        }}
        title={t("selectBodyType")}
        search={specs.bodyPicker.search}
        onSearchChange={specs.bodyPicker.setSearch}
        items={specs.bodyPicker.filtered}
        selectedId={payload.bodyTypeId}
        onSelect={(id) => {
          onChange({ bodyTypeId: id });
          specs.bodyPicker.setOpen(false);
          specs.bodyPicker.reset();
        }}
        isLoading={specs.bodyTypesLoading}
        isError={specs.bodyTypesError}
      />

      <SpecPickerSheet
        open={specs.transmissionPicker.open}
        onOpenChange={(open) => {
          specs.transmissionPicker.setOpen(open);
          if (!open) specs.transmissionPicker.reset();
        }}
        title={t("selectTransmission")}
        search={specs.transmissionPicker.search}
        onSearchChange={specs.transmissionPicker.setSearch}
        items={specs.transmissionPicker.filtered}
        selectedId={payload.transmissionId}
        onSelect={(id) => {
          onChange({ transmissionId: id });
          specs.transmissionPicker.setOpen(false);
          specs.transmissionPicker.reset();
        }}
        isLoading={specs.transmissionsLoading}
        isError={specs.transmissionsError}
      />

      <SpecPickerSheet
        open={specs.drivePicker.open}
        onOpenChange={(open) => {
          specs.drivePicker.setOpen(open);
          if (!open) specs.drivePicker.reset();
        }}
        title={t("selectDriveType")}
        search={specs.drivePicker.search}
        onSearchChange={specs.drivePicker.setSearch}
        items={specs.drivePicker.filtered}
        selectedId={payload.driveTypeId}
        onSelect={(id) => {
          onChange({ driveTypeId: id });
          specs.drivePicker.setOpen(false);
          specs.drivePicker.reset();
        }}
        isLoading={specs.driveTypesLoading}
        isError={specs.driveTypesError}
      />

      <SpecPickerSheet
        open={specs.enginePicker.open}
        onOpenChange={(open) => {
          specs.enginePicker.setOpen(open);
          if (!open) specs.enginePicker.reset();
        }}
        title={t("selectEngineType")}
        search={specs.enginePicker.search}
        onSearchChange={specs.enginePicker.setSearch}
        items={specs.enginePicker.filtered}
        selectedId={payload.engineTypeId}
        onSelect={(id) => {
          onChange({ engineTypeId: id });
          specs.enginePicker.setOpen(false);
          specs.enginePicker.reset();
        }}
        isLoading={specs.engineTypesLoading}
        isError={specs.engineTypesError}
      />
    </>
  );
}

export default function Step4Specs({
  payload,
  onChange,
  fieldErrors,
  showErrors = false,
  disabled = false,
}: Step4SpecsProps) {
  const { t } = useTranslation();
  const specs = useSpecsStep(payload);
  const disclosureErrors = conditionDisclosureFieldErrors(
    fieldErrors,
    payload.conditionDisclosure,
    specs.condition,
  );

  return (
    <View className="gap-5 py-5">
      <ConditionToggle
        condition={specs.condition}
        disclosure={payload.conditionDisclosure}
        error={specs.condition === Enums.ListingCondition.New ? disclosureErrors.damaged : undefined}
        disabled={disabled}
        onChange={onChange}
      />

      {specs.condition === Enums.ListingCondition.Used && (
        <MileageInput
          payload={payload}
          onChange={onChange}
          fieldErrors={fieldErrors}
          showErrors={showErrors}
          disabled={disabled}
        />
      )}

      {/* Optional specifications share one group, including Color. */}
      <View className="gap-5 border-t border-border pt-5">
        <Text
          accessibilityRole="header"
          className="text-subhead font-heading font-semibold text-foreground"
        >
          {t("moreDetails")}
        </Text>
        <BodyTypePicker
          selectedBodyType={specs.selectedBodyType}
          disabled={disabled}
          onPress={() => specs.bodyPicker.setOpen(true)}
        />
        <TransmissionPicker
          selectedTransmission={specs.selectedTransmission}
          disabled={disabled}
          onPress={() => specs.transmissionPicker.setOpen(true)}
        />
        <EngineTypePicker
          selectedEngineType={specs.selectedEngineType}
          disabled={disabled}
          onPress={() => specs.enginePicker.setOpen(true)}
        />
        <DriveTypePicker
          selectedDriveType={specs.selectedDriveType}
          disabled={disabled}
          onPress={() => specs.drivePicker.setOpen(true)}
        />
        <ColorPicker
          selectedColor={specs.selectedColor}
          disabled={disabled}
          onPress={() => specs.colorPicker.setOpen(true)}
        />
        <EnginePowerInput
          payload={payload}
          onChange={onChange}
          disabled={disabled}
          fieldErrors={fieldErrors}
          showErrors={showErrors}
        />
      </View>

      {/* Keep the seller disclosure and known issues together after the specifications. */}
      <ConditionDisclosureSection
        key={specs.condition}
        showErrors={showErrors}
        payload={payload}
        condition={specs.condition}
        errors={disclosureErrors}
        onChange={onChange}
        disabled={disabled}
      />

      <SpecSheets payload={payload} onChange={onChange} specs={specs} />
    </View>
  );
}

function ConditionToggle({
  condition,
  disclosure,
  error,
  disabled,
  onChange,
}: {
  condition: Enums.ListingCondition;
  disclosure: ListingsSchemas.DraftConditionDisclosure | undefined;
  error?: string;
  disabled: boolean;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-1.5">
      <Text className="text-callout font-medium text-foreground">{t("condition")}</Text>
      <View className="flex-row rounded-lg bg-muted p-1">
        <Pressable
          onPress={() => {
            // ADR-0080: a New car is not asked Damaged and stores not damaged.
            onChange({
              condition: Enums.ListingCondition.New,
              mileageKm: undefined,
              conditionDisclosure: { ...disclosure, damaged: false },
            });
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ selected: condition === Enums.ListingCondition.New }}
          accessibilityLabel={t("new")}
          className={cn(
            "flex-1 items-center justify-center rounded-md py-2.5",
            condition === Enums.ListingCondition.New && "bg-card",
            disabled && "opacity-50",
          )}
        >
          <Text
            className={cn(
              "text-callout font-medium",
              condition === Enums.ListingCondition.New
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {t("new")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (condition !== Enums.ListingCondition.New) {
              onChange({ condition: Enums.ListingCondition.Used });
              return;
            }
            // Clear the answer New stored, so a Used car is never published
            // on an answer the seller did not give (ADR-0080).
            const knownIssuesText = disclosure?.knownIssuesText;
            onChange({
              condition: Enums.ListingCondition.Used,
              conditionDisclosure: knownIssuesText === undefined ? {} : { knownIssuesText },
            });
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ selected: condition === Enums.ListingCondition.Used }}
          accessibilityLabel={t("used")}
          className={cn(
            "flex-1 items-center justify-center rounded-md py-2.5",
            condition === Enums.ListingCondition.Used && "bg-card",
            disabled && "opacity-50",
          )}
        >
          <Text
            className={cn(
              "text-callout font-medium",
              condition === Enums.ListingCondition.Used
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {t("used")}
          </Text>
        </Pressable>
      </View>
      {error && (
        <Text className="text-callout text-destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

function MileageInput({
  payload,
  onChange,
  fieldErrors,
  showErrors,
  disabled,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  fieldErrors?: Record<string, string>;
  showErrors: boolean;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [touched, setTouched] = useState(false);
  return (
    <View className="gap-1.5">
      <Text className="text-callout font-medium text-foreground">
        {t("mileage")} *
      </Text>
      {wrapDisabled(
        <Input
          value={payload.mileageKm?.toString() ?? ""}
          onBlur={() => setTouched(true)}
          onChangeText={(text) => {
            setTouched(true);
            const num = parseInt(text, 10);
            onChange({
              mileageKm: Number.isNaN(num) ? undefined : num,
            });
          }}
          placeholder={t("mileagePlaceholder")}
          keyboardType="number-pad"
          editable={!disabled}
        />,
        disabled,
      )}
      {(showErrors || touched) && fieldErrors?.mileageKm && (
        <Text className="text-callout text-destructive" accessibilityLiveRegion="polite">
          {fieldErrors.mileageKm}
        </Text>
      )}
    </View>
  );
}

function ColorPicker({
  selectedColor,
  disabled,
  onPress,
}: {
  selectedColor?: { name: string; hex?: string | null };
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-1.5">
      <Text className="text-callout font-medium text-foreground">{t("color")}</Text>
      {wrapDisabled(
        <Button
          variant="outline"
          onPress={onPress}
          disabled={disabled}
          className="justify-start min-h-[52px]"
        >
          {selectedColor?.hex && (
            <View
              className="mr-3 h-6 w-6 rounded-full border border-border"
              style={{ backgroundColor: selectedColor.hex }}
            />
          )}
          <Text
            className={
              selectedColor ? "text-foreground font-medium" : "text-muted-foreground"
            }
          >
            {selectedColor?.name ?? t("selectColor")}
          </Text>
        </Button>,
        disabled,
      )}
    </View>
  );
}

function BodyTypePicker({
  selectedBodyType,
  disabled,
  onPress,
}: {
  selectedBodyType?: { name: string };
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-1.5">
      <Text className="text-callout font-medium text-foreground">{t("bodyType")}</Text>
      {wrapDisabled(
        <Button
          variant="outline"
          onPress={onPress}
          disabled={disabled}
          className="justify-start min-h-[52px]"
        >
          <Text
            className={
              selectedBodyType ? "text-foreground font-medium" : "text-muted-foreground"
            }
          >
            {selectedBodyType?.name ?? t("selectBodyType")}
          </Text>
        </Button>,
        disabled,
      )}
    </View>
  );
}

function TransmissionPicker({
  selectedTransmission,
  disabled,
  onPress,
}: {
  selectedTransmission?: { name: string };
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-1.5">
      <Text className="text-callout font-medium text-foreground">
        {t("transmission")}
      </Text>
      {wrapDisabled(
        <Button
          variant="outline"
          onPress={onPress}
          disabled={disabled}
          className="justify-start min-h-[52px]"
        >
          <Text
            className={
              selectedTransmission
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            }
          >
            {selectedTransmission?.name ?? t("selectTransmission")}
          </Text>
        </Button>,
        disabled,
      )}
    </View>
  );
}

function DriveTypePicker({
  selectedDriveType,
  disabled,
  onPress,
}: {
  selectedDriveType?: { name: string };
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-1.5">
      <Text className="text-callout font-medium text-foreground">{t("driveType")}</Text>
      {wrapDisabled(
        <Button
          variant="outline"
          onPress={onPress}
          disabled={disabled}
          className="justify-start min-h-[52px]"
        >
          <Text
            className={
              selectedDriveType ? "text-foreground font-medium" : "text-muted-foreground"
            }
          >
            {selectedDriveType?.name ?? t("selectDriveType")}
          </Text>
        </Button>,
        disabled,
      )}
    </View>
  );
}

function EngineTypePicker({
  selectedEngineType,
  disabled,
  onPress,
}: {
  selectedEngineType?: { name: string };
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-1.5">
      <Text className="text-callout font-medium text-foreground">{t("engineType")}</Text>
      {wrapDisabled(
        <Button
          variant="outline"
          onPress={onPress}
          disabled={disabled}
          className="justify-start min-h-[52px]"
        >
          <Text
            className={
              selectedEngineType ? "text-foreground font-medium" : "text-muted-foreground"
            }
          >
            {selectedEngineType?.name ?? t("selectEngineType")}
          </Text>
        </Button>,
        disabled,
      )}
    </View>
  );
}

function EnginePowerInput({
  payload,
  onChange,
  disabled,
  fieldErrors,
  showErrors,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  disabled: boolean;
  fieldErrors?: Record<string, string>;
  showErrors: boolean;
}) {
  const { t } = useTranslation();
  const [touched, setTouched] = useState(false);
  return (
    <View className="gap-1.5">
      <Text className="text-callout font-medium text-foreground">
        {t("enginePower")}
      </Text>
      {wrapDisabled(
        <Input
          value={payload.enginePower?.toString() ?? ""}
          onBlur={() => setTouched(true)}
          onChangeText={(text) => {
            setTouched(true);
            const num = parseInt(text, 10);
            onChange({
              enginePower: Number.isNaN(num) ? undefined : num,
            });
          }}
          placeholder={t("enginePowerPlaceholder")}
          keyboardType="number-pad"
          editable={!disabled}
        />,
        disabled,
      )}
      {(showErrors || touched) && fieldErrors?.enginePower && (
        <Text className="text-callout text-destructive" accessibilityLiveRegion="polite">
          {fieldErrors.enginePower}
        </Text>
      )}
    </View>
  );
}

function ConditionDisclosureSection({
  payload,
  condition,
  errors,
  showErrors,
  onChange,
  disabled,
}: {
  payload: WizardSchemas.WizardDraftPayload;
  condition: Enums.ListingCondition;
  errors: ConditionDisclosureFieldErrors;
  showErrors: boolean;
  onChange: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [damagedTouched, setDamagedTouched] = useState(false);
  const [knownIssuesTouched, setKnownIssuesTouched] = useState(false);
  const disclosure = payload.conditionDisclosure;
  const isNew = condition === Enums.ListingCondition.New;

  const updateDisclosure = useCallback(
    (patch: Partial<ListingsSchemas.DraftConditionDisclosure>) => {
      onChange({
        conditionDisclosure: { ...disclosure, ...(isNew && { damaged: false }), ...patch },
      });
    },
    [disclosure, isNew, onChange],
  );

  return (
    <View className="gap-5 border-t border-border pt-5">
      <Text accessibilityRole="header" className="text-subhead font-heading font-semibold text-foreground">
        {t("conditionAsStatedBySeller")}
      </Text>

      {!isNew && (
        <View className="gap-1.5">
          <Text className="text-callout font-medium text-foreground">{t("damaged")}</Text>
          <View className="flex-row rounded-lg bg-muted p-1" accessibilityRole="radiogroup">
            {([true, false] as const).map((answer) => {
              const selected = disclosure?.damaged === answer;
              return (
                <Pressable
                  key={String(answer)}
                  onBlur={() => setDamagedTouched(true)}
                  onPress={() => {
                    setDamagedTouched(true);
                    updateDisclosure({ damaged: answer });
                  }}
                  disabled={disabled}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${t("damaged")}: ${answer ? t("yes") : t("no")}`}
                  className={cn(
                    "flex-1 items-center justify-center rounded-md py-2.5",
                    selected && "bg-card",
                    disabled && "opacity-50",
                  )}
                >
                  <Text
                    className={cn(
                      "text-callout font-medium",
                      selected ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {answer ? t("yes") : t("no")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {(showErrors || damagedTouched) && errors.damaged && (
            <Text className="text-callout text-destructive" accessibilityLiveRegion="polite">
              {errors.damaged}
            </Text>
          )}
        </View>
      )}

      <View className="gap-1.5">
        <Text className="text-callout font-medium text-foreground">
          {t("knownIssuesText")}
        </Text>
        {wrapDisabled(
          <Input
            value={disclosure?.knownIssuesText ?? ""}
            onBlur={() => setKnownIssuesTouched(true)}
            onChangeText={(text) => {
              setKnownIssuesTouched(true);
              updateDisclosure({ knownIssuesText: text || undefined });
            }}
            placeholder={t("knownIssuesPlaceholder")}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={1000}
            editable={!disabled}
            className="h-auto min-h-[100px] py-3"
          />,
          disabled,
        )}
        {(showErrors || knownIssuesTouched) && errors.knownIssuesText && (
          <Text className="text-callout text-destructive" accessibilityLiveRegion="polite">
            {errors.knownIssuesText}
          </Text>
        )}
      </View>
    </View>
  );
}

