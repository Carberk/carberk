import { useCallback, useReducer, useRef } from "react";
import { ListingsSchemas, type WizardSchemas } from "@auto-tm/contracts";

import { useEditListing } from "../../api/listings/useEditListing";
import { useAttachMedia } from "../../api/listings/useAttachMedia";
import { useRemoveMedia } from "../../api/listings/useRemoveMedia";
import { useReorderMedia } from "../../api/listings/useReorderMedia";
import type { StagedPhoto } from "../uploadStaging/types";

import { EDITABLE_FIELDS } from "./editChanges";

export type OpState = "pending" | "in_flight" | "succeeded" | "failed";

export class EditSessionError extends Error {
  constructor(
    public readonly opStates: Record<string, OpState>,
    public readonly failedOpId: string,
    public readonly cause: unknown,
  ) {
    super(`Edit session failed at operation ${failedOpId}`);
    this.name = "EditSessionError";
  }
}

interface State {
  status: "idle" | "saving" | "succeeded" | "failed";
  opStates: Record<string, OpState>;
  error: EditSessionError | null;
}

type Action =
  | { type: "INIT_OPS"; opIds: string[] }
  | { type: "OP_START"; opId: string }
  | { type: "OP_SUCCESS"; opId: string }
  | { type: "OP_FAIL"; opId: string; cause: unknown }
  | { type: "ALL_SUCCEEDED" }
  | { type: "RETRY" }
  | { type: "RESET" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "INIT_OPS": {
      const opStates: Record<string, OpState> = {};
      for (const id of action.opIds) {
        opStates[id] = "pending";
      }
      return {
        status: "saving",
        opStates,
        error: null,
      };
    }
    case "OP_START":
      return {
        ...state,
        opStates: { ...state.opStates, [action.opId]: "in_flight" },
      };
    case "OP_SUCCESS":
      return {
        ...state,
        opStates: { ...state.opStates, [action.opId]: "succeeded" },
      };
    case "OP_FAIL": {
      const nextOpStates: Record<string, OpState> = {
        ...state.opStates,
        [action.opId]: "failed",
      };
      return {
        ...state,
        status: "failed",
        opStates: nextOpStates,
        error: new EditSessionError(nextOpStates, action.opId, action.cause),
      };
    }
    case "ALL_SUCCEEDED":
      return { ...state, status: "succeeded" };
    case "RETRY": {
      const next: Record<string, OpState> = {};
      for (const [id, s] of Object.entries(state.opStates)) {
        next[id] = s === "failed" ? "pending" : s;
      }
      return { ...state, status: "saving", opStates: next, error: null };
    }
    case "RESET":
      return { status: "idle", opStates: {}, error: null };
    default:
      return state;
  }
}

export function buildFieldsPatch(
  payload: WizardSchemas.WizardDraftPayload,
): ListingsSchemas.EditListingRequest {
  const fields: ListingsSchemas.EditListingRequest = {
    priceAmount: payload.priceAmount,
    priceCurrency: payload.priceCurrency,
    description: payload.description,
    condition: payload.condition,
    mileageKm: payload.mileageKm,
    colorId: payload.colorId,
    bodyTypeId: payload.bodyTypeId,
    transmissionId: payload.transmissionId,
    driveTypeId: payload.driveTypeId,
    engineTypeId: payload.engineTypeId,
    enginePower: payload.enginePower,
    regionId: payload.regionId,
    cityId: payload.cityId,
    locationText: payload.locationText,
    contactPhone: payload.contactPhone,
    allowCalls: payload.allowCalls,
    allowChat: payload.allowChat,
    acceptsExchange: payload.acceptsExchange,
    installmentAvailable: payload.installmentAvailable,
    conditionDisclosure: payload.conditionDisclosure === undefined
      ? undefined
      : ListingsSchemas.ConditionDisclosureSchema.parse(payload.conditionDisclosure),
  };
  const patch: ListingsSchemas.EditListingRequest = {};
  function copyDefinedField<K extends keyof ListingsSchemas.EditListingRequest>(field: K) {
    const value = fields[field];
    if (value !== undefined) patch[field] = value;
  }
  EDITABLE_FIELDS.forEach(copyDefinedField);
  return patch;
}

export interface SaveListingEditOp {
  id: string;
  label: string;
}

/**
 * What this edit session has already done to the server, in the server's own
 * terms. Attach mints a server media ID that differs from the local staging
 * UUID; later operations (reorder, a repeated save) must use it.
 */
interface MediaLedger {
  /** Local staging photoId to the server media ID attach returned. */
  attached: Map<string, string>;
  /** Server media IDs already deleted, so a stale seed cannot re-queue them. */
  removed: Set<string>;
}

function createLedger(): MediaLedger {
  return { attached: new Map(), removed: new Set() };
}

interface PlannedAttachment {
  photoId: string;
  key: string;
  sortOrder: number;
  width?: number;
  height?: number;
}

/** Operations for one save, fixed when it starts so retry replays the same intent. */
interface EditPlan {
  /** What the seller had on screen when the plan was fixed; see `editInputKey`. */
  inputKey: string;
  fieldsPatch: ListingsSchemas.EditListingRequest;
  attachments: PlannedAttachment[];
  removedMediaIds: string[];
  /** Final display order, cover first. Local IDs resolve through the ledger at reorder time. */
  orderedPhotoIds: string[];
}

/**
 * The seller's intent as a plan sees it: the fields they would send and the
 * photos in display order. Compared by content, so a re-render or a refetch
 * that hands the hook fresh objects with the same content is not a change.
 */
function editInputKey(
  fieldsPatch: ListingsSchemas.EditListingRequest,
  photos: StagedPhoto[],
): string {
  return JSON.stringify({
    fields: fieldsPatch,
    photos: photos.map((p) => [p.photoId, p.key ?? null, p.sortOrder]),
  });
}

function buildEditPlan(
  fieldsPatch: ListingsSchemas.EditListingRequest,
  photos: StagedPhoto[],
  seedMedia: ListingsSchemas.ListingMedia[],
  ledger: MediaLedger,
): EditPlan {
  const seedMediaIds = new Set(seedMedia.map((m) => m.id));
  const isServerMedia = (photoId: string) =>
    seedMediaIds.has(photoId) || ledger.attached.has(photoId);
  const serverId = (photoId: string) => ledger.attached.get(photoId) ?? photoId;

  const attachments: PlannedAttachment[] = [];
  for (const photo of photos) {
    if (!hasUploadKey(photo) || isServerMedia(photo.photoId)) continue;
    attachments.push({
      photoId: photo.photoId,
      key: photo.key,
      sortOrder: photo.sortOrder,
      width: photo.width,
      height: photo.height,
    });
  }

  const keptMediaIds = new Set(photos.map((p) => serverId(p.photoId)));
  const removedMediaIds = new Set<string>();
  const planRemoval = (mediaId: string) => {
    if (!keptMediaIds.has(mediaId) && !ledger.removed.has(mediaId)) {
      removedMediaIds.add(mediaId);
    }
  };
  seedMedia.forEach((m) => planRemoval(m.id));
  // A photo attached earlier in this session and dropped since is on the
  // server even while the seed is still the pre-attach snapshot.
  ledger.attached.forEach((mediaId) => planRemoval(mediaId));

  // A photo with no object key and no server row has no server ID to order.
  const orderedPhotoIds = photos
    .filter((p) => hasUploadKey(p) || isServerMedia(p.photoId))
    .map((p) => p.photoId);

  return {
    inputKey: editInputKey(fieldsPatch, photos),
    fieldsPatch,
    attachments,
    removedMediaIds: [...removedMediaIds],
    orderedPhotoIds,
  };
}

function planOps(plan: EditPlan): SaveListingEditOp[] {
  const ops: SaveListingEditOp[] = [];
  if (Object.keys(plan.fieldsPatch).length > 0) {
    ops.push({ id: "fields", label: "Save field changes" });
  }
  for (const attachment of plan.attachments) {
    ops.push({
      id: `attach:${attachment.photoId}`,
      label: `Attach photo ${attachment.sortOrder + 1}`,
    });
  }
  for (const mediaId of plan.removedMediaIds) {
    ops.push({ id: `remove:${mediaId}`, label: "Remove photo" });
  }
  if (plan.orderedPhotoIds.length > 0) {
    ops.push({ id: "reorder", label: "Update photo order" });
  }
  return ops;
}

export function opLabel(opId: string): string {
  if (opId === "fields") return "Save field changes";
  if (opId === "reorder") return "Update photo order";
  if (opId.startsWith("attach:")) return "Attach photo";
  if (opId.startsWith("remove:")) return "Remove photo";
  return opId;
}

function hasUploadKey(photo: StagedPhoto): photo is StagedPhoto & { key: string } {
  return Boolean(photo.key);
}

export function useSaveListingEdit(
  listingId: string,
  payload: WizardSchemas.WizardDraftPayload,
  photos: StagedPhoto[],
  seedMedia: ListingsSchemas.ListingMedia[],
  businessId?: string,
) {
  const [state, dispatch] = useReducer(reducer, {
    status: "idle",
    opStates: {},
    error: null,
  });

  const editListing = useEditListing(businessId);
  const attachMedia = useAttachMedia(listingId, businessId);
  const removeMedia = useRemoveMedia(listingId, businessId);
  const reorderMedia = useReorderMedia(listingId, businessId);

  // Survives refetches and re-renders: what the server accepted and the plan
  // the current save is working through. Never derived from the live seed.
  const ledgerRef = useRef<{ listingId: string; ledger: MediaLedger }>({
    listingId,
    ledger: createLedger(),
  });
  const planRef = useRef<EditPlan | null>(null);

  const currentLedger = useCallback((): MediaLedger => {
    if (ledgerRef.current.listingId !== listingId) {
      ledgerRef.current = { listingId, ledger: createLedger() };
      planRef.current = null;
    }
    return ledgerRef.current.ledger;
  }, [listingId]);

  const runOps = useCallback(
    async (plan: EditPlan, initialOpStates: Record<string, OpState>) => {
      const ledger = currentLedger();
      const opStates: Record<string, OpState> = { ...initialOpStates };

      const runOp = async (opId: string, fn: () => Promise<unknown>) => {
        if (opStates[opId] === "succeeded") return;
        opStates[opId] = "in_flight";
        dispatch({ type: "OP_START", opId });
        try {
          await fn();
          opStates[opId] = "succeeded";
          dispatch({ type: "OP_SUCCESS", opId });
        } catch (err) {
          opStates[opId] = "failed";
          dispatch({ type: "OP_FAIL", opId, cause: err });
          throw new EditSessionError({ ...opStates }, opId, err);
        }
      };

      // Repair older Listings before fields. At the cap, release one obsolete
      // photo per attachment; at 20 -> 19 this preserves the publication floor.
      const removePlanned = async (mediaId: string) => {
        await runOp(`remove:${mediaId}`, async () => {
          await removeMedia.mutateAsync(mediaId);
          ledger.removed.add(mediaId);
        });
      };
      let attachedCount = seedMedia.filter((media) => !ledger.removed.has(media.id)).length +
        [...ledger.attached.values()].filter((id) => !seedMedia.some((media) => media.id === id) && !ledger.removed.has(id)).length;
      for (const attachment of plan.attachments) {
        if (ledger.attached.has(attachment.photoId)) continue;
        if (attachedCount >= ListingsSchemas.MAX_LISTING_PHOTOS) {
          const obsoleteId = plan.removedMediaIds.find((id) => !ledger.removed.has(id));
          if (obsoleteId) {
            await removePlanned(obsoleteId);
            attachedCount--;
          }
        }
        await runOp(`attach:${attachment.photoId}`, async () => {
          const attached = await attachMedia.mutateAsync({
            key: attachment.key,
            kind: "image",
            sortOrder: attachment.sortOrder,
            width: attachment.width,
            height: attachment.height,
          });
          ledger.attached.set(attachment.photoId, attached.id);
          attachedCount++;
        });
      }

      if (Object.keys(plan.fieldsPatch).length > 0) {
        await runOp("fields", () =>
          editListing.mutateAsync({ listingId, patch: plan.fieldsPatch }),
        );
      }

      for (const mediaId of plan.removedMediaIds) {
        await removePlanned(mediaId);
      }

      if (plan.orderedPhotoIds.length > 0) {
        await runOp("reorder", () =>
          reorderMedia.mutateAsync({
            ordering: plan.orderedPhotoIds.map((photoId, sortOrder) => ({
              mediaId: ledger.attached.get(photoId) ?? photoId,
              sortOrder,
            })),
          }),
        );
      }

      dispatch({ type: "ALL_SUCCEEDED" });
    },
    [
      listingId,
      currentLedger,
      editListing,
      attachMedia,
      removeMedia,
      reorderMedia,
      seedMedia,
    ],
  );

  // Two presses in the same render would both run the plan and attach a photo twice.
  const inFlightRef = useRef(false);
  const runExclusive = useCallback(async (work: () => Promise<boolean>) => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    try {
      return await work();
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const runFreshPlan = useCallback(
    async (plan: EditPlan) => {
      planRef.current = plan;
      dispatch({
        type: "INIT_OPS",
        opIds: planOps(plan).map((o) => o.id),
      });
      await runOps(plan, {});
      return true;
    },
    [runOps],
  );

  /** Resolves true when every operation succeeded, false when another save was already running. */
  const save = useCallback(
    () =>
      runExclusive(() =>
        runFreshPlan(
          buildEditPlan(buildFieldsPatch(payload), photos, seedMedia, currentLedger()),
        ),
      ),
    [payload, photos, seedMedia, currentLedger, runExclusive, runFreshPlan],
  );

  /**
   * Resolves true when every operation succeeded and false when nothing ran
   * (no failed save to retry, or another save is running). An undiverged
   * retry replays the plan fixed at Save; edits made since then are saved by
   * re-planning from the current state against the ledger, as a fresh Save would.
   */
  const retry = useCallback(
    () =>
      runExclusive(async () => {
        const ledger = currentLedger();
        const plan = planRef.current;
        if (state.status !== "failed" || !plan) return false;
        const fieldsPatch = buildFieldsPatch(payload);
        if (plan.inputKey !== editInputKey(fieldsPatch, photos)) {
          return runFreshPlan(buildEditPlan(fieldsPatch, photos, seedMedia, ledger));
        }
        dispatch({ type: "RETRY" });
        await runOps(plan, state.opStates);
        return true;
      }),
    [
      state.status,
      state.opStates,
      payload,
      photos,
      seedMedia,
      currentLedger,
      runExclusive,
      runFreshPlan,
      runOps,
    ],
  );

  return {
    save,
    retry,
    status: state.status,
    opStates: state.opStates,
    error: state.error,
    isPending: state.status === "saving",
  };
}
