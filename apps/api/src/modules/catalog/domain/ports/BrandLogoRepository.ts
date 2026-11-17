import type { Brand } from "../Brand";






export type LogoKeyReplacement =
  | { replaced: true; previousKey: string | null }
  | { replaced: false; reason: "not-found" };


export interface BrandLogoRepository {
  getBrandById(id: string): Promise<Brand | null>;





  replaceLogoKey(id: string, logoKey: string | null): Promise<LogoKeyReplacement>;
}

export const BRAND_LOGO_REPOSITORY = Symbol("BrandLogoRepository");
