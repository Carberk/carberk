import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma.module";
import { SendServiceText } from "./application/SendServiceText";
import { FindServiceTextOperation } from "./application/FindServiceTextOperation";
import { ReadServiceMessages } from "./application/ReadServiceMessages";
import { AcknowledgeServiceMessages } from "./application/AcknowledgeServiceMessages";
import { ReadServiceReceipts } from "./application/ReadServiceReceipts";
import { SERVICE_MESSAGE_REPOSITORY } from "./domain/ServiceMessageRepository";
import { PrismaServiceMessageRepository } from "./infrastructure/PrismaServiceMessageRepository";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "./business-messaging.public";

@Module({
  imports: [PrismaModule],
  providers: [SendServiceText, FindServiceTextOperation, ReadServiceMessages, AcknowledgeServiceMessages, ReadServiceReceipts,
    { provide: SERVICE_MESSAGE_REPOSITORY, useClass: PrismaServiceMessageRepository },
    { provide: BUSINESS_MESSAGING_PORT, inject: [SendServiceText, FindServiceTextOperation, ReadServiceMessages, AcknowledgeServiceMessages, ReadServiceReceipts],
      useFactory: (send: SendServiceText, find: FindServiceTextOperation, read: ReadServiceMessages, ack: AcknowledgeServiceMessages, receipts: ReadServiceReceipts): BusinessMessagingPort => ({
        sendOnceText: (input, confirmCommit) => send.executeOnce(input, confirmCommit), findTextOperation: (input) => find.execute(input),
        sendText: (input) => send.execute(input), readMessages: (input) => read.execute(input),
        acknowledge: (input) => ack.execute(input), readReceipts: (input) => receipts.execute(input),
      }) },
  ],
  exports: [BUSINESS_MESSAGING_PORT],
})
export class BusinessMessagingModule {}
