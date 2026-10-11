import { describe, it, expect } from "vitest";

import { mediaCleanupPrefix } from "./mediaCleanupPrefix";

const directory = "pending/00000000-0000-4000-8000-000000000001/";

describe("Listing cleanup namespace", () => {
  it.each(["jpg", "webp", "mp4"])("recognizes a presigned %s original", (extension) => {
    expect(mediaCleanupPrefix(`${directory}original.${extension}`)).toBe(directory);
  });

  it.each([
    "pending/original.webp", "pending/not-a-uuid/original.webp",
    `${directory}original.jpeg`, `${directory}nested/original.webp`,
    `${directory}thumbnail.webp`, `${directory}original.webp/extra`,
    `other/${directory}original.webp`, `/${directory}original.webp`,
    "chat-attachments/conversation/00000000-0000-4000-8000-000000000001/original.mp4",
    `${directory}original.webp\n`,
  ])("rejects keys presign cannot produce: %s", (key) => {
    expect(mediaCleanupPrefix(key)).toBeNull();
  });
});
