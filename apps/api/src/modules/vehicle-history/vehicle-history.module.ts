import { Module } from "@nestjs/common";
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
import { PrismaHistoryAssignmentRepository } from "./infrastructure/PrismaHistoryAssignmentRepository";
import { HistoryRequestProjection } from "./application/HistoryRequestProjection";
import { ClaimHistoryRequest } from "./application/ClaimHistoryRequest";
import { GetOperatorHistoryRequest } from "./application/GetOperatorHistoryRequest";

@Module({
  imports: [ConfigModule, IdentityModule, PrismaModule],
  controllers: [VehicleHistoryController, HistoryRequestsController, HistoryAssignmentController],
  providers: [CurrentHistoryOperator, ListOperatorHistoryRequests, HistoryRequestProjection, ClaimHistoryRequest, GetOperatorHistoryRequest,
    { provide: HISTORY_ASSIGNMENT_REPOSITORY, useClass: PrismaHistoryAssignmentRepository },
    CurrentHistoryRequester, CreateHistoryRequest, ListHistoryRequests, GetHistoryRequest,
    { provide: HISTORY_REQUEST_REPOSITORY, useClass: PrismaHistoryRequestRepository }],
})
export class VehicleHistoryModule {}
