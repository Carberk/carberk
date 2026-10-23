import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@auto-tm/db";

import { PrismaModule } from "../../common/prisma.module";
import type { Env } from "../../env.schema";
import { IdentityModule } from "../identity/identity.module";
import { STAFF_AUTHORITY_PORT,type StaffAuthorityPort } from "../identity/identity.public";

import { PrismaImprovementRead } from "./infrastructure/PrismaImprovementRead";
import { PrismaMarketKnowledge } from "./infrastructure/PrismaMarketKnowledge";
import { ImprovementController } from "./presentation/ImprovementController";

@Module({imports:[PrismaModule,IdentityModule],controllers:[ImprovementController],providers:[
 {provide:PrismaImprovementRead,inject:[PrismaService,STAFF_AUTHORITY_PORT,ConfigService],useFactory:(prisma:PrismaService,authority:StaffAuthorityPort,config:ConfigService<Env,true>)=>new PrismaImprovementRead(prisma,authority,{epoch:config.get("MEASUREMENT_COLLECTOR_EPOCH",{infer:true})??"",environment:config.get("APP_ENV",{infer:true})==="production"?"production":config.get("APP_ENV",{infer:true})==="staging"?"staging":"test",population:"synthetic"})},
 {provide:PrismaMarketKnowledge,inject:[PrismaService,STAFF_AUTHORITY_PORT,ConfigService],useFactory:(prisma:PrismaService,authority:StaffAuthorityPort,config:ConfigService<Env,true>)=>new PrismaMarketKnowledge(prisma,authority,config.get("MEASUREMENT_COLLECTOR_EPOCH",{infer:true})??"")},
]})
export class ImprovementModule {}
