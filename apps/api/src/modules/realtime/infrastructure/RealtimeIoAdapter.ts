import type { INestApplicationContext } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { Redis } from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Server, ServerOptions } from "socket.io";

import { verifyGatewayAttribution, type AttributionOptions } from "../../../common/gateway-attribution";

export interface RealtimeIoAdapterOptions {
  corsOrigin: string;
  redisAdapterEnabled: boolean;
  redisUrl: string | undefined;
  gatewayAttribution: AttributionOptions;
}

export class RealtimeIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    appOrHttpServer: INestApplicationContext,
    private readonly options: RealtimeIoAdapterOptions,
  ) {
    super(appOrHttpServer);
  }

  async configure(): Promise<void> {
    if (!this.options.redisAdapterEnabled) {
      return;
    }

    if (!this.options.redisUrl) {
      throw new Error(
        "Redis URL is required when the Socket.IO Redis adapter is enabled",
      );
    }

    const pubClient = new Redis(this.options.redisUrl);
    const subClient = pubClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.options.corsOrigin,
      },
    }) as Server;
    server.engine.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
      void verifyGatewayAttribution(req, this.options.gatewayAttribution).then(result => {
        if (result.status === 200) next();
        else { res.statusCode = result.status; res.end(); }
      }).catch(() => { res.statusCode = 503; res.end(); });
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
