import { IdentitySchemas } from "@auto-tm/contracts";

/**
 * What the name editor says about its field. The rule is the one the server
 * applies (`@auto-tm/contracts`); the editor only tells an empty field from
 * one of only spaces, which the server reports alike as `empty`.
 */
export type DisplayNameFieldError = "empty" | "spaces" | "too_short" | "too_long";

export interface DisplayNameField {
  /** The error for the text, or null when it passes the rule. */
  error: DisplayNameFieldError | null;
  /** Characters after normalizing, as the counter shows them. */
  count: number;
  /** The form that is sent and stored. */
  normalized: string;
  /** Valid and different from the name the User has now. */
  canSave: boolean;
}

/** The field error for a refusal of `text` by the rule, here or on the server. */
export function fieldErrorFor(
  text: string,
  problem: IdentitySchemas.DisplayNameProblem,
): DisplayNameFieldError {
  if (problem === IdentitySchemas.DisplayNameProblem.Empty) {
    return text.length === 0 ? "empty" : "spaces";
  }
  return problem;
}

export function describeDisplayNameField(text: string, currentName: string): DisplayNameField {
  const normalized = IdentitySchemas.normalizeDisplayName(text);
  const problem = IdentitySchemas.displayNameProblem(text);
  const error = problem === undefined ? null : fieldErrorFor(text, problem);
  return {
    error,
    count: IdentitySchemas.displayNameLength(text),
    normalized,
    canSave: error === null && normalized !== currentName,
  };
}
