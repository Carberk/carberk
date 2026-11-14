import { Inject, Injectable } from "@nestjs/common";
import { ServiceMessagesSchemas } from "@auto-tm/contracts";
import { SERVICE_MESSAGE_REPOSITORY, ServiceMessageError, type ServiceMessageRepository,
  type ServiceStream } from "../domain/ServiceMessageRepository";

@Injectable()
export class ReadServiceReceipts {
  constructor(@Inject(SERVICE_MESSAGE_REPOSITORY) private readonly repository: ServiceMessageRepository) {}
  async execute(input: ServiceStream) {
    const parsed = ServiceMessagesSchemas.ServiceStreamSchema.safeParse(input);
    if (!parsed.success) throw new ServiceMessageError("SERVICE_MESSAGE_INVALID_INPUT");
    return this.repository.receipts(parsed.data).catch(() => { throw new ServiceMessageError("SERVICE_MESSAGE_UNAVAILABLE"); });
  }
}
