import { z } from "../zod";

/** Preference only; this response never grants access or authorizes replay. */
export const RoutingPolicySchema = z.object({
  version: z.literal(1),
  disableTmPreference: z.boolean(),
  maxAgeSeconds: z.literal(60),
}).strict();

export type RoutingPolicy = z.infer<typeof RoutingPolicySchema>;
