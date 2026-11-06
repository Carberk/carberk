import type { ListingVideoSelection } from "./listingVideo";

/**
 * Preparation port for "Use video". #1044 connects the native adapter;
 * until then the default adapter is inert, so nothing is prepared or
 * uploaded by this ticket.
 */
export interface ListingVideoPreparationPort {
  prepare(selection: ListingVideoSelection): Promise<void> | void;
}

export const inertListingVideoPreparation: ListingVideoPreparationPort = {
  prepare: () => undefined,
};

/** In-memory fake for component tests. Records every handed-off selection. */
export class FakeListingVideoPreparation implements ListingVideoPreparationPort {
  readonly selections: ListingVideoSelection[] = [];

  prepare(selection: ListingVideoSelection): void {
    this.selections.push(selection);
  }
}
