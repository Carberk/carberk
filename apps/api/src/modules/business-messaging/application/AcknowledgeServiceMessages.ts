import { Inject, Injectable } from "@nestjs/common";
import { ServiceMessagesSchemas } from "@auto-tm/contracts";
import { SERVICE_MESSAGE_REPOSITORY, ServiceMessageError, type ServiceMessageRepository,
  type AcknowledgeServiceMessagesInput } from "../domain/ServiceMessageRepository";

@Injectable()
export class AcknowledgeServiceMessages {
  constructor(@Inject(SERVICE_MESSAGE_REPOSITORY) private readonly repository: ServiceMessageRepository) {}
  async execute(input: AcknowledgeServiceMessagesInput) {
    const parsed = ServiceMessagesSchemas.AcknowledgeServiceMessagesSchema.safeParse(input);
    if (!parsed.success) throw new ServiceMessageError("SERVICE_MESSAGE_INVALID_INPUT");
    return this.repository.acknowledge(parsed.data).catch((error: unknown) => {
      if (error instanceof ServiceMessageError) throw error;
      throw new ServiceMessageError("SERVICE_MESSAGE_UNAVAILABLE");
    });
  }
}
