import { ServiceDenied } from "../domain/serviceAccess";

export async function cleanServiceBytes(_bytes: Uint8Array, _contentType: string, _purpose: "support" | "history"): Promise<Uint8Array> {
 throw new ServiceDenied("INVALID_ATTACHMENT");
}
