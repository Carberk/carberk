import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DIRECT_MESSAGE_DELIVERY_ELIGIBILITY } from "./domain/DirectMessageDeliveryEligibility";
import { PrismaDirectMessageDeliveryEligibility } from "./infrastructure/PrismaDirectMessageDeliveryEligibility";
import { ProcessDirectMessagePush } from "./application/ProcessDirectMessagePush";
import { FcmApnsPushTransport } from "./adapters/FcmApnsPushTransport";
import { TestPushTransport } from "./adapters/TestPushTransport";
import { UnconfiguredPushTransport } from "./adapters/UnconfiguredPushTransport";
import { ParseApnsSender, createApnsSendFn } from "./adapters/apns/ApnsSender";
import { UnprovisionedApnsSender } from "./adapters/apns/UnprovisionedApnsSender";
import { FirebaseFcmSender, createFirebaseSendFn } from "./adapters/fcm/FcmSender";
import { readApnsCredentials, readFcmCredentials } from "./adapters/credentials";
import type { PushPort } from "./domain/PushPort";
import { PUSH_PORT } from "./domain/PushPort";
import { PUSH_DEVICE_STORE } from "./domain/PushDeviceStore";
import { NOTIFICATION_HISTORY_STORE } from "./domain/NotificationHistoryStore";
import { PUSH_TRANSPORT } from "./domain/types";
import { PrismaPushDeviceStore } from "./infrastructure/PrismaPushDeviceStore";
import { PrismaNotificationHistoryStore } from "./infrastructure/PrismaNotificationHistoryStore";

/**
 * Resolves the configured transport. Provider SDKs and credentials are only
 * touched for the delivering transports, so `test` boots without any push
 * secret present. `fcm` (ADR-0047) is the Android-first launch configuration:
 * the same routing and wire payload as `fcm-apns`, with no Apple credentials
 * read and no APNS SDK loaded. The APNS host comes from `APNS_PRODUCTION`,
 * never from `APP_ENV`.
 */
export async function createPushPort(config: ConfigService): Promise<PushPort> {
  const transport = config.get<string>("PUSH_TRANSPORT");

  if (transport === PUSH_TRANSPORT.Test) {
    return new TestPushTransport();
  }

  if (transport !== PUSH_TRANSPORT.Fcm && transport !== PUSH_TRANSPORT.FcmApns) {
    return new UnconfiguredPushTransport(transport ?? "unset");
  }

  const read = (name: string) => config.get<string>(name);
  const fcm = new FirebaseFcmSender(
    await createFirebaseSendFn(readFcmCredentials(read)),
  );

  if (transport === PUSH_TRANSPORT.Fcm) {
    return new FcmApnsPushTransport(fcm, new UnprovisionedApnsSender());
  }

  return new FcmApnsPushTransport(
    fcm,
    new ParseApnsSender(await createApnsSendFn(readApnsCredentials(read))),
  );
}

@Module({
  providers: [
    ProcessDirectMessagePush,
    { provide: DIRECT_MESSAGE_DELIVERY_ELIGIBILITY, useClass: PrismaDirectMessageDeliveryEligibility },
    PrismaPushDeviceStore,
    {
      provide: PUSH_DEVICE_STORE,
      useClass: PrismaPushDeviceStore,
    },
    PrismaNotificationHistoryStore,
    {
      provide: NOTIFICATION_HISTORY_STORE,
      useClass: PrismaNotificationHistoryStore,
    },
    {
      provide: PUSH_PORT,
      useFactory: createPushPort,
      inject: [ConfigService],
    },
  ],
  exports: [ProcessDirectMessagePush],
})
export class PushModule {}
