import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { ConversationsSchemas } from "@auto-tm/contracts";
import { MEDIA_STORAGE_PORT, type MediaStoragePort } from "../../listings/domain/ports/MediaStoragePort";
import { MEDIA_OBJECT_INSPECTOR, type MediaObjectInspector } from "../../listings/domain/ports/MediaObjectInspector";
import { CHAT_ATTACHMENT_UPLOAD_REPOSITORY, type ChatAttachmentUploadRepository } from "../domain/ports/ChatAttachmentUploadRepository";
import { ValidateConversationAccess } from "./ValidateConversationAccess";
import { ConversationAccessPolicy } from "./ConversationAccessPolicy";

const unavailable = () => new BadRequestException({ code: "UPLOAD_NOT_AVAILABLE", message: "Upload is no longer available" });

@Injectable()
export class RenewChatAttachmentUpload {
  constructor(
    @Inject(CHAT_ATTACHMENT_UPLOAD_REPOSITORY) private readonly uploads: ChatAttachmentUploadRepository,
    @Inject(ValidateConversationAccess) private readonly access: ValidateConversationAccess,
    @Inject(ConversationAccessPolicy) private readonly policy: ConversationAccessPolicy,
    @Inject(MEDIA_STORAGE_PORT) private readonly storage: MediaStoragePort,
    @Inject(MEDIA_OBJECT_INSPECTOR) private readonly inspector: MediaObjectInspector,
  ) {}

  async execute(input: ConversationsSchemas.RenewChatAttachmentRequest & { userId: string; conversationId: string }): Promise<ConversationsSchemas.RenewChatAttachmentResponse> {
    const available = async () => {
      await this.policy.assertAccountNotPendingDeletion(input.userId);
      await this.access.execute(input);
      const issued = await this.uploads.find(input.key);
      if (!issued || issued.committed || issued.senderId !== input.userId || issued.conversationId !== input.conversationId ||
        issued.contentType !== input.contentType || issued.sizeBytes !== input.sizeBytes) throw unavailable();
    };
    await available();
    const stored = await this.inspector.inspect(input.key);
    if (stored && (stored.contentType !== input.contentType || stored.sizeBytes !== input.sizeBytes)) throw unavailable();
    const grant = stored ? null : await this.storage.presignUpload({ key: input.key, contentType: input.contentType,
      sizeBytes: input.sizeBytes, expirySeconds: 600, createOnly: true });
    // A send/account change can overlap HEAD/signing. No upload authority replaces present bytes.
    await available();
    if (!grant) return { state: "present", key: input.key };
    if (grant.headers?.["if-none-match"] !== "*") throw unavailable();
    return { state: "upload_required", key: input.key, uploadUrl: grant.url, expiresIn: 600,
      maxSizeBytes: 5242880, headers: { "if-none-match": "*", "content-type": input.contentType } };
  }
}
