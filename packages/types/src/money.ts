/**
 * Canonical Value Object for Money representing PostgreSQL NUMERIC(19,4)
 * strictly isolated to prevent IEEE-754 floating point arithmetic inaccuracies.
 */
export interface Money {
  /**
   * Exact scaled decimal string representation matching PostgreSQL NUMERIC(19,4)
   * Example: "12500.0000", "450.5000"
   */
  readonly amount: string;

  /**
   * ISO 4217 Currency Code (e.g., "KES", "USD", "EUR")
   */
  readonly currency: string;

  /**
   * Decimal precision scale (canonical standard is 4 decimal places for NUMERIC(19,4))
   */
  readonly scale: number;
}

export interface MoneyValueObject {
  amount: string;
  currency: string;
  scale: number;
  formatted: string;
  minorUnits: bigint;
}

export type CurrencyCode = "KES" | "USD" | "EUR" | "GBP" | string;
