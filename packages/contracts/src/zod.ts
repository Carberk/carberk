import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Zod 4 attaches schema methods at construction time. Initialize the extension
// before constructing contracts, regardless of the consumer import order.
extendZodWithOpenApi(z);

export { z };

/** Zod 3 accepted minute-precision UTC strings used by existing cursors. */
export const DateTimeSchema = z.union([
  z.iso.datetime(),
  z.iso.datetime({ precision: -1 }),
]);

/** Zod 3 accepted integral numbers outside Number.MAX_SAFE_INTEGER. */
export const LegacyIntegerSchema = z
  .number()
  .refine(Number.isInteger)
  // Keep the wire contract's integer metadata while Zod 4's number schema
  // correctly accepts the legacy unsafe integral values.
  .openapi({ type: "integer" });
