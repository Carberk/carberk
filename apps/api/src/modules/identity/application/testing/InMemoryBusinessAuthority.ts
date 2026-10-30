import type { BusinessAuthorityRepository, BusinessAuthoritySnapshot } from "../../domain/ports/BusinessAuthorityRepository";
export class InMemoryBusinessAuthority implements BusinessAuthorityRepository {
 snapshot: BusinessAuthoritySnapshot | null = null;
 async current() { return this.snapshot; }
}
