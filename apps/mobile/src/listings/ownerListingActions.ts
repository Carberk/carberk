import { Enums } from "@auto-tm/contracts";

/**
 * What an owner can do with a Listing or a draft, shared by My listings' ⋯
 * sheet and Listing detail's owner bar and menu so both use the same names.
 */
export type OwnerListingAction = "edit" | "markSold" | "remove" | "relist" | "delete";
export type DraftAction = "continue" | "deleteDraft";
export type OwnerAction = OwnerListingAction | DraftAction;
/** The actions that change the Listing or draft, and so ask first. */
export type ConfirmedOwnerAction = Exclude<OwnerAction, "edit" | "continue">;

/**
 * The actions a Listing's status allows, in the sheet's order. A sold Listing
 * can only be deleted: it cannot be put back on sale. A blocked (banned)
 * Listing has none until an admin unbans it.
 */
export function ownerListingActions(status: string): OwnerListingAction[] {
  switch (status) {
    case Enums.ListingStatus.Active:
      return ["edit", "markSold", "remove", "delete"];
    case Enums.ListingStatus.Archived:
      return ["relist", "edit", "delete"];
    case Enums.ListingStatus.Sold:
      return ["delete"];
    default:
      return [];
  }
}

export const DRAFT_ACTIONS: readonly DraftAction[] = ["continue", "deleteDraft"];

export const OWNER_ACTION_LABEL: Record<OwnerAction, string> = {
  edit: "ownerActionEdit",
  markSold: "ownerActionMarkSold",
  remove: "ownerActionRemove",
  relist: "ownerActionRelist",
  delete: "ownerActionDelete",
  continue: "ownerActionContinue",
  deleteDraft: "ownerActionDeleteDraft",
};

/** Translation keys for each confirmation and the toast after it succeeds. */
export const OWNER_ACTION_CONFIRM: Record<
  ConfirmedOwnerAction,
  { title: string; description: string; done: string }
> = {
  markSold: { title: "ownerConfirmMarkSoldTitle", description: "ownerConfirmMarkSold", done: "ownerDoneMarkSold" },
  remove: { title: "ownerConfirmRemoveTitle", description: "ownerConfirmRemove", done: "ownerDoneRemove" },
  relist: { title: "ownerConfirmRelistTitle", description: "ownerConfirmRelist", done: "ownerDoneRelist" },
  delete: { title: "ownerConfirmDeleteTitle", description: "ownerConfirmDelete", done: "ownerDoneDelete" },
  deleteDraft: { title: "ownerConfirmDeleteDraftTitle", description: "ownerConfirmDeleteDraft", done: "ownerDoneDeleteDraft" },
};

export function isDestructiveAction(action: OwnerAction): boolean {
  return action === "delete" || action === "deleteDraft";
}
