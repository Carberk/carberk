import { describe, expect, it } from "vitest";

process.env["EXPO_PUBLIC_MEDIA_URL"] = "https://media.autotm.tm";

import { getPhotoUri } from "./photoUri";
import type { StagedPhoto } from "./types";

function photo(overrides: Partial<StagedPhoto>): StagedPhoto {
  return {
    photoId: "photo-1",
    state: "uploaded",
    sortOrder: 0,
    retryCount: 0,
    ...overrides,
  };
}

describe("getPhotoUri", () => {
  it("prefers the local staged file when it exists", () => {
    expect(
      getPhotoUri(
        photo({
          localUri: "file:///local/photo.webp",
          key: "pending/p1/original.webp",
        }),
      ),
    ).toBe("file:///local/photo.webp");
  });

  it("uses the pending original object because draft uploads have no generated variants yet", () => {
    expect(getPhotoUri(photo({ key: "pending/p1/original.webp" }))).toBe(
      "https://media.autotm.tm/listing-photos/pending/p1/original.webp",
    );
  });

  it("uses generated variants for attached listing media", () => {
    expect(
      getPhotoUri(
        photo({ key: "listings/listing-1/media-1/original.webp" }),
        "detail",
      ),
    ).toBe(
      "https://media.autotm.tm/listing-photos/listings/listing-1/media-1/detail.webp",
    );
  });
});
