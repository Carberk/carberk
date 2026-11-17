import { BadRequestException } from "@nestjs/common";

import { BRAND_LOGO_REJECTION_MESSAGES, type BrandLogoRejection } from "../domain/BrandLogo";


export function rejectBrandLogo(reason: BrandLogoRejection): never {
  throw new BadRequestException({
    code: "VALIDATION_FAILED",
    message: BRAND_LOGO_REJECTION_MESSAGES[reason],
    details: { reason },
  });
}
