import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService, withCampaignEmailDelivery } from "@auto-tm/db";
import { Redis } from "ioredis";

import { MockEmailSender } from "./adapters/MockEmailSender";
import { ResendEmailSender, createResendSendFn } from "./adapters/resend/ResendEmailSender";
import { SendSignInCodeEmail } from "./application/SendSignInCodeEmail";
import { DAILY_SEND_CAP } from "./domain/DailySendCap";
import type { EmailSenderPort } from "./domain/EmailSenderPort";
import { EMAIL_SENDER_PORT } from "./domain/EmailSenderPort";
import { DEFAULT_EMAIL_DAILY_CAP, EMAIL_DRIVER } from "./domain/types";
import { RedisDailySendCap } from "./infrastructure/RedisDailySendCap";

const EMAIL_CAP_REDIS = Symbol("EmailCapRedis");

/**
 * Resolves the configured driver. The Resend SDK is only loaded for
 * `EMAIL_DRIVER=resend`, so the default `mock` boot needs no API key.
 * `env.schema.ts` has already required `RESEND_API_KEY` and `EMAIL_FROM`.
 */
export async function createEmailSender(config: ConfigService, db: PrismaService): Promise<EmailSenderPort> {
  const mock = config.get<string>("EMAIL_DRIVER") !== EMAIL_DRIVER.Resend;
  const sender = mock ? new MockEmailSender() : new ResendEmailSender(
    await createResendSendFn(config.getOrThrow<string>("RESEND_API_KEY")),
    config.getOrThrow<string>("EMAIL_FROM"),
  );
  return {
    send: (email, options) => withCampaignEmailDelivery(db, options.idempotencyKey, email.to, async campaign => {
      if (!campaign) return sender.send(email, options);
      if (!mock || config.get<string>("APP_ENV") !== "staging") throw new Error("Campaign requires staging mock delivery");
      const { namespace, transaction } = campaign;
      const rows = await transaction.$queryRawUnsafe<{ request_id: string }[]>(`
        INSERT INTO "${namespace}".campaign_delivery_sink(request_id,email,message)
        VALUES($1,$2,$3::jsonb) ON CONFLICT(request_id) DO UPDATE SET request_id=excluded.request_id
          WHERE campaign_delivery_sink.email=excluded.email AND campaign_delivery_sink.message=excluded.message
        RETURNING request_id`, options.idempotencyKey, email.to, JSON.stringify(email));
      if (rows.length !== 1) throw new Error("Campaign sink collision");
      return { ok: true };
    }),
  };
}

@Module({
  providers: [
    SendSignInCodeEmail,
    {
      provide: EMAIL_SENDER_PORT,
      useFactory: createEmailSender,
      inject: [ConfigService, PrismaService],
    },
    {
      provide: EMAIL_CAP_REDIS,
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<string>("REDIS_URL"), { lazyConnect: true }),
      inject: [ConfigService],
    },
    {
      provide: DAILY_SEND_CAP,
      useFactory: (redis: Redis, config: ConfigService) =>
        new RedisDailySendCap(
          redis,
          config.get<number>("EMAIL_DAILY_CAP") ?? DEFAULT_EMAIL_DAILY_CAP,
        ),
      inject: [EMAIL_CAP_REDIS, ConfigService],
    },
  ],
  exports: [SendSignInCodeEmail],
})
export class EmailModule implements OnApplicationShutdown {
  constructor(@Inject(EMAIL_CAP_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
