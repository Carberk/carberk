export const queryKeys = {
  me: () => ["me"] as const,

  catalog: {
    all: () => ["catalog"] as const,
    brands: (locale: string = "ru") =>
      [...queryKeys.catalog.all(), "brands", locale] as const,
    models: (brandId: string, locale: string = "ru") =>
      [...queryKeys.catalog.all(), "models", brandId, locale] as const,
    generations: (modelId: string, locale: string = "ru") =>
      [...queryKeys.catalog.all(), "generations", modelId, locale] as const,
    colors: (locale: string = "ru") =>
      [...queryKeys.catalog.all(), "colors", locale] as const,
    bodyTypes: (locale: string = "ru") =>
      [...queryKeys.catalog.all(), "body-types", locale] as const,
    engineTypes: (locale: string = "ru") =>
      [...queryKeys.catalog.all(), "engine-types", locale] as const,
    transmissions: (locale: string = "ru") =>
      [...queryKeys.catalog.all(), "transmissions", locale] as const,
    driveTypes: (locale: string = "ru") =>
      [...queryKeys.catalog.all(), "drive-types", locale] as const,
    regions: (locale: string = "ru") =>
      [...queryKeys.catalog.all(), "regions", locale] as const,
    cities: (regionId: string, locale: string = "ru") =>
      [...queryKeys.catalog.all(), "cities", regionId, locale] as const,
    /** A region's whole city list, apart from the first page `cities` holds. */
    citiesAll: (regionId: string, locale: string = "ru") =>
      [...queryKeys.catalog.cities(regionId, locale), "all"] as const,
    search: (query: string, locale: string) =>
      [...queryKeys.catalog.all(), "search", query, locale] as const,
  },

  listings: {
    all: () => ["listings"] as const,
    lists: () => [...queryKeys.listings.all(), "list"] as const,
    /**
     * `viewerId` separates a signed-in feed (items carry `isFavorited`) from
     * the anonymous one, so a cached anonymous page never shows a stale ♡.
     */
    list: (filters: unknown, viewerId: string | null = null) =>
      [...queryKeys.listings.lists(), filters, viewerId] as const,
    count: (filters: unknown) =>
      [...queryKeys.listings.all(), "count", filters] as const,
    modelCounts: (filters: unknown) =>
      [...queryKeys.listings.all(), "model-counts", filters] as const,
    brandCounts: (filters: unknown) =>
      [...queryKeys.listings.all(), "brand-counts", filters] as const,
    detail: (id: string) =>
      [...queryKeys.listings.all(), "detail", id] as const,
    myListings: () => [...queryKeys.listings.all(), "my-listings"] as const,
    myListingsInfinite: () =>
      [...queryKeys.listings.all(), "my-listings-infinite"] as const,
    myDrafts: () => [...queryKeys.listings.all(), "my-drafts"] as const,
    ownerVideo: (userId: string | null, type?: string, id?: string) =>
      [...queryKeys.listings.all(), "owner-video", userId, type, id] as const,
    /** Per User and generation: a cover grant names its Session and the video it was issued for. */
    videoCover: (userId: string | null, listingId: string, generationId?: string) =>
      [...queryKeys.listings.all(), "video-cover", userId, listingId, generationId] as const,
    stagingOwners: (userId: string) =>
      [...queryKeys.listings.all(), "staging-owners", userId] as const,
    myDraftsInfinite: () =>
      [...queryKeys.listings.all(), "my-drafts-infinite"] as const,
    myCountsAll: () => [...queryKeys.listings.all(), "my-counts"] as const,
    /** Per User, so a cached total never shows after another User signs in. */
    myCounts: (userId: string | null) =>
      [...queryKeys.listings.myCountsAll(), userId] as const,
    /** Shared by every owner lifecycle mutation so pending state spans screens. */
    lifecycleMutation: () => ["listing-lifecycle"] as const,
    myContactPhonesAll: () =>
      [...queryKeys.listings.all(), "my-contact-phones"] as const,
    /** Per User, so a cached list never shows after another User signs in. */
    myContactPhones: (userId: string | null) =>
      [...queryKeys.listings.myContactPhonesAll(), userId] as const,
  },

  uploads: {
    all: () => ["uploads"] as const,
    presign: () => [...queryKeys.uploads.all(), "presign"] as const,
  },

  exchangeRates: {
    all: () => ["exchange-rates"] as const,
  },

  favorites: {
    all: () => ["favorites"] as const,
    lists: () => [...queryKeys.favorites.all(), "list"] as const,
    /** Hide sold on and off are separate lists, each with its own pages. */
    list: (activeOnly: boolean) =>
      [...queryKeys.favorites.lists(), { activeOnly }] as const,
  },

  conversations: {
    all: () => ["conversations"] as const,
    list: () => [...queryKeys.conversations.all(), "list"] as const,
    detail: (id: string) =>
      [...queryKeys.conversations.all(), "detail", id] as const,
    messages: (id: string) =>
      [...queryKeys.conversations.all(), "messages", id] as const,
    /** Every viewer's total; invalidate this to refresh the Messages tab count. */
    unreadCounts: () =>
      [...queryKeys.conversations.all(), "unread-count"] as const,
    /** Keyed by viewer, so another User never sees the previous User's count. */
    unreadCount: (viewerId: string) =>
      [...queryKeys.conversations.unreadCounts(), viewerId] as const,
  },

  reports: {
    all: () => ["reports"] as const,
    inspectionInterest: (listingId: string) =>
      [...queryKeys.reports.all(), "inspection-interest", listingId] as const,
  },
};
