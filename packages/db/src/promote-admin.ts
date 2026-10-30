import { AuthSchemas } from "@auto-tm/contracts";

const TM_MOBILE_RE = /^\+993[67]\d{7}$/;
const ADMIN_ROLE = "admin";

export interface PromoteAdminUser {
  id: string;
  role: string;
  emailVerifiedAt: Date | null;
}

export interface PromoteAdminDeps {
  /** The adapter prepares before mutation locks and confirms read-only outcomes. */
  transaction<T>(work: (tx: PromoteAdminTransaction) => Promise<T>): Promise<T>;
}

export interface PromoteAdminTransaction {
  findUserByPhone(phone: string): Promise<PromoteAdminUser | null>;
  findUsersByEmail(email: string): Promise<PromoteAdminUser[]>;
  updateUserRole(userId: string, role: string): Promise<void>;
  createAuditLog(data: {
    actorId: null;
    action: string;
    targetType: string;
    targetId: string;
    details: Record<string, unknown>;
  }): Promise<void>;
}

export interface PromoteAdminOptions {
  phone?: string;
  email?: string;
  reason: string;
  dryRun: boolean;
}

export interface PromoteAdminResult {
  exitCode: number;
  message: string;
}

export async function runPromoteAdmin(
  deps: PromoteAdminDeps,
  options: PromoteAdminOptions,
): Promise<PromoteAdminResult> {
  if ((options.phone !== undefined) === (options.email !== undefined)) {
    return { exitCode: 1, message: "Supply exactly one of --phone and --email" };
  }
  if (options.phone !== undefined && !TM_MOBILE_RE.test(options.phone)) {
    return { exitCode: 1, message: `Invalid phone format: ${options.phone}` };
  }

  const email = options.email === undefined
    ? undefined
    : AuthSchemas.EmailAddress.safeParse(options.email);
  if (email && !email.success) {
    return { exitCode: 1, message: "Invalid email format" };
  }

  const normalizedReason = options.reason.trim();
  if (normalizedReason.length === 0) {
    return { exitCode: 1, message: "Reason cannot be empty" };
  }
  if (normalizedReason.length > 1000) {
    return { exitCode: 1, message: "Reason cannot exceed 1000 characters" };
  }

  return deps.transaction(async (tx) => {
    let user: PromoteAdminUser | null;
    if (options.phone !== undefined) {
      user = await tx.findUserByPhone(options.phone);
    } else if (email?.success) {
      const holders = await tx.findUsersByEmail(email.data);
      if (holders.length > 1) {
        return { exitCode: 1, message: "Ambiguous email holders; promotion refused" };
      }
      user = holders[0] ?? null;
      if (user && !user.emailVerifiedAt) {
        return { exitCode: 1, message: "Email holder must be verified" };
      }
    } else {
      return { exitCode: 1, message: "Invalid email format" };
    }
    if (!user) {
      return { exitCode: 1, message: "No user found for the selected contact" };
    }

    if (user.role === ADMIN_ROLE) {
      return {
        exitCode: 0,
        message: `User ${user.id} is already admin`,
      };
    }

    if (options.dryRun) {
      return {
        exitCode: 0,
        message: `[dry-run] Would promote user ${user.id} to admin`,
      };
    }

    await tx.updateUserRole(user.id, ADMIN_ROLE);
    await tx.createAuditLog({ actorId: null, action: "ADMIN_BOOTSTRAP_PROMOTE", targetType: "user", targetId: user.id,
      details: { reason: normalizedReason, before: { role: user.role }, after: { role: ADMIN_ROLE } } });
    return { exitCode: 0, message: `Promoted user ${user.id} to admin` };
  });
}
