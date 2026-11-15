export interface MediaStoragePort {
  presignUpload(data: {
    key: string;
    contentType: string;
    sizeBytes: number;
    expirySeconds?: number;
    writeProtocol?: "conditional-v1";
    /** Read-only inspection of an issued empty family; never initialize it again. */
    renew?: true;
  }): Promise<{ url: string; key: string; headers?: Record<string, string>; objectKeys?: string[] }>;

  resolvePublicUrl(key: string): string;

  deleteObject(key: string): Promise<void>;
}

export const MEDIA_STORAGE_PORT = Symbol("MediaStoragePort");
