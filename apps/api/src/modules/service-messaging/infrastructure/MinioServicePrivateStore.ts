import { Readable } from "node:stream";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ServicePrivateStore } from "../domain/ports/ServiceMessagingPort";
import { ServiceDenied } from "../domain/serviceAccess";

/** Provision this dedicated bucket with no anonymous policy before activation.
 * Storage locators never leave the server and are never presigned. */
@Injectable()
export class MinioServicePrivateStore implements ServicePrivateStore {
 private readonly client: S3Client;
 constructor(@Inject(ConfigService) config: ConfigService) {
  this.client = new S3Client({ endpoint: config.get<string>("MINIO_ENDPOINT", "http://localhost:9000"), region: config.get<string>("MINIO_REGION", "us-east-1"), forcePathStyle: true, credentials: { accessKeyId: config.get<string>("MINIO_ACCESS_KEY", "minioadmin"), secretAccessKey: config.get<string>("MINIO_SECRET_KEY", "minioadmin") } });
 }
 async putImmutable(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  await this.client.send(new PutObjectCommand({ Bucket: "service-private", Key: key, Body: bytes, ContentType: contentType, ContentLength: bytes.byteLength, IfNoneMatch: "*", CacheControl: "no-store, private", ContentDisposition: "attachment" }));
 }
 async get(key: string, maxBytes: number): Promise<Uint8Array> {
  if (maxBytes <= 0 || maxBytes > 20 * 1024 * 1024) throw new ServiceDenied("INVALID_ATTACHMENT");
  const object = await this.client.send(new GetObjectCommand({ Bucket: "service-private", Key: key }));
  if (!object.Body || object.ContentLength !== maxBytes) { if (object.Body instanceof Readable) if (object.Body instanceof Readable) object.Body.destroy(); throw new ServiceDenied("INVALID_ATTACHMENT"); }
  const chunks: Uint8Array[] = []; let length = 0;
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
   length += chunk.byteLength;
   if (length > maxBytes) { if (object.Body instanceof Readable) object.Body.destroy(); throw new ServiceDenied("INVALID_ATTACHMENT"); }
   chunks.push(chunk);
  }
  if (length !== maxBytes) throw new ServiceDenied("INVALID_ATTACHMENT");
  return Buffer.concat(chunks);
 }
 async remove(key: string): Promise<void> {
  await this.client.send(new DeleteObjectCommand({ Bucket: "service-private", Key: key }));
 }
}
