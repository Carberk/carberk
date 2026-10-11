import { describe, it, expect } from "vitest";

process.env["EXPO_PUBLIC_MEDIA_URL"] = "https://media.autotm.tm";

import { buildOriginalUrl, buildVariantUrl } from "./buildVariantUrl";

describe("buildVariantUrl", () => {
  it("builds detail variant from original key", () => {
    const url = buildVariantUrl("listings/l1/m1/original.webp", "detail");
    expect(url).toBe("https://media.autotm.tm/listing-photos/listings/l1/m1/detail.webp");
  });

  it("builds fullscreen variant from webp original", () => {
    const url = buildVariantUrl(
      "listings/l1/m1/original.webp",
      "fullscreen",
    );
    expect(url).toBe(
      "https://media.autotm.tm/listing-photos/listings/l1/m1/fullscreen.webp",
    );
  });

  it("returns raw URL for video keys", () => {
    const url = buildVariantUrl("listings/l1/m1/video.mp4", "detail");
    expect(url).toBe("https://media.autotm.tm/listing-videos/listings/l1/m1/video.mp4");
  });

  it("builds original image URL with bucket", () => {
    const url = buildOriginalUrl("pending/p1/original.webp");
    expect(url).toBe("https://media.autotm.tm/listing-photos/pending/p1/original.webp");
  });
});
