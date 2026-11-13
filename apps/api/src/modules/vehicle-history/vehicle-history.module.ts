import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { IdentityModule } from "../identity/identity.module";
import { VehicleHistoryController } from "./presentation/VehicleHistoryController";

@Module({ imports: [ConfigModule, IdentityModule], controllers: [VehicleHistoryController] })
export class VehicleHistoryModule {}
