import { Readable } from "node:stream";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

/** Network boundary fake keeps private bucket names and immutable bytes. */
export class InMemoryS3VideoTransport {
  readonly objects = new Map<string, { bytes: Buffer; type: string }>();
  async send(command: GetObjectCommand | PutObjectCommand) {
    const address = `${command.input.Bucket}/${command.input.Key}`;
    if (command instanceof GetObjectCommand) {
      const value = this.objects.get(address);
      if (!value) throw Object.assign(new Error("NoSuchKey"), { $metadata: { httpStatusCode: 404 } });
      return { Body: Readable.from(value.bytes), ContentLength: value.bytes.length, ContentType: value.type };
    }
    if (this.objects.has(address) && command.input.IfNoneMatch === "*") throw Object.assign(new Error("PreconditionFailed"), { $metadata: { httpStatusCode: 412 } });
    const chunks: Buffer[] = [];
    if (!(command.input.Body instanceof Readable)) throw new Error("Expected streaming body");
    for await (const chunk of command.input.Body) chunks.push(Buffer.from(chunk));
    this.objects.set(address, { bytes: Buffer.concat(chunks), type: command.input.ContentType ?? "" });
    return {};
  }
}
