import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { PrismaModule } from "../../common/prisma.module";
import { IdentityModule } from "../identity/identity.module";
import { IDENTITY_CHECK_PORT, PROFILE_PHOTO_PORT } from "../identity/identity.public";

import { ListingViewsController } from "./presentation/ListingViewsController";
import { ListingsController } from "./presentation/listings.controller";
import { DraftsController } from "./presentation/DraftsController";
import { UploadsController } from "./presentation/UploadsController";
import { MyListingsController } from "./presentation/MyListingsController";
import { ExchangeRatesController } from "./presentation/ExchangeRatesController";
import { FavoritesController } from "./presentation/FavoritesController";
import { ContactPhonesController } from "./presentation/ContactPhonesController";
import { NullVinDecoder } from "./infrastructure/NullVinDecoder";
import { NullContentClassifier } from "./infrastructure/NullContentClassifier";
import { SortedFeedRankingAdapter } from "./infrastructure/SortedFeedRankingAdapter";
import { EventEmitterListingEventPublisher } from "./infrastructure/EventEmitterListingEventPublisher";
import { PrismaListingDraftRepository } from "./infrastructure/PrismaListingDraftRepository";
import { PrismaListingRepository } from "./infrastructure/PrismaListingRepository";
import { PrismaListingMediaRepository } from "./infrastructure/PrismaListingMediaRepository";
import { PrismaMediaUploadRepository } from "./infrastructure/PrismaMediaUploadRepository";
import { PrismaUploadClaims } from "./infrastructure/PrismaUploadClaims";
import { UPLOAD_CLAIM_PORT } from "./domain/ports/UploadClaimPort";
import { PrismaProfilePhotoLink } from "./infrastructure/PrismaProfilePhotoLink";
import { ProfilePhotoUploadAdapter } from "./infrastructure/ProfilePhotoUploadAdapter";
import { PROFILE_PHOTO_LINK_PORT } from "./domain/ports/ProfilePhotoLinkPort";
import { PrismaExchangeRateRepository } from "./infrastructure/PrismaExchangeRateRepository";
import { PrismaListingsReadRepository } from "./infrastructure/PrismaListingsReadRepository";
import { PrismaListingsAdminRepository } from "./infrastructure/PrismaListingsAdminRepository";
import { PrismaOwnerListingCountsRepository } from "./infrastructure/PrismaOwnerListingCountsRepository";
import { PrismaFavoriteRepository } from "./infrastructure/PrismaFavoriteRepository";
import { IdentitySellerProfileAdapter } from "./infrastructure/IdentitySellerProfileAdapter";
import { PrismaVerifiedContactPhoneRepository } from "./infrastructure/PrismaVerifiedContactPhoneRepository";
import { MinioMediaStorageAdapter } from "./infrastructure/MinioMediaStorageAdapter";
import { SharpImageVariantGenerator } from "./infrastructure/SharpImageVariantGenerator";
import { CreateDraft } from "./application/CreateDraft";
import { CountListings } from "./application/CountListings";
import { CountListingModels } from "./application/CountListingModels";
import { CountListingBrands } from "./application/CountListingBrands";
import { RecomputeListingPrices } from "./application/RecomputeListingPrices";
import { UpdateDraft } from "./application/UpdateDraft";
import { ValidateDraftStep } from "./application/ValidateDraftStep";
import { ListMyDrafts } from "./application/ListMyDrafts";
import { DiscardDraft } from "./application/DiscardDraft";
import { UploadAdoptionGuard } from "./application/UploadAdoptionGuard";
import { PresignUpload } from "./application/PresignUpload";
import { PublishListing } from "./application/PublishListing";
import { MarkSold } from "./application/MarkSold";
import { ArchiveListing } from "./application/ArchiveListing";
import { RepublishListing } from "./application/RepublishListing";
import { DeleteListing } from "./application/DeleteListing";
import { EditListing } from "./application/EditListing";
import { AttachMedia } from "./application/AttachMedia";
import { RemoveMedia } from "./application/RemoveMedia";
import { ReorderMedia } from "./application/ReorderMedia";
import { GetListingDetail } from "./application/GetListingDetail";
import { ListFeed } from "./application/ListFeed";
import { ListMyListings } from "./application/ListMyListings";
import { CountMyListings } from "./application/CountMyListings";
import { GetExchangeRates } from "./application/GetExchangeRates";
import { AddFavorite } from "./application/AddFavorite";
import { RemoveFavorite } from "./application/RemoveFavorite";
import { ListMyFavorites } from "./application/ListMyFavorites";
import { RequestContactPhoneCode } from "./application/RequestContactPhoneCode";
import { ConfirmContactPhone } from "./application/ConfirmContactPhone";
import { ListMyContactPhones } from "./application/ListMyContactPhones";
import { ContactPhonePolicy } from "./domain/ContactPhonePolicy";
import { VIN_DECODER_PORT } from "./domain/ports/VinDecoderPort";
import { MEDIA_CONTENT_CLASSIFIER_PORT } from "./domain/ports/MediaContentClassifierPort";
import { FEED_RANKING_PORT } from "./domain/ports/FeedRankingPort";
import { LISTING_EVENT_PUBLISHER } from "./domain/ports/ListingEventPublisher";
import { LISTING_DRAFT_REPOSITORY } from "./domain/ports/ListingDraftRepository";
import { LISTING_REPOSITORY } from "./domain/ports/ListingRepository";
import { LISTING_MEDIA_REPOSITORY } from "./domain/ports/ListingMediaRepository";
import { IMAGE_VARIANT_GENERATOR } from "./domain/ports/ImageVariantGenerator";
import { MEDIA_UPLOAD_REPOSITORY } from "./domain/ports/MediaUploadRepository";
import { MEDIA_OBJECT_INSPECTOR } from "./domain/ports/MediaObjectInspector";
import { EXCHANGE_RATE_PORT } from "./domain/ports/ExchangeRatePort";
import { MEDIA_STORAGE_PORT } from "./domain/ports/MediaStoragePort";
import { LISTINGS_READ_PORT } from "./domain/ports/ListingsReadPort";
import { LISTING_CARD_READ_PORT } from "./domain/ports/ListingCardReadPort";
import { LISTINGS_ADMIN_PORT } from "./domain/ports/ListingsAdminPort";
import { OWNER_LISTING_COUNTS_PORT } from "./domain/ports/OwnerListingCountsPort";
import { FAVORITE_REPOSITORY } from "./domain/ports/FavoriteRepository";
import { SELLER_PROFILE_PORT } from "./domain/ports/SellerProfilePort";
import {
  VERIFIED_CONTACT_PHONE_REPOSITORY,
  type VerifiedContactPhoneRepository,
} from "./domain/ports/VerifiedContactPhoneRepository";
import { ACCOUNT_PHONE_PORT, type AccountPhonePort } from "./domain/ports/AccountPhonePort";

import { RecordListingView } from "./application/RecordListingView";
import { PrismaListingViews } from "./infrastructure/PrismaListingViews";
import { LISTING_VIEWS_PORT } from "./domain/ports/ListingViewsPort";

@Module({
  imports: [PrismaModule, EventEmitterModule, IdentityModule],
  controllers: [ListingViewsController, ListingsController, DraftsController, UploadsController, MyListingsController, ExchangeRatesController, FavoritesController, ContactPhonesController],
  providers: [
    // Infrastructure adapters
    NullVinDecoder,
    NullContentClassifier,
    SortedFeedRankingAdapter,
    EventEmitterListingEventPublisher,
    PrismaListingDraftRepository,
    PrismaListingRepository,
    PrismaListingMediaRepository,
    PrismaMediaUploadRepository,
    PrismaUploadClaims,
    PrismaExchangeRateRepository,
    PrismaListingsReadRepository,
    PrismaListingsAdminRepository,
    PrismaOwnerListingCountsRepository,
    PrismaFavoriteRepository,
    IdentitySellerProfileAdapter,
    MinioMediaStorageAdapter,
    SharpImageVariantGenerator,

    // Port bindings
    {
      provide: VIN_DECODER_PORT,
      useClass: NullVinDecoder,
    },
    {
      provide: MEDIA_CONTENT_CLASSIFIER_PORT,
      useClass: NullContentClassifier,
    },
    {
      provide: FEED_RANKING_PORT,
      useClass: SortedFeedRankingAdapter,
    },
    {
      provide: LISTING_EVENT_PUBLISHER,
      useClass: EventEmitterListingEventPublisher,
    },
    {
      provide: LISTING_DRAFT_REPOSITORY,
      useClass: PrismaListingDraftRepository,
    },
    {
      provide: LISTING_REPOSITORY,
      useClass: PrismaListingRepository,
    },
    {
      provide: LISTING_MEDIA_REPOSITORY,
      useClass: PrismaListingMediaRepository,
    },
    {
      provide: EXCHANGE_RATE_PORT,
      useClass: PrismaExchangeRateRepository,
    },
    {
      provide: MEDIA_STORAGE_PORT,
      useExisting: MinioMediaStorageAdapter,
    },
    {
      provide: MEDIA_UPLOAD_REPOSITORY,
      useClass: PrismaMediaUploadRepository,
    },
    {
      provide: UPLOAD_CLAIM_PORT,
      useExisting: PrismaUploadClaims,
    },
    {
      provide: MEDIA_OBJECT_INSPECTOR,
      useExisting: MinioMediaStorageAdapter,
    },
    {
      provide: PROFILE_PHOTO_LINK_PORT,
      useClass: PrismaProfilePhotoLink,
    },
    ProfilePhotoUploadAdapter,
    {
      // Identity's port, served by the upload pipeline (ADR-0088).
      provide: PROFILE_PHOTO_PORT,
      useExisting: ProfilePhotoUploadAdapter,
    },
    {
      provide: IMAGE_VARIANT_GENERATOR,
      useClass: SharpImageVariantGenerator,
    },
    {
      provide: LISTINGS_READ_PORT,
      useClass: PrismaListingsReadRepository,
    },
    {
      provide: LISTING_CARD_READ_PORT,
      useExisting: PrismaListingsReadRepository,
    },
    {
      provide: LISTINGS_ADMIN_PORT,
      useClass: PrismaListingsAdminRepository,
    },
    {
      provide: OWNER_LISTING_COUNTS_PORT,
      useExisting: PrismaOwnerListingCountsRepository,
    },
    {
      provide: FAVORITE_REPOSITORY,
      useClass: PrismaFavoriteRepository,
    },
    {
      provide: SELLER_PROFILE_PORT,
      useExisting: IdentitySellerProfileAdapter,
    },
    {
      provide: VERIFIED_CONTACT_PHONE_REPOSITORY,
      useClass: PrismaVerifiedContactPhoneRepository,
    },
    {
      // Identity's yes/no `holdsSignInPhone`; Listings never reads the value.
      provide: ACCOUNT_PHONE_PORT,
      useExisting: IDENTITY_CHECK_PORT,
    },
    {
      provide: ContactPhonePolicy,
      useFactory: (
        accountPhones: AccountPhonePort,
        confirmations: VerifiedContactPhoneRepository,
      ) => new ContactPhonePolicy(accountPhones, confirmations),
      inject: [ACCOUNT_PHONE_PORT, VERIFIED_CONTACT_PHONE_REPOSITORY],
    },

    // Application use-cases
    CreateDraft,
    CountListings,
    CountListingModels,
    CountListingBrands,
    RecomputeListingPrices,
    UpdateDraft,
    ValidateDraftStep,
    ListMyDrafts,
    DiscardDraft,
    UploadAdoptionGuard,
    PresignUpload,
    PublishListing,
    MarkSold,
    ArchiveListing,
    RepublishListing,
    DeleteListing,
    EditListing,
    AttachMedia,
    RemoveMedia,
    ReorderMedia,
    GetListingDetail,
    RecordListingView,
    { provide: LISTING_VIEWS_PORT, useClass: PrismaListingViews },
    ListFeed,
    ListMyListings,
    CountMyListings,
    GetExchangeRates,
    AddFavorite,
    RemoveFavorite,
    ListMyFavorites,
    RequestContactPhoneCode,
    ConfirmContactPhone,
    ListMyContactPhones,
  ],
  exports: [
    VIN_DECODER_PORT,
    MEDIA_CONTENT_CLASSIFIER_PORT,
    FEED_RANKING_PORT,
    LISTING_EVENT_PUBLISHER,
    LISTING_DRAFT_REPOSITORY,
    LISTING_REPOSITORY,
    LISTING_MEDIA_REPOSITORY,
    IMAGE_VARIANT_GENERATOR,
    EXCHANGE_RATE_PORT,
    MEDIA_STORAGE_PORT,
    LISTINGS_READ_PORT,
    LISTINGS_ADMIN_PORT,
    FAVORITE_REPOSITORY,
    PROFILE_PHOTO_PORT,
  ],
})
export class ListingsModule {}
