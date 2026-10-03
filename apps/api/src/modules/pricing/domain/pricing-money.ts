// ============================================================================
// CAR HIRE OS — PRICING MONEY DOMAIN VALUE OBJECT (DEV-007, BRS-001)
// Deterministic 4-Decimal Scale Arithmetic with Half-Up Rounding & Invariant Protection
// ============================================================================

export class PricingMoney {
  private readonly _amount: number;
  private readonly _currency: string;

  constructor(amount: number, currency: string = "KES") {
    if (isNaN(amount) || !isFinite(amount)) {
      throw new Error(`Invalid numeric amount for PricingMoney: ${amount}`);
    }
    this._currency = currency.toUpperCase().trim();
    // Enforce 4 decimal scale standard (PostgreSQL NUMERIC(19,4))
    this._amount = PricingMoney.roundTo4(amount);
  }

  static roundTo4(val: number): number {
    return Math.round((val + Number.EPSILON) * 10000) / 10000;
  }

  static roundTo2(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  static zero(currency: string = "KES"): PricingMoney {
    return new PricingMoney(0, currency);
  }

  static from(amount: number | string, currency: string = "KES"): PricingMoney {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new PricingMoney(num, currency);
  }

  get amount(): number {
    return this._amount;
  }

  get currency(): string {
    return this._currency;
  }

  get displayAmount(): number {
    return PricingMoney.roundTo2(this._amount);
  }

  private assertSameCurrency(other: PricingMoney): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Currency mismatch: cannot perform operation between ${this._currency} and ${other._currency}`
      );
    }
  }

  add(other: PricingMoney | number): PricingMoney {
    if (typeof other === "number") {
      return new PricingMoney(this._amount + other, this._currency);
    }
    this.assertSameCurrency(other);
    return new PricingMoney(this._amount + other._amount, this._currency);
  }

  subtract(other: PricingMoney | number): PricingMoney {
    if (typeof other === "number") {
      return new PricingMoney(this._amount - other, this._currency);
    }
    this.assertSameCurrency(other);
    return new PricingMoney(this._amount - other._amount, this._currency);
  }

  multiply(factor: number): PricingMoney {
    return new PricingMoney(this._amount * factor, this._currency);
  }

  divide(divisor: number): PricingMoney {
    if (divisor === 0) {
      throw new Error("Division by zero in PricingMoney");
    }
    return new PricingMoney(this._amount / divisor, this._currency);
  }

  percentage(percent: number): PricingMoney {
    return new PricingMoney((this._amount * percent) / 100, this._currency);
  }

  /**
   * Calculates tax amount when current money represents a tax-exclusive subtotal.
   * e.g. Subtotal 10,000 with 16% tax -> 1,600
   */
  calculateExclusiveTax(taxRatePercent: number): PricingMoney {
    return this.percentage(taxRatePercent);
  }

  /**
   * Extracts tax amount when current money is tax-inclusive.
   * e.g. Gross 11,600 with 16% tax -> 1,600 (Net is 10,000)
   */
  calculateInclusiveTaxPortion(taxRatePercent: number): PricingMoney {
    const factor = 1 + taxRatePercent / 100;
    const net = this._amount / factor;
    const tax = this._amount - net;
    return new PricingMoney(tax, this._currency);
  }

  isGreaterThan(other: PricingMoney): boolean {
    this.assertSameCurrency(other);
    return this._amount > other._amount;
  }

  isLessThan(other: PricingMoney): boolean {
    this.assertSameCurrency(other);
    return this._amount < other._amount;
  }

  isZero(): boolean {
    return Math.abs(this._amount) < 0.00001;
  }

  isNegative(): boolean {
    return this._amount < -0.00001;
  }

  format(locale: string = "en-KE"): string {
    return `${this._currency} ${this.displayAmount.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  toJSON(): number {
    return this._amount;
  }
}
