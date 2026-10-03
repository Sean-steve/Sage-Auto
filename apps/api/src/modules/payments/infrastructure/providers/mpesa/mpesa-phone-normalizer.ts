// ============================================================================
// CAR HIRE OS — M-PESA PHONE NUMBER NORMALIZER & VALIDATOR (Sprint 23)
// Safaricom MSISDN Standard: 254XXXXXXXXX (12 Digits, No Leading + or 0)
// ============================================================================

export class InvalidMpesaPhoneNumberError extends Error {
  public readonly code = "INVALID_MPESA_PHONE_NUMBER";
  constructor(public readonly rawPhone: string, public readonly reason: string) {
    super(`Invalid M-Pesa phone number '${rawPhone}': ${reason}`);
    this.name = "InvalidMpesaPhoneNumberError";
  }
}

export class MpesaPhoneNormalizer {
  /**
   * Normalizes Kenyan phone numbers to Safaricom Daraja format: 254XXXXXXXXX
   * Handles:
   *  - "+254712345678" -> "254712345678"
   *  - "0712345678"    -> "254712345678"
   *  - "712345678"     -> "254712345678"
   *  - "+254110123456" -> "254110123456" (011x series)
   *  - "0110123456"    -> "254110123456"
   *  - "254712345678"  -> "254712345678"
   */
  static normalize(rawPhone: string): string {
    if (!rawPhone || typeof rawPhone !== "string") {
      throw new InvalidMpesaPhoneNumberError(String(rawPhone), "Phone number is empty or not a string");
    }

    // Strip spaces, dashes, parentheses, plus signs
    const cleaned = rawPhone.replace(/[\s\-()+]/g, "");

    let normalized: string;

    if (cleaned.startsWith("0")) {
      // 07XXXXXXXX or 01XXXXXXXX -> replace leading 0 with 254
      normalized = `254${cleaned.slice(1)}`;
    } else if (cleaned.startsWith("254")) {
      normalized = cleaned;
    } else if (cleaned.startsWith("7") || cleaned.startsWith("1")) {
      normalized = `254${cleaned}`;
    } else {
      throw new InvalidMpesaPhoneNumberError(
        rawPhone,
        "Phone number must start with +254, 254, 07, 01, 7, or 1"
      );
    }

    // Validate 12-digit length
    if (!/^\d{12}$/.test(normalized)) {
      throw new InvalidMpesaPhoneNumberError(
        rawPhone,
        `Expected 12 digits for Kenyan MSISDN, got ${normalized.length} (${normalized})`
      );
    }

    // Validate Safaricom/Kenyan mobile prefixes (2547xx or 2541xx)
    const validPrefixes = ["2547", "2541"];
    const hasValidPrefix = validPrefixes.some((p) => normalized.startsWith(p));
    if (!hasValidPrefix) {
      throw new InvalidMpesaPhoneNumberError(
        rawPhone,
        `Phone number does not match supported mobile network prefix (must start with 2547... or 2541...)`
      );
    }

    return normalized;
  }

  /**
   * Safely masks a phone number for logging and audit trails (e.g. "2547****5678")
   */
  static mask(phone: string): string {
    try {
      const normalized = this.normalize(phone);
      return `${normalized.slice(0, 4)}****${normalized.slice(-4)}`;
    } catch {
      return "MASKED_PHONE";
    }
  }
}
