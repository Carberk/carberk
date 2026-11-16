import { Inject, Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { IdentityEventBusPort, IdentityEventPayloads } from "../domain/ports/IdentityEventBusPort";

@Injectable()
export class EventEmitterIdentityEventBus implements IdentityEventBusPort {
  constructor(
    @Optional()
    @Inject(EventEmitter2)
    private readonly eventEmitter?: EventEmitter2,
  ) {}

  emit<K extends keyof IdentityEventPayloads>(event: K, payload: IdentityEventPayloads[K]): void {
    this.eventEmitter?.emit(event, payload);
  }
}
