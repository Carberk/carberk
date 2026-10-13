/**
 * What Listing detail's card-seeded preview places before detail loads
 * (#867): the optional specifications, whether a VIN row exists and the
 * price badges. Feed and Favorites items carry the contact preferences
 * besides. A value the Listing does not have stays
 * absent, so the preview leaves its entry out. The VIN itself and the contact
 * phone never go on a card.
 */
export interface CardPreviewFields {
  enginePower?: number;
  driveTypeId?: string;
  bodyTypeId?: string;
  colorId?: string;
  hasVin?: boolean;
  acceptsExchange?: boolean;
  installmentAvailable?: boolean;
}

export function cardPreviewFields(source: CardPreviewFields): CardPreviewFields {
  return {
    ...(source.enginePower !== undefined ? { enginePower: source.enginePower } : {}),
    ...(source.driveTypeId !== undefined ? { driveTypeId: source.driveTypeId } : {}),
    ...(source.bodyTypeId !== undefined ? { bodyTypeId: source.bodyTypeId } : {}),
    ...(source.colorId !== undefined ? { colorId: source.colorId } : {}),
    ...(source.hasVin !== undefined ? { hasVin: source.hasVin } : {}),
    ...(source.acceptsExchange !== undefined ? { acceptsExchange: source.acceptsExchange } : {}),
    ...(source.installmentAvailable !== undefined
      ? { installmentAvailable: source.installmentAvailable }
      : {}),
  };
}
