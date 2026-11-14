import { Inject, Injectable } from "@nestjs/common";
import { ServiceMessagesSchemas } from "@auto-tm/contracts";
import {
  SERVICE_MESSAGE_REPOSITORY,
  ServiceMessageError,
  type SendServiceTextInput,
  type SendOnceServiceTextInput,
  type ServiceMessageRepository,
} from "../domain/ServiceMessageRepository";

import { TextOperationSchema } from "./FindServiceTextOperation";

const OnceTextSchema = ServiceMessagesSchemas.SendServiceTextSchema.extend({
  operationKey: TextOperationSchema.shape.operationKey,
}).strict();

@Injectable()
export class SendServiceText {
  constructor(
    @Inject(SERVICE_MESSAGE_REPOSITORY) private readonly repository: ServiceMessageRepository,
  ) {}

  execute(input: SendServiceTextInput) {
    return this.send(input, false);
  }

  executeOnce(input: SendOnceServiceTextInput) {
    return this.send(input, true);
  }

  private async send(input: SendServiceTextInput | SendOnceServiceTextInput, once: boolean) {
    const parsed = (once ? OnceTextSchema : ServiceMessagesSchemas.SendServiceTextSchema).safeParse(input);
    if (!parsed.success) throw new ServiceMessageError("SERVICE_MESSAGE_INVALID_INPUT");
    const original = await this.repository.append(parsed.data).catch((error: unknown) => {
      if (error instanceof ServiceMessageError) throw error;
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
