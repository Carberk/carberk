import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ListingsSchemas, WizardSchemas } from "@auto-tm/contracts";

import { useListingDetail } from "../../../src/api/listings/useListingDetail";
import { useUploadQueue } from "../../../src/listings/uploadStaging/useUploadQueue";
import { deleteDraftDir } from "../../../src/listings/uploadStaging/stagingDir";
import {
  useSaveListingEdit,
  opLabel,
  type OpState,
} from "../../../src/listings/edit/useSaveListingEdit";
import Step2Photos from "../../../src/listings/wizard/Step2Photos";
import Step3VehicleId from "../../../src/listings/wizard/Step3VehicleId";
import Step4Specs from "../../../src/listings/wizard/Step4Specs";
import Step5Price from "../../../src/listings/wizard/Step5Price";
import Step6Location from "../../../src/listings/wizard/Step6Location";
import Step7DescContact from "../../../src/listings/wizard/Step7DescContact";
import Step8Review from "../../../src/listings/wizard/Step8Review";
import { WizardLayout } from "../../../src/listings/wizard/WizardLayout";
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
  return (
    <View className="gap-2 rounded-lg bg-destructive/10 p-3">
      <Text className="text-sm font-medium text-destructive">
        {t("couldNotSaveAllChanges")}
      </Text>
      {Object.entries(opStates).map(([opId, state]) => (
        <Text key={opId} className="text-xs text-muted-foreground">
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

  // Photos staged by an earlier session cannot be attached by this one.
  const uploadQueue = useUploadQueue(
    sessionListing ? stagingKey : "",
    editPayload,
    { restoreLocalPhotos: false },
  );

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

  // Sync upload queue photos into payload so wizard validation and review see changes
  useEffect(() => {
    const photosFromQueue = buildPayloadPhotos(uploadQueue.photos);
    dispatch({
      type: "UPDATE_FIELDS",
      updates: { photos: photosFromQueue },
    });
  }, [uploadQueue.photos]);

  const ctx = buildMachineContext(machineState);

  const handlePayloadChange = useCallback(
    (updates: Partial<WizardSchemas.WizardDraftPayload>) => {
      dispatch({ type: "UPDATE_FIELDS", updates });
    },
    [],
  );

  const handleReturnToReview = useCallback(() => {
    if (saveEdit.isPending) return;
    if (!ctx.canContinue) {
      setAttemptedSteps((current) =>
        current[machineState.currentStep]
          ? current
          : { ...current, [machineState.currentStep]: true },
      );
      return;
    }
    dispatch({ type: "GO_TO_STEP", step: "review" });
  }, [ctx.canContinue, machineState.currentStep, saveEdit.isPending]);

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
      } catch {
        // Error state surfaced by saveEdit.error + per-op banner below
      }
    },
    [show, listingId, stagingKey],
  );

  const handleSave = useCallback(async () => {
    if (!ctx.canPublish) return;
    await finishSave(saveEdit.save);
  }, [ctx.canPublish, saveEdit.save, finishSave]);

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
  const uploadStatus = {
    inflight: uploadQueue.photos.filter((p) =>
      ["selected", "compressed", "presigned", "uploading"].includes(p.state),
    ).length,
    failed: uploadQueue.photos.filter((p) => p.state === "failed").length,
    total: uploadQueue.photos.length,
  };

  const disabledReason =
    ctx.isLastStep && !uploadQueue.publishGate.canPublish
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

  const saveStatus: "idle" | "saving" | "saved" | "error" =
    saveEdit.isPending ? "saving" : saveEdit.status === "failed" ? "error" : "idle";

  return (
    <WizardLayout
      routeTitle={t("editListing")}
      stepTitle={t(`wizardSteps.${currentStep}`)}
      stepNumber={ctx.stepNumber}
      stepCount={ctx.stepCount}
      onBack={() => {}}
      onContinue={handleReturnToReview}
      onPublish={handleSave}
      onReturnToReview={handleReturnToReview}
      onDiscard={handleDiscard}
      mode={machineState.mode}
      editDetourActive={ctx.editDetourActive}
      canContinue={(ctx.canContinue || currentStep === "specs") && !saveEdit.isPending}
      canPublish={uploadQueue.publishGate.canPublish && !saveEdit.isPending}
      canGoBack={ctx.canGoBack}
      isLastStep={ctx.isLastStep}
      saveStatus={saveStatus}
      saveError={saveEdit.error ? t("couldNotSaveAllChanges") : null}
      onRetrySave={handleRetrySave}
      progressPercent={ctx.progressPercent}
      disabledReason={disabledReason}
      uploadStatus={uploadStatus}
      publishLabel={t("saveChanges")}
      discardTitle={t("leaveEditMode")}
      discardDescription={t("unsavedChangesLost")}
      isDiscarding={false}
      discardError={null}
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
          disabled={true}
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
          defaultPhone={sessionListing.contactPhone ?? ""}
        />
      )}
      {currentStep === "review" && (
        <>
          <Step8Review
            payload={machineState.payload}
            validatedSteps={machineState.validatedSteps}
            onGoToStep={(step) => dispatch({ type: "GO_TO_STEP", step })}
            photos={uploadQueue.photos}
          />
          {saveEdit.status === "failed" && (
            <View className="mt-4">
              <EditSaveErrorBanner
                opStates={saveEdit.opStates}
                onRetry={handleRetrySave}
              />
            </View>
          )}
        </>
      )}
    </WizardLayout>
  );
}
