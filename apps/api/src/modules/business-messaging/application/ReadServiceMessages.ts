import { Inject, Injectable } from "@nestjs/common";
import { ServiceMessagesSchemas } from "@auto-tm/contracts";
import {
  SERVICE_MESSAGE_REPOSITORY,
  ServiceMessageError,
  type ReadServiceMessagesInput,
  type ServiceMessageRepository,
} from "../domain/ServiceMessageRepository";

@Injectable()
export class ReadServiceMessages {
  constructor(
    @Inject(SERVICE_MESSAGE_REPOSITORY) private readonly repository: ServiceMessageRepository,
  ) {}

  async execute(input: ReadServiceMessagesInput) {
    const parsed = (input.participant ? ServiceMessagesSchemas.ReadParticipantMessagesSchema
      : ServiceMessagesSchemas.ReadServiceMessagesSchema).safeParse(input);
    if (!parsed.success) throw new ServiceMessageError("SERVICE_MESSAGE_INVALID_INPUT");
    return this.repository.page(parsed.data).catch((error: unknown) => {
      if (error instanceof ServiceMessageError) throw error;
      throw new ServiceMessageError("SERVICE_MESSAGE_UNAVAILABLE");
    });
  }
}
