import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../../common/prisma.module";
import { IdentityModule } from "../identity/identity.module";
import { SERVICE_MESSAGING_PORT, SERVICE_PRIVATE_STORE, SERVICE_RUNTIME } from "./domain/ports/ServiceMessagingPort";
import { PrismaServiceMessaging } from "./infrastructure/PrismaServiceMessaging";
import { MinioServicePrivateStore } from "./infrastructure/MinioServicePrivateStore";
import { ServiceMessagingController } from "./presentation/ServiceMessagingController";
import { serviceRuntime } from "./infrastructure/serviceRuntime";
import { ServiceBinaryParser } from "./presentation/ServiceBinaryParser";
@Module({
 imports: [ConfigModule, PrismaModule, IdentityModule],
 controllers: [ServiceMessagingController],
 providers: [ServiceBinaryParser, { provide: SERVICE_MESSAGING_PORT, useClass: PrismaServiceMessaging }, { provide: SERVICE_PRIVATE_STORE, useClass: MinioServicePrivateStore }, { provide: SERVICE_RUNTIME, inject: [ConfigService], useFactory: serviceRuntime }],
 exports: [SERVICE_MESSAGING_PORT],
})
export class ServiceMessagingModule {}
