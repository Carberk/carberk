import { DateTimeSchema, z } from "../zod";

import { CurrencySchema } from "./listings";

export const ExchangeRateSchema = z.object({
  fromCurrency: CurrencySchema,
  toCurrency: CurrencySchema,
  rate: z.number().positive(),
  updatedAt: DateTimeSchema,
});
export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;

export const ExchangeRatesResponseSchema = z.object({
  rates: z.array(ExchangeRateSchema),
});
export type ExchangeRatesResponse = z.infer<typeof ExchangeRatesResponseSchema>;
