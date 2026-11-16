import type { Listing } from "../../domain/Listing";

export interface ListingPublicationInput {
  draftId: string;
  listing: Omit<Parameters<typeof Listing.create>[0], "publicNumber" | "createdAt" | "updatedAt">;
  priceTmt: number;
  claimToken: string;
  photos: { id: string; key: string; sortOrder: number; uploadId: string; thumbHash?: string | undefined }[];
}

export interface ListingPublication {
  publish(input: ListingPublicationInput): Promise<Listing>;
}

export const LISTING_PUBLICATION = Symbol("ListingPublication");
