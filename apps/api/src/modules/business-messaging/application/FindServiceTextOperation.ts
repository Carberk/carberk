import { Inject, Injectable } from "@nestjs/common";
import { ServiceMessagesSchemas } from "@auto-tm/contracts";
import {
  SERVICE_MESSAGE_REPOSITORY, ServiceMessageError,
  type FindServiceTextOperationInput, type ServiceMessageRepository,
} from "../domain/ServiceMessageRepository";

// Keep the trusted key outside external contracts and message projections.
export const TextOperationSchema = ServiceMessagesSchemas.ServiceStreamSchema.extend({
  operationKey: ServiceMessagesSchemas.ServiceStreamSchema.shape.objectId,
}).strict();

@Injectable()
export class FindServiceTextOperation {
  constructor(
    @Inject(SERVICE_MESSAGE_REPOSITORY) private readonly repository: ServiceMessageRepository,
  ) {}

  async execute(input: FindServiceTextOperationInput) {
    const parsed = TextOperationSchema.safeParse(input);
    if (!parsed.success) throw new ServiceMessageError("SERVICE_MESSAGE_INVALID_INPUT");
    return this.repository.findOperation(parsed.data).catch(() => {
      throw new ServiceMessageError("SERVICE_MESSAGE_UNAVAILABLE");
    });
  }
}
