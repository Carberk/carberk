import type { BusinessSchemas } from "@auto-tm/contracts";
import type { BusinessSubject } from "./BusinessAuthorityPort";
export const BUSINESS_REPOSITORY = "IDENTITY_BUSINESS_REPOSITORY";
export interface NewBusinessInvitation { tokenHash: string; expiresAt: Date }
export interface BusinessRepository {
 workspace(subject: BusinessSubject, now: Date): Promise<BusinessSchemas.BusinessWorkspace | null>;
 admit(input: BusinessSubject & BusinessSchemas.AdmitBusinessInput & NewBusinessInvitation, now: Date): Promise<{ businessId: string; invitationId: string }>;
 invite(input: BusinessSubject & { businessId: string; recipientUserId: string } & NewBusinessInvitation, now: Date): Promise<{ businessId: string; invitationId: string }>;
 redeem(input: BusinessSubject & { tokenHash: string }, now: Date): Promise<{ businessId: string }>;
 revoke(input: BusinessSubject & { businessId: string; invitationId: string }, now: Date): Promise<void>;
 changeMember(input: BusinessSubject & BusinessSchemas.BusinessMembershipChangeInput & { businessId: string }, now: Date): Promise<void>;
 settings(input: BusinessSubject & BusinessSchemas.BusinessSettingsInput & { businessId: string }, now: Date): Promise<void>;
 recover(input: BusinessSubject & BusinessSchemas.RecoverBusinessInput & { businessId: string } & NewBusinessInvitation, now: Date): Promise<{ businessId: string; invitationId: string }>;
}
export const BUSINESS_INVITATION_TOKENS = "IDENTITY_BUSINESS_INVITATION_TOKENS";
export interface BusinessInvitationTokens { issue(): string; hash(token: string): string }
