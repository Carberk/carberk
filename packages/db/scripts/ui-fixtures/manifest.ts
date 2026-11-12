import manifest from "./es300h-shenzhen-2025-07-17/v1/photos.manifest.json" with { type: "json" };

export interface GalleryPhoto {
  readonly file: string;
  readonly order: number;
  readonly view: string;
  readonly description: string;
  readonly sourceFile: string;
  readonly sourcePage: string;
  readonly sourceRevisionId: number;
  readonly url: string;
  readonly author: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly transformations: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly sha256: string;
}

export interface GalleryDefinition {
  readonly scenarioKey: string;
  readonly version: number;
  readonly purpose: string;
  readonly subject: string;
  readonly photos: readonly GalleryPhoto[];
}

// Definition import loads only data. Files are decoded only by explicit verification.
for (const photo of manifest.photos) Object.freeze(photo);
Object.freeze(manifest.photos);
export const ES300H_GALLERY: GalleryDefinition = Object.freeze(manifest);
