import type { GeneratedIdentity } from "../GeneratedIdentity";
import type { SignInMethods } from "../SignInMethods";
import type { User } from "../User";

export interface UserRepository {
  findByPhone(phone: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /**
   * Creates a User holding the given verified Sign-in Methods (at least one)
   * and the Generated Name number and Assigned Avatar index drawn for it.
   */
  create(signInMethods: SignInMethods, identity: GeneratedIdentity): Promise<User>;
  /** Stores the User's own name. Writes nothing else on the User. */
  updateDisplayName(userId: string, displayName: string): Promise<void>;
  /** Unsupported raw erasure. Production callers must use the account UoW. */
  delete(id: string): Promise<void>;
  findUsersWithExpiredDeletionGrace(now: Date): Promise<User[]>;
  /**
   * Unsupported raw retained-User scrub. It is not the physical account purge
   * and must refuse; production erasure belongs to the complete account UoW.
   */
  purgePersonalData(userId: string): Promise<void>;
}
