import type { Enums } from "@auto-tm/contracts";

import type { SignInCodeChannel } from "./types";

/** Why a code was issued (ADR-0081). Each verify accepts only its own purpose. */
export type SignInCodePurpose = Enums.SignInCodePurpose;

export interface OtpRequest {
  readonly id: string;
  readonly purpose: SignInCodePurpose;
  readonly channel: SignInCodeChannel;
  readonly destination: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly verifiedAt: Date | null;
  readonly attempts: number;
  readonly businessId?: string | undefined;
  readonly userId: string | null;
  readonly ip: string;
  readonly createdAt: Date;
}

export type { SignInCodeChannel } from "./types";
