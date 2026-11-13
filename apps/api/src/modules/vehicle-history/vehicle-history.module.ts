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

@Module({
  imports: [ConfigModule, IdentityModule, PrismaModule],
  controllers: [VehicleHistoryController, HistoryRequestsController],
  providers: [CurrentHistoryRequester, CreateHistoryRequest, ListHistoryRequests, GetHistoryRequest,
    { provide: HISTORY_REQUEST_REPOSITORY, useClass: PrismaHistoryRequestRepository }],
})
export class VehicleHistoryModule {}
