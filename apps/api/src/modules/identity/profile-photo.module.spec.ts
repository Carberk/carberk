import "reflect-metadata";

import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { ListingsModule } from "../listings/listings.module";
import { GetMe } from "./application/GetMe";
import { RemoveProfilePhoto } from "./application/RemoveProfilePhoto";
import { SetProfilePhoto } from "./application/SetProfilePhoto";
import { PROFILE_PHOTO_PORT } from "./domain/ports/ProfilePhotoPort";
import { IdentityModule } from "./identity.module";
import { IDENTITY_TOKENS } from "./identity.tokens";
import { MePhotoController } from "./presentation/MePhotoController";
import { ProfilePhotoModule } from "./profile-photo.module";

function metadata(key: string, module: unknown): unknown[] {
  return (Reflect.getMetadata(key, module as object) as unknown[] | undefined) ?? [];
}

describe("ProfilePhotoModule", () => {
  it("composes identity's photo use-cases with the upload boundary Listings provides", () => {
    expect(metadata(MODULE_METADATA.IMPORTS, ProfilePhotoModule)).toEqual(
      expect.arrayContaining([IdentityModule, ListingsModule]),
    );
    expect(metadata(MODULE_METADATA.CONTROLLERS, ProfilePhotoModule)).toEqual([MePhotoController]);
    expect(metadata(MODULE_METADATA.PROVIDERS, ProfilePhotoModule)).toEqual(
      expect.arrayContaining([SetProfilePhoto, RemoveProfilePhoto]),
    );
  });

  it("gets the port from Listings, which binds it to its upload adapter and exports it", () => {
    const binding = metadata(MODULE_METADATA.PROVIDERS, ListingsModule).find(
      (provider) =>
        typeof provider === "object" && provider !== null &&
        "provide" in provider && provider.provide === PROFILE_PHOTO_PORT,
    );

    expect(binding).toMatchObject({ provide: PROFILE_PHOTO_PORT });
    expect(metadata(MODULE_METADATA.EXPORTS, ListingsModule)).toContain(PROFILE_PHOTO_PORT);
  });

  it("leaves IdentityModule free of Listings, so the two modules form no cycle", () => {
    expect(metadata(MODULE_METADATA.IMPORTS, IdentityModule)).not.toContain(ListingsModule);
    expect(metadata(MODULE_METADATA.IMPORTS, IdentityModule)).not.toContain(ProfilePhotoModule);
    expect(metadata(MODULE_METADATA.IMPORTS, ListingsModule)).toContain(IdentityModule);
  });

  it("reads /me and the User through providers IdentityModule exports", () => {
    expect(metadata(MODULE_METADATA.EXPORTS, IdentityModule)).toEqual(
      expect.arrayContaining([GetMe, IDENTITY_TOKENS.UserRepository]),
    );
  });
});
