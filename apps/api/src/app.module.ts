import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { BullModule } from "@nestjs/bullmq";
import { LoggerModule } from "nestjs-pino";

import { AccountDeletionPendingGuard } from "./common/account-deletion-pending.guard";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { GlobalErrorFilter } from "./common/error.filter";
import { HealthController } from "./common/health.controller";
import { ReadinessService } from "./common/readiness.service";
import { parseEnv } from "./env.schema";
import { IdentityModule } from "./modules/identity/identity.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { ListingsModule } from "./modules/listings/listings.module";
import { ConversationsModule } from "./modules/conversations/conversations.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { AdminModule } from "./modules/admin/admin.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: parseEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env["LOG_LEVEL"] ?? "info",
      },
    }),
    EventEmitterModule.forRoot(),
    JwtModule.register({
      global: true,
      secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
       
      signOptions: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JWT lib type
        expiresIn: (process.env["JWT_ACCESS_TTL"] ?? "15m") as any,
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    BullModule.forRoot({
      connection: {
        url: process.env["REDIS_URL"] ?? "redis://localhost:6379",
      },
    }),
    IdentityModule,
    CatalogModule,
    ListingsModule,
    ConversationsModule,
    NotificationsModule,
    ReportsModule,
    AdminModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
  providers: [
    ReadinessService,
    { provide: APP_FILTER, useClass: GlobalErrorFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccountDeletionPendingGuard },
  ],
})
export class AppModule {}
