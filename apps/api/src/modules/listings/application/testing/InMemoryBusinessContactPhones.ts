import type { VerifiedContactPhone } from "../../domain/VerifiedContactPhone";
import type { BusinessContactPhoneRepository } from "../../domain/ports/BusinessContactPhoneRepository";
export class InMemoryBusinessContactPhones implements BusinessContactPhoneRepository {
  readonly numbers = new Map<string, VerifiedContactPhone>();
  async find(businessId: string) { return this.numbers.get(businessId) ?? null; }
  async record(confirmation: VerifiedContactPhone) { this.numbers.set(confirmation.sellerId, confirmation); return confirmation; }
}
