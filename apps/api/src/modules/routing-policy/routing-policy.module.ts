import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { RoutingPolicyController } from "./routing-policy.controller";

@Module({ imports: [ConfigModule], controllers: [RoutingPolicyController] })
export class RoutingPolicyModule {}
