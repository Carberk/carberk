import { PlusCircle, List } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { NavigationContext } from "@react-navigation/native";
import { useContext, useEffect, useReducer, useState, useCallback, useMemo, useRef } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { WizardSchemas } from "@auto-tm/contracts";

import { useCreateDraft } from "../../src/api/listings/useCreateDraft";
import { useDiscardDraft } from "../../src/api/listings/useDiscardDraft";
import { useMyDrafts } from "../../src/api/listings/useMyDrafts";
import { usePublishDraft } from "../../src/api/listings/usePublishDraft";
import { useBrands } from "../../src/api/catalog/useBrands";
import { useModels } from "../../src/api/catalog/useModels";
import { deleteDraftDir } from "../../src/listings/uploadStaging/stagingDir";
import { useUploadQueue } from "../../src/listings/uploadStaging/useUploadQueue";
import {
  wizardMachineReducer,
  createInitialState,
  buildMachineContext,
} from "../../src/listings/wizard/wizardMachine";
import { WizardLayout } from "../../src/listings/wizard/WizardLayout";
import { useWizardAutosave } from "../../src/listings/wizard/useWizardAutosave";
import { useAuth } from "../../src/auth/useAuth";
import {
  translateWizardError,
  translateWizardFieldErrors,
} from "../../src/listings/wizard/wizardErrors";
import { SignInDialog } from "../../components/auth/SignInDialog";
import Step2Photos from "../../src/listings/wizard/Step2Photos";
import Step3VehicleId from "../../src/listings/wizard/Step3VehicleId";
import Step4Specs from "../../src/listings/wizard/Step4Specs";
import Step5Price from "../../src/listings/wizard/Step5Price";
import Step6Location from "../../src/listings/wizard/Step6Location";
import Step7DescContact from "../../src/listings/wizard/Step7DescContact";
import Step8Review from "../../src/listings/wizard/Step8Review";


import { useToast } from "@/components/ui/toast";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { localeTag } from "@/src/i18n/resources";

function buildPayloadPhotos(
  photos: ReturnType<typeof useUploadQueue>["photos"],
): NonNullable<WizardSchemas.WizardDraftPayload["photos"]> {
  return photos
    .filter((p): p is typeof p & { key: string } => !!p.key)
    .map((p) => ({
      photoId: p.photoId,
      key: p.key,
      sortOrder: p.sortOrder,
    }));
}

export default function SellScreen() {
  const { t, i18n } = useTranslation();
  // `phone` follows the live auth session, so signing in from this tab's own
  // sign-in sheet fills the Step 7 contact placeholder without a remount.
  const { isAuthenticated, phone: defaultPhone } = useAuth();
  const { show, setTopClearance } = useToast();
  const wizardHeaderHeight = useRef(0);
  const publishErrorToastId = useRef<string | null>(null);
  const handleHeaderHeightChange = useCallback((height: number) => {
    wizardHeaderHeight.current = height;
    if (publishErrorToastId.current) {
      setTopClearance(publishErrorToastId.current, height);
    }
  }, [setTopClearance]);
  const navigation = useContext(NavigationContext);
  const params = useLocalSearchParams<{ resumeDraftId?: string }>();
  const [showSignIn, setShowSignIn] = useState(false);
  const [machineState, dispatch] = useReducer(
    wizardMachineReducer,
    createInitialState(),
  );
  const [attemptedSteps, setAttemptedSteps] = useState<
    Partial<Record<WizardSchemas.WizardStep, boolean>>
  >({});
  const resumedRef = useRef<string | null>(null);

  // Hide the bottom tab bar while the wizard is open — the wizard is a focused
  // flow that should not advertise navigation to other tabs.
  const inWizard =
    machineState.status !== "idle" && machineState.draftId !== null;
  useEffect(() => {
    if (!navigation) return;
    navigation.setOptions({
      tabBarStyle: inWizard
        ? { display: "none" as const }
        : undefined,
    });
  }, [inWizard, navigation]);

  // 50 is the API's FeedQuerySchema max — anything higher 400s and breaks
  // draft resume entirely.
  const { data: draftsData, isPending: draftsLoading } = useMyDrafts({
    enabled: !!isAuthenticated,
    limit: params.resumeDraftId ? 50 : 20,
  });

  const createDraft = useCreateDraft();
  const publishDraft = usePublishDraft();
  const discardDraft = useDiscardDraft();

  const { data: brandsData } = useBrands();
  const draftBrandId = draftsData?.items?.[0]?.payload.brandId ?? "";
  const { data: modelsData } = useModels(draftBrandId);
  const draftBrandName = brandsData?.items.find(
    (b) => b.id === draftBrandId,
  )?.name;
  const draftModelName = modelsData?.items.find(
    (m) => m.id === draftsData?.items?.[0]?.payload.modelId,
  )?.name;

  const { save, forceSave, retrySave, saveStatus, saveError } =
    useWizardAutosave(machineState.draftId ?? undefined);
  const uploadQueue = useUploadQueue(
    machineState.draftId ? `draft-${machineState.draftId}` : "",
    machineState.payload,
  );

  const ctx = buildMachineContext(machineState);

  // Sync upload queue photos into payload
  useEffect(() => {
    const photosFromQueue = buildPayloadPhotos(uploadQueue.photos);
    const currentPhotos = JSON.stringify(machineState.payload.photos ?? []);
    const newPhotos = JSON.stringify(photosFromQueue);
    if (currentPhotos !== newPhotos) {
      dispatch({
        type: "UPDATE_FIELDS",
        updates: {
          photos: photosFromQueue,
        },
      });
    }
  }, [uploadQueue.photos]);

  // Stable key for autosave trigger — avoids 25+ individual deps and reference churn
  const payloadKey = useMemo(
    () =>
      JSON.stringify({
        ...machineState.payload,
        photos: buildPayloadPhotos(uploadQueue.photos),
        validatedSteps: machineState.validatedSteps,
      }),
    [machineState.payload, machineState.validatedSteps, uploadQueue.photos],
  );

  // Autosave when payload changes
  useEffect(() => {
    if (!machineState.draftId || machineState.status !== "step") return;
    const fullPayload: WizardSchemas.WizardDraftPayload = {
      ...machineState.payload,
      photos: buildPayloadPhotos(uploadQueue.photos),
      validatedSteps: machineState.validatedSteps,
    };
    save(fullPayload);
  }, [machineState.draftId, machineState.status, payloadKey, save]);

  const handleStartListing = useCallback(() => {
    if (!isAuthenticated) {
      setShowSignIn(true);
      return;
    }

    const existingDraft = draftsData?.items?.[0];
    if (existingDraft) {
      return;
    }

    handleCreateNewDraft();
  }, [isAuthenticated, draftsData]);

  const handleCreateNewDraft = useCallback(() => {
    if (!isAuthenticated) {
      setShowSignIn(true);
      return;
    }

    createDraft.mutate(undefined, {
      onSuccess: (draft) => {
        dispatch({
          type: "INIT",
          draftId: draft.id,
          payload: {
            currentStep: 1,
            allowCalls: true,
            allowChat: true,
            priceCurrency: "TMT",
          },
        });
      },
      onError: (err) => {
        const message =
          err instanceof Error ? err.message : t("failedToCreateDraft");
        show({ title: message, variant: "destructive" });
      },
    });
  }, [isAuthenticated, createDraft, show]);

  const handleContinueDraft = useCallback(
    (draft: NonNullable<typeof draftsData>["items"][number]) => {
      dispatch({
        type: "INIT",
        draftId: draft.id,
        payload: {
          ...draft.payload,
          allowCalls: draft.payload.allowCalls ?? true,
          allowChat: draft.payload.allowChat ?? true,
          priceCurrency: draft.payload.priceCurrency ?? "TMT",
        } as WizardSchemas.WizardDraftPayload,
      });
    },
    [],
  );

  // Resume a specific draft when navigated from My Listings / Drafts management.
  useEffect(() => {
    if (!params.resumeDraftId) {
      resumedRef.current = null;
      return;
    }
    if (
      resumedRef.current === params.resumeDraftId ||
      !draftsData ||
      machineState.status !== "idle"
    ) {
      return;
    }
    const target = draftsData.items.find((d) => d.id === params.resumeDraftId);
    if (target) {
      resumedRef.current = params.resumeDraftId;
      handleContinueDraft(target);
    } else {
      resumedRef.current = params.resumeDraftId;
      show({
        title: t("draftNotFound"),
        variant: "destructive",
      });
    }
  }, [params.resumeDraftId, draftsData, machineState.status, handleContinueDraft, show]);

  const handleBack = useCallback(() => {
    dispatch({ type: "BACK" });
    // Force save on navigation
    const fullPayload: WizardSchemas.WizardDraftPayload = {
      ...machineState.payload,
      photos: buildPayloadPhotos(uploadQueue.photos),
      validatedSteps: machineState.validatedSteps,
    };
    void forceSave(fullPayload);
  }, [machineState.payload, machineState.validatedSteps, uploadQueue.photos, forceSave]);

  const handleContinue = useCallback(() => {
    if (discardDraft.isPending || publishDraft.isPending) return;
    if (!ctx.canContinue) {
      setAttemptedSteps((current) =>
        current[machineState.currentStep]
          ? current
          : { ...current, [machineState.currentStep]: true },
      );
      return;
    }

    dispatch({ type: "NEXT" });
    // Force save on navigation
    const fullPayload: WizardSchemas.WizardDraftPayload = {
      ...machineState.payload,
      photos: buildPayloadPhotos(uploadQueue.photos),
      validatedSteps: machineState.validatedSteps,
    };
    void forceSave(fullPayload);
  }, [ctx.canContinue, machineState, uploadQueue.photos, forceSave, discardDraft.isPending, publishDraft.isPending]);

  const handlePublish = useCallback(async () => {
    if (!machineState.draftId) return;

    const fullPayload: WizardSchemas.WizardDraftPayload = {
      ...machineState.payload,
      description: machineState.payload.description?.trim(),
      photos: buildPayloadPhotos(uploadQueue.photos),
      validatedSteps: machineState.validatedSteps,
    };

    dispatch({ type: "PUBLISH_START" });

    try {
      await forceSave(fullPayload);
      const result = await publishDraft.mutateAsync(machineState.draftId);
      dispatch({ type: "PUBLISH_SUCCESS", listingId: result.id });
      show({
        title: t("listingPublished"),
        variant: "success",
      });
      router.replace(`/(public)/listings/${result.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("failedToPublish");
      dispatch({ type: "PUBLISH_ERROR", error: message });
      publishErrorToastId.current = show({
        title: message, variant: "destructive", topClearance: wizardHeaderHeight.current,
      });
    }
  }, [machineState, uploadQueue.photos, forceSave, publishDraft, show]);

  const handleDiscard = useCallback(() => {
    const id = machineState.draftId;
    if (!id) return;

    // Always clear local state immediately so the user can escape a broken
    // draft (e.g., orphaned draftId after a server restart / DB reset).
    void deleteDraftDir(`draft-${id}`);
    dispatch({ type: "DISCARD" });

    // Best-effort server-side delete. If the draft is already gone (404) or
    // the request fails for any other reason, we don't block the user.
    discardDraft.mutate(id, {
      onError: (err) => {
        const message = err instanceof Error ? err.message : t("failedToDiscard");
        show({ title: message, variant: "destructive" });
      },
    });
  }, [machineState.draftId, discardDraft, show]);

  const handlePayloadChange = useCallback(
    (updates: Partial<WizardSchemas.WizardDraftPayload>) => {
      dispatch({ type: "UPDATE_FIELDS", updates });
    },
    [],
  );

  // ── Wizard mode ──
  if (machineState.status !== "idle" && machineState.draftId) {
    const currentStep = ctx.state.currentStep;
    const fieldErrors = translateWizardFieldErrors(t, ctx.fieldErrors);

    // Compute upload status counts for chip + publishGate reason
    const uploadStatus = {
      inflight: uploadQueue.photos.filter((p) =>
        ["selected", "compressed", "presigned", "uploading"].includes(p.state),
      ).length,
      failed: uploadQueue.photos.filter((p) => p.state === "failed").length,
      total: uploadQueue.photos.length,
    };

    // Compose a clear reason text when Publish/Continue is disabled.
    let disabledReason: string | undefined;
    if (ctx.isLastStep && !uploadQueue.publishGate.canPublish) {
      if (uploadStatus.failed > 0) {
        disabledReason = t("failed");
      } else if (uploadStatus.inflight > 0) {
        disabledReason = t("waitForPhotos", { count: uploadStatus.inflight });
      } else {
        disabledReason =
          translateWizardError(t, uploadQueue.publishGate.blockers[0]) ??
          t("cannotPublishYet");
      }
    } else if (ctx.isLastStep && !ctx.canPublish) {
      const missing = WizardSchemas.WIZARD_STEPS.filter(
        (s) =>
          s !== "review" && !machineState.validatedSteps.includes(s),
      );
      if (missing.length > 0) {
        disabledReason = t("completeStepsBeforePublish", { count: missing.length });
      }
    } else if (
      !ctx.isLastStep &&
      !ctx.canContinue &&
      attemptedSteps[currentStep] &&
      ctx.stepErrors.length > 0
    ) {
      disabledReason = translateWizardError(t, ctx.stepErrors[0]);
    }

    return (
      <WizardLayout
        onHeaderHeightChange={handleHeaderHeightChange}
        routeTitle={t("sellCar")}
        stepTitle={t(`wizardSteps.${currentStep}`)}
        stepNumber={ctx.stepNumber}
        stepCount={ctx.stepCount}
        onBack={handleBack}
        onContinue={handleContinue}
        onPublish={handlePublish}
        onDiscard={handleDiscard}
        mode={machineState.mode}
        editDetourActive={ctx.editDetourActive}
        canContinue={
          (ctx.canContinue || currentStep === "specs") &&
          !discardDraft.isPending && !publishDraft.isPending
        }
        canPublish={ctx.canPublish && uploadQueue.publishGate.canPublish}
        canGoBack={ctx.canGoBack}
        isLastStep={ctx.isLastStep}
        saveStatus={saveStatus}
        saveError={saveError}
        onRetrySave={retrySave}
        progressPercent={ctx.progressPercent}
        disabledReason={disabledReason}
        uploadStatus={uploadStatus}
        isDiscarding={discardDraft.isPending}
        discardError={discardDraft.error?.message ?? null}
      >
        {currentStep === "photos" && (
          <Step2Photos
            photos={uploadQueue.photos}
            onAddPhoto={uploadQueue.addPhoto}
            onRemovePhoto={uploadQueue.removePhoto}
            onReorderPhotos={uploadQueue.reorderPhotos}
            onRetryPhoto={uploadQueue.retryPhoto}
            isCompressing={uploadQueue.isCompressing}
            isUploading={uploadQueue.isUploading}
            fieldErrors={fieldErrors}
          />
        )}
        {currentStep === "vehicle" && (
          <Step3VehicleId
            payload={machineState.payload}
            onChange={handlePayloadChange}
            fieldErrors={fieldErrors}
            showErrors={attemptedSteps.vehicle === true}
          />
        )}
        {currentStep === "specs" && (
          <Step4Specs
            payload={machineState.payload}
            onChange={handlePayloadChange}
            fieldErrors={fieldErrors}
            showErrors={attemptedSteps.specs === true}
          />
        )}
        {currentStep === "price" && (
          <Step5Price
            payload={machineState.payload}
            onChange={handlePayloadChange}
            fieldErrors={fieldErrors}
          />
        )}
        {currentStep === "location" && (
          <Step6Location
            payload={machineState.payload}
            onChange={handlePayloadChange}
            fieldErrors={fieldErrors}
            showErrors={attemptedSteps.location === true}
          />
        )}
        {currentStep === "contact" && (
          <Step7DescContact
            payload={machineState.payload}
            onChange={handlePayloadChange}
            defaultPhone={defaultPhone}
          />
        )}
        {currentStep === "review" && (
          <Step8Review
            payload={machineState.payload}
            validatedSteps={machineState.validatedSteps}
            onGoToStep={(step) => dispatch({ type: "GO_TO_STEP", step })}
            photos={uploadQueue.photos}
          />
        )}
      </WizardLayout>
    );
  }

  // ── Entry screen ──
  const existingDraft = draftsData?.items?.[0];
  const hasDrafts = !!existingDraft;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <View className="flex-1 px-5 pt-3">
        <Text className="text-3xl font-heading leading-tight tracking-tight text-foreground">
          {t("sell")}
        </Text>

        {hasDrafts && isAuthenticated && !draftsLoading ? (
          <View className="mt-6 w-full gap-4">
            <View className="gap-3 rounded-xl border border-border p-4">
              <Text className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("latestDraft")}
              </Text>
              <Text className="text-lg font-semibold text-foreground" numberOfLines={1}>
                {draftBrandName && draftModelName
                  ? `${existingDraft.payload.year ?? ""} ${draftBrandName} ${draftModelName}`
                  : existingDraft.payload.brandId && existingDraft.payload.modelId
                    ? `${existingDraft.payload.year ?? ""} ${existingDraft.payload.brandId} ${existingDraft.payload.modelId}`
                    : t("continueListing")}
              </Text>
              <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                {existingDraft.payload.photos?.length
                  ? t("photoCount", { count: existingDraft.payload.photos.length })
                  : t("noPhotos")}
                {" · "}
                {existingDraft.payload.priceAmount
                  ? `${existingDraft.payload.priceAmount.toLocaleString(localeTag(i18n.language))} ${existingDraft.payload.priceCurrency ?? "TMT"}`
                  : t("priceMissing")}
              </Text>
              <Button
                variant="default"
                size="pill"
                onPress={() => handleContinueDraft(existingDraft)}
              >
                <Text>{t("continueListing")}</Text>
              </Button>
            </View>
            <Button
              variant="outline"
              size="pill"
              onPress={handleCreateNewDraft}
            >
              <Text>{t("newListing")}</Text>
            </Button>
            <Button
              variant="ghost"
              size="pill"
              onPress={() => router.push("/listings/manage")}
            >
              <Icon as={List} className="size-4 text-foreground" />
              <Text>{t("myListingsAndDrafts")}</Text>
            </Button>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center px-4">
            <Icon as={PlusCircle} className="size-8 text-muted-foreground" />
            <Text className="mt-4 text-lg font-semibold text-foreground">
              {t("sellYourCar")}
            </Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              {t("listYourVehicle")}
            </Text>
            <Button
              variant="default"
              size="pill"
              className="mt-6 self-stretch"
              onPress={handleStartListing}
            >
              <Text>{t("startListing")}</Text>
            </Button>
            {isAuthenticated && (
              <Button
                variant="ghost"
                size="pill"
                className="mt-2"
                onPress={() => router.push("/listings/manage")}
              >
                <Icon as={List} className="size-4 text-foreground" />
                <Text>{t("myListingsAndDrafts")}</Text>
              </Button>
            )}
          </View>
        )}
      </View>

      <SignInDialog
        description={t("signInToSellDescription")}
        open={showSignIn}
        returnTo="/(tabs)/sell"
        title={t("signInToSellTitle")}
        onOpenChange={setShowSignIn}
      />
    </SafeAreaView>
  );
}
