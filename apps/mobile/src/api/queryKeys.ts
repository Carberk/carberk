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
    myDraftsInfinite: () =>
      [...queryKeys.listings.all(), "my-drafts-infinite"] as const,
    /** Shared by every owner lifecycle mutation so pending state spans screens. */
    lifecycleMutation: () => ["listing-lifecycle"] as const,
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
  },

  reports: {
    all: () => ["reports"] as const,
    inspectionInterest: (listingId: string) =>
      [...queryKeys.reports.all(), "inspection-interest", listingId] as const,
  },
};
