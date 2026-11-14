import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma.module";
import { SendServiceText } from "./application/SendServiceText";
import { ReadServiceMessages } from "./application/ReadServiceMessages";
import { SERVICE_MESSAGE_REPOSITORY } from "./domain/ServiceMessageRepository";
import { PrismaServiceMessageRepository } from "./infrastructure/PrismaServiceMessageRepository";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "./business-messaging.public";

@Module({
  imports: [PrismaModule],
  providers: [SendServiceText, ReadServiceMessages,
    { provide: SERVICE_MESSAGE_REPOSITORY, useClass: PrismaServiceMessageRepository },
    { provide: BUSINESS_MESSAGING_PORT, inject: [SendServiceText, ReadServiceMessages],
      useFactory: (send: SendServiceText, read: ReadServiceMessages): BusinessMessagingPort => ({
        sendText: (input) => send.execute(input), readMessages: (input) => read.execute(input),
      }) },
  ],
  exports: [BUSINESS_MESSAGING_PORT],
})
export class BusinessMessagingModule {}
