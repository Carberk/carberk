import {
  Inject,
  Injectable,
  ForbiddenException,
} from "@nestjs/common";

import type {
  ListingsReadPort,
  ListingSummary,
} from "../../listings/domain/ports/ListingsReadPort";
import { LISTINGS_READ_PORT } from "../../listings/domain/ports/ListingsReadPort";
import { Message } from "../domain/Message";
import { CONVERSATION_ERROR_CODES } from "../domain/types";
import { buildPostRefSnapshot } from "./PostRefSnapshotMapper";

import { SendConversationMessage } from "./SendConversationMessage";

export interface SendPostRefMessageInput {
  senderId: string;
  conversationId: string;
  metadata: { listingId: string };
  clientMessageId?: string | undefined;
}

export interface SendPostRefMessageResult {
  message: Message;
  listing: ListingSummary | null;
}

@Injectable()
export class SendPostRefMessage {
  constructor(
    @Inject(SendConversationMessage)
    private readonly sendConversationMessage: SendConversationMessage,
    @Inject(LISTINGS_READ_PORT)
    private readonly listings: ListingsReadPort,
  ) {}

  async execute(
    input: SendPostRefMessageInput,
  ): Promise<SendPostRefMessageResult> {
    const result = await this.sendConversationMessage.execute({
      senderId: input.senderId,
      conversationId: input.conversationId,
      clientMessageId: input.clientMessageId,
      createMessage: async ({
        id,
        conversationId,
        senderId,
        clientMessageId,
      }) => {
        const referencedListing = await this.loadReferencedListing(
          input.metadata.listingId,
        );

        return Message.createPostRef({
          id,
          conversationId,
          senderId,
          clientMessageId,
          metadata: buildPostRefSnapshot(referencedListing),
        });
      },
    });

    return { message: result.message, listing: result.listing };
  }

  private async loadReferencedListing(
    listingId: string,
  ): Promise<ListingSummary> {
    const referencedListing = await this.listings.getListingSummary(listingId);

    if (!referencedListing || referencedListing.status !== "active") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Referenced listing is not available",
        details: {
          reason: CONVERSATION_ERROR_CODES.LISTING_REFERENCE_NOT_VISIBLE,
        },
      });
    }

    return referencedListing;
  }
}
