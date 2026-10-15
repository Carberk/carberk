import { ConfigService } from "@nestjs/config";
import type { ServicePrivateStore } from "../domain/ports/ServiceMessagingPort";
export class MinioServicePrivateStore implements ServicePrivateStore {
 constructor(_config: ConfigService) {}
 async putImmutable(_key: string, _bytes: Uint8Array, _contentType: string): Promise<void> { throw new Error("not implemented"); }
 async get(_key: string, _maxBytes: number): Promise<Uint8Array> { throw new Error("not implemented"); }
 async remove(_key: string): Promise<void> { throw new Error("not implemented"); }
}
