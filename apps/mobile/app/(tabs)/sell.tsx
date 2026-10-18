import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { NavigationContext } from "@react-navigation/native";
import { useContext, useEffect, useReducer, useState, useCallback, useMemo, useRef } from "react";
import { BackHandler, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ListingsSchemas, type WizardSchemas } from "@auto-tm/contracts";

import { useMeasurementScreen } from "../../src/measurement/useMeasurementScreen";
import { recordWizardStepResult } from "../../src/measurement/nativeMeasurement";
import { inventoryCopy } from "../../src/business/inventoryCopy";
import { useBusinessWorkspace } from "../../src/business/api";
import { ApiError } from "../../src/api/client";
import { useCreateDraft } from "../../src/api/listings/useCreateDraft";
import { useDiscardDraft } from "../../src/api/listings/useDiscardDraft";
import { useMyContactPhones } from "../../src/api/listings/useMyContactPhones";
import { useMyDrafts } from "../../src/api/listings/useMyDrafts";
import { usePublishDraft } from "../../src/api/listings/usePublishDraft";
import { useBrands } from "../../src/api/catalog/useBrands";
import { useModels } from "../../src/api/catalog/useModels";
import { deleteDraftDir } from "../../src/listings/uploadStaging/stagingDir";
import { countUploads } from "../../src/listings/uploadStaging/uploadCounts";
import { useUploadQueue } from "../../src/listings/uploadStaging/useUploadQueue";
import {
  wizardMachineReducer,
  createInitialState,
  buildMachineContext,
  isUntouchedPayload,
} from "../../src/listings/wizard/wizardMachine";
import { LeaveUnsavedDialog } from "../../src/listings/wizard/LeaveUnsavedDialog";
import { WizardLayout } from "../../src/listings/wizard/WizardLayout";
import { useWizardAutosave } from "../../src/listings/wizard/useWizardAutosave";
import { useAuth } from "../../src/auth/useAuth";
import { useViewer } from "../../src/auth/useViewer";
import { isContactPhonePublishError } from "../../src/listings/wizard/contactPhoneError";
import { resolveContactPhoneSelection } from "../../src/listings/wizard/contactPhoneSelection";
import {
  translateWizardError,
  translateWizardFieldErrors,
} from "../../src/listings/wizard/wizardErrors";
import { SignInDialog } from "../../components/auth/SignInDialog";
import { SellEntry } from "../../src/listings/sell/SellEntry";
import { ListingVideoEditor } from "../../src/listings/videoEditor/ListingVideoEditor";
import Step2Photos from "../../src/listings/wizard/Step2Photos";
import Step3VehicleId from "../../src/listings/wizard/Step3VehicleId";
import Step4Specs from "../../src/listings/wizard/Step4Specs";
import Step5Price from "../../src/listings/wizard/Step5Price";
import Step6Location from "../../src/listings/wizard/Step6Location";
import Step7DescContact from "../../src/listings/wizard/Step7DescContact";
import CheckAndPublish from "../../src/listings/wizard/CheckAndPublish";
import { publishBlockerLines } from "../../src/listings/wizard/publishBlockers";
import { publishFailureMessage, publishFailureOf } from "../../src/listings/wizard/publishFailure";
import { LargeTitle } from "../../components/navigation/ScreenHeader";
import { TabScreen } from "../../components/navigation/TabScreen";

import { useToast } from "@/components/ui/toast";
import { Text } from "@/components/ui/text";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

// What is saved and published: only photos that have a key, since the API treats
// a draft photo as attached and Publish needs three keyed photos.
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

// What the Photos step validates: every picked photo, key or not, so Continue
// does not wait for an upload. Never saved; see buildPayloadPhotos.
function buildPickedPhotos(
  photos: ReturnType<typeof useUploadQueue>["photos"],
): NonNullable<WizardSchemas.WizardDraftPayload["photos"]> {
  return photos.map((p) => ({
    photoId: p.photoId,
    ...(p.key ? { key: p.key } : {}),
    sortOrder: p.sortOrder,
  }));
}

// How long ✕ waits for its save or delete. One request can take 30 seconds to time
// out, and a token refresh before it more, which is too long to hold ✕ disabled.
const CLOSE_WAIT_MS = 10_000;

/** `work`, or `onTimeout` if it has not settled within the close wait. */
function withinCloseWait<T>(work: Promise<T>, onTimeout: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout), CLOSE_WAIT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export default function SellScreen() {
  const { t, i18n } = useTranslation();
  const c = inventoryCopy(i18n.language);
  // `phone` follows the live auth session, so signing in from this tab's own
  // sign-in sheet preselects the Contact step's account phone (ADR-0081).
  const { isAuthenticated, phone: accountPhone, userId } = useAuth();
  const viewer = useViewer();
  const { show } = useToast();
  const navigation = useContext(NavigationContext);
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ resumeDraftId?: string; confirmedContactPhone?: string; businessId?: string }>();
  const businessQuery = useBusinessWorkspace();
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | undefined>(params.businessId);
  const businessId = selectedBusinessId;
  const business = businessQuery.data?.workspace;
  const contextPhone = businessId ? null : accountPhone;
  const { data: contactPhonesData } = useMyContactPhones({ userId: viewer?.userId ?? null, enabled: !!isAuthenticated, businessId });
  const [showSignIn, setShowSignIn] = useState(false);
  const [businessAccessError, setBusinessAccessError] = useState(false);
  const [draftLimitOpen, setDraftLimitOpen] = useState(false);
  const [publishPhoneError, setPublishPhoneError] = useState(false);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closingRef = useRef(false);
  const publishingRef = useRef(false);
  // The draft that tapping New listing created in this session. Only that draft is
  // removed when the seller closes it untouched; a draft reopened from the Sell tab
  // or My listings is never deleted by ✕.
  const newDraftIdRef = useRef<string | null>(null);
  const [machineState, dispatch] = useReducer(
    wizardMachineReducer,
    createInitialState(),
  );
  useMeasurementScreen("sell", machineState.draftId && machineState.status === "step" ? {eventName:"wizard_step_opened",purpose:"product_improvement",payload:{draftId:machineState.draftId,step:machineState.currentStep}} : null);
  const [attemptedSteps, setAttemptedSteps] = useState<
    Partial<Record<WizardSchemas.WizardStep, boolean>>
  >({});
  const resumedRef = useRef<string | null>(null);
  // Whether the upload queue held the open draft's photos at the last sync.
  const queueWasReady = useRef(false);

  // Hide the bottom tab bar while the wizard is open — the wizard is a focused
  // flow that should not advertise navigation to other tabs.
  useEffect(() => { if (machineState.status === "idle" && params.businessId) setSelectedBusinessId(params.businessId); }, [params.businessId, machineState.status]);
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
  const {
    data: draftsData,
    isPending: draftsLoading,
    error: draftsError,
    refetch: refetchDrafts,
  } = useMyDrafts({
    enabled: !!isAuthenticated,
    limit: params.resumeDraftId ? 50 : 20,
    businessId,
  });

  const createDraft = useCreateDraft(businessId);
  const publishDraft = usePublishDraft(businessId);
  const discardDraft = useDiscardDraft(businessId);

  const { data: brandsData } = useBrands();
  const draftBrandId = draftsData?.items?.[0]?.payload.brandId ?? "";
  const { data: modelsData } = useModels(draftBrandId);
  const draftBrandName = brandsData?.items.find(
    (b) => b.id === draftBrandId,
  )?.name;
  const draftModelName = modelsData?.items.find(
    (m) => m.id === draftsData?.items?.[0]?.payload.modelId,
  )?.name;

  const { save, forceSave, flush, discardPending, retrySave, saveStatus, saveError } =
    useWizardAutosave(machineState.draftId ?? undefined, businessId);
  const uploadQueue = useUploadQueue(
    machineState.draftId ? `draft-${machineState.draftId}` : "",
    machineState.payload,
    { businessId },
  );

  const draftUserRef = useRef(userId);
  useEffect(() => {
    if (draftUserRef.current !== userId) {
      draftUserRef.current = userId;
      discardPending(); newDraftIdRef.current = null; dispatch({ type: "DISCARD" });
    }
  }, [userId, discardPending]);

  const ctx = buildMachineContext(machineState);

  // Sync the picked photos into the payload the steps validate. Only which photos
  // there are, and their order, count: a photo's key arriving later changes nothing
  // the Photos step checks, so it must not reset the steps after it. Nor does the
  // first sync of a resumed draft: a photo that was still uploading when the app
  // closed comes back from staging, and that is not a change the seller made.
  // Until the queue holds the open draft's photos it is empty, or holds the last
  // draft's, and says nothing about this one: the saved photos stay as they are.
  const queueReady = uploadQueue.isReady === true && machineState.draftId !== null;
  useEffect(() => {
    const restoring = queueReady && !queueWasReady.current;
    queueWasReady.current = queueReady;
    if (!queueReady) return;
    const picked = buildPickedPhotos(uploadQueue.photos);
    const current = machineState.payload.photos ?? [];
    const sameOrder =
      current.length === picked.length &&
      current.every((photo, index) => photo.photoId === picked[index]?.photoId);
    if (!sameOrder) {
      dispatch({
        type: "UPDATE_FIELDS",
        updates: {
          photos: picked,
        },
        keepValidSteps: restoring,
      });
    }
  }, [uploadQueue.photos, queueReady]);

  // The photos a save sends: the queue's keyed ones. Until the queue holds the open
  // draft's photos, the keyed ones the draft was opened with, so Back, Continue or
  // ✕ in that moment does not write the draft without its photos.
  const photosToSave = useMemo(
    () =>
      queueReady
        ? buildPayloadPhotos(uploadQueue.photos)
        : (machineState.payload.photos ?? []).filter((p) => !!p.key),
    [queueReady, uploadQueue.photos, machineState.payload.photos],
  );

  // Stable key for autosave trigger — avoids 25+ individual deps and reference churn
  const payloadKey = useMemo(
    () =>
      JSON.stringify({
        ...machineState.payload,
        photos: photosToSave,
        validatedSteps: machineState.validatedSteps,
      }),
    [machineState.payload, machineState.validatedSteps, photosToSave],
  );

  // Autosave when payload changes. Not before the queue holds this draft's photos:
  // a save built from the queue until then would write the draft without them.
  useEffect(() => {
    if (!queueReady || machineState.status !== "step") return;
    const fullPayload: WizardSchemas.WizardDraftPayload = {
      ...machineState.payload,
      photos: photosToSave,
      validatedSteps: machineState.validatedSteps,
    };
    save(fullPayload);
  }, [machineState.draftId, queueReady, machineState.status, payloadKey, save]);

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
    if (businessId && (business?.business.id !== businessId || business.business.status !== "active")) { show({ title: c.denied, variant: "destructive" }); return; }
    setBusinessAccessError(false);
    if (!isAuthenticated) {
      setShowSignIn(true);
      return;
    }

    createDraft.mutate(undefined, {
      onSuccess: (draft) => {
        if (draftUserRef.current !== userId) return;
        newDraftIdRef.current = draft.id;
        setSelectedBusinessId(draft.businessId);
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
        if (businessId && err instanceof ApiError && err.status === 403) { setBusinessAccessError(true); void businessQuery.refetch(); show({ title: c.denied, variant: "destructive" }); return; }
        if (err instanceof ApiError && err.code === ListingsSchemas.ListingsErrorCode.DraftLimitReached) {
          setDraftLimitOpen(true);
          void refetchDrafts();
          return;
        }
        const message =
          err instanceof Error ? err.message : t("failedToCreateDraft");
        show({ title: message, variant: "destructive" });
      },
    });
  }, [isAuthenticated, createDraft, show, refetchDrafts, businessId, business, c.denied, businessQuery.refetch, userId]);

  const handleContinueDraft = useCallback(
    (draft: NonNullable<typeof draftsData>["items"][number]) => {
      setSelectedBusinessId(draft.businessId);
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

  // The contact-phone code flow returns here with the confirmed number; put it
  // in the draft and clear the param so a rerender does not reapply it.
  useEffect(() => {
    const confirmed = params.confirmedContactPhone;
    if (!confirmed) return;
    dispatch({ type: "UPDATE_FIELDS", updates: { contactPhone: confirmed } });
    setPublishPhoneError(false);
    router.setParams({ confirmedContactPhone: undefined });
  }, [params.confirmedContactPhone]);

  const handleBack = useCallback(() => {
    dispatch({ type: "BACK" });
    // Force save on navigation, with the step it moves to: the payload in hand
    // still names the step being left.
    const moved = wizardMachineReducer(machineState, { type: "BACK" });
    const fullPayload: WizardSchemas.WizardDraftPayload = {
      ...moved.payload,
      photos: photosToSave,
      validatedSteps: moved.validatedSteps,
    };
    void forceSave(fullPayload);
  }, [machineState, photosToSave, forceSave]);

  const handleContinue = useCallback(() => {
    if (discardDraft.isPending || publishDraft.isPending) return;
    // The Contact step's Continue stays tappable so its selection error can
    // appear (same pattern as the specs step): a number whose 7-day window
    // ended, or no number at all, must be confirmed or changed first. A
    // number the app cannot judge yet (`pending`: the confirmed list is loading
    // or failed) goes on, unless a publish has already refused it.
    if (machineState.currentStep === "contact") {
      const selection = resolveContactPhoneSelection({
        phone: machineState.payload.contactPhone,
        accountPhone: contextPhone,
        confirmedPhones: contactPhonesData?.items,
      });
      if (
        selection.kind === "stale" ||
        selection.kind === "none" ||
        (selection.kind === "pending" && publishPhoneError)
      ) {
        if(machineState.draftId)recordWizardStepResult(machineState.draftId,machineState.currentStep,"expected_rejection");
        setAttemptedSteps((current) =>
          current.contact ? current : { ...current, contact: true },
        );
        return;
      }
    }
    if (!ctx.canContinue) {
      if(machineState.draftId)recordWizardStepResult(machineState.draftId,machineState.currentStep,"expected_rejection");
      setAttemptedSteps((current) =>
        current[machineState.currentStep]
          ? current
          : { ...current, [machineState.currentStep]: true },
      );
      return;
    }

    if(machineState.draftId)recordWizardStepResult(machineState.draftId,machineState.currentStep,"success");
    // Done on a step opened from Check returns there; Continue moves on.
    const advance = { type: ctx.editDetourActive ? "RETURN_TO_REVIEW" : "NEXT" } as const;
    dispatch(advance);
    // Force save on navigation, with the step it moves to.
    const moved = wizardMachineReducer(machineState, advance);
    const fullPayload: WizardSchemas.WizardDraftPayload = {
      ...moved.payload,
      photos: photosToSave,
      validatedSteps: moved.validatedSteps,
    };
    void forceSave(fullPayload);
  }, [ctx.canContinue, ctx.editDetourActive, machineState, photosToSave, forceSave, discardDraft.isPending, publishDraft.isPending, contextPhone, contactPhonesData, publishPhoneError]);

  const handlePublish = useCallback(async () => {
    // One publish at a time: a second tap lands before the button re-renders disabled.
    if (!machineState.draftId || publishingRef.current) return;
    publishingRef.current = true;

    const fullPayload: WizardSchemas.WizardDraftPayload = {
      ...machineState.payload,
      description: machineState.payload.description?.trim(),
      photos: photosToSave,
      validatedSteps: machineState.validatedSteps,
    };

    recordWizardStepResult(machineState.draftId,"review","success");
    dispatch({ type: "PUBLISH_START" });

    // Publish sends what the server holds, so the draft must be saved first. One
    // attempt: a retry left running could change the draft after it is published.
    // A failed save sends nothing, and the save status says what went wrong.
    if (!(await flush(fullPayload))) {
      dispatch({ type: "PUBLISH_ABORTED" });
      publishingRef.current = false;
      return;
    }

    try {
      const result = await publishDraft.mutateAsync(machineState.draftId);
      show({
        title: t("listingPublished"),
        variant: "success",
      });
      router.push(`/(public)/listings/${result.id}`);
      // The draft is a Listing now, so the wizard closes and the Sell tab is back
      // at its entry. No success screen (founder decision D8 on #354).
      newDraftIdRef.current = null;
      dispatch({ type: "DISCARD" });
    } catch (err) {
      if (businessId && err instanceof ApiError && err.status === 403) { setBusinessAccessError(true); void businessQuery.refetch(); }
      // ADR-0081: the contact phone needs a confirmation. Nothing was published
      // and the draft is saved, so this is not a publish failure to word on
      // Check: the seller goes to the Contact step, and Done brings them back.
      if (isContactPhonePublishError(err)) {
        dispatch({ type: "PUBLISH_ABORTED" });
        dispatch({ type: "CHANGE_FROM_REVIEW", step: "contact" });
        setPublishPhoneError(true);
        return;
      }
      // The wizard stays on Check with the draft saved; the error is worded above
      // Publish.
      dispatch({ type: "PUBLISH_ERROR", error: publishFailureOf(err) });
    } finally {
      publishingRef.current = false;
    }
  }, [machineState, photosToSave, flush, publishDraft, show, businessId, businessQuery.refetch]);

  const closeWizard = useCallback(() => {
    newDraftIdRef.current = null;
    setUnsavedDialogOpen(false);
    dispatch({ type: "DISCARD" });
  }, []);

  // ✕: the draft is already on the server, so closing saves the pending change and
  // leaves. A new Listing the seller never touched is deleted instead, so it neither
  // lingers as an empty draft nor counts toward the five-draft limit. A failed save
  // asks before anything is lost. `retry` skips the "last save failed" shortcut so
  // the dialog's Retry really tries again.
  const handleClose = useCallback(
    async (retry = false) => {
      const id = machineState.draftId;
      if (!id || closingRef.current) return;
      if (machineState.status !== "step" && machineState.status !== "publishError") return;

      const payload: WizardSchemas.WizardDraftPayload = {
        ...machineState.payload,
        photos: photosToSave,
        validatedSteps: machineState.validatedSteps,
      };

      closingRef.current = true;
      setIsClosing(true);
      try {
        // A picked photo without a key is not in the payload yet, but it is a change.
        if (
          id === newDraftIdRef.current &&
          uploadQueue.photos.length === 0 &&
          isUntouchedPayload(payload)
        ) {
          discardPending();
          try {
            // Wait, so a New listing tapped right after counts the drafts without this one.
            // A delete that has not answered in time is left to finish on its own.
            await withinCloseWait(discardDraft.mutateAsync(id).then(() => undefined), undefined);
          } catch {
            // Nothing was typed, so nothing is lost; the empty draft stays and can be
            // deleted from My listings.
          }
          void deleteDraftDir(`draft-${id}`);
          closeWizard();
          return;
        }

        if (!retry && saveStatus === "error") {
          setUnsavedDialogOpen(true);
          return;
        }
        // A save that has not answered in time counts as failed: the seller is asked
        // instead of waiting out a dead connection with ✕ disabled.
        if (!(await withinCloseWait(flush(payload), false))) {
          setUnsavedDialogOpen(true);
          return;
        }
        closeWizard();
        // The Sell tab has no header for a top toast to clear: at the top it would
        // cover the Latest draft card, so it sits above the tab bar, as on Favorites.
        show({ title: t("savedToDrafts"), variant: "success", placement: "aboveTabBar" });
      } finally {
        closingRef.current = false;
        setIsClosing(false);
      }
    },
    [
      machineState.draftId,
      machineState.status,
      machineState.payload,
      machineState.validatedSteps,
      uploadQueue.photos,
      photosToSave,
      saveStatus,
      flush,
      discardPending,
      discardDraft,
      closeWizard,
      show,
      t,
    ],
  );

  // Android system back: on the first step it behaves as ✕, on later steps it goes
  // back one step. The create wizard hides the tab bar, so nothing else would handle it.
  // Only while the Sell tab is the focused screen and the wizard can be left: a
  // screen opened over the tabs keeps its own back, and so does a published Listing.
  const backIsWizards =
    isFocused &&
    inWizard &&
    machineState.mode === "create" &&
    (machineState.status === "step" || machineState.status === "publishError");
  useEffect(() => {
    if (!backIsWizards) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isClosing) return true;
      // The dialog is on top: back dismisses it, like Keep editing.
      if (unsavedDialogOpen) {
        setUnsavedDialogOpen(false);
        return true;
      }
      if (ctx.canGoBack) handleBack();
      else void handleClose();
      return true;
    });
    return () => subscription.remove();
  }, [backIsWizards, ctx.canGoBack, isClosing, unsavedDialogOpen, handleBack, handleClose]);

  const handlePayloadChange = useCallback(
    (updates: Partial<WizardSchemas.WizardDraftPayload>) => {
      if (updates.contactPhone !== undefined) setPublishPhoneError(false);
      dispatch({ type: "UPDATE_FIELDS", updates });
    },
    [],
  );

  // ── Wizard mode ──
  if (machineState.status !== "idle" && machineState.draftId) {
    const currentStep = ctx.state.currentStep;
    const fieldErrors = translateWizardFieldErrors(t, ctx.fieldErrors);
    const contactSelection =
      currentStep === "contact"
        ? resolveContactPhoneSelection({
            phone: machineState.payload.contactPhone,
            accountPhone: contextPhone,
            confirmedPhones: contactPhonesData?.items,
          })
        : null;
    const contactSelectionError =
      attemptedSteps.contact &&
      (contactSelection?.kind === "stale" ||
        (contactSelection?.kind === "pending" && publishPhoneError))
        ? t("confirmAgainOrChoose")
        : attemptedSteps.contact && contactSelection?.kind === "none"
          ? t("chooseOrConfirmContactPhone")
          : null;

    // Compute upload status counts for chip + publishGate reason
    const uploadStatus = countUploads(uploadQueue.photos);

    // On Check, everything that blocks Publish is named above it. Until the queue
    // holds this draft's photos its counts say nothing about the draft.
    const publishBlockers = ctx.isLastStep
      ? publishBlockerLines(t, {
          validatedSteps: machineState.validatedSteps,
          uploads: queueReady ? uploadStatus : null,
        })
      : [];

    // Why Continue or Done is disabled on a step the seller tried to leave.
    let disabledReason: string | undefined;
    if (
      !ctx.isLastStep &&
      !ctx.canContinue &&
      attemptedSteps[currentStep] &&
      ctx.stepErrors.length > 0
    ) {
      disabledReason = translateWizardError(t, ctx.stepErrors[0]);
    }
    // On Check, Publish waits for the queue to hold this draft's photos. That is
    // not something to fix, so it reads as a neutral line, not a blocker.
    if (ctx.isLastStep && !queueReady) {
      disabledReason = t("loadingEllipsis");
    }

    return (
      <>
      <WizardLayout
        routeTitle={t("sellCar")}
        stepTitle={t(`wizardSteps.${currentStep}`)}
        stepNumber={ctx.stepNumber}
        stepCount={ctx.stepCount}
        onBack={handleBack}
        onContinue={handleContinue}
        onPublish={handlePublish}
        onReturnToReview={handleContinue}
        onClose={() => void handleClose()}
        isClosing={isClosing}
        mode={machineState.mode}
        editDetourActive={ctx.editDetourActive}
        canContinue={
          (ctx.canContinue || currentStep === "specs" || currentStep === "contact") &&
          !discardDraft.isPending && !publishDraft.isPending
        }
        canPublish={ctx.canPublish && queueReady && uploadQueue.publishGate.canPublish && (!businessId || (!businessAccessError && business?.business.id === businessId && business.business.status === "active"))}
        canGoBack={ctx.canGoBack}
        isLastStep={ctx.isLastStep}
        saveStatus={saveStatus}
        saveError={saveError}
        onRetrySave={retrySave}
        progressPercent={ctx.progressPercent}
        disabledReason={disabledReason}
        publishBlockers={publishBlockers}
        isPublishing={machineState.status === "publishing"}
        publishError={
          machineState.status === "publishError"
            ? publishFailureMessage(t, machineState.publishError, machineState.payload.priceCurrency)
            : null
        }
        uploadStatus={uploadStatus}
        onUploadStatusPress={() =>
          // From Check the chip opens Photos as a change, so Done comes back.
          dispatch({ type: ctx.isLastStep ? "CHANGE_FROM_REVIEW" : "GO_TO_STEP", step: "photos" })
        }
      >
        <Text className="py-2 text-callout font-semibold">{c.context}: {businessId ? business?.business.name ?? c.title : c.personal}</Text>
        {businessId && (businessAccessError || business?.business.id !== businessId || business.business.status !== "active") ? <Text accessibilityRole="alert">{c.denied}</Text> : null}
        {currentStep === "photos" && (
          <>
          <Step2Photos
            photos={uploadQueue.photos}
            onAddPhoto={uploadQueue.addPhoto}
            onRemovePhoto={uploadQueue.removePhoto}
            onReorderPhotos={uploadQueue.reorderPhotos}
            onRetryPhoto={uploadQueue.retryPhoto}
            isCompressing={uploadQueue.isCompressing}
            isUploading={uploadQueue.isUploading}
            fieldErrors={fieldErrors}
            showErrors={attemptedSteps.photos === true}
          />
          {userId && machineState.draftId ? <ListingVideoEditor ownerId={userId} target={{ kind: "draft", id: machineState.draftId }} businessId={businessId} /> : null}
          </>
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
            showErrors={attemptedSteps.price === true}
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
            accountPhone={contextPhone}
            canChangeNumber={!businessId || business?.membership.role === "owner"}
            confirmedPhones={contactPhonesData?.items}
            onAnotherNumber={() =>
              router.push({
                pathname: "/listings/contact-phone",
                params: { returnPathname: "/(tabs)/sell", ...(businessId ? { businessId } : {}) },
              })
            }
            onConfirmExpired={(phone) =>
              router.push({
                pathname: "/listings/contact-phone",
                params: {
                  phone,
                  reconfirm: "1",
                  returnPathname: "/(tabs)/sell",
                  ...(businessId ? { businessId } : {}),
                },
              })
            }
            selectionError={contactSelectionError}
            publishPhoneError={publishPhoneError}
          />
        )}
        {currentStep === "review" && (
          <CheckAndPublish
            payload={machineState.payload}
            validatedSteps={machineState.validatedSteps}
            onChangeStep={(step) => dispatch({ type: "CHANGE_FROM_REVIEW", step })}
            photos={uploadQueue.photos}
            photosReady={queueReady}
          />
        )}
      </WizardLayout>
      <LeaveUnsavedDialog
        open={unsavedDialogOpen}
        onOpenChange={setUnsavedDialogOpen}
        onRetry={() => void handleClose(true)}
        onLeave={closeWizard}
      />
      </>
    );
  }

  // ── Entry screen ──
  return (
    <TabScreen>
      <LargeTitle title={t("sell")} />

      {isAuthenticated && business?.business.status === "active" && !params.businessId ? <View className="gap-3 px-4 pb-4"><Text>{c.context}</Text><Button disabled={createDraft.isPending} variant={businessId ? "outline" : "default"} onPress={() => setSelectedBusinessId(undefined)}><Text>{c.personal}</Text></Button><Button disabled={createDraft.isPending} variant={businessId ? "default" : "outline"} onPress={() => setSelectedBusinessId(business.business.id)}><Text>{business.business.name}</Text></Button><Text className="text-muted-foreground">{c.fixedContext}</Text></View> : null}
      {params.businessId ? <Text className="px-4 py-2">{c.context}: {business?.business.name ?? c.title}</Text> : null}
      {isAuthenticated ? (
        <SellEntry
          drafts={draftsData?.items}
          isPending={draftsLoading}
          error={draftsError}
          onRetry={() => void refetchDrafts()}
          brandName={draftBrandName}
          modelName={draftModelName}
          isCreating={createDraft.isPending}
          onContinue={handleContinueDraft}
          onCreate={handleCreateNewDraft}
          onNavigate={(href) => router.push(href)}
          limitSheetOpen={draftLimitOpen}
          onLimitSheetOpenChange={setDraftLimitOpen}
        />
      ) : (
        <EmptyState illustration="sell" title={t("sellYourCar")} hint={t("listYourVehicle")}>
          <Button variant="brand" size="pill" onPress={handleStartListing}>
            <Text>{t("startListing")}</Text>
          </Button>
        </EmptyState>
      )}

      <SignInDialog
        description={t("signInToSellDescription")}
        open={showSignIn}
        returnTo="/(tabs)/sell"
        title={t("signInToSellTitle")}
        onOpenChange={setShowSignIn}
      />
    </TabScreen>
  );
}
