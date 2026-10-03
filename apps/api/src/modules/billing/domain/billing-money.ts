// ============================================================================
// CAR HIRE OS — BILLING MONEY MATH (NUMERIC 19,4 Standard)
// ============================================================================

export class BillingMoney {
  public static readonly SCALE = 4;

  public static round(value: number): number {
    return Math.round(value * 10000) / 10000;
  }

  public static add(a: number, b: number): number {
    return this.round(this.round(a) + this.round(b));
  }

  public static subtract(a: number, b: number): number {
    return this.round(this.round(a) - this.round(b));
  }

  public static multiply(amount: number, factor: number): number {
    return this.round(this.round(amount) * factor);
  }

  public static calculateTax(subtotal: number, taxRatePercent: number): number {
    return this.round((this.round(subtotal) * taxRatePercent) / 100);
  }

  public static formatCurrency(amount: number, currency = "KES"): string {
    return `${currency} ${amount.toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}
