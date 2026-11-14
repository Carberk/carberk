import { Inject, Injectable } from "@nestjs/common";
import { ServiceMessagesSchemas } from "@auto-tm/contracts";
import {
  SERVICE_MESSAGE_REPOSITORY,
  ServiceMessageError,
  type SendServiceTextInput,
  type ServiceMessageRepository,
} from "../domain/ServiceMessageRepository";

@Injectable()
export class SendServiceText {
  constructor(
    @Inject(SERVICE_MESSAGE_REPOSITORY) private readonly repository: ServiceMessageRepository,
  ) {}

  async execute(input: SendServiceTextInput) {
    const parsed = ServiceMessagesSchemas.SendServiceTextSchema.safeParse(input);
    if (!parsed.success) throw new ServiceMessageError("SERVICE_MESSAGE_INVALID_INPUT");
    const original = await this.repository.append(parsed.data).catch(() => {
      throw new ServiceMessageError("SERVICE_MESSAGE_UNAVAILABLE");
    });
    // Preserve all original characters, including surrounding whitespace/newlines.
    // UUID key canonicalization is independent of text equality; Session is no key.
    if (original.text !== parsed.data.text) {
      throw new ServiceMessageError("SERVICE_MESSAGE_INTENT_CONFLICT");
    }
    return original;
  }
}
