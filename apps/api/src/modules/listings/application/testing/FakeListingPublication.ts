import { Listing } from "../../domain/Listing";
import type { UploadClaimPort } from "../../domain/ports/UploadClaimPort";
import type { ListingPublication, ListingPublicationInput } from "../ports/ListingPublication";

export class FakeListingPublication implements ListingPublication {
  createdListings: Array<ListingPublicationInput["listing"] & { priceTmt: number }> = [];
  createdMedia: ListingPublicationInput["photos"] = [];
  deletedDrafts: string[] = [];
  failTransaction: (() => Error) | undefined;

  constructor(private readonly claims: UploadClaimPort) {}

  async publish(input: ListingPublicationInput): Promise<Listing> {
    if (this.failTransaction) throw this.failTransaction();
    await this.claims.finalize(null, {
      token: input.claimToken,
      uploadIds: input.photos.map((photo) => photo.uploadId),
      target: { type: "listing", id: input.listing.id },
    });
    const listing = Listing.create({ ...input.listing, publicNumber: 1 });
    this.createdListings.push({ ...input.listing, priceTmt: input.priceTmt });
    this.createdMedia.push(...input.photos);
    this.deletedDrafts.push(input.draftId);
    return listing;
  }
}
