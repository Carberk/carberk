import { AlertCircle, RefreshCw } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { WizardScrollLock } from "./wizardScrollLock";

import { BackButton } from "@/components/navigation/StackHeader";
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
  routeTitle: string;
  stepTitle: string;
  stepNumber: number;
  stepCount: number;
  onBack: () => void;
  onContinue: () => void;
  onPublish: () => void;
  onReturnToReview?: () => void;
  /**
   * ✕ in the header. Create flow: saves the draft and closes. Edit flow: leaves the
   * edit from its section list. The screen owns the save, the leave rule and its dialog.
   */
  onClose?: () => void;
  /** ✕ is disabled while a close is in progress. */
  isClosing?: boolean;
  mode: "create" | "edit";
  /**
   * Edit flow: this is the Listing's section list, not a step. Its header has ✕ in
   * place of Back, the title alone, and no step position or progress bar.
   */
  sectionList?: boolean;
  /**
   * Edit flow: the car's title, under "Edit listing" on the section list and on
   * every step. An edit's steps have no position in the wizard and no progress bar.
   */
  subtitle?: string;
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
  /** Create flow, last step: what keeps Publish disabled, listed above it in this order. */
  publishBlockers?: string[];
  /** Create flow: Publish reads "Publishing..." and takes no taps. */
  isPublishing?: boolean;
  /** Create flow: why the last publish failed, shown above Publish and announced. */
  publishError?: string | null;
  secondaryAction?: FooterAction;
  publishLabel?: string;
  uploadStatus?: UploadStatusChip;
  /** Tapping the header's upload chip: open Photos. Without it the chip is plain status. */
  onUploadStatusPress?: () => void;
}

/** "Saved", "Saving..." or "Not saved. Retry", read politely by a screen reader. */
function SaveStatusLine({
  saveStatus,
  onRetrySave,
}: {
  saveStatus: WizardLayoutProps["saveStatus"];
  onRetrySave: () => void;
}) {
  const { t } = useTranslation();
  const text =
    saveStatus === "saving"
      ? t("savingEllipsis")
      : saveStatus === "saved"
        ? t("saved")
        : saveStatus === "error"
          ? t("notSavedRetry")
          : null;

  // `accessibilityLiveRegion` covers Android; iOS has no live regions, so it is announced.
  useEffect(() => {
    if (text && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(text);
  }, [text]);

  return (
    <View accessibilityLiveRegion="polite" className="min-h-4">
      {saveStatus === "error" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text ?? undefined}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          className="self-start"
          onPress={onRetrySave}
        >
          <Text className="text-caption text-destructive">{text}</Text>
        </Pressable>
      ) : text ? (
        <Text
          className={cn(
            "text-caption",
            saveStatus === "saved" ? "text-success-500" : "text-muted-foreground",
          )}
        >
          {text}
        </Text>
      ) : null}
    </View>
  );
}

function WizardHeader({
  routeTitle,
  stepTitle,
  stepNumber,
  stepCount,
  canGoBack,
  onBack,
  mode,
  sectionList,
  subtitle,
  onClose,
  isClosing,
  progressPercent,
  saveStatus,
  onRetrySave,
  uploadStatus,
  onUploadStatusPress,
}: {
  routeTitle: string;
  stepTitle: string;
  stepNumber: number;
  stepCount: number;
  canGoBack: boolean;
  onBack: () => void;
  mode: WizardLayoutProps["mode"];
  sectionList: boolean;
  subtitle?: string;
  onClose?: (() => void) | undefined;
  isClosing: boolean;
  progressPercent: number;
  saveStatus: WizardLayoutProps["saveStatus"];
  onRetrySave: () => void;
  uploadStatus?: UploadStatusChip;
  onUploadStatusPress?: () => void;
}) {
  const { t } = useTranslation();
  const stepPosition = t("stepOf", { step: stepNumber, total: stepCount });
  // An edit is not walked step by step: neither its section list nor a step opened
  // from it has a position in the wizard or a progress bar.
  const isEdit = mode === "edit";
  // A screen reader hears the step title, with its position in the create wizard,
  // each time a step opens.
  const stepAnnouncement = isEdit || sectionList ? stepTitle : `${stepTitle}, ${stepPosition}`;
  const closeButton = (
    // Left on the section list of an edit, right in the create wizard; a mounted button is only ever one of them.
    <BackButton
      kind="close"
      onPress={onClose}
      disabled={isClosing}
      accessibilityLabel={t("close")}
    />
  );
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(stepAnnouncement);
  }, [stepAnnouncement]);

  return (
    <View testID="wizard-header" className="gap-2 px-4 pb-3 pt-1">
      {/* Row 1: nav + position marker + close */}
      <View className="min-h-11 flex-row items-center justify-between">
        {sectionList ? (
          closeButton
        ) : canGoBack ? (
          <BackButton onPress={onBack} accessibilityLabel={t("back")} />
        ) : (
          <View className="w-11" />
        )}

        <View className="flex-row items-center gap-1 flex-1 justify-center">
          {/* The heading below already reads the position, so this row reads only the route. */}
          {sectionList ? null : isEdit ? (
            <View className="items-center">
              <Text className="text-caption font-medium text-foreground">{routeTitle}</Text>
              {subtitle ? (
                <Text className="text-caption text-muted-foreground" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text className="text-caption text-muted-foreground" accessibilityLabel={routeTitle}>
              {routeTitle} · {stepPosition}
            </Text>
          )}
        </View>

        {/* An edit is left from its section list; a step opened from it has Back only. */}
        {mode === "create" ? closeButton : <View className="w-11" />}
      </View>

      {/* Row 2: the prominent step title — the ONE title */}
      <Text
        className="text-headline font-heading font-semibold text-foreground"
        accessibilityRole="header"
        accessibilityLabel={stepAnnouncement}
      >
        {stepTitle}
      </Text>
      {sectionList && subtitle ? (
        <Text className="-mt-1 text-callout text-muted-foreground">{subtitle}</Text>
      ) : null}

      {/* Row 3: progress, in the create wizard only */}
      {isEdit || sectionList ? null : (
        <Progress
          testID="wizard-progress"
          value={progressPercent}
          className="bg-muted h-1"
          indicatorClassName="bg-foreground"
        />
      )}

      {/* Row 4: where the draft stands; the line's height is kept so nothing jumps */}
      <SaveStatusLine saveStatus={saveStatus} onRetrySave={onRetrySave} />

      <UploadStatusChipRow
        uploadStatus={uploadStatus}
        onPress={onUploadStatusPress}
      />
    </View>
  );
}

/** Photos still uploading and photos that failed, kept in view on every step. */
function UploadStatusChipRow({
  uploadStatus,
  onPress,
}: {
  uploadStatus?: UploadStatusChip;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  if (!uploadStatus || (uploadStatus.inflight === 0 && uploadStatus.failed === 0)) {
    return null;
  }
  const uploadingText = t("uploadChipUploading", { count: uploadStatus.inflight });
  const failedText = t("uploadChipFailed", { count: uploadStatus.failed });
  const chip = (
    <View className="flex-row items-center gap-3 self-start rounded-full bg-muted px-3 py-1.5">
      {uploadStatus.inflight > 0 && (
        <View className="flex-row items-center gap-1.5">
          <ActivityIndicator size="small" />
          <Text className="text-caption text-muted-foreground">{uploadingText}</Text>
        </View>
      )}
      {uploadStatus.failed > 0 && (
        <View className="flex-row items-center gap-1.5">
          <Icon as={AlertCircle} className="size-3.5 text-destructive" />
          <Text className="text-caption text-destructive">{failedText}</Text>
        </View>
      )}
    </View>
  );
  if (!onPress) return chip;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        uploadStatus.inflight > 0 ? uploadingText : null,
        uploadStatus.failed > 0 ? failedText : null,
      ]
        .filter(Boolean)
        .join(", ")}
      className="min-h-11 justify-center self-start active:opacity-70"
      onPress={onPress}
    >
      {chip}
    </Pressable>
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
      <Text className="flex-1 text-callout text-destructive">{saveError}</Text>
      <Button variant="ghost" size="sm" onPress={onRetrySave}>
        <Icon as={RefreshCw} className="size-4 text-destructive" />
      </Button>
    </View>
  );
}

/** Why the last publish failed, above Publish. It interrupts a screen reader, since the seller just asked to publish. */
function PublishErrorAlert({ message }: { message: string }) {
  // Announced on both platforms: iOS has no live regions, and TalkBack does not
  // reliably read a live region that appears already filled. The alert unmounts
  // while a publish runs, so each failure announces.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={message}
      accessibilityLiveRegion="assertive"
      className="flex-row items-start gap-2 rounded-lg border border-destructive px-3 py-2"
    >
      <Icon as={AlertCircle} className="mt-0.5 size-4 text-destructive" />
      <Text className="flex-1 text-callout text-destructive">{message}</Text>
    </View>
  );
}

function WizardFooter({
  isLastStep,
  canContinue,
  canPublish,
  onContinue,
  onPublish,
  onReturnToReview,
  mode,
  editDetourActive,
  disabledReason,
  publishBlockers,
  isPublishing = false,
  publishError,
  secondaryAction,
  publishLabel,
}: {
  publishBlockers?: string[];
  isPublishing?: boolean;
  publishError?: string | null;
  isLastStep: boolean;
  canContinue: boolean;
  canPublish: boolean;
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
      <>
        {showDisabledReason && (
          <Text className="px-1 text-caption text-muted-foreground">
            {disabledReason}
          </Text>
        )}
        <Button
          variant="default"
          size="lg"
          className="w-full"
          onPress={onReturnToReview}
          disabled={primaryDisabled || !onReturnToReview}
        >
          <Text>{t("done")}</Text>
        </Button>
      </>
    );
  }

  if (isEditReview) {
    return (
      <>
        {showDisabledReason && (
          <Text className="px-1 text-caption text-muted-foreground">
            {disabledReason}
          </Text>
        )}
        <Button
          variant="brand"
          size="lg"
          className="w-full"
          onPress={onPublish}
          disabled={!canPublish}
        >
          <Text>{publishLabel ?? t("publish")}</Text>
        </Button>
      </>
    );
  }

  return (
    <>
      {showDisabledReason && (
        <Text className="px-1 text-caption text-muted-foreground">
          {disabledReason}
        </Text>
      )}
      {isLastStep && publishBlockers && publishBlockers.length > 0 ? (
        // One line each, so a screen reader reads them in this order before Publish.
        <View testID="publish-blockers" className="gap-0.5 px-1">
          {publishBlockers.map((line) => (
            <Text key={line} className="text-caption text-destructive">
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {isLastStep && publishError && !isPublishing ? <PublishErrorAlert message={publishError} /> : null}
      {/* Back is in the header, so the step's one action has the full width. */}
      {isLastStep ? (
        <Button
          variant="brand"
          size="lg"
          className="w-full"
          onPress={onPublish}
          // Disabled while publishing, so a second tap cannot publish twice.
          disabled={!canPublish || isPublishing}
          accessibilityState={{ busy: isPublishing }}
        >
          <Text>{isPublishing ? t("publishingEllipsis") : (publishLabel ?? t("publish"))}</Text>
        </Button>
      ) : (
        <Button
          variant="default"
          size="lg"
          className="w-full"
          onPress={onContinue}
          disabled={!canContinue}
        >
          <Text>{t("continue")}</Text>
        </Button>
      )}

      {secondaryAction && (
        <Button
          variant="link"
          className="self-center"
          onPress={secondaryAction.onPress}
          disabled={secondaryAction.disabled}
        >
          <Text className="text-callout text-foreground underline">
            {secondaryAction.label}
          </Text>
        </Button>
      )}
    </>
  );
}

export function WizardLayout({
  routeTitle,
  stepTitle,
  stepNumber,
  stepCount,
  onBack,
  onContinue,
  onPublish,
  onReturnToReview,
  onClose,
  isClosing = false,
  mode,
  sectionList = false,
  subtitle,
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
  publishBlockers,
  isPublishing,
  publishError,
  secondaryAction,
  publishLabel,
  uploadStatus,
  onUploadStatusPress,
}: WizardLayoutProps) {
  const [scrollLocked, setScrollLocked] = useState(false);
  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Android is edge to edge, so the window does not resize for the keyboard: the
          whole column pads, the step scrolls and the action bar rides above the keys.
          iOS keeps its layout. */}
      <KeyboardAvoidingView enabled={Platform.OS === "android"} behavior="padding" className="flex-1">
      <WizardHeader
        routeTitle={routeTitle}
        stepTitle={stepTitle}
        stepNumber={stepNumber}
        stepCount={stepCount}
        canGoBack={canGoBack}
        onBack={onBack}
        mode={mode}
        sectionList={sectionList}
        subtitle={subtitle}
        onClose={onClose}
        isClosing={isClosing}
        progressPercent={progressPercent}
        saveStatus={saveStatus}
        onRetrySave={onRetrySave}
        uploadStatus={uploadStatus}
        onUploadStatusPress={onUploadStatusPress}
      />

      <SaveErrorBanner
        saveStatus={saveStatus}
        saveError={saveError}
        onRetrySave={onRetrySave}
      />

      <WizardScrollLock.Provider value={setScrollLocked}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 16 }}
          scrollEnabled={!scrollLocked}
        >
          <View className="w-full px-5">{children}</View>
        </ScrollView>
      </WizardScrollLock.Provider>

      {/* The action sits on the page below the step, never over it: the step ends
          above the button, and the safe area keeps the button off the system inset. */}
      <View testID="wizard-footer" className="gap-2 px-5 py-2">
        <WizardFooter
          isLastStep={isLastStep}
          canContinue={canContinue}
          canPublish={canPublish}
          onContinue={onContinue}
          onPublish={onPublish}
          onReturnToReview={onReturnToReview}
          mode={mode}
          editDetourActive={editDetourActive}
          disabledReason={disabledReason}
          publishBlockers={publishBlockers}
          isPublishing={isPublishing}
          publishError={publishError}
          secondaryAction={secondaryAction}
          publishLabel={publishLabel}
        />
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
