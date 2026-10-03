import { ChevronLeft, AlertCircle, RefreshCw } from "lucide-react-native";
import { useEffect, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface FooterAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

interface UploadStatusChip {
  inflight: number;
  failed: number;
  total: number;
}

interface WizardLayoutProps {
  onHeaderHeightChange?: (height: number) => void;
  routeTitle: string;
  stepTitle: string;
  stepNumber: number;
  stepCount: number;
  onBack: () => void;
  onContinue: () => void;
  onPublish: () => void;
  onReturnToReview?: () => void;
  onDiscard: () => void;
  mode: "create" | "edit";
  editDetourActive: boolean;
  canContinue: boolean;
  canPublish: boolean;
  canGoBack: boolean;
  isLastStep: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  onRetrySave: () => void;
  progressPercent: number;
  children: React.ReactNode;
  disabledReason?: string;
  secondaryAction?: FooterAction;
  publishLabel?: string;
  discardTitle?: string;
  discardDescription?: string;
  isDiscarding?: boolean;
  discardError?: string | null;
  uploadStatus?: UploadStatusChip;
}

function WizardHeader({
  onHeaderHeightChange,
  routeTitle,
  stepTitle,
  stepNumber,
  stepCount,
  canGoBack,
  onBack,
  onOpenDiscard,
  progressPercent,
  saveStatus,
  onRetrySave,
}: {
  onHeaderHeightChange?: (height: number) => void;
  routeTitle: string;
  stepTitle: string;
  stepNumber: number;
  stepCount: number;
  canGoBack: boolean;
  onBack: () => void;
  onOpenDiscard: () => void;
  progressPercent: number;
  saveStatus: WizardLayoutProps["saveStatus"];
  onRetrySave: () => void;
}) {
  const { t } = useTranslation();
  const stepPosition = t("stepOf", { step: stepNumber, total: stepCount });
  // A screen reader hears the step title with its position each time a step opens.
  const stepAnnouncement = `${stepTitle}, ${stepPosition}`;
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(stepAnnouncement);
  }, [stepAnnouncement]);

  const saveStatusText =
    saveStatus === "saving"
      ? t("savingEllipsis")
      : saveStatus === "error"
        ? t("couldNotSave")
        : saveStatus === "saved"
          ? t("saved")
          : null;

  const saveStatusClass =
    saveStatus === "error"
      ? "text-destructive"
      : saveStatus === "saved"
        ? "text-success-500"
        : "text-muted-foreground";

  return (
    <View
      onLayout={(event) => onHeaderHeightChange?.(event.nativeEvent.layout.height)}
      className="border-b border-border px-5 py-3 gap-2">
      {/* Row 1: nav + position marker + inline save status + cancel */}
      <View className="flex-row items-center justify-between">
        {canGoBack ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-10 px-0 -ml-1"
            onPress={onBack}
            accessibilityLabel={t("back")}
          >
            <View className="flex-row items-center gap-0.5">
              <Icon as={ChevronLeft} className="size-5 text-foreground" />
              <Text className="text-sm font-medium text-foreground">{t("back")}</Text>
            </View>
          </Button>
        ) : (
          <View className="w-16" />
        )}

        <View className="flex-row items-center gap-1 flex-1 justify-center">
          {/* The heading below already reads the position, so this row reads only the route. */}
          <Text className="text-xs text-muted-foreground" accessibilityLabel={routeTitle}>
            {routeTitle} · {stepPosition}
          </Text>
          {saveStatusText && (
            <Text className={cn("text-xs", saveStatusClass)}>
              {" · "}{saveStatusText}
            </Text>
          )}
          {saveStatus === "error" && (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0 py-0"
              onPress={onRetrySave}
            >
              <Text className="text-xs text-destructive">{t("retry")}</Text>
            </Button>
          )}
        </View>

        <Button
          variant="ghost"
          size="sm"
          className="h-10 px-0 -mr-1"
          onPress={onOpenDiscard}
          accessibilityLabel={t("discard")}
        >
          <Text className="text-sm font-medium text-muted-foreground">{t("cancel")}</Text>
        </Button>
      </View>

      {/* Row 2: the prominent step title — the ONE title */}
      <Text
        className="text-2xl font-heading text-foreground"
        accessibilityRole="header"
        accessibilityLabel={stepAnnouncement}
      >
        {stepTitle}
      </Text>

      {/* Row 3: progress */}
      <Progress
        value={progressPercent}
        className="bg-muted h-1"
        indicatorClassName="bg-foreground"
      />
    </View>
  );
}

function SaveErrorBanner({
  saveStatus,
  saveError,
  onRetrySave,
}: {
  saveStatus: WizardLayoutProps["saveStatus"];
  saveError: string | null;
  onRetrySave: () => void;
}) {
  if (saveStatus !== "error" || !saveError) return null;

  return (
    <View className="mx-5 mt-3 flex-row items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
      <Icon as={AlertCircle} className="size-4 text-destructive" />
      <Text className="flex-1 text-sm text-destructive">{saveError}</Text>
      <Button variant="ghost" size="sm" onPress={onRetrySave}>
        <Icon as={RefreshCw} className="size-4 text-destructive" />
      </Button>
    </View>
  );
}

function WizardFooter({
  isLastStep,
  canContinue,
  canPublish,
  canGoBack,
  onBack,
  onContinue,
  onPublish,
  onReturnToReview,
  mode,
  editDetourActive,
  disabledReason,
  secondaryAction,
  publishLabel,
}: {
  isLastStep: boolean;
  canContinue: boolean;
  canPublish: boolean;
  canGoBack: boolean;
  onBack: () => void;
  onContinue: () => void;
  onPublish: () => void;
  onReturnToReview?: () => void;
  mode: "create" | "edit";
  editDetourActive: boolean;
  disabledReason?: string;
  secondaryAction?: FooterAction;
  publishLabel?: string;
}) {
  const { t } = useTranslation();
  const primaryDisabled = isLastStep ? !canPublish : !canContinue;
  const showDisabledReason = primaryDisabled && Boolean(disabledReason);
  const isEditReview = mode === "edit" && isLastStep;

  if (editDetourActive) {
    return (
      <View className="border-t border-border px-5 py-3 gap-2">
        {showDisabledReason && (
          <Text className="text-xs text-muted-foreground">
            {disabledReason}
          </Text>
        )}
        <Button
          variant="default"
          size="pill"
          className="w-full"
          onPress={onReturnToReview}
          disabled={primaryDisabled || !onReturnToReview}
        >
          <Text>{t("done")}</Text>
        </Button>
      </View>
    );
  }

  if (isEditReview) {
    return (
      <View className="border-t border-border px-5 py-3 gap-2">
        {showDisabledReason && (
          <Text className="text-xs text-muted-foreground">
            {disabledReason}
          </Text>
        )}
        <Button
          variant="brand"
          size="pill"
          className="w-full"
          onPress={onPublish}
          disabled={!canPublish}
        >
          <Text>{publishLabel ?? t("publish")}</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="border-t border-border px-5 py-3 gap-2">
      {showDisabledReason && (
        <Text className="text-xs text-muted-foreground">
          {disabledReason}
        </Text>
      )}
      <View className="flex-row gap-3">
        {canGoBack ? (
          <Button
            variant="outline"
            size="pill"
            className="flex-1"
            onPress={onBack}
          >
            <Text>{t("back")}</Text>
          </Button>
        ) : secondaryAction ? (
          <Button
            variant="outline"
            size="pill"
            className="flex-1"
            onPress={secondaryAction.onPress}
            disabled={secondaryAction.disabled}
          >
            <Text>{secondaryAction.label}</Text>
          </Button>
        ) : (
          <View className="flex-1" />
        )}

        {isLastStep ? (
          <Button
            variant="brand"
            size="pill"
            className="flex-1"
            onPress={onPublish}
            disabled={!canPublish}
          >
            <Text>{publishLabel ?? t("publish")}</Text>
          </Button>
        ) : (
          <Button
            variant="default"
            size="pill"
            className="flex-1"
            onPress={onContinue}
            disabled={!canContinue}
          >
            <Text>{t("continue")}</Text>
          </Button>
        )}
      </View>

      {canGoBack && secondaryAction && (
        <Button
          variant="link"
          className="self-start"
          onPress={secondaryAction.onPress}
          disabled={secondaryAction.disabled}
        >
          <Text className="text-sm text-foreground underline">
            {secondaryAction.label}
          </Text>
        </Button>
      )}
    </View>
  );
}

function DiscardConfirmationDialog({
  open,
  onOpenChange,
  onDiscard,
  discardTitle,
  discardDescription,
  isDiscarding,
  discardError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  discardTitle: string;
  discardDescription: string;
  isDiscarding?: boolean;
  discardError?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{discardTitle}</AlertDialogTitle>
          <AlertDialogDescription>{discardDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        {discardError ? (
          <Text className="text-sm text-destructive">{discardError}</Text>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDiscarding} onPress={() => onOpenChange(false)}>
            <Text>{t("keepEditing")}</Text>
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive active:bg-destructive/90"
            disabled={isDiscarding}
            onPress={() => {
              onDiscard();
            }}
          >
            {isDiscarding ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="white" />
                <Text className="text-destructive-foreground">{t("discarding")}</Text>
              </View>
            ) : (
              <Text className="text-destructive-foreground">{t("discard")}</Text>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function WizardLayout({
  onHeaderHeightChange,
  routeTitle,
  stepTitle,
  stepNumber,
  stepCount,
  onBack,
  onContinue,
  onPublish,
  onReturnToReview,
  onDiscard,
  mode,
  editDetourActive,
  canContinue,
  canPublish,
  canGoBack,
  isLastStep,
  saveStatus,
  saveError,
  onRetrySave,
  progressPercent,
  children,
  disabledReason,
  secondaryAction,
  publishLabel,
  discardTitle,
  discardDescription,
  isDiscarding = false,
  discardError = null,
  uploadStatus,
}: WizardLayoutProps) {
  const { t } = useTranslation();
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <WizardHeader
        onHeaderHeightChange={onHeaderHeightChange}
        routeTitle={routeTitle}
        stepTitle={stepTitle}
        stepNumber={stepNumber}
        stepCount={stepCount}
        canGoBack={canGoBack}
        onBack={onBack}
        onOpenDiscard={() => setShowDiscardDialog(true)}
        progressPercent={progressPercent}
        saveStatus={saveStatus}
        onRetrySave={onRetrySave}
      />

      <SaveErrorBanner
        saveStatus={saveStatus}
        saveError={saveError}
        onRetrySave={onRetrySave}
      />

      {/* Content area: flex-1 so footer sticks to bottom when content is short,
          ScrollView without flex-1 so it shrinks to content height with no gap */}
      <View className="flex-1">
        <ScrollView>
          <View className="w-full px-5">{children}</View>
        </ScrollView>

        <View className="mt-auto">
          {uploadStatus && (uploadStatus.inflight > 0 || uploadStatus.failed > 0) && (
            <View className="mx-5 mb-2 flex-row items-center gap-2 rounded-lg bg-muted px-3 py-2">
              {uploadStatus.inflight > 0 && (
                <View className="flex-row items-center gap-1.5">
                  <ActivityIndicator size="small" />
                  <Text className="text-xs text-muted-foreground">
                    {uploadStatus.inflight} {t("uploading")}
                  </Text>
                </View>
              )}
              {uploadStatus.failed > 0 && (
                <View className="flex-row items-center gap-1.5">
                  <Icon as={AlertCircle} className="size-3.5 text-destructive" />
                  <Text className="text-xs text-destructive">
                    {uploadStatus.failed} {t("failed")}
                  </Text>
                </View>
              )}
            </View>
          )}

          <WizardFooter
            isLastStep={isLastStep}
            canContinue={canContinue}
            canPublish={canPublish}
            canGoBack={canGoBack}
            onBack={onBack}
            onContinue={onContinue}
            onPublish={onPublish}
            onReturnToReview={onReturnToReview}
            mode={mode}
            editDetourActive={editDetourActive}
            disabledReason={disabledReason}
            secondaryAction={secondaryAction}
            publishLabel={publishLabel}
          />
        </View>
      </View>

      <DiscardConfirmationDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
        onDiscard={onDiscard}
        discardTitle={discardTitle ?? t("discardListingTitle")}
        discardDescription={discardDescription ?? t("discardListingDescription")}
        isDiscarding={isDiscarding}
        discardError={discardError}
      />
    </SafeAreaView>
  );
}
