// ============================================================================
// CAR HIRE OS — SPRINT 24: STRIPE SECURITY & CRYPTOGRAPHIC SERVICE
// HMAC-SHA256 Webhook Verification, Timing-Safe Checks, Minor Unit Scaling & Masking
// ============================================================================

import crypto from "node:crypto";
import type { CardBrand, CardMaskedSummary } from "@carhire/types";

// Currencies with zero decimal places in ISO 4217 (Stripe minor units = 1)
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"
]);

// Currencies with three decimal places in ISO 4217
const THREE_DECIMAL_CURRENCIES = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

export class StripeSecurityService {
  /**
   * Verifies the HMAC-SHA256 signature in the `stripe-signature` header.
   * Format: `t=1492774577,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd`
   *
   * @param signatureHeader Value of the `stripe-signature` header
   * @param rawPayload The raw unparsed request payload string or Buffer
   * @param secret The webhook signing secret (`whsec_...`)
   * @param toleranceSeconds Maximum age of the timestamp in seconds (default 300s)
   */
  static verifyWebhookSignature(
    signatureHeader: string | undefined,
    rawPayload: string | Buffer,
    secret: string,
    toleranceSeconds = 300
  ): boolean {
    if (!signatureHeader || !secret) {
      return false;
    }

    try {
      const items = signatureHeader.split(",");
      let timestamp: number | null = null;
      const signatures: string[] = [];

      for (const item of items) {
        const [key, value] = item.trim().split("=");
        if (key === "t") {
          timestamp = parseInt(value, 10);
        } else if (key === "v1") {
          signatures.push(value);
        }
      }

      if (!timestamp || isNaN(timestamp) || signatures.length === 0) {
        return false;
      }

      // Check timestamp freshness to prevent replay attacks
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
        return false;
      }

      // Compute HMAC over `${timestamp}.${rawPayload}`
      const payloadString = typeof rawPayload === "string" ? rawPayload : rawPayload.toString("utf8");
      const signedPayload = `${timestamp}.${payloadString}`;
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(signedPayload, "utf8")
        .digest("hex");

      const expectedBuffer = Buffer.from(expectedSignature, "hex");

      // Verify at least one signature matches using constant-time comparison
      for (const sig of signatures) {
        try {
          const sigBuffer = Buffer.from(sig, "hex");
          if (sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            return true;
          }
        } catch {
          continue;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Generates a valid test `stripe-signature` header for testing & simulation.
   */
  static generateTestSignatureHeader(
    rawPayload: string | Buffer,
    secret: string,
    timestampSeconds?: number
  ): string {
    const timestamp = timestampSeconds ?? Math.floor(Date.now() / 1000);
    const payloadString = typeof rawPayload === "string" ? rawPayload : rawPayload.toString("utf8");
    const signedPayload = `${timestamp}.${payloadString}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload, "utf8")
      .digest("hex");

    return `t=${timestamp},v1=${signature}`;
  }

  /**
   * Converts high-precision decimal amount string (NUMERIC 19,4) to integer minor currency units (cents).
   */
  static toMinorUnits(amountDecimal: string | number, currency: string): number {
    const num = typeof amountDecimal === "number" ? amountDecimal : parseFloat(amountDecimal);
    if (isNaN(num) || num < 0) return 0;

    const curr = currency.toUpperCase();
    if (ZERO_DECIMAL_CURRENCIES.has(curr)) {
      return Math.round(num);
    }
    if (THREE_DECIMAL_CURRENCIES.has(curr)) {
      return Math.round(num * 1000);
    }
    // Default 2 decimal places (cents)
    return Math.round(num * 100);
  }

  /**
   * Converts integer minor units (cents) to high-precision 4-decimal currency string (NUMERIC 19,4).
   */
  static fromMinorUnits(minorUnits: number, currency: string): string {
    if (isNaN(minorUnits) || minorUnits < 0) return "0.0000";

    const curr = currency.toUpperCase();
    if (ZERO_DECIMAL_CURRENCIES.has(curr)) {
      return minorUnits.toFixed(4);
    }
    if (THREE_DECIMAL_CURRENCIES.has(curr)) {
      return (minorUnits / 1000).toFixed(4);
    }
    return (minorUnits / 100).toFixed(4);
  }

  /**
   * Normalizes brand names to standard CardBrand enum.
   */
  static normalizeBrand(brandRaw?: string): CardBrand {
    if (!brandRaw) return "UNKNOWN";
    const b = brandRaw.trim().toUpperCase().replace(/[\s_-]/g, "");
    if (b.includes("VISA")) return "VISA";
    if (b.includes("MASTER")) return "MASTERCARD";
    if (b.includes("AMEX") || b.includes("AMERICAN")) return "AMEX";
    if (b.includes("DISCOVER")) return "DISCOVER";
    if (b.includes("JCB")) return "JCB";
    if (b.includes("DINERS")) return "DINERS_CLUB";
    if (b.includes("UNION")) return "UNIONPAY";
    return "UNKNOWN";
  }

  /**
   * Formats a safe masked card description for UI and audit purposes.
   * Never includes full PAN or security codes.
   */
  static formatMaskedCard(summary: CardMaskedSummary): string {
    const brand = summary.brand || "CARD";
    const last4 = summary.last4 || "••••";
    const exp = summary.expMonth && summary.expYear ? ` (Exp ${String(summary.expMonth).padStart(2, "0")}/${String(summary.expYear).slice(-2)})` : "";
    return `${brand} •••• ${last4}${exp}`;
  }
}
