import { router, Stack, useIsFocused, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { AccessibilityInfo, BackHandler, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ListingsSchemas, WizardSchemas } from "@auto-tm/contracts";

import { useListingDetail } from "../../../src/api/listings/useListingDetail";
import { useMyContactPhones } from "../../../src/api/listings/useMyContactPhones";
import { useAuth } from "../../../src/auth/useAuth";
import { useViewer } from "../../../src/auth/useViewer";
import { useUploadQueue } from "../../../src/listings/uploadStaging/useUploadQueue";
import { deleteDraftDir } from "../../../src/listings/uploadStaging/stagingDir";
import { countUploads } from "../../../src/listings/uploadStaging/uploadCounts";
import { hasEditChanges } from "../../../src/listings/edit/editChanges";
import { LeaveEditDialog } from "../../../src/listings/edit/LeaveEditDialog";
import {
  useSaveListingEdit,
  opLabel,
  type OpState,
} from "../../../src/listings/edit/useSaveListingEdit";
import { EditSectionList, useCarTitle } from "../../../src/listings/wizard/CheckAndPublish";
import Step2Photos from "../../../src/listings/wizard/Step2Photos";
import Step4Specs from "../../../src/listings/wizard/Step4Specs";
import Step5Price from "../../../src/listings/wizard/Step5Price";
import Step6Location from "../../../src/listings/wizard/Step6Location";
import Step7DescContact from "../../../src/listings/wizard/Step7DescContact";
import { WizardLayout } from "../../../src/listings/wizard/WizardLayout";
import { isContactPhonePublishError } from "../../../src/listings/wizard/contactPhoneError";
import { resolveContactPhoneSelection } from "../../../src/listings/wizard/contactPhoneSelection";
import {
  buildMachineContext,
  createInitialState,
  wizardMachineReducer,
} from "../../../src/listings/wizard/wizardMachine";
import {
  translateWizardError,
  translateWizardFieldErrors,
} from "../../../src/listings/wizard/wizardErrors";

import { useToast } from "@/components/ui/toast";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";

function listingToPayload(
  listing: ListingsSchemas.ListingDetail,
): WizardSchemas.WizardDraftPayload {
  return {
    vin: listing.vin,
    brandId: listing.brandId,
    modelId: listing.modelId,
    generationId: listing.generationId,
    year: listing.year,
    mileageKm: listing.mileageKm,
    condition: listing.condition,
    colorId: listing.colorId,
    bodyTypeId: listing.bodyTypeId,
    transmissionId: listing.transmissionId,
    driveTypeId: listing.driveTypeId,
    engineTypeId: listing.engineTypeId,
    enginePower: listing.enginePower,
    priceAmount: listing.priceAmount,
    priceCurrency: listing.priceCurrency,
    regionId: listing.regionId,
    cityId: listing.cityId,
    locationText: listing.locationText,
    description: listing.description,
    contactPhone: listing.contactPhone,
    allowCalls: listing.allowCalls,
    allowChat: listing.allowChat,
    acceptsExchange: listing.acceptsExchange,
    installmentAvailable: listing.installmentAvailable,
    conditionDisclosure: listing.conditionDisclosure,
    photos: listing.media.map((m, i) => ({
      photoId: m.id,
      key: m.key,
      sortOrder: i,
    })),
  };
}

const EMPTY_PAYLOAD = {} as WizardSchemas.WizardDraftPayload;
const CONTACT_STEP: readonly WizardSchemas.WizardStep[] = ["contact"];

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

function EditSaveErrorBanner({
  opStates,
  onRetry,
}: {
  opStates: Record<string, OpState>;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const message = t("couldNotSaveAllChanges");
  // The seller just asked to save, so the failure interrupts a screen reader.
  // Announced on both platforms, like a failed publish: iOS has no live regions.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  return (
    <View className="gap-2 rounded-lg bg-destructive/10 p-3">
      <Text accessibilityRole="alert" className="text-callout font-medium text-destructive">
        {message}
      </Text>
      {Object.entries(opStates).map(([opId, state]) => (
        <Text key={opId} className="text-caption text-muted-foreground">
          {state === "succeeded"
            ? "✓"
            : state === "failed"
              ? "✗"
              : "·"}{" "}
          {opLabel(opId)}
        </Text>
      ))}
      <Button
        size="pill"
        onPress={onRetry}
      >
        <Text className="text-background">{t("retry")}</Text>
      </Button>
    </View>
  );
}

export default function EditListingScreen() {
  const { id } = useLocalSearchParams();
  const listingId = id as string;
  // One edit session per Listing: another Listing starts from nothing of this one's.
  return <EditListingSession key={listingId} listingId={listingId} />;
}

function EditListingSession({ listingId }: { listingId: string }) {
  const { t } = useTranslation();
  const { show } = useToast();
  const isFocused = useIsFocused();
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  const { confirmedContactPhone } = useLocalSearchParams<{
    confirmedContactPhone?: string;
  }>();
  // The picker's rows (ADR-0081): the sign-in phone and the numbers still
  // inside their 7 days. The Listing's own number is always selectable.
  const { isAuthenticated, phone: accountPhone } = useAuth();
  const viewer = useViewer();
  const { data: contactPhonesData } = useMyContactPhones({
    userId: viewer?.userId ?? null,
    enabled: !!isAuthenticated,
  });
  // The server refused the changed number; shown on the Contact step until
  // the seller picks or confirms one.
  const [contactPhoneRefused, setContactPhoneRefused] = useState(false);

  const { data: listing } = useListingDetail(listingId);
  const stagingKey = `edit-${listingId}`;
  const [machineState, dispatch] = useReducer(
    wizardMachineReducer,
    createInitialState(),
  );
  const [attemptedSteps, setAttemptedSteps] = useState<
    Partial<Record<WizardSchemas.WizardStep, boolean>>
  >({});

  // The server seeds an edit session once. A refetch, including the ones the
  // save's own mutations trigger, must not overwrite what the seller changed.
  const [sessionListing, setSessionListing] = useState(listing);
  if (listing && !sessionListing) setSessionListing(listing);

  const editPayload = useMemo(() => {
    if (!sessionListing) return EMPTY_PAYLOAD;
    return listingToPayload(sessionListing);
  }, [sessionListing]);
  // Car is locked in an edit, so the published Listing names it.
  const carTitle = useCarTitle(editPayload);

  // Photos staged by an earlier session cannot be attached by this one.
  const uploadQueue = useUploadQueue(
    sessionListing ? stagingKey : "",
    editPayload,
    { restoreLocalPhotos: false },
  );
  // The upload queue starts empty and then holds the Listing's own photos; until
  // then its photos say nothing about what the seller changed.
  const photosReady = uploadQueue.isReady !== false;

  const saveEdit = useSaveListingEdit(
    listingId,
    machineState.payload,
    uploadQueue.photos,
    listing?.media ?? [],
  );

  useEffect(() => {
    if (sessionListing) {
      dispatch({
        type: "INIT",
        draftId: null,
        listingId: sessionListing.id,
        mode: "edit",
        entryStep: "review",
        payload: listingToPayload(sessionListing),
      });
    }
  }, [sessionListing]);

  // Until restoration finishes, the empty queue is not the Listing's photo set.
  // Keep the seeded photos valid while loading; sync actual edits once ready.
  useEffect(() => {
    if (!photosReady) return;
    const photosFromQueue = buildPayloadPhotos(uploadQueue.photos);
    dispatch({
      type: "UPDATE_FIELDS",
      updates: { photos: photosFromQueue },
    });
  }, [photosReady, uploadQueue.photos]);

  // The contact-phone code flow returns here with the confirmed number; put it
  // in the edit and clear the param so a rerender does not reapply it.
  useEffect(() => {
    if (!confirmedContactPhone || !sessionListing) return;
    dispatch({
      type: "UPDATE_FIELDS",
      updates: { contactPhone: confirmedContactPhone },
    });
    setContactPhoneRefused(false);
    router.setParams({ confirmedContactPhone: undefined });
  }, [confirmedContactPhone, sessionListing]);

  const ctx = buildMachineContext(machineState);

  const contactSelection = resolveContactPhoneSelection({
    phone: machineState.payload.contactPhone,
    accountPhone,
    currentListingPhone: sessionListing?.contactPhone ?? null,
    confirmedPhones: contactPhonesData?.items,
  });
  // A number that is neither the Listing's own, the sign-in phone, nor inside
  // its 7 days needs a code before the edit can use it.
  const contactNeedsCode =
    contactSelection.kind === "stale" || contactSelection.kind === "none";

  const handlePayloadChange = useCallback(
    (updates: Partial<WizardSchemas.WizardDraftPayload>) => {
      if (updates.contactPhone !== undefined) setContactPhoneRefused(false);
      dispatch({ type: "UPDATE_FIELDS", updates });
    },
    [],
  );

  // A failed save may have applied part of the edit (ADR-0025), so the session
  // counts as changed until a save succeeds, whatever the fields now hold.
  const hasChanges =
    saveEdit.status === "failed" ||
    hasEditChanges(editPayload, machineState.payload, photosReady ? uploadQueue.photos : null);
  // A new number that still needs a code: the server would refuse the save.
  const contactBlocksSave =
    contactNeedsCode &&
    (machineState.payload.contactPhone ?? null) !== (sessionListing?.contactPhone ?? null);

  const handleReturnToReview = useCallback(() => {
    if (saveEdit.isPending) return;
    if (
      (machineState.currentStep === "contact" && contactNeedsCode) ||
      !ctx.canContinue
    ) {
      setAttemptedSteps((current) =>
        current[machineState.currentStep]
          ? current
          : { ...current, [machineState.currentStep]: true },
      );
      return;
    }
    dispatch({ type: "RETURN_TO_REVIEW" });
  }, [ctx.canContinue, contactNeedsCode, machineState.currentStep, saveEdit.isPending]);

  // Back on a step returns to the section list and keeps what the seller typed;
  // the list then asks for the step again if it was left invalid.
  const handleBack = useCallback(() => {
    if (saveEdit.isPending) return;
    dispatch({ type: "BACK" });
  }, [saveEdit.isPending]);

  const finishSave = useCallback(
    async (run: () => Promise<boolean>) => {
      try {
        // false: nothing ran (a save was already running, or there was nothing to retry).
        if (!(await run())) return;
        // The server holds every staged photo now; left on disk they would
        // reappear as unsent photos the next time this Listing is edited.
        void deleteDraftDir(stagingKey);
        show({ title: t("changesSaved"), variant: "success" });
        // Navigate to public detail; may 404 until downstream route ships
        router.replace(`/(public)/listings/${listingId}`);
      } catch (err) {
        // ADR-0081: the changed contact phone needs a confirmation. Nothing
        // was saved; send the seller to the Contact step to confirm or change it.
        // `cause` is the API error the failed operation threw (EditSessionError).
        if (err instanceof Error && isContactPhonePublishError(err.cause)) {
          setContactPhoneRefused(true);
          // From the list the Contact step opens with Done and Back to the list.
          // A retry from another open step keeps that step's way back.
          dispatch(
            machineState.currentStep === "review"
              ? { type: "CHANGE_FROM_REVIEW", step: "contact" }
              : { type: "GO_TO_STEP", step: "contact" },
          );
        }
        // Any other failure: saveEdit.error and the per-op banner below.
      }
    },
    [show, t, listingId, stagingKey, machineState.currentStep],
  );

  const handleSave = useCallback(async () => {
    if (!photosReady || !ctx.canPublish || !hasChanges || contactBlocksSave) return;
    await finishSave(saveEdit.save);
  }, [photosReady, ctx.canPublish, hasChanges, contactBlocksSave, saveEdit.save, finishSave]);

  const handleRetrySave = useCallback(
    () => finishSave(saveEdit.retry),
    [saveEdit.retry, finishSave],
  );

  const handleDiscard = useCallback(() => {
    void deleteDraftDir(stagingKey);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/(public)/listings/${listingId}`);
    }
  }, [listingId, stagingKey]);

  // ✕ and system back on the section list: ask only when something would be lost.
  const handleLeave = useCallback(() => {
    if (saveEdit.isPending) return;
    if (hasChanges) setLeaveDialogOpen(true);
    else handleDiscard();
  }, [saveEdit.isPending, hasChanges, handleDiscard]);

  // Android system back, only while the edit is the focused screen: a screen
  // opened over it, such as the contact phone code flow, keeps its own back.
  const backIsEdits = isFocused && !!sessionListing;
  useEffect(() => {
    if (!backIsEdits) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      // The dialog is on top: back dismisses it, like Keep editing.
      if (leaveDialogOpen) setLeaveDialogOpen(false);
      else if (ctx.canGoBack) handleBack();
      else handleLeave();
      return true;
    });
    return () => subscription.remove();
  }, [backIsEdits, leaveDialogOpen, ctx.canGoBack, handleBack, handleLeave]);

  if (!sessionListing) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">{t("loadingEllipsis")}</Text>
      </View>
    );
  }

  const currentStep = machineState.currentStep;
  const fieldErrors = translateWizardFieldErrors(t, ctx.fieldErrors);

  // Compute upload status counts for chip + publishGate reason
  const uploadStatus = countUploads(uploadQueue.photos);

  const disabledReason =
    ctx.isLastStep && photosReady && !uploadQueue.publishGate.canPublish
      ? uploadStatus.failed > 0
        ? t("photosFailedRetryOrRemove", { count: uploadStatus.failed })
        : uploadStatus.inflight > 0
          ? t("waitForPhotos", { count: uploadStatus.inflight })
          : (translateWizardError(t, uploadQueue.publishGate.blockers[0]) ??
            t("cannotSaveYet"))
      : !ctx.isLastStep &&
          !ctx.canContinue &&
          attemptedSteps[currentStep] &&
          ctx.stepErrors.length > 0
        ? translateWizardError(t, ctx.stepErrors[0])
        : undefined;

  const contactSelectionError =
    contactPhoneRefused ||
    (attemptedSteps.contact && contactSelection.kind === "stale")
      ? t("confirmAgainOrChoose")
      : attemptedSteps.contact && contactSelection.kind === "none"
        ? t("chooseOrConfirmContactPhone")
        : null;
  const contactPhoneReturn = `/listings/${listingId}/edit`;

  const saveStatus: "idle" | "saving" | "saved" | "error" =
    saveEdit.isPending ? "saving" : saveEdit.status === "failed" ? "error" : "idle";

  return (
    <>
      {/* The iOS swipe back cannot ask first, so it only closes an edit with nothing to lose. */}
      <Stack.Screen options={{ gestureEnabled: !hasChanges }} />
      <WizardLayout
        routeTitle={t("editListing")}
        // The section list is headed by the route's own title, not by a step's.
        stepTitle={ctx.isLastStep ? t("editListing") : t(`wizardSteps.${currentStep}`)}
        stepNumber={ctx.stepNumber}
        stepCount={ctx.stepCount}
        onBack={handleBack}
        onContinue={handleReturnToReview}
        onPublish={handleSave}
        onReturnToReview={handleReturnToReview}
        onClose={handleLeave}
        mode={machineState.mode}
        sectionList={ctx.isLastStep}
        subtitle={carTitle || undefined}
        editDetourActive={ctx.editDetourActive}
        canContinue={
          (ctx.canContinue || currentStep === "specs" || currentStep === "contact") &&
          !saveEdit.isPending
        }
        canPublish={
          photosReady &&
          ctx.canPublish &&
          hasChanges &&
          !contactBlocksSave &&
          uploadQueue.publishGate.canPublish &&
          !saveEdit.isPending
        }
        canGoBack={ctx.canGoBack && !saveEdit.isPending}
        isLastStep={ctx.isLastStep}
        saveStatus={saveStatus}
        // The failure is worded once, in the banner on the section list.
        saveError={null}
        onRetrySave={handleRetrySave}
        progressPercent={ctx.progressPercent}
        disabledReason={disabledReason}
        uploadStatus={uploadStatus}
        publishLabel={t("saveChanges")}
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
            showErrors={attemptedSteps.photos === true}
            continuesWhileUploading={false}
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
            accountPhone={accountPhone || null}
            confirmedPhones={contactPhonesData?.items}
            currentListingPhone={sessionListing.contactPhone ?? null}
            onAnotherNumber={() =>
              router.push({
                pathname: "/listings/contact-phone",
                params: { returnPathname: contactPhoneReturn },
              })
            }
            onConfirmExpired={(phone) =>
              router.push({
                pathname: "/listings/contact-phone",
                params: { phone, reconfirm: "1", returnPathname: contactPhoneReturn },
              })
            }
            selectionError={contactSelectionError}
          />
        )}
        {currentStep === "review" && (
          <>
            {saveEdit.status === "failed" && (
              <View className="mt-4">
                <EditSaveErrorBanner
                  opStates={saveEdit.opStates}
                  onRetry={handleRetrySave}
                />
              </View>
            )}
            <EditSectionList
              payload={machineState.payload}
              validatedSteps={machineState.validatedSteps}
              onChangeStep={(step) => dispatch({ type: "CHANGE_FROM_REVIEW", step })}
              photos={uploadQueue.photos}
              photosReady={photosReady}
              stepsNeedingSeller={contactBlocksSave ? CONTACT_STEP : undefined}
            />
          </>
        )}
      </WizardLayout>
      <LeaveEditDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        onLeave={() => {
          setLeaveDialogOpen(false);
          handleDiscard();
        }}
      />
    </>
  );
}
