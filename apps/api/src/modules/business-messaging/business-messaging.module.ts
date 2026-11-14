import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma.module";
import { SendServiceText } from "./application/SendServiceText";
import { ReadServiceMessages } from "./application/ReadServiceMessages";
import { AcknowledgeServiceMessages } from "./application/AcknowledgeServiceMessages";
import { ReadServiceReceipts } from "./application/ReadServiceReceipts";
import { SERVICE_MESSAGE_REPOSITORY } from "./domain/ServiceMessageRepository";
import { PrismaServiceMessageRepository } from "./infrastructure/PrismaServiceMessageRepository";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "./business-messaging.public";

@Module({
  imports: [PrismaModule],
  providers: [SendServiceText, ReadServiceMessages, AcknowledgeServiceMessages, ReadServiceReceipts,
    { provide: SERVICE_MESSAGE_REPOSITORY, useClass: PrismaServiceMessageRepository },
    { provide: BUSINESS_MESSAGING_PORT, inject: [SendServiceText, ReadServiceMessages, AcknowledgeServiceMessages, ReadServiceReceipts],
      useFactory: (send: SendServiceText, read: ReadServiceMessages, ack: AcknowledgeServiceMessages, receipts: ReadServiceReceipts): BusinessMessagingPort => ({
        sendText: (input) => send.execute(input), readMessages: (input) => read.execute(input),
        acknowledge: (input) => ack.execute(input), readReceipts: (input) => receipts.execute(input),
      }) },
  ],
  exports: [BUSINESS_MESSAGING_PORT],
})
export class BusinessMessagingModule {}
