import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { CHAT_ATTACHMENT_MAX_SIZE_BYTES, chatAttachmentKey, isChatAttachmentKeyOf } from "../domain/ChatAttachment";
import { CONVERSATION_REPOSITORY, type ConversationRepository } from "../domain/ports/ConversationRepository";
import { BUSINESS_CHAT_FILE_STORE, type BusinessChatFileStore } from "../domain/ports/BusinessChatFileStore";
import type { ConversationActor } from "../domain/ports/BusinessEnquiryRepository";
import { BusinessEnquiryAccess } from "./BusinessEnquiryAccess";

@Injectable()
export class BusinessChatFiles {
 constructor(@Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository, @Inject(BusinessEnquiryAccess) private readonly access: BusinessEnquiryAccess, @Inject(BUSINESS_CHAT_FILE_STORE) private readonly store: BusinessChatFileStore) {}
 private async authorize(actor: ConversationActor, conversationId: string, attachmentId: string, send: boolean) {
  const conversation = await this.conversations.findById(conversationId);
  if (!conversation) throw new NotFoundException();
  if (!conversation.businessId) throw new ForbiddenException();
  await this.access.authorize(conversation, actor, { send });
  const key = chatAttachmentKey(conversationId, attachmentId, "webp", true);
  if (!isChatAttachmentKeyOf(conversationId, key, true)) throw new BadRequestException("Invalid attachment");
  return key;
 }
 async upload(actor: ConversationActor, conversationId: string, attachmentId: string, bytes: unknown) {
  const key = await this.authorize(actor, conversationId, attachmentId, true);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > CHAT_ATTACHMENT_MAX_SIZE_BYTES) throw new BadRequestException("Invalid attachment");
  await this.store.put(key, bytes);
  return { ok: true };
 }
 async download(actor: ConversationActor, conversationId: string, attachmentId: string) {
  const key = await this.authorize(actor, conversationId, attachmentId, false);
  const bytes = await this.store.get(key);
  await this.authorize(actor, conversationId, attachmentId, false);
  return bytes;
 }
}
