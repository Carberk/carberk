import { ErrorCode, IdentitySchemas } from "@auto-tm/contracts";

import { ApiError } from "./client";

/**
 * Why the server refused a Display Name, when `error` is INVALID_DISPLAY_NAME
 * with a reason this app knows. The name editor shows the matching rule error
 * instead of a generic failure.
 */
export function getDisplayNameRefusal(
  error: unknown,
): IdentitySchemas.DisplayNameProblem | undefined {
  if (!(error instanceof ApiError) || error.code !== ErrorCode.InvalidDisplayName) {
    return undefined;
  }
  const parsed = IdentitySchemas.InvalidDisplayNameDetailsSchema.safeParse(error.details);
  return parsed.success ? parsed.data.reason : undefined;
}

export interface ErrorCopy {
  title: string;
  description: string;
  retryable: boolean;
}

const CONTACT_ERROR_CODES = new Set([
  "LISTING_NOT_CONTACTABLE",
  "CHAT_DISABLED",
  "SELF_CONTACT_NOT_ALLOWED",
  "NOT_A_PARTICIPANT",
]);

function getReason(details: unknown): string | undefined {
  if (
    typeof details === "object" &&
    details !== null &&
    "reason" in details &&
    typeof (details as { reason?: unknown }).reason === "string"
  ) {
    return (details as { reason: string }).reason;
  }
  return undefined;
}

export function mapErrorToCopy(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): ErrorCopy {
  if (error instanceof ApiError) {
    if (error.code === "NETWORK_ERROR" || error.status === 0) {
      return {
        title: t("offline"),
        description: t("checkConnection"),
        retryable: true,
      };
    }

    if (error.code === "UNAUTHENTICATED" || error.status === 401) {
      return {
        title: t("authErrorTitle"),
        description: t("authErrorDescription"),
        retryable: true,
      };
    }

    if (error.code === "RATE_LIMITED" || error.status === 429) {
      return {
        title: t("rateLimitTitle"),
        description: t("rateLimitDescription"),
        retryable: true,
      };
    }

    if (error.status === 404 || error.code === "NOT_FOUND") {
      return {
        title: t("notAvailable"),
        description: t("removedSoldOrArchived"),
        retryable: false,
      };
    }

    if (error.code === "CONTRACT_VIOLATION") {
      return {
        title: t("somethingWentWrong"),
        description: t("unexpectedError"),
        retryable: false,
      };
    }

    if (CONTACT_ERROR_CODES.has(error.code)) {
      return {
        title: t("couldNotOpenConversation"),
        description: t(`contactError.${error.code}`),
        retryable: false,
      };
    }

    if (error.code === "FORBIDDEN" || error.status === 403) {
      const reason = getReason(error.details);
      if (reason === "USER_SUSPENDED") {
        return {
          title: t("accountRestricted"),
          description: t("accountRestrictedDescription"),
          retryable: false,
        };
      }
      if (
        reason === "FEATURE_DISABLED" ||
        reason === "LISTING_PUBLISH_ENABLED" ||
        reason === "LISTING_MUTATIONS_ENABLED" ||
        reason === "CONTACT_ENABLED" ||
        reason === "REPORT_ENTRY_ENABLED"
      ) {
        return {
          title: t("featureUnavailable"),
          description: t("featureUnavailableDescription"),
          retryable: false,
        };
      }
      return {
        title: t("forbiddenTitle"),
        description: t("forbiddenDescription"),
        retryable: false,
      };
    }

    return {
      title: t("somethingWentWrong"),
      description: t("tryAgain"),
      retryable: true,
    };
  }

  return {
    title: t("somethingWentWrong"),
    description: t("tryAgain"),
    retryable: true,
  };
}

