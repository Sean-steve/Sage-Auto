import { CANONICAL_MONEY_SCALE, DEFAULT_CURRENCY } from "@carhire/constants";
import type { Money } from "@carhire/types";

const SCALE_FACTOR = 10n ** BigInt(CANONICAL_MONEY_SCALE); // 10000n for 4 decimal places

/**
 * Parses any numeric, string or minor-unit representation into a strict Money value object
 */
export function createMoney(amount: string | number | bigint, currency: string = DEFAULT_CURRENCY): Money {
  let stringAmount: string;

  if (typeof amount === "bigint") {
    const isNegative = amount < 0n;
    const absVal = isNegative ? -amount : amount;
    const whole = absVal / SCALE_FACTOR;
    const fraction = absVal % SCALE_FACTOR;
    const paddedFraction = fraction.toString().padStart(CANONICAL_MONEY_SCALE, "0");
    stringAmount = `${isNegative ? "-" : ""}${whole.toString()}.${paddedFraction}`;
  } else if (typeof amount === "number") {
    // Round to avoid IEEE 754 precision issues before string conversion
    const fixed = amount.toFixed(CANONICAL_MONEY_SCALE);
    stringAmount = fixed;
  } else {
    // Clean string input
    const cleanStr = amount.trim();
    if (!cleanStr) {
      stringAmount = `0.${"0".repeat(CANONICAL_MONEY_SCALE)}`;
    } else {
      const parts = cleanStr.split(".");
      const whole = parts[0] || "0";
      const fraction = (parts[1] || "").padEnd(CANONICAL_MONEY_SCALE, "0").slice(0, CANONICAL_MONEY_SCALE);
      stringAmount = `${whole}.${fraction}`;
    }
  }

  return {
    amount: stringAmount,
    currency: currency.toUpperCase(),
    scale: CANONICAL_MONEY_SCALE,
  };
}

/**
 * Converts a Money object into BigInt scaled units for exact arithmetic
 */
export function toScaledBigInt(money: Money): bigint {
  const parts = money.amount.split(".");
  const isNegative = parts[0].startsWith("-");
  const wholeStr = isNegative ? parts[0].substring(1) : parts[0];
  const fractionStr = (parts[1] || "").padEnd(CANONICAL_MONEY_SCALE, "0").slice(0, CANONICAL_MONEY_SCALE);

  const whole = BigInt(wholeStr || "0");
  const fraction = BigInt(fractionStr || "0");
  const total = whole * SCALE_FACTOR + fraction;
  return isNegative ? -total : total;
}

/**
 * Converts Scaled BigInt back to Money
 */
export function fromScaledBigInt(scaled: bigint, currency: string = DEFAULT_CURRENCY): Money {
  return createMoney(scaled, currency);
}

/**
 * Adds two Money amounts safely
 */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch in money addition: ${a.currency} vs ${b.currency}`);
  }
  const sum = toScaledBigInt(a) + toScaledBigInt(b);
  return fromScaledBigInt(sum, a.currency);
}

/**
 * Subtracts Money b from Money a safely
 */
export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch in money subtraction: ${a.currency} vs ${b.currency}`);
  }
  const diff = toScaledBigInt(a) - toScaledBigInt(b);
  return fromScaledBigInt(diff, a.currency);
}

/**
 * Multiplies Money by a scalar factor safely using integer precision
 */
export function multiplyMoney(money: Money, factor: number | bigint): Money {
  const scaledMoney = toScaledBigInt(money);
  if (typeof factor === "bigint") {
    return fromScaledBigInt(scaledMoney * factor, money.currency);
  }
  // Convert factor to 4-decimal scaled integer
  const scaledFactor = BigInt(Math.round(factor * Number(SCALE_FACTOR)));
  const result = (scaledMoney * scaledFactor) / SCALE_FACTOR;
  return fromScaledBigInt(result, money.currency);
}

/**
 * Divides Money by a divisor safely
 */
export function divideMoney(money: Money, divisor: number | bigint): Money {
  if (divisor === 0 || divisor === 0n) {
    throw new Error("Division by zero in Money calculation");
  }
  const scaledMoney = toScaledBigInt(money);
  if (typeof divisor === "bigint") {
    return fromScaledBigInt(scaledMoney / divisor, money.currency);
  }
  const scaledDivisor = BigInt(Math.round(divisor * Number(SCALE_FACTOR)));
  const result = (scaledMoney * SCALE_FACTOR) / scaledDivisor;
  return fromScaledBigInt(result, money.currency);
}

/**
 * Formats a Money instance to a localized display string
 */
export function formatMoney(money: Money | number | string, currency = DEFAULT_CURRENCY): string {
  const m = typeof money === "object" && "amount" in money ? money : createMoney(money, currency);
  const numVal = parseFloat(m.amount);

  if (m.currency === "KES") {
    return `KES ${numVal.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  if (m.currency === "USD") {
    return `$${numVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${m.currency} ${numVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
