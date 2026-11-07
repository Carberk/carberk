import type { Env } from "../env.schema";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { ConfigListingVideoAccess } from "./ConfigListingVideoAccess";

it("defaults missing configuration to no video access", () => {
  const access = new ConfigListingVideoAccess(new ConfigService<Env, true>());
  expect(access.canUploadVideo("user-1")).toBe(false);
  expect(access.canResumeVideo("user-1")).toBe(false);
  expect(access.canViewVideo("user-1")).toBe(false);
});

describe.each([false, true])("uploads enabled %s", (enabled) => {
  it("matches exact, trimmed User IDs independently for upload and view", () => {
    const access = new ConfigListingVideoAccess(new ConfigService<Env, true>({
      LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: " upload-only, both, , ",
      LISTING_VIDEO_VIEW_TESTER_USER_IDS: " view-only, both ",
      LISTING_VIDEO_UPLOADS_ENABLED: enabled,
    }));
    expect(access.canUploadVideo("upload-only")).toBe(enabled);
    expect(access.canResumeVideo("upload-only")).toBe(true);
    expect(access.canViewVideo("upload-only")).toBe(false);
    expect(access.canUploadVideo("view-only")).toBe(false);
    expect(access.canResumeVideo("view-only")).toBe(false);
    expect(access.canViewVideo("view-only")).toBe(true);
    expect(access.canUploadVideo("both")).toBe(enabled);
    expect(access.canResumeVideo("both")).toBe(true);
    expect(access.canViewVideo("both")).toBe(true);
    for (const id of ["", "upload", "neither"]) {
      expect(access.canUploadVideo(id)).toBe(false);
      expect(access.canResumeVideo(id)).toBe(false);
      expect(access.canViewVideo(id)).toBe(false);
    }
  });
});
