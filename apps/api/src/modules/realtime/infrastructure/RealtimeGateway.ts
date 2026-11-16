import {
  Inject,
  Injectable,
} from "@nestjs/common";
import type {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from "@nestjs/websockets";
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";

import { SocketAuthMiddleware } from "./SocketAuthMiddleware";
import { SocketConnectionRegistry } from "./SocketConnectionRegistry";
import { REALTIME_NAMESPACE, userRoom } from "../realtime.public";

@Injectable()
@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
})
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Namespace;

  constructor(
    @Inject(SocketAuthMiddleware)
    private readonly authMiddleware: SocketAuthMiddleware,
    @Inject(SocketConnectionRegistry)
    private readonly registry: SocketConnectionRegistry,
  ) {}

  afterInit(server: Namespace): void {
    server.use((socket, next) => this.authMiddleware.use(socket, next));
  }

  handleConnection(client: Socket): void {
    const user = client.data.user;
    if (!user?.sub) {
      client.disconnect(true);
      return;
    }

    client.join(userRoom(user.sub));
    this.registry.register(client.id, user.sub);
  }

  handleDisconnect(client: Socket): void {
    this.registry.unregister(client.id);
  }
}
