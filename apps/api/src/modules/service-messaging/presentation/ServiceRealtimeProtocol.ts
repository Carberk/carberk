import { z } from "zod";
export const ServiceRealtimeProtocol = { changed: z.object({ conversationId: z.string().uuid(), lastSequence: z.number().int().nonnegative() }).strict() };
