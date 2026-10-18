import { MeasurementModule } from "../measurement/measurement.module";
import { AdmitBusiness } from "./application/AdmitBusiness";
import { InviteBusinessMember } from "./application/InviteBusinessMember";
import { RedeemBusinessInvitation } from "./application/RedeemBusinessInvitation";
import { RevokeBusinessInvitation } from "./application/RevokeBusinessInvitation";
import { ChangeBusinessMembership } from "./application/ChangeBusinessMembership";
import { UpdateBusinessSettings } from "./application/UpdateBusinessSettings";
import { RecoverBusinessOwner } from "./application/RecoverBusinessOwner";
import { BusinessController } from "./presentation/BusinessController";
import { PrismaBusinessRepository } from "./infrastructure/PrismaBusinessRepository";
import { NodeBusinessInvitationTokens } from "./infrastructure/NodeBusinessInvitationTokens";
import { BUSINESS_REPOSITORY, BUSINESS_INVITATION_TOKENS } from "./domain/ports/BusinessRepository";
import { CheckBusinessAuthority } from "./application/CheckBusinessAuthority";
import { PrismaBusinessAuthority } from "./infrastructure/PrismaBusinessAuthority";
import { BUSINESS_AUTHORITY_PORT } from "./domain/ports/BusinessAuthorityPort";
import { BUSINESS_AUTHORITY_REPOSITORY } from "./domain/ports/BusinessAuthorityRepository";
import { CheckStaffAuthority } from "./application/CheckStaffAuthority";
import { ChangeStaffGrant } from "./application/ChangeStaffGrant";
import { StaffController } from "./presentation/StaffController";
import { PrismaStaffAuthority } from "./infrastructure/PrismaStaffAuthority";
import { STAFF_AUTHORITY_PORT } from "./domain/ports/StaffAuthorityPort";
import { STAFF_AUTHORITY_REPOSITORY } from "./domain/ports/StaffAuthorityRepository";
import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { AuthSchemas } from "@auto-tm/contracts";

import { PrismaModule } from "../../common/prisma.module";
import { IdentityController } from "./presentation/identity.controller";
import { AuthController } from "./presentation/AuthController";
import { MeController } from "./presentation/MeController";
import { AdminAuthController } from "./presentation/AdminAuthController";
import { AccountDeletionController } from "./presentation/AccountDeletionController";
import { RequestOtp } from "./application/RequestOtp";
import { VerifyOtp } from "./application/VerifyOtp";
import { VerifySignInCode } from "./application/VerifySignInCode";
import { RefreshSession } from "./application/RefreshSession";
import { Logout } from "./application/Logout";
import { LogoutAll } from "./application/LogoutAll";
import { GetMe } from "./application/GetMe";
import { UpdateDisplayName } from "./application/UpdateDisplayName";
import { DeleteMe } from "./application/DeleteMe";
import { RecoverAccount } from "./application/RecoverAccount";
import { GetAdminTotpStatus } from "./application/GetAdminTotpStatus";
import { EnrollAdminTotp } from "./application/EnrollAdminTotp";
import { VerifyAdminTotp } from "./application/VerifyAdminTotp";
import { BlockUser } from "./application/BlockUser";
import { UnblockUser } from "./application/UnblockUser";
import { IsBlocked } from "./application/IsBlocked";
import { RequestSignInMethodChange } from "./application/RequestSignInMethodChange";
import { ConfirmSignInMethodChange } from "./application/ConfirmSignInMethodChange";
import { RequestAccountDeletion } from "./application/RequestAccountDeletion";
import { ConfirmAccountDeletion } from "./application/ConfirmAccountDeletion";
import { IssueContactPhoneCode } from "./application/IssueContactPhoneCode";
import { ConfirmContactPhoneCode } from "./application/ConfirmContactPhoneCode";
import type { ContactPhoneCodePort } from "./domain/ports/ContactPhoneCodePort";
import { PrismaOtpRequestRepository } from "./infrastructure/PrismaOtpRequestRepository";
import { PrismaUserRepository } from "./infrastructure/PrismaUserRepository";
import { PrismaSessionRepository } from "./infrastructure/PrismaSessionRepository";
import { PrismaTotpEnrollmentRepository } from "./infrastructure/PrismaTotpEnrollmentRepository";
import { HttpOtpSenderAdapter } from "./infrastructure/HttpOtpSenderAdapter";
import { BcryptHasherAdapter } from "./infrastructure/BcryptHasherAdapter";
import { SystemClockAdapter } from "./infrastructure/SystemClockAdapter";
import { PrismaIdentityCheckAdapter } from "./infrastructure/PrismaIdentityCheckAdapter";
import { PrismaIdentityReadAdapter } from "./infrastructure/PrismaIdentityReadAdapter";
import { PrismaIdentityAdminRepository } from "./infrastructure/PrismaIdentityAdminRepository";
import { PrismaBlockedUserRepository } from "./infrastructure/PrismaBlockedUserRepository";
import { AesGcmTotpSecretCipher } from "./infrastructure/AesGcmTotpSecretCipher";
import { OtplibTotpVerifier } from "./infrastructure/OtplibTotpVerifier";
import { InMemoryTotpThrottleAdapter } from "./infrastructure/InMemoryTotpThrottleAdapter";
import { PinoSecurityLoggerAdapter } from "./infrastructure/PinoSecurityLoggerAdapter";
import { PrismaAccountDeletionUnitOfWork } from "./infrastructure/PrismaAccountDeletionUnitOfWork";
import { PrismaAccountRestoreUnitOfWork } from "./infrastructure/PrismaAccountRestoreUnitOfWork";
import { NodeConstantTimeComparator } from "./infrastructure/NodeConstantTimeComparator";
import { parseReviewerOtpBypassConfig } from "./infrastructure/ReviewerOtpBypassConfigFactory";
import { EventEmitterIdentityEventBus } from "./infrastructure/EventEmitterIdentityEventBus";
import { BullMqEmailCodeSenderAdapter } from "./infrastructure/BullMqEmailCodeSenderAdapter";
import { IDENTITY_TOKENS } from "./identity.tokens";
import { IDENTITY_ADMIN_PORT } from "./domain/ports/IdentityAdminPort";
import { IDENTITY_READ_PORT } from "./domain/ports/IdentityReadPort";
import { SELLER_PROFILE_READ_PORT } from "./domain/ports/SellerProfileReadPort";
import { PrismaSellerProfileReadAdapter } from "./infrastructure/PrismaSellerProfileReadAdapter";
import { ACCOUNT_DELETION_UNIT_OF_WORK } from "./domain/ports/AccountDeletionUnitOfWork";
import { ACCOUNT_RESTORE_UNIT_OF_WORK } from "./domain/ports/AccountRestoreUnitOfWork";
import { BLOCKED_USER_REPOSITORY } from "./domain/ports/BlockedUserRepository";
import { CONSTANT_TIME_COMPARATOR_PORT } from "./domain/ports/ConstantTimeComparatorPort";
import { RANDOM_SOURCE_PORT } from "./domain/ports/RandomSourcePort";
import { MathRandomSource } from "./infrastructure/MathRandomSource";
import { REVIEWER_OTP_BYPASS_CONFIG } from "./domain/ports/ReviewerOtpBypassConfig";
import { RedisReservedPhoneAttemptLedger } from "./infrastructure/RedisReservedPhoneAttemptLedger";
import { RESERVED_PHONE_ATTEMPT_LEDGER } from "./domain/ports/ReservedPhoneAttemptLedger";
import { EMAIL_CODE_SENDER_PORT } from "./domain/ports/EmailCodeSenderPort";

@Module({
  imports: [
    MeasurementModule,
    EventEmitterModule,
    PrismaModule,
    BullModule.registerQueue({ name: AuthSchemas.EMAIL_CODE_QUEUE }),
  ],
  controllers: [BusinessController, StaffController,
    IdentityController,
    AuthController,
    MeController,
    AdminAuthController,
    AccountDeletionController,
  ],
  providers: [
    AdmitBusiness, InviteBusinessMember, RedeemBusinessInvitation, RevokeBusinessInvitation, ChangeBusinessMembership, UpdateBusinessSettings, RecoverBusinessOwner,
    { provide: BUSINESS_REPOSITORY, useClass: PrismaBusinessRepository },
    { provide: BUSINESS_INVITATION_TOKENS, useClass: NodeBusinessInvitationTokens },
    CheckBusinessAuthority,
    { provide: BUSINESS_AUTHORITY_PORT, useExisting: CheckBusinessAuthority },
    { provide: BUSINESS_AUTHORITY_REPOSITORY, useClass: PrismaBusinessAuthority },
    CheckStaffAuthority, ChangeStaffGrant,
    { provide: STAFF_AUTHORITY_PORT, useExisting: CheckStaffAuthority },
    { provide: STAFF_AUTHORITY_REPOSITORY, useClass: PrismaStaffAuthority },
    PrismaOtpRequestRepository,
    PrismaUserRepository,
    PrismaSessionRepository,
    PrismaTotpEnrollmentRepository,
    HttpOtpSenderAdapter,
    BcryptHasherAdapter,
    SystemClockAdapter,
    PrismaIdentityCheckAdapter,
    PrismaIdentityReadAdapter,
    PrismaSellerProfileReadAdapter,
    PrismaIdentityAdminRepository,
    PrismaBlockedUserRepository,
    AesGcmTotpSecretCipher,
    OtplibTotpVerifier,
    InMemoryTotpThrottleAdapter,
    PinoSecurityLoggerAdapter,
    NodeConstantTimeComparator,
    EventEmitterIdentityEventBus,
    RedisReservedPhoneAttemptLedger,
    { provide: RESERVED_PHONE_ATTEMPT_LEDGER, useExisting: RedisReservedPhoneAttemptLedger },
    BullMqEmailCodeSenderAdapter,
    {
      provide: EMAIL_CODE_SENDER_PORT,
      useExisting: BullMqEmailCodeSenderAdapter,
    },
    {
      provide: ACCOUNT_DELETION_UNIT_OF_WORK,
      useClass: PrismaAccountDeletionUnitOfWork,
    },
    {
      provide: ACCOUNT_RESTORE_UNIT_OF_WORK,
      useClass: PrismaAccountRestoreUnitOfWork,
    },
    {
      provide: IDENTITY_TOKENS.OtpTestMode,
      useFactory: () => process.env["OTP_TEST_MODE"] === "true",
    },
    {
      provide: IDENTITY_TOKENS.IdentityCheckPort,
      useClass: PrismaIdentityCheckAdapter,
    },
    {
      provide: IDENTITY_READ_PORT,
      useClass: PrismaIdentityReadAdapter,
    },
    {
      provide: SELLER_PROFILE_READ_PORT,
      useExisting: PrismaSellerProfileReadAdapter,
    },
    {
      provide: IDENTITY_ADMIN_PORT,
      useClass: PrismaIdentityAdminRepository,
    },
    {
      provide: BLOCKED_USER_REPOSITORY,
      useClass: PrismaBlockedUserRepository,
    },
    {
      provide: CONSTANT_TIME_COMPARATOR_PORT,
      useClass: NodeConstantTimeComparator,
    },
    {
      provide: RANDOM_SOURCE_PORT,
      useClass: MathRandomSource,
    },
    {
      provide: REVIEWER_OTP_BYPASS_CONFIG,
      useFactory: () =>
        parseReviewerOtpBypassConfig({
          REVIEW_DEMO_ACCOUNT_ENABLED: process.env["REVIEW_DEMO_ACCOUNT_ENABLED"] === "true",
          REVIEW_DEMO_ACCOUNTS_JSON: process.env["REVIEW_DEMO_ACCOUNTS_JSON"] ?? "[]",
          TESTER_ACCOUNTS_JSON: process.env["TESTER_ACCOUNTS_JSON"] ?? "[]",
        }),
    },
    {
      provide: IDENTITY_TOKENS.OtpRequestRepository,
      useExisting: PrismaOtpRequestRepository,
    },
    {
      provide: IDENTITY_TOKENS.ClockPort,
      useExisting: SystemClockAdapter,
    },
    {
      provide: IDENTITY_TOKENS.SessionRepository,
      useExisting: PrismaSessionRepository,
    },
    {
      provide: IDENTITY_TOKENS.TotpSecretCipherPort,
      useClass: AesGcmTotpSecretCipher,
    },
    {
      provide: IDENTITY_TOKENS.TotpVerifierPort,
      useClass: OtplibTotpVerifier,
    },
    {
      provide: IDENTITY_TOKENS.TotpEnrollmentRepository,
      useExisting: PrismaTotpEnrollmentRepository,
    },
    {
      provide: IDENTITY_TOKENS.TotpThrottlePort,
      useClass: InMemoryTotpThrottleAdapter,
    },
    {
      provide: IDENTITY_TOKENS.SecurityLoggerPort,
      useClass: PinoSecurityLoggerAdapter,
    },
    {
      provide: "TOTP_SECRET_ENCRYPTION_KEY",
      useFactory: () => process.env["TOTP_SECRET_ENCRYPTION_KEY"] ?? "",
    },
    {
      provide: "TOTP_STEP_SECONDS",
      useFactory: () => 30,
    },
    {
      provide: "EventBus",
      useClass: EventEmitterIdentityEventBus,
    },
    RequestOtp,
    VerifyOtp,
    VerifySignInCode,
    RefreshSession,
    Logout,
    LogoutAll,
    GetMe,
    UpdateDisplayName,
    DeleteMe,
    RecoverAccount,
    GetAdminTotpStatus,
    EnrollAdminTotp,
    VerifyAdminTotp,
    BlockUser,
    UnblockUser,
    IsBlocked,
    RequestSignInMethodChange,
    ConfirmSignInMethodChange,
    RequestAccountDeletion,
    ConfirmAccountDeletion,
    IssueContactPhoneCode,
    ConfirmContactPhoneCode,
    {
      // The purpose is fixed by the two use-cases; callers cannot choose it.
      provide: IDENTITY_TOKENS.ContactPhoneCodePort,
      useFactory: (
        issue: IssueContactPhoneCode,
        confirm: ConfirmContactPhoneCode,
      ): ContactPhoneCodePort => ({
        requestCode: (input) => issue.execute(input),
        confirmCode: (input) => confirm.execute(input),
      }),
      inject: [IssueContactPhoneCode, ConfirmContactPhoneCode],
    },
  ],
  exports: [
    BUSINESS_AUTHORITY_PORT,
    STAFF_AUTHORITY_PORT,
    SELLER_PROFILE_READ_PORT,
    IDENTITY_TOKENS.IdentityCheckPort,
    IDENTITY_TOKENS.ContactPhoneCodePort,
    IDENTITY_READ_PORT,
    IDENTITY_TOKENS.SessionRepository,
    IDENTITY_TOKENS.ClockPort,
    IDENTITY_ADMIN_PORT,
    // For ProfilePhotoModule, identity's own composition above Listings. Other
    // contexts cannot name these classes: lint keeps them to identity.public.
    GetMe,
    PrismaUserRepository,
  ],
})
export class IdentityModule {}
