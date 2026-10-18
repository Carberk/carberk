import { Readable } from "node:stream";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { BusinessChatFileStore } from "../domain/ports/BusinessChatFileStore";
import { CHAT_ATTACHMENT_MAX_SIZE_BYTES } from "../domain/ChatAttachment";

/** Dedicated bucket must have no anonymous policy. No read or write presigns. */
@Injectable()
export class MinioBusinessChatFileStore implements BusinessChatFileStore {
 private readonly client: S3Client;
 constructor(@Inject(ConfigService) config: ConfigService) {
  this.client = new S3Client({ endpoint: config.getOrThrow<string>("MINIO_ENDPOINT"), region: config.get<string>("MINIO_REGION", "us-east-1"), forcePathStyle: true, credentials: { accessKeyId: config.get<string>("MINIO_ACCESS_KEY", ""), secretAccessKey: config.get<string>("MINIO_SECRET_KEY", "") } });
 }
 async put(key: string, bytes: Uint8Array): Promise<void> {
  try {
   await this.client.send(new PutObjectCommand({ Bucket: "business-chat-private", Key: key, Body: bytes, ContentType: "image/webp", ContentLength: bytes.byteLength, IfNoneMatch: "*", CacheControl: "no-store, private" }), { abortSignal: AbortSignal.timeout(10000) });
  } catch (error) {
   if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw error;
   const existing = await this.get(key);
   if (!Buffer.from(existing).equals(Buffer.from(bytes))) throw new ConflictException("Attachment bytes already exist");
  }
 }
 async get(key: string): Promise<Uint8Array> {
  const object = await this.client.send(new GetObjectCommand({ Bucket: "business-chat-private", Key: key }), { abortSignal: AbortSignal.timeout(10000) });
  const invalid = () => { if (object.Body instanceof Readable) object.Body.destroy(); return new BadRequestException("Invalid attachment"); };
  if (!object.Body || !object.ContentLength || object.ContentLength > CHAT_ATTACHMENT_MAX_SIZE_BYTES) throw invalid();
  const chunks: Uint8Array[] = []; let length = 0;
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
   length += chunk.byteLength; if (length > CHAT_ATTACHMENT_MAX_SIZE_BYTES) throw invalid(); chunks.push(chunk);
  }
  if (length !== object.ContentLength) throw invalid();
  return Buffer.concat(chunks);
 }
}
