import type { Prisma } from "@auto-tm/db";
import { Conversation } from "../domain/Conversation";

export function toDomainConversation(row: Prisma.ConversationGetPayload<Record<string, never>>): Conversation {
  return Conversation.create({ ...row, enquiryState: row.enquiryState === "closed" ? "closed" : "open" });
}
