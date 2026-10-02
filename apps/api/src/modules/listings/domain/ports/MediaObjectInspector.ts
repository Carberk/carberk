import type { StoredObjectInfo } from "../MediaUpload";

/** Reads what storage actually holds under a key, without trusting the client. */
export interface MediaObjectInspector {
  /** Null when no object exists under the key. */
  inspect(key: string): Promise<StoredObjectInfo | null>;
}

export const MEDIA_OBJECT_INSPECTOR = Symbol("MediaObjectInspector");
