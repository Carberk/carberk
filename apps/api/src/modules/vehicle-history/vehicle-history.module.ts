import { Inject, Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { HttpAdapterHost } from "@nestjs/core";
import type { FastifyInstance } from "fastify";
import { ConfigModule } from "@nestjs/config";
import { IdentityModule } from "../identity/identity.module";
import { VehicleHistoryController } from "./presentation/VehicleHistoryController";
import { PrismaModule } from "../../common/prisma.module";
import { HistoryRequestsController } from "./presentation/HistoryRequestsController";
import { CurrentHistoryRequester } from "./application/CurrentHistoryRequester";
import { CreateHistoryRequest } from "./application/CreateHistoryRequest";
import { ListHistoryRequests } from "./application/ListHistoryRequests";
import { GetHistoryRequest } from "./application/GetHistoryRequest";
import { HISTORY_REQUEST_REPOSITORY } from "./domain/HistoryRequestRepository";
import { PrismaHistoryRequestRepository } from "./infrastructure/PrismaHistoryRequestRepository";

import { HistoryAssignmentController } from "./presentation/HistoryAssignmentController";
import { CurrentHistoryOperator } from "./application/CurrentHistoryOperator";
import { ListOperatorHistoryRequests } from "./application/ListOperatorHistoryRequests";
import { HISTORY_ASSIGNMENT_REPOSITORY } from "./domain/HistoryAssignmentRepository";
import { PrismaHistoryAssignmentRepository, HistoryMessageLocks } from "./infrastructure/PrismaHistoryAssignmentRepository";
import { BusinessMessagingModule } from "../business-messaging/business-messaging.module";
import { HistoryReceiptsController } from "./presentation/HistoryReceiptsController";
import { AcknowledgeHistoryMessages } from "./application/AcknowledgeHistoryMessages";
import { ReadHistoryReceipts } from "./application/ReadHistoryReceipts";
import { HistoryMessagesController } from "./presentation/HistoryMessagesController";
import { HistoryMessageAccess } from "./application/HistoryMessageAccess";
import { HistoryMessageProjection } from "./application/HistoryMessageProjection";
import { SendHistoryText } from "./application/SendHistoryText";
import { ReadHistoryMessages } from "./application/ReadHistoryMessages";
import { historyRequestFailure } from "./presentation/HistoryRequestExceptionFilter";
import { HistoryRequestError } from "./domain/HistoryRequestError";
import { HistoryQueueProjection } from "./application/HistoryQueueProjection";
import { HistoryRequestProjection } from "./application/HistoryRequestProjection";
import { ClaimHistoryRequest } from "./application/ClaimHistoryRequest";
import { HandoverHistoryRequest } from "./application/HandoverHistoryRequest";
import { GetOperatorHistoryRequest } from "./application/GetOperatorHistoryRequest";
import { HISTORY_CLOCK, HistoryWaiting, type HistoryClock } from "./domain/HistoryWaiting";
import { ChangeHistoryWaiting } from "./application/ChangeHistoryWaiting";
import { HISTORY_WAITING_LIFECYCLE } from "./vehicle-history.public";
import { SyncHistoryWaiting } from "./application/SyncHistoryWaiting";
import { ReadHistoryReminder } from "./application/ReadHistoryReminder";
import { StopHistoryReminders } from "./application/StopHistoryReminders";
import { SendHistoryReminder } from "./application/SendHistoryReminder";
import { HistoryReminderProjection } from "./application/HistoryReminderProjection";
import { HistoryRemindersController } from "./presentation/HistoryRemindersController";
import { HistoryNotesController } from "./presentation/HistoryNotesController";
import { AddHistoryPrivateNote } from "./application/AddHistoryPrivateNote";
import { ReadHistoryPrivateNotes } from "./application/ReadHistoryPrivateNotes";
import { HistoryPrivateNoteProjection } from "./application/HistoryPrivateNoteProjection";
import { HISTORY_PRIVATE_NOTE_REPOSITORY } from "./domain/HistoryPrivateNoteRepository";
import { PrismaHistoryPrivateNoteRepository } from "./infrastructure/PrismaHistoryPrivateNoteRepository";

@Module({
  imports: [ConfigModule, IdentityModule, PrismaModule, BusinessMessagingModule],
  exports: [HISTORY_WAITING_LIFECYCLE, HISTORY_CLOCK],
  controllers: [VehicleHistoryController, HistoryRequestsController, HistoryAssignmentController, HistoryMessagesController, HistoryReceiptsController, HistoryRemindersController, HistoryNotesController],
  providers: [AcknowledgeHistoryMessages, ReadHistoryReceipts, HistoryMessageLocks, HistoryMessageAccess, HistoryMessageProjection, SendHistoryText, ReadHistoryMessages,
    AddHistoryPrivateNote, ReadHistoryPrivateNotes, HistoryPrivateNoteProjection,
    { provide: HISTORY_PRIVATE_NOTE_REPOSITORY, useClass: PrismaHistoryPrivateNoteRepository },
    SyncHistoryWaiting, ChangeHistoryWaiting, ReadHistoryReminder, StopHistoryReminders, SendHistoryReminder, HistoryReminderProjection,
    { provide: HISTORY_WAITING_LIFECYCLE, useExisting: ChangeHistoryWaiting },
    { provide: HISTORY_CLOCK, useFactory: (): HistoryClock => ({ now: () => new Date() }) },
    { provide: HistoryWaiting, inject: [HISTORY_CLOCK], useFactory: (clock: HistoryClock) => new HistoryWaiting(clock) },
    CurrentHistoryOperator, ListOperatorHistoryRequests, HistoryQueueProjection, HistoryRequestProjection, ClaimHistoryRequest, HandoverHistoryRequest, GetOperatorHistoryRequest,
    { provide: HISTORY_ASSIGNMENT_REPOSITORY, useClass: PrismaHistoryAssignmentRepository },
    CurrentHistoryRequester, CreateHistoryRequest, ListHistoryRequests, GetHistoryRequest,
    { provide: HISTORY_REQUEST_REPOSITORY, useClass: PrismaHistoryRequestRepository }],
})
export class VehicleHistoryModule implements NestModule {
  constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}
  configure(consumer: MiddlewareConsumer) {
    const fastify: FastifyInstance = this.adapter.httpAdapter.getInstance();
    fastify.addHook("onRoute", (route) => {
      const message = /^\/api\/v1\/vehicle-history\/(operator\/)?requests\/:id\/(messages|receipts)$/.test(route.url);
      const reminder = /^\/api\/v1\/vehicle-history\/(operator\/)?requests\/:id\/reminder(?:\/stop)?$/.test(route.url);
      const note = /^\/api\/v1\/vehicle-history\/operator\/requests\/:id\/notes$/.test(route.url);
      if (!message && !reminder && !note && !/^\/api\/v1\/vehicle-history\/operator\/requests(?:\/:id(?:\/claim)?)?$/.test(route.url)) return;
      // Fastify parser failures happen before Nest's controller exception filter.
      route.errorHandler = (error, request, reply) => {
        const response = historyRequestFailure(new HistoryRequestError(error.statusCode && error.statusCode < 500
          ? reminder ? "HISTORY_REMINDER_INVALID" : note ? "HISTORY_NOTE_INVALID" : message ? "HISTORY_MESSAGE_INVALID" : "HISTORY_REQUEST_INVALID"
          : reminder ? "HISTORY_REMINDER_UNAVAILABLE" : note ? "HISTORY_NOTE_UNAVAILABLE" : "HISTORY_MESSAGE_UNAVAILABLE"), request.headers["accept-language"]);
        void reply.header("Cache-Control", "private, no-store").status(response.statusCode).send(response);
      };
    });
    // Runs before JSON parsing, so malformed payloads are private as well.
    consumer.apply((_request: unknown, response: ServerResponse, next: () => void) => {
      response.setHeader("Cache-Control", "private, no-store"); next();
    }).forRoutes(HistoryMessagesController, HistoryReceiptsController, HistoryAssignmentController, HistoryRemindersController, HistoryNotesController);
  }
}
