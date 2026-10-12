import type {
  ChatAttachmentCleaner,
  ChatAttachmentCleanResult,
} from "../../domain/ports/ChatAttachmentCleaner";

/** The ThumbHash the fake reports for every clean image: a real 300x200 blue photo's. */
export const FAKE_CHAT_THUMB_HASH = "2yMBBYCIh4iHiHeAiId4dXh3f4f4";

/**
 * The one `ChatAttachmentCleaner` fake: records every key it was asked to
 * clean and answers with a fixed result. `onClean` lets a spec observe the
 * moment the clean runs, such as what was already stored by then.
 */
export class FakeChatAttachmentCleaner implements ChatAttachmentCleaner {
  result: ChatAttachmentCleanResult = { status: "clean", thumbHash: FAKE_CHAT_THUMB_HASH };
  cleaned: string[] = [];

  constructor(private readonly onClean?: () => void) {}

  async clean(key: string): Promise<ChatAttachmentCleanResult> {
    this.cleaned.push(key);
    this.onClean?.();
    return this.result;
  }
}
