/** Private bytes are served only through current Conversation authority. */
export interface BusinessChatFileStore {
 put(key: string, bytes: Uint8Array): Promise<void>;
 get(key: string): Promise<Uint8Array>;
}
export const BUSINESS_CHAT_FILE_STORE = Symbol("BusinessChatFileStore");
