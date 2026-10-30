import { BusinessChatFiles } from "./application/BusinessChatFiles";
import { MinioBusinessChatFileStore } from "./infrastructure/MinioBusinessChatFileStore";
import { BUSINESS_CHAT_FILE_STORE } from "./domain/ports/BusinessChatFileStore";
import { ConversationBinaryParser } from "./presentation/ConversationBinaryParser";
import { MeasurementModule } from "../measurement/measurement.module";
import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { ListingsModule } from "../listings/listings.module";
import { IdentityModule } from "../identity/identity.module";
import { RealtimeModule } from "../realtime/realtime.module";

import { ConversationsController } from "./presentation/conversations.controller";
import { ConversationGateway } from "./presentation/gateways/ConversationGateway";
import { OpenConversation } from "./application/OpenConversation";
import { ListMyConversations } from "./application/ListMyConversations";
import { CountMyUnreadMessages } from "./application/CountMyUnreadMessages";
import { GetConversation } from "./application/GetConversation";
import { ListMessages } from "./application/ListMessages";
import { SendTextMessage } from "./application/SendTextMessage";
import { SendMessage } from "./application/SendMessage";
import { SendRealtimeMessage } from "./application/SendRealtimeMessage";
import { SendPostRefMessage } from "./application/SendPostRefMessage";
import { ConversationMessageCommitter } from "./application/ConversationMessageCommitter";
import { ConversationSendPolicy } from "./application/ConversationSendPolicy";
import { SendConversationMessage } from "./application/SendConversationMessage";
import { PresignChatAttachmentUpload } from "./application/PresignChatAttachmentUpload";
import { UpdateWatermark } from "./application/UpdateWatermark";
import { MuteConversation } from "./application/MuteConversation";
import { DeleteMessage } from "./application/DeleteMessage";
import { ValidateConversationAccess } from "./application/ValidateConversationAccess";
import { ConversationAccessPolicy } from "./application/ConversationAccessPolicy";
import { PrismaConversationRepository } from "./infrastructure/PrismaConversationRepository";
import { EventEmitterMessageEventPublisher } from "./infrastructure/EventEmitterMessageEventPublisher";
import { SharpChatAttachmentCleaner } from "./infrastructure/SharpChatAttachmentCleaner";
import { CHAT_ATTACHMENT_CLEANER } from "./domain/ports/ChatAttachmentCleaner";
import { CONVERSATION_REPOSITORY } from "./domain/ports/ConversationRepository";
import { MESSAGE_EVENT_PUBLISHER } from "./domain/ports/MessageEventPublisher";
import { CONVERSATION_STATE_PORT } from "./domain/ports/ConversationStatePort";
import { MESSAGE_MODERATION_READ_PORT } from "./domain/ports/MessageModerationReadPort";
import { CONVERSATION_REPORT_CONTEXT_PORT } from "./domain/ports/ConversationReportContextPort";
import { BusinessEnquiryAccess } from "./application/BusinessEnquiryAccess";
import { PrismaBusinessEnquiryRepository } from "./infrastructure/PrismaBusinessEnquiryRepository";
import { BUSINESS_ENQUIRY_REPOSITORY } from "./domain/ports/BusinessEnquiryRepository";

@Module({
  imports: [MeasurementModule,EventEmitterModule, ListingsModule, IdentityModule, RealtimeModule],
  controllers: [ConversationsController],
  providers: [
    BusinessChatFiles, ConversationBinaryParser,
    { provide: BUSINESS_CHAT_FILE_STORE, useClass: MinioBusinessChatFileStore },
    PrismaConversationRepository,
    BusinessEnquiryAccess,
    PrismaBusinessEnquiryRepository,
    { provide: BUSINESS_ENQUIRY_REPOSITORY, useExisting: PrismaBusinessEnquiryRepository },
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: PrismaConversationRepository,
    },
    {
      provide: CONVERSATION_STATE_PORT,
      useExisting: CONVERSATION_REPOSITORY,
    },
    { provide: MESSAGE_MODERATION_READ_PORT, useExisting: CONVERSATION_REPOSITORY },
    {
      provide: CONVERSATION_REPORT_CONTEXT_PORT,
      useExisting: CONVERSATION_REPOSITORY,
    },
    {
      provide: MESSAGE_EVENT_PUBLISHER,
      useClass: EventEmitterMessageEventPublisher,
    },
    {
      provide: CHAT_ATTACHMENT_CLEANER,
      useClass: SharpChatAttachmentCleaner,
    },
    OpenConversation,
    ListMyConversations,
    CountMyUnreadMessages,
    GetConversation,
    ListMessages,
    ConversationMessageCommitter,
    ConversationSendPolicy,
    SendConversationMessage,
    SendTextMessage,
    SendMessage,
    SendRealtimeMessage,
    SendPostRefMessage,
    PresignChatAttachmentUpload,
    UpdateWatermark,
    MuteConversation,
    DeleteMessage,
    ConversationAccessPolicy,
    ValidateConversationAccess,
    ConversationGateway,
  ],
  exports: [CONVERSATION_STATE_PORT, CONVERSATION_REPORT_CONTEXT_PORT, MESSAGE_MODERATION_READ_PORT],
})
export class ConversationsModule {}
